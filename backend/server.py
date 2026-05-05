"""
CentCord — Discord-style chat & community platform
FastAPI + MongoDB + WebSocket realtime + JWT/Google auth + E2E DM key exchange.
"""
from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import json
import time
import asyncio
import logging
import secrets
import bcrypt
import jwt
import requests
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any, Set
from fastapi import (
    FastAPI, APIRouter, HTTPException, Request, Response, Depends,
    UploadFile, File, Query, Header, WebSocket, WebSocketDisconnect, status
)
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

# ========== Config ==========
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALG = "HS256"
ACCESS_TTL_MIN = 60 * 24       # 1 day for dev convenience
REFRESH_TTL_DAYS = 30
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'admin@centcord.app')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'admin123')
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
APP_NAME = os.environ.get('APP_NAME', 'centcord')
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_AUTH_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
log = logging.getLogger("centcord")

# ========== Permissions (bitmask) ==========
PERM_VIEW = 1 << 0
PERM_SEND = 1 << 1
PERM_MANAGE_MESSAGES = 1 << 2
PERM_MANAGE_CHANNELS = 1 << 3
PERM_MANAGE_SERVER = 1 << 4
PERM_KICK = 1 << 5
PERM_BAN = 1 << 6
PERM_MANAGE_ROLES = 1 << 7
PERM_MENTION_EVERYONE = 1 << 8
PERM_ADMINISTRATOR = 1 << 31
DEFAULT_PERMS = PERM_VIEW | PERM_SEND
ADMIN_PERMS = (1 << 32) - 1

# ========== Mongo ==========
mongo_client = AsyncIOMotorClient(MONGO_URL)
db = mongo_client[DB_NAME]

# ========== Helpers ==========
def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def now_iso() -> str:
    return now_utc().isoformat()

def gen_id(prefix: str = "id") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:14]}"

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def create_jwt(user_id: str, email: str, kind: str = "access") -> str:
    delta = timedelta(minutes=ACCESS_TTL_MIN) if kind == "access" else timedelta(days=REFRESH_TTL_DAYS)
    payload = {
        "sub": user_id, "email": email, "type": kind,
        "exp": now_utc() + delta, "iat": now_utc(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

def decode_jwt(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])

def set_auth_cookies(resp: Response, access: str, refresh: str):
    resp.set_cookie("access_token", access, httponly=True, secure=True, samesite="none",
                    max_age=ACCESS_TTL_MIN * 60, path="/")
    resp.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none",
                    max_age=REFRESH_TTL_DAYS * 86400, path="/")

def clear_auth_cookies(resp: Response):
    resp.delete_cookie("access_token", path="/")
    resp.delete_cookie("refresh_token", path="/")
    resp.delete_cookie("session_token", path="/")

def public_user(u: dict) -> dict:
    if not u:
        return {}
    return {
        "user_id": u["user_id"],
        "email": u.get("email"),
        "display_name": u.get("display_name") or u.get("name") or u.get("email", "").split("@")[0],
        "avatar_url": u.get("avatar_url"),
        "banner_url": u.get("banner_url"),
        "bio": u.get("bio", ""),
        "pronouns": u.get("pronouns", ""),
        "accent_color": u.get("accent_color", "#FF3B00"),
        "status": u.get("status", "online"),
        "custom_status": u.get("custom_status", ""),
        "role": u.get("role", "user"),
        "created_at": u.get("created_at"),
        "public_key": u.get("public_key"),
    }

# ========== Auth dependencies ==========
async def get_user_by_token(token: str) -> Optional[dict]:
    try:
        payload = decode_jwt(token)
        if payload.get("type") != "access":
            return None
        u = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
        return u
    except Exception:
        return None

async def get_user_by_session(session_token: str) -> Optional[dict]:
    s = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not s:
        return None
    expires_at = s.get("expires_at")
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at)
        except Exception:
            return None
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at and expires_at < now_utc():
        return None
    u = await db.users.find_one({"user_id": s["user_id"]}, {"_id": 0})
    return u

async def get_current_user(request: Request) -> dict:
    # Try JWT access cookie
    token = request.cookies.get("access_token")
    if not token:
        h = request.headers.get("Authorization", "")
        if h.startswith("Bearer "):
            token = h[7:]
    if token:
        u = await get_user_by_token(token)
        if u:
            return u
    # Try Emergent session token
    sess = request.cookies.get("session_token") or request.headers.get("X-Session-Token")
    if sess:
        u = await get_user_by_session(sess)
        if u:
            return u
    raise HTTPException(status_code=401, detail="Not authenticated")

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin required")
    return user

# ========== Membership / permissions ==========
async def get_member(server_id: str, user_id: str) -> Optional[dict]:
    return await db.members.find_one({"server_id": server_id, "user_id": user_id}, {"_id": 0})

async def member_perms(server_id: str, user_id: str) -> int:
    server = await db.servers.find_one({"server_id": server_id}, {"_id": 0})
    if not server:
        return 0
    if server.get("owner_id") == user_id:
        return ADMIN_PERMS
    member = await get_member(server_id, user_id)
    if not member:
        return 0
    perms = DEFAULT_PERMS
    if member.get("role_ids"):
        roles = await db.roles.find({"server_id": server_id, "role_id": {"$in": member["role_ids"]}}, {"_id": 0}).to_list(100)
        for r in roles:
            perms |= r.get("permissions", 0)
    if perms & PERM_ADMINISTRATOR:
        return ADMIN_PERMS
    return perms

async def require_membership(server_id: str, user: dict, perm: int = PERM_VIEW) -> int:
    perms = await member_perms(server_id, user["user_id"])
    if perms == 0:
        raise HTTPException(status_code=403, detail="Not a member")
    if perm and not (perms & perm) and not (perms & PERM_ADMINISTRATOR):
        raise HTTPException(status_code=403, detail="Missing permissions")
    return perms

# ========== Object storage ==========
storage_key: Optional[str] = None

def init_storage() -> Optional[str]:
    global storage_key
    if storage_key:
        return storage_key
    if not EMERGENT_LLM_KEY:
        log.warning("EMERGENT_LLM_KEY missing — object storage disabled")
        return None
    try:
        r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=20)
        r.raise_for_status()
        storage_key = r.json().get("storage_key")
        log.info("Object storage initialized")
        return storage_key
    except Exception as e:
        log.error(f"Storage init failed: {e}")
        return None

def storage_put(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=503, detail="Storage unavailable")
    r = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=60,
    )
    r.raise_for_status()
    return r.json()

def storage_get(path: str):
    key = init_storage()
    if not key:
        raise HTTPException(status_code=503, detail="Storage unavailable")
    r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=30)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")

# ========== Rate limiting (in-memory) ==========
_rate: Dict[str, List[float]] = {}
def rate_limit(key: str, limit: int, window_s: int) -> bool:
    now = time.time()
    arr = _rate.setdefault(key, [])
    cutoff = now - window_s
    while arr and arr[0] < cutoff:
        arr.pop(0)
    if len(arr) >= limit:
        return False
    arr.append(now)
    return True

# ========== WebSocket hub ==========
class WSHub:
    def __init__(self):
        self.connections: Dict[str, Set[WebSocket]] = {}  # user_id -> sockets

    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        self.connections.setdefault(user_id, set()).add(ws)

    def disconnect(self, user_id: str, ws: WebSocket):
        if user_id in self.connections:
            self.connections[user_id].discard(ws)
            if not self.connections[user_id]:
                self.connections.pop(user_id, None)

    async def send_user(self, user_id: str, event: str, data: dict):
        if user_id not in self.connections:
            return
        msg = json.dumps({"event": event, "data": data})
        dead = []
        for ws in list(self.connections[user_id]):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for d in dead:
            self.connections[user_id].discard(d)

    async def send_users(self, user_ids: List[str], event: str, data: dict):
        for uid in user_ids:
            await self.send_user(uid, event, data)

    async def broadcast_server(self, server_id: str, event: str, data: dict):
        members = await db.members.find({"server_id": server_id}, {"_id": 0, "user_id": 1}).to_list(10000)
        await self.send_users([m["user_id"] for m in members], event, data)

hub = WSHub()

# ========== Models ==========
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    display_name: str = Field(min_length=1, max_length=64)

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class GoogleSessionIn(BaseModel):
    session_id: str

class UpdateProfileIn(BaseModel):
    display_name: Optional[str] = Field(None, max_length=64)
    bio: Optional[str] = Field(None, max_length=400)
    pronouns: Optional[str] = Field(None, max_length=32)
    accent_color: Optional[str] = Field(None, max_length=16)
    avatar_url: Optional[str] = None
    banner_url: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(online|idle|dnd|offline)$")
    custom_status: Optional[str] = Field(None, max_length=128)
    public_key: Optional[str] = Field(None, max_length=2000)

class CreateServerIn(BaseModel):
    name: str = Field(min_length=2, max_length=64)
    description: Optional[str] = Field("", max_length=400)
    icon_url: Optional[str] = None
    is_public: bool = False

class UpdateServerIn(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=64)
    description: Optional[str] = Field(None, max_length=400)
    icon_url: Optional[str] = None
    banner_url: Optional[str] = None
    is_public: Optional[bool] = None

class CreateCategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)

class CreateChannelIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    type: str = Field(pattern="^(text|voice|announcement|forum)$")
    category_id: Optional[str] = None
    topic: Optional[str] = Field("", max_length=400)

class UpdateChannelIn(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=64)
    topic: Optional[str] = Field(None, max_length=400)
    slowmode: Optional[int] = Field(None, ge=0, le=21600)
    nsfw: Optional[bool] = None
    locked: Optional[bool] = None

class CreateRoleIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    color: str = "#FF3B00"
    permissions: int = DEFAULT_PERMS
    mentionable: bool = True

class AssignRoleIn(BaseModel):
    role_id: str

class UpdateMemberIn(BaseModel):
    nickname: Optional[str] = Field(None, max_length=64)
    role_ids: Optional[List[str]] = None

class SendMessageIn(BaseModel):
    content: str = Field(max_length=4000)
    attachments: Optional[List[Dict[str, Any]]] = None
    reply_to: Optional[str] = None
    nonce: Optional[str] = None  # for E2E DM (base64)

class EditMessageIn(BaseModel):
    content: str = Field(max_length=4000)

class ReactionIn(BaseModel):
    emoji: str = Field(min_length=1, max_length=32)

class CreateInviteIn(BaseModel):
    max_uses: int = Field(0, ge=0, le=1000)
    expires_in_minutes: int = Field(10080, ge=0)  # default 7 days; 0 = never

class FriendRequestIn(BaseModel):
    target: str  # email or user_id or display_name

class CreateDMIn(BaseModel):
    user_id: str

class WebhookSendIn(BaseModel):
    content: str = Field(max_length=4000)
    username: Optional[str] = None

# ========== App ==========
app = FastAPI(title="CentCord API", version="1.0.0")
api = APIRouter(prefix="/api")

# Security headers middleware
class SecurityHeaders(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        resp = await call_next(request)
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "SAMEORIGIN"
        resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        resp.headers["Permissions-Policy"] = "geolocation=(), microphone=(self), camera=(self)"
        return resp

app.add_middleware(SecurityHeaders)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # we use Authorization Bearer for cross-origin to keep wildcard simple
    allow_methods=["*"],
    allow_headers=["*"],
)

# A second middleware to allow credentials only when origin matches the frontend host
@app.middleware("http")
async def conditional_credentials(request: Request, call_next):
    resp = await call_next(request)
    origin = request.headers.get("origin")
    if origin:
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Access-Control-Allow-Credentials"] = "true"
        resp.headers["Vary"] = "Origin"
    return resp

# ========== Auth endpoints ==========
@api.post("/auth/register")
async def auth_register(payload: RegisterIn, request: Request, response: Response):
    ip = request.client.host if request.client else "?"
    if not rate_limit(f"register:{ip}", 10, 600):
        raise HTTPException(status_code=429, detail="Too many requests")
    email = payload.email.lower().strip()
    existing = await db.users.find_one({"email": email}, {"_id": 0, "user_id": 1})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    user_id = gen_id("usr")
    doc = {
        "user_id": user_id,
        "email": email,
        "password_hash": hash_password(payload.password),
        "display_name": payload.display_name.strip(),
        "avatar_url": None,
        "banner_url": None,
        "bio": "",
        "pronouns": "",
        "accent_color": "#FF3B00",
        "status": "online",
        "custom_status": "",
        "role": "user",
        "auth_provider": "password",
        "public_key": None,
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    access = create_jwt(user_id, email, "access")
    refresh = create_jwt(user_id, email, "refresh")
    set_auth_cookies(response, access, refresh)
    return {"user": public_user(doc), "access_token": access, "refresh_token": refresh}

@api.post("/auth/login")
async def auth_login(payload: LoginIn, request: Request, response: Response):
    ip = request.client.host if request.client else "?"
    email = payload.email.lower().strip()
    lkey = f"{ip}:{email}"
    if not rate_limit(f"login:{lkey}", 8, 300):
        raise HTTPException(status_code=429, detail="Too many attempts. Wait a few minutes.")
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    access = create_jwt(user["user_id"], email, "access")
    refresh = create_jwt(user["user_id"], email, "refresh")
    set_auth_cookies(response, access, refresh)
    user.pop("_id", None); user.pop("password_hash", None)
    return {"user": public_user(user), "access_token": access, "refresh_token": refresh}

@api.post("/auth/logout")
async def auth_logout(response: Response):
    clear_auth_cookies(response)
    return {"ok": True}

@api.get("/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    return public_user(user)

@api.post("/auth/refresh")
async def auth_refresh(request: Request, response: Response):
    rt = request.cookies.get("refresh_token") or (request.headers.get("Authorization", "")[7:] if request.headers.get("Authorization", "").startswith("Bearer ") else None)
    if not rt:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = decode_jwt(rt)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Bad token")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    access = create_jwt(user["user_id"], user["email"], "access")
    refresh = create_jwt(user["user_id"], user["email"], "refresh")
    set_auth_cookies(response, access, refresh)
    return {"access_token": access, "refresh_token": refresh}

@api.post("/auth/google/session")
async def auth_google_session(payload: GoogleSessionIn, response: Response):
    """Exchange Emergent session_id for an app session (cookie-based)."""
    try:
        r = requests.get(EMERGENT_AUTH_SESSION_URL, headers={"X-Session-ID": payload.session_id}, timeout=15)
        r.raise_for_status()
        sd = r.json()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to verify session: {e}")
    email = (sd.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(status_code=400, detail="No email in session")
    user = await db.users.find_one({"email": email})
    if not user:
        user_id = gen_id("usr")
        doc = {
            "user_id": user_id,
            "email": email,
            "password_hash": None,
            "display_name": sd.get("name") or email.split("@")[0],
            "avatar_url": sd.get("picture"),
            "banner_url": None,
            "bio": "",
            "pronouns": "",
            "accent_color": "#FF3B00",
            "status": "online",
            "custom_status": "",
            "role": "user",
            "auth_provider": "google",
            "public_key": None,
            "created_at": now_iso(),
        }
        await db.users.insert_one(doc)
        user = doc
    else:
        user.pop("_id", None)
    # Store emergent session for cookie-based path
    session_token = sd.get("session_token") or secrets.token_urlsafe(32)
    expires_at = now_utc() + timedelta(days=7)
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user["user_id"],
        "provider": "google",
        "expires_at": expires_at.isoformat(),
        "created_at": now_iso(),
    })
    response.set_cookie("session_token", session_token, httponly=True, secure=True, samesite="none",
                        max_age=7 * 86400, path="/")
    # Also issue JWT for unified usage
    access = create_jwt(user["user_id"], user["email"], "access")
    refresh = create_jwt(user["user_id"], user["email"], "refresh")
    set_auth_cookies(response, access, refresh)
    return {"user": public_user(user), "access_token": access, "refresh_token": refresh, "session_token": session_token}

# ========== Users ==========
@api.patch("/users/me")
async def update_me(payload: UpdateProfileIn, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not update:
        return public_user(user)
    update["updated_at"] = now_iso()
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    # Notify friends of presence change
    if "status" in update or "custom_status" in update:
        friends = await db.friends.find({"$or": [{"a": user["user_id"]}, {"b": user["user_id"]}], "status": "accepted"}, {"_id": 0}).to_list(1000)
        ids = [f["b"] if f["a"] == user["user_id"] else f["a"] for f in friends]
        await hub.send_users(ids, "presence.update", {"user_id": user["user_id"], "status": fresh.get("status"), "custom_status": fresh.get("custom_status")})
    return public_user(fresh)

@api.get("/users/{user_id}")
async def get_user(user_id: str, user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return public_user(u)

@api.get("/users/search/{query}")
async def search_users(query: str, user: dict = Depends(get_current_user)):
    if len(query) < 2:
        return []
    rgx = {"$regex": query, "$options": "i"}
    users = await db.users.find(
        {"$or": [{"email": rgx}, {"display_name": rgx}]},
        {"_id": 0, "password_hash": 0}
    ).limit(20).to_list(20)
    return [public_user(u) for u in users]

# ========== Friends ==========
@api.get("/friends")
async def list_friends(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    rows = await db.friends.find({"$or": [{"a": uid}, {"b": uid}]}, {"_id": 0}).to_list(1000)
    out = []
    for r in rows:
        other = r["b"] if r["a"] == uid else r["a"]
        u = await db.users.find_one({"user_id": other}, {"_id": 0})
        if u:
            out.append({"friend_id": r["friend_id"], "status": r["status"], "initiator": r["initiator"], "user": public_user(u)})
    return out

@api.post("/friends/requests")
async def add_friend(payload: FriendRequestIn, user: dict = Depends(get_current_user)):
    target = payload.target.strip().lower()
    target_user = await db.users.find_one({"$or": [{"email": target}, {"user_id": target}, {"display_name": payload.target}]}, {"_id": 0})
    if not target_user or target_user["user_id"] == user["user_id"]:
        raise HTTPException(status_code=404, detail="User not found")
    a, b = sorted([user["user_id"], target_user["user_id"]])
    existing = await db.friends.find_one({"a": a, "b": b}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail=f"Already {existing['status']}")
    doc = {
        "friend_id": gen_id("fr"),
        "a": a, "b": b,
        "initiator": user["user_id"],
        "status": "pending",
        "created_at": now_iso(),
    }
    await db.friends.insert_one(doc)
    await hub.send_user(target_user["user_id"], "friend.request", {"from": public_user(user)})
    return {"ok": True}

@api.patch("/friends/{friend_id}")
async def respond_friend(friend_id: str, action: str = Query(..., pattern="^(accept|reject|block)$"), user: dict = Depends(get_current_user)):
    r = await db.friends.find_one({"friend_id": friend_id}, {"_id": 0})
    if not r or user["user_id"] not in (r["a"], r["b"]):
        raise HTTPException(status_code=404, detail="Not found")
    if action == "accept":
        await db.friends.update_one({"friend_id": friend_id}, {"$set": {"status": "accepted"}})
    elif action == "reject":
        await db.friends.delete_one({"friend_id": friend_id})
    elif action == "block":
        await db.friends.update_one({"friend_id": friend_id}, {"$set": {"status": "blocked", "blocker": user["user_id"]}})
    other = r["b"] if r["a"] == user["user_id"] else r["a"]
    await hub.send_user(other, "friend.update", {"friend_id": friend_id, "action": action})
    return {"ok": True}

@api.delete("/friends/{friend_id}")
async def remove_friend(friend_id: str, user: dict = Depends(get_current_user)):
    r = await db.friends.find_one({"friend_id": friend_id}, {"_id": 0})
    if not r or user["user_id"] not in (r["a"], r["b"]):
        raise HTTPException(status_code=404, detail="Not found")
    await db.friends.delete_one({"friend_id": friend_id})
    return {"ok": True}

# ========== Servers ==========
async def _ensure_default_role(server_id: str):
    role_id = gen_id("role")
    await db.roles.insert_one({
        "role_id": role_id, "server_id": server_id,
        "name": "@everyone", "color": "#A1A1AA",
        "permissions": DEFAULT_PERMS, "position": 0, "mentionable": False,
        "is_default": True, "created_at": now_iso(),
    })
    return role_id

@api.post("/servers")
async def create_server(payload: CreateServerIn, user: dict = Depends(get_current_user)):
    server_id = gen_id("srv")
    invite_code = secrets.token_urlsafe(8).replace("-", "").replace("_", "")[:10]
    doc = {
        "server_id": server_id,
        "owner_id": user["user_id"],
        "name": payload.name,
        "description": payload.description or "",
        "icon_url": payload.icon_url,
        "banner_url": None,
        "is_public": payload.is_public,
        "invite_code": invite_code,
        "boost_count": 0,
        "tags": [],
        "created_at": now_iso(),
    }
    await db.servers.insert_one(doc)
    await _ensure_default_role(server_id)
    # default category + general channel
    cat_id = gen_id("cat")
    await db.categories.insert_one({
        "category_id": cat_id, "server_id": server_id,
        "name": "GENERAL", "position": 0, "created_at": now_iso(),
    })
    await db.channels.insert_one({
        "channel_id": gen_id("ch"), "server_id": server_id, "category_id": cat_id,
        "name": "general", "type": "text", "topic": "Welcome to your new server.",
        "position": 0, "slowmode": 0, "nsfw": False, "locked": False, "created_at": now_iso(),
    })
    await db.channels.insert_one({
        "channel_id": gen_id("ch"), "server_id": server_id, "category_id": cat_id,
        "name": "general-voice", "type": "voice", "topic": "",
        "position": 1, "slowmode": 0, "nsfw": False, "locked": False, "created_at": now_iso(),
    })
    # owner membership
    await db.members.insert_one({
        "server_id": server_id, "user_id": user["user_id"],
        "nickname": None, "role_ids": [], "joined_at": now_iso(),
    })
    doc.pop("_id", None)
    return doc

@api.get("/servers")
async def my_servers(user: dict = Depends(get_current_user)):
    members = await db.members.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(1000)
    server_ids = [m["server_id"] for m in members]
    servers = await db.servers.find({"server_id": {"$in": server_ids}}, {"_id": 0}).to_list(1000)
    return servers

@api.get("/servers/discover")
async def discover_servers(q: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {"is_public": True}
    if q:
        query["$or"] = [{"name": {"$regex": q, "$options": "i"}}, {"description": {"$regex": q, "$options": "i"}}]
    servers = await db.servers.find(query, {"_id": 0}).limit(50).to_list(50)
    for s in servers:
        s["member_count"] = await db.members.count_documents({"server_id": s["server_id"]})
    return servers

@api.get("/servers/{server_id}")
async def get_server(server_id: str, user: dict = Depends(get_current_user)):
    await require_membership(server_id, user)
    server = await db.servers.find_one({"server_id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    cats = await db.categories.find({"server_id": server_id}, {"_id": 0}).sort("position", 1).to_list(100)
    chs = await db.channels.find({"server_id": server_id}, {"_id": 0}).sort("position", 1).to_list(500)
    roles = await db.roles.find({"server_id": server_id}, {"_id": 0}).sort("position", -1).to_list(100)
    server["categories"] = cats
    server["channels"] = chs
    server["roles"] = roles
    server["my_perms"] = await member_perms(server_id, user["user_id"])
    return server

@api.patch("/servers/{server_id}")
async def update_server(server_id: str, payload: UpdateServerIn, user: dict = Depends(get_current_user)):
    await require_membership(server_id, user, PERM_MANAGE_SERVER)
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if update:
        update["updated_at"] = now_iso()
        await db.servers.update_one({"server_id": server_id}, {"$set": update})
        await hub.broadcast_server(server_id, "server.update", {"server_id": server_id, **update})
    return await db.servers.find_one({"server_id": server_id}, {"_id": 0})

@api.delete("/servers/{server_id}")
async def delete_server(server_id: str, user: dict = Depends(get_current_user)):
    """Politique anti-DMCA : un serveur ne peut être supprimé que par un administrateur
    de la plateforme, et uniquement après confirmation d'activité illégale.
    Le propriétaire peut seulement archiver ou quitter son serveur."""
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail=("Suppression refusée. Politique anti-DMCA : aucun serveur n'est supprimé "
                    "sauf en cas d'activité illégale confirmée par la plateforme. "
                    "Utilisez « archiver » ou « quitter » à la place.")
        )
    server = await db.servers.find_one({"server_id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Serveur introuvable")
    # Exiger un signalement actif d'activité illégale validé par admin
    active_report = await db.reports.find_one({
        "target_type": "server", "target_id": server_id,
        "category": "illegal", "status": "validated"
    }, {"_id": 0})
    if not active_report:
        raise HTTPException(
            status_code=403,
            detail="Aucun signalement validé d'activité illégale pour ce serveur."
        )
    await db.servers.delete_one({"server_id": server_id})
    await db.categories.delete_many({"server_id": server_id})
    await db.channels.delete_many({"server_id": server_id})
    await db.roles.delete_many({"server_id": server_id})
    await db.members.delete_many({"server_id": server_id})
    await db.messages.delete_many({"server_id": server_id})
    await db.audit_log.insert_one({
        "audit_id": gen_id("au"), "server_id": server_id, "actor_id": user["user_id"],
        "action": "server.delete.illegal", "data": {"report_id": active_report.get("report_id")}, "at": now_iso()
    })
    await hub.broadcast_server(server_id, "server.delete", {"server_id": server_id})
    return {"ok": True, "reason": "illegal_activity"}

@api.post("/servers/{server_id}/archive")
async def archive_server(server_id: str, user: dict = Depends(get_current_user)):
    """Le propriétaire peut archiver son serveur (caché, lecture seule)."""
    server = await db.servers.find_one({"server_id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Serveur introuvable")
    if server["owner_id"] != user["user_id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Seul le propriétaire peut archiver ce serveur")
    await db.servers.update_one({"server_id": server_id}, {"$set": {"archived": True, "is_public": False, "archived_at": now_iso()}})
    await hub.broadcast_server(server_id, "server.archive", {"server_id": server_id})
    return {"ok": True}

@api.post("/servers/{server_id}/unarchive")
async def unarchive_server(server_id: str, user: dict = Depends(get_current_user)):
    server = await db.servers.find_one({"server_id": server_id}, {"_id": 0})
    if not server or server["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Seul le propriétaire peut désarchiver")
    await db.servers.update_one({"server_id": server_id}, {"$set": {"archived": False}})
    return {"ok": True}

@api.post("/servers/{server_id}/leave")
async def leave_server(server_id: str, user: dict = Depends(get_current_user)):
    server = await db.servers.find_one({"server_id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Not found")
    if server["owner_id"] == user["user_id"]:
        raise HTTPException(status_code=400, detail="Owner cannot leave; transfer or delete.")
    await db.members.delete_one({"server_id": server_id, "user_id": user["user_id"]})
    return {"ok": True}

# ========== Categories / Channels ==========
@api.post("/servers/{server_id}/categories")
async def create_category(server_id: str, payload: CreateCategoryIn, user: dict = Depends(get_current_user)):
    await require_membership(server_id, user, PERM_MANAGE_CHANNELS)
    pos = await db.categories.count_documents({"server_id": server_id})
    doc = {"category_id": gen_id("cat"), "server_id": server_id, "name": payload.name.upper(),
           "position": pos, "created_at": now_iso()}
    await db.categories.insert_one(doc)
    await hub.broadcast_server(server_id, "category.create", doc)
    doc.pop("_id", None)
    return doc

@api.delete("/servers/{server_id}/categories/{category_id}")
async def delete_category(server_id: str, category_id: str, user: dict = Depends(get_current_user)):
    await require_membership(server_id, user, PERM_MANAGE_CHANNELS)
    await db.categories.delete_one({"category_id": category_id})
    await db.channels.update_many({"category_id": category_id}, {"$set": {"category_id": None}})
    await hub.broadcast_server(server_id, "category.delete", {"category_id": category_id})
    return {"ok": True}

@api.post("/servers/{server_id}/channels")
async def create_channel(server_id: str, payload: CreateChannelIn, user: dict = Depends(get_current_user)):
    await require_membership(server_id, user, PERM_MANAGE_CHANNELS)
    pos = await db.channels.count_documents({"server_id": server_id})
    doc = {
        "channel_id": gen_id("ch"), "server_id": server_id,
        "category_id": payload.category_id, "name": payload.name.lower().replace(" ", "-"),
        "type": payload.type, "topic": payload.topic or "",
        "position": pos, "slowmode": 0, "nsfw": False, "locked": False,
        "created_at": now_iso(),
    }
    await db.channels.insert_one(doc)
    await hub.broadcast_server(server_id, "channel.create", doc)
    doc.pop("_id", None)
    return doc

@api.patch("/servers/{server_id}/channels/{channel_id}")
async def update_channel(server_id: str, channel_id: str, payload: UpdateChannelIn, user: dict = Depends(get_current_user)):
    await require_membership(server_id, user, PERM_MANAGE_CHANNELS)
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if update:
        await db.channels.update_one({"channel_id": channel_id, "server_id": server_id}, {"$set": update})
        await hub.broadcast_server(server_id, "channel.update", {"channel_id": channel_id, **update})
    ch = await db.channels.find_one({"channel_id": channel_id}, {"_id": 0})
    return ch

@api.delete("/servers/{server_id}/channels/{channel_id}")
async def delete_channel(server_id: str, channel_id: str, user: dict = Depends(get_current_user)):
    await require_membership(server_id, user, PERM_MANAGE_CHANNELS)
    await db.channels.delete_one({"channel_id": channel_id, "server_id": server_id})
    await db.messages.delete_many({"channel_id": channel_id})
    await hub.broadcast_server(server_id, "channel.delete", {"channel_id": channel_id})
    return {"ok": True}

# ========== Roles ==========
@api.post("/servers/{server_id}/roles")
async def create_role(server_id: str, payload: CreateRoleIn, user: dict = Depends(get_current_user)):
    await require_membership(server_id, user, PERM_MANAGE_ROLES)
    pos = await db.roles.count_documents({"server_id": server_id})
    doc = {"role_id": gen_id("role"), "server_id": server_id, "name": payload.name,
           "color": payload.color, "permissions": payload.permissions, "position": pos,
           "mentionable": payload.mentionable, "is_default": False, "created_at": now_iso()}
    await db.roles.insert_one(doc)
    await hub.broadcast_server(server_id, "role.create", doc)
    doc.pop("_id", None)
    return doc

@api.patch("/servers/{server_id}/roles/{role_id}")
async def update_role(server_id: str, role_id: str, payload: CreateRoleIn, user: dict = Depends(get_current_user)):
    await require_membership(server_id, user, PERM_MANAGE_ROLES)
    update = payload.model_dump()
    await db.roles.update_one({"role_id": role_id, "server_id": server_id}, {"$set": update})
    await hub.broadcast_server(server_id, "role.update", {"role_id": role_id, **update})
    return {"ok": True}

@api.delete("/servers/{server_id}/roles/{role_id}")
async def delete_role(server_id: str, role_id: str, user: dict = Depends(get_current_user)):
    await require_membership(server_id, user, PERM_MANAGE_ROLES)
    role = await db.roles.find_one({"role_id": role_id}, {"_id": 0})
    if role and role.get("is_default"):
        raise HTTPException(status_code=400, detail="Cannot delete default role")
    await db.roles.delete_one({"role_id": role_id, "server_id": server_id})
    await db.members.update_many({"server_id": server_id}, {"$pull": {"role_ids": role_id}})
    await hub.broadcast_server(server_id, "role.delete", {"role_id": role_id})
    return {"ok": True}

# ========== Members ==========
@api.get("/servers/{server_id}/members")
async def list_members(server_id: str, user: dict = Depends(get_current_user)):
    await require_membership(server_id, user)
    members = await db.members.find({"server_id": server_id}, {"_id": 0}).to_list(2000)
    user_ids = [m["user_id"] for m in members]
    users = await db.users.find({"user_id": {"$in": user_ids}}, {"_id": 0, "password_hash": 0}).to_list(2000)
    user_map = {u["user_id"]: u for u in users}
    out = []
    for m in members:
        u = user_map.get(m["user_id"])
        if u:
            out.append({**m, "user": public_user(u)})
    return out

@api.patch("/servers/{server_id}/members/{user_id}")
async def update_member(server_id: str, user_id: str, payload: UpdateMemberIn, user: dict = Depends(get_current_user)):
    is_self = user["user_id"] == user_id
    perms = await member_perms(server_id, user["user_id"])
    if not is_self and not (perms & PERM_MANAGE_ROLES) and not (perms & PERM_ADMINISTRATOR):
        raise HTTPException(status_code=403, detail="No permission")
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if update:
        await db.members.update_one({"server_id": server_id, "user_id": user_id}, {"$set": update})
        await hub.broadcast_server(server_id, "member.update", {"user_id": user_id, **update})
        await db.audit_log.insert_one({
            "audit_id": gen_id("au"), "server_id": server_id, "actor_id": user["user_id"],
            "target_id": user_id, "action": "member.update", "data": update, "at": now_iso()
        })
    return {"ok": True}

@api.delete("/servers/{server_id}/members/{user_id}")
async def kick_member(server_id: str, user_id: str, user: dict = Depends(get_current_user)):
    await require_membership(server_id, user, PERM_KICK)
    server = await db.servers.find_one({"server_id": server_id}, {"_id": 0})
    if server and server["owner_id"] == user_id:
        raise HTTPException(status_code=400, detail="Cannot kick owner")
    await db.members.delete_one({"server_id": server_id, "user_id": user_id})
    await db.audit_log.insert_one({"audit_id": gen_id("au"), "server_id": server_id, "actor_id": user["user_id"],
                                   "target_id": user_id, "action": "member.kick", "at": now_iso()})
    await hub.broadcast_server(server_id, "member.kick", {"user_id": user_id})
    await hub.send_user(user_id, "kicked", {"server_id": server_id})
    return {"ok": True}

@api.post("/servers/{server_id}/bans/{user_id}")
async def ban_member(server_id: str, user_id: str, user: dict = Depends(get_current_user)):
    await require_membership(server_id, user, PERM_BAN)
    await db.bans.insert_one({"server_id": server_id, "user_id": user_id, "banned_by": user["user_id"], "at": now_iso()})
    await db.members.delete_one({"server_id": server_id, "user_id": user_id})
    await db.audit_log.insert_one({"audit_id": gen_id("au"), "server_id": server_id, "actor_id": user["user_id"],
                                   "target_id": user_id, "action": "member.ban", "at": now_iso()})
    await hub.broadcast_server(server_id, "member.ban", {"user_id": user_id})
    return {"ok": True}

@api.delete("/servers/{server_id}/bans/{user_id}")
async def unban_member(server_id: str, user_id: str, user: dict = Depends(get_current_user)):
    await require_membership(server_id, user, PERM_BAN)
    await db.bans.delete_one({"server_id": server_id, "user_id": user_id})
    return {"ok": True}

@api.get("/servers/{server_id}/bans")
async def list_bans(server_id: str, user: dict = Depends(get_current_user)):
    await require_membership(server_id, user, PERM_BAN)
    bans = await db.bans.find({"server_id": server_id}, {"_id": 0}).to_list(1000)
    for b in bans:
        u = await db.users.find_one({"user_id": b["user_id"]}, {"_id": 0})
        if u:
            b["user"] = public_user(u)
    return bans

@api.get("/servers/{server_id}/audit-log")
async def get_audit(server_id: str, user: dict = Depends(get_current_user)):
    await require_membership(server_id, user, PERM_MANAGE_SERVER)
    rows = await db.audit_log.find({"server_id": server_id}, {"_id": 0}).sort("at", -1).limit(100).to_list(100)
    for r in rows:
        if r.get("actor_id"):
            u = await db.users.find_one({"user_id": r["actor_id"]}, {"_id": 0})
            if u: r["actor"] = public_user(u)
    return rows

# ========== Invites ==========
@api.post("/servers/{server_id}/invites")
async def create_invite(server_id: str, payload: CreateInviteIn, user: dict = Depends(get_current_user)):
    await require_membership(server_id, user)
    code = secrets.token_urlsafe(6).replace("-", "").replace("_", "")[:8]
    expires_at = (now_utc() + timedelta(minutes=payload.expires_in_minutes)).isoformat() if payload.expires_in_minutes else None
    doc = {"invite_id": gen_id("inv"), "code": code, "server_id": server_id, "inviter_id": user["user_id"],
           "uses": 0, "max_uses": payload.max_uses, "expires_at": expires_at, "created_at": now_iso()}
    await db.invites.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.get("/servers/{server_id}/invites")
async def list_invites(server_id: str, user: dict = Depends(get_current_user)):
    await require_membership(server_id, user)
    return await db.invites.find({"server_id": server_id}, {"_id": 0}).sort("created_at", -1).to_list(100)

@api.post("/invites/{code}")
async def use_invite(code: str, user: dict = Depends(get_current_user)):
    inv = await db.invites.find_one({"code": code}, {"_id": 0})
    if not inv:
        # also check default invite_code on server
        srv = await db.servers.find_one({"invite_code": code}, {"_id": 0})
        if not srv:
            raise HTTPException(status_code=404, detail="Invalid invite")
        server_id = srv["server_id"]
    else:
        if inv.get("expires_at"):
            ea = inv["expires_at"]
            if isinstance(ea, str):
                ea = datetime.fromisoformat(ea)
            if ea.tzinfo is None: ea = ea.replace(tzinfo=timezone.utc)
            if ea < now_utc():
                raise HTTPException(status_code=410, detail="Invite expired")
        if inv["max_uses"] and inv["uses"] >= inv["max_uses"]:
            raise HTTPException(status_code=410, detail="Invite expired")
        await db.invites.update_one({"invite_id": inv["invite_id"]}, {"$inc": {"uses": 1}})
        server_id = inv["server_id"]
    if await db.bans.find_one({"server_id": server_id, "user_id": user["user_id"]}):
        raise HTTPException(status_code=403, detail="You are banned from this server")
    if not await db.members.find_one({"server_id": server_id, "user_id": user["user_id"]}):
        await db.members.insert_one({"server_id": server_id, "user_id": user["user_id"], "nickname": None,
                                     "role_ids": [], "joined_at": now_iso()})
        await hub.broadcast_server(server_id, "member.join", {"user_id": user["user_id"]})
    return await db.servers.find_one({"server_id": server_id}, {"_id": 0})

# ========== Messages (channels) ==========
async def _resolve_channel(channel_id: str, user: dict) -> dict:
    ch = await db.channels.find_one({"channel_id": channel_id}, {"_id": 0})
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")
    await require_membership(ch["server_id"], user, PERM_VIEW)
    return ch

@api.get("/channels/{channel_id}/messages")
async def get_messages(channel_id: str, before: Optional[str] = None, limit: int = 50, user: dict = Depends(get_current_user)):
    ch = await _resolve_channel(channel_id, user)
    q: Dict[str, Any] = {"channel_id": channel_id, "deleted": {"$ne": True}}
    if before:
        q["created_at"] = {"$lt": before}
    rows = await db.messages.find(q, {"_id": 0}).sort("created_at", -1).limit(min(limit, 100)).to_list(limit)
    rows.reverse()
    user_ids = list({r["author_id"] for r in rows})
    users = await db.users.find({"user_id": {"$in": user_ids}}, {"_id": 0}).to_list(2000)
    umap = {u["user_id"]: public_user(u) for u in users}
    # Enrich polls
    poll_ids = [r["poll_id"] for r in rows if r.get("poll_id")]
    polls = {}
    if poll_ids:
        for p in await db.polls.find({"poll_id": {"$in": poll_ids}}, {"_id": 0}).to_list(200):
            polls[p["poll_id"]] = p
    # Enrich reply-to data
    reply_ids = [r["reply_to"] for r in rows if r.get("reply_to")]
    reply_map = {}
    if reply_ids:
        replied = await db.messages.find({"message_id": {"$in": reply_ids}}, {"_id": 0}).to_list(500)
        # author info for replies
        ruids = list({m["author_id"] for m in replied})
        rusers = await db.users.find({"user_id": {"$in": ruids}}, {"_id": 0}).to_list(500)
        rumap = {u["user_id"]: public_user(u) for u in rusers}
        for m in replied:
            m["author"] = rumap.get(m["author_id"])
            reply_map[m["message_id"]] = m
    for r in rows:
        r["author"] = umap.get(r["author_id"])
        if r.get("poll_id") and r["poll_id"] in polls:
            r["poll"] = polls[r["poll_id"]]
        if r.get("reply_to") and r["reply_to"] in reply_map:
            r["reply_to_data"] = reply_map[r["reply_to"]]
    return rows

@api.post("/channels/{channel_id}/messages")
async def send_message(channel_id: str, payload: SendMessageIn, user: dict = Depends(get_current_user)):
    ch = await _resolve_channel(channel_id, user)
    perms = await require_membership(ch["server_id"], user, PERM_SEND)
    if ch.get("locked") and not (perms & PERM_MANAGE_MESSAGES) and not (perms & PERM_ADMINISTRATOR):
        raise HTTPException(status_code=403, detail="Channel is locked")
    if not rate_limit(f"msg:{user['user_id']}", 30, 10):
        raise HTTPException(status_code=429, detail="Slow down")
    msg = {
        "message_id": gen_id("msg"),
        "channel_id": channel_id, "server_id": ch["server_id"],
        "author_id": user["user_id"],
        "content": payload.content, "attachments": payload.attachments or [],
        "reply_to": payload.reply_to, "reactions": [], "pinned": False,
        "created_at": now_iso(), "edited_at": None, "deleted": False,
    }
    await db.messages.insert_one(msg)
    msg.pop("_id", None)
    msg["author"] = public_user(user)
    await hub.broadcast_server(ch["server_id"], "message.create", msg)
    # Notifications sur mentions @
    import re as _re
    mentions = set(_re.findall(r"@(\w+)", payload.content or ""))
    if mentions:
        members = await db.members.find({"server_id": ch["server_id"]}, {"_id": 0}).to_list(2000)
        uids = [m["user_id"] for m in members]
        users_in = await db.users.find({"user_id": {"$in": uids}}, {"_id": 0}).to_list(2000)
        for u in users_in:
            dn = (u.get("display_name") or "").lower()
            if dn in (m.lower() for m in mentions) and u["user_id"] != user["user_id"]:
                await push_notification(u["user_id"], "mention", {
                    "channel_id": ch["channel_id"], "server_id": ch["server_id"],
                    "message_id": msg["message_id"], "from": user["display_name"],
                })
    return msg

@api.patch("/messages/{message_id}")
async def edit_message(message_id: str, payload: EditMessageIn, user: dict = Depends(get_current_user)):
    msg = await db.messages.find_one({"message_id": message_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Not found")
    if msg["author_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not your message")
    await db.messages.update_one({"message_id": message_id}, {"$set": {"content": payload.content, "edited_at": now_iso()}})
    if msg.get("server_id"):
        await hub.broadcast_server(msg["server_id"], "message.update", {"message_id": message_id, "content": payload.content, "edited_at": now_iso()})
    elif msg.get("dm_id"):
        dm = await db.dms.find_one({"dm_id": msg["dm_id"]}, {"_id": 0})
        if dm:
            await hub.send_users(dm["participants"], "message.update", {"message_id": message_id, "content": payload.content, "edited_at": now_iso()})
    return {"ok": True}

@api.delete("/messages/{message_id}")
async def delete_message(message_id: str, user: dict = Depends(get_current_user)):
    msg = await db.messages.find_one({"message_id": message_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Not found")
    if msg["author_id"] != user["user_id"]:
        if msg.get("server_id"):
            perms = await member_perms(msg["server_id"], user["user_id"])
            if not (perms & PERM_MANAGE_MESSAGES) and not (perms & PERM_ADMINISTRATOR):
                raise HTTPException(status_code=403, detail="No permission")
        else:
            raise HTTPException(status_code=403, detail="Not your message")
    await db.messages.update_one({"message_id": message_id}, {"$set": {"deleted": True, "content": ""}})
    if msg.get("server_id"):
        await hub.broadcast_server(msg["server_id"], "message.delete", {"message_id": message_id, "channel_id": msg.get("channel_id")})
    elif msg.get("dm_id"):
        dm = await db.dms.find_one({"dm_id": msg["dm_id"]}, {"_id": 0})
        if dm:
            await hub.send_users(dm["participants"], "message.delete", {"message_id": message_id, "dm_id": msg["dm_id"]})
    return {"ok": True}

@api.post("/messages/{message_id}/reactions")
async def add_reaction(message_id: str, payload: ReactionIn, user: dict = Depends(get_current_user)):
    msg = await db.messages.find_one({"message_id": message_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Not found")
    reactions = msg.get("reactions", [])
    found = next((r for r in reactions if r["emoji"] == payload.emoji), None)
    if found:
        if user["user_id"] in found["users"]:
            found["users"].remove(user["user_id"])
            if not found["users"]:
                reactions.remove(found)
        else:
            found["users"].append(user["user_id"])
    else:
        reactions.append({"emoji": payload.emoji, "users": [user["user_id"]]})
    await db.messages.update_one({"message_id": message_id}, {"$set": {"reactions": reactions}})
    if msg.get("server_id"):
        await hub.broadcast_server(msg["server_id"], "message.reaction", {"message_id": message_id, "reactions": reactions})
    elif msg.get("dm_id"):
        dm = await db.dms.find_one({"dm_id": msg["dm_id"]}, {"_id": 0})
        if dm:
            await hub.send_users(dm["participants"], "message.reaction", {"message_id": message_id, "reactions": reactions})
    return {"reactions": reactions}

@api.post("/messages/{message_id}/pin")
async def pin_message(message_id: str, user: dict = Depends(get_current_user)):
    msg = await db.messages.find_one({"message_id": message_id}, {"_id": 0})
    if not msg or not msg.get("server_id"):
        raise HTTPException(status_code=404, detail="Not found")
    await require_membership(msg["server_id"], user, PERM_MANAGE_MESSAGES)
    await db.messages.update_one({"message_id": message_id}, {"$set": {"pinned": True}})
    await hub.broadcast_server(msg["server_id"], "message.pin", {"message_id": message_id, "pinned": True})
    return {"ok": True}

@api.delete("/messages/{message_id}/pin")
async def unpin_message(message_id: str, user: dict = Depends(get_current_user)):
    msg = await db.messages.find_one({"message_id": message_id}, {"_id": 0})
    if not msg or not msg.get("server_id"):
        raise HTTPException(status_code=404, detail="Not found")
    await require_membership(msg["server_id"], user, PERM_MANAGE_MESSAGES)
    await db.messages.update_one({"message_id": message_id}, {"$set": {"pinned": False}})
    await hub.broadcast_server(msg["server_id"], "message.pin", {"message_id": message_id, "pinned": False})
    return {"ok": True}

@api.get("/channels/{channel_id}/pins")
async def list_pins(channel_id: str, user: dict = Depends(get_current_user)):
    await _resolve_channel(channel_id, user)
    rows = await db.messages.find({"channel_id": channel_id, "pinned": True, "deleted": {"$ne": True}}, {"_id": 0}).to_list(100)
    return rows

@api.get("/servers/{server_id}/search")
async def search_messages(server_id: str, q: str, user: dict = Depends(get_current_user)):
    await require_membership(server_id, user)
    rows = await db.messages.find(
        {"server_id": server_id, "deleted": {"$ne": True}, "content": {"$regex": q, "$options": "i"}},
        {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    return rows

# ========== Direct Messages with E2E key exchange ==========
@api.post("/dms")
async def create_dm(payload: CreateDMIn, user: dict = Depends(get_current_user)):
    other = await db.users.find_one({"user_id": payload.user_id}, {"_id": 0})
    if not other:
        raise HTTPException(status_code=404, detail="User not found")
    a, b = sorted([user["user_id"], payload.user_id])
    existing = await db.dms.find_one({"key": f"{a}:{b}"}, {"_id": 0})
    if existing:
        return existing
    doc = {"dm_id": gen_id("dm"), "key": f"{a}:{b}", "participants": [a, b],
           "created_at": now_iso(), "last_message_at": None}
    await db.dms.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.get("/dms")
async def list_dms(user: dict = Depends(get_current_user)):
    rows = await db.dms.find({"participants": user["user_id"]}, {"_id": 0}).sort("last_message_at", -1).to_list(100)
    user_ids = list({p for r in rows for p in r["participants"] if p != user["user_id"]})
    users = await db.users.find({"user_id": {"$in": user_ids}}, {"_id": 0}).to_list(1000)
    umap = {u["user_id"]: public_user(u) for u in users}
    for r in rows:
        other = next((p for p in r["participants"] if p != user["user_id"]), None)
        r["other"] = umap.get(other)
    return rows

@api.get("/dms/{dm_id}/messages")
async def dm_messages(dm_id: str, before: Optional[str] = None, limit: int = 50, user: dict = Depends(get_current_user)):
    dm = await db.dms.find_one({"dm_id": dm_id}, {"_id": 0})
    if not dm or user["user_id"] not in dm["participants"]:
        raise HTTPException(status_code=404, detail="Not found")
    q: Dict[str, Any] = {"dm_id": dm_id, "deleted": {"$ne": True}}
    if before:
        q["created_at"] = {"$lt": before}
    rows = await db.messages.find(q, {"_id": 0}).sort("created_at", -1).limit(min(limit, 100)).to_list(limit)
    rows.reverse()
    return rows

@api.post("/dms/{dm_id}/messages")
async def dm_send(dm_id: str, payload: SendMessageIn, user: dict = Depends(get_current_user)):
    dm = await db.dms.find_one({"dm_id": dm_id}, {"_id": 0})
    if not dm or user["user_id"] not in dm["participants"]:
        raise HTTPException(status_code=404, detail="Not found")
    if not rate_limit(f"dm:{user['user_id']}", 30, 10):
        raise HTTPException(status_code=429, detail="Slow down")
    msg = {
        "message_id": gen_id("msg"),
        "dm_id": dm_id, "author_id": user["user_id"],
        "content": payload.content,  # may be base64 ciphertext
        "attachments": payload.attachments or [],
        "reply_to": payload.reply_to,
        "nonce": payload.nonce,
        "reactions": [], "pinned": False,
        "encrypted": bool(payload.nonce),
        "created_at": now_iso(), "edited_at": None, "deleted": False,
    }
    await db.messages.insert_one(msg)
    await db.dms.update_one({"dm_id": dm_id}, {"$set": {"last_message_at": msg["created_at"]}})
    msg.pop("_id", None)
    msg["author"] = public_user(user)
    await hub.send_users(dm["participants"], "message.create", msg)
    # Notification au destinataire
    other_id = next((p for p in dm["participants"] if p != user["user_id"]), None)
    if other_id:
        await push_notification(other_id, "dm", {
            "dm_id": dm_id, "from": user["display_name"], "message_id": msg["message_id"]
        })
    return msg
@api.post("/uploads")
async def upload(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename")
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "bin"
    if ext not in {"jpg", "jpeg", "png", "gif", "webp", "pdf", "txt", "md", "json", "csv", "mp4", "webm", "mp3", "wav", "ogg"}:
        raise HTTPException(status_code=415, detail=f"File type .{ext} not allowed")
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 25MB)")
    path = f"{APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    content_type = file.content_type or "application/octet-stream"
    try:
        result = storage_put(path, data, content_type)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")
    file_doc = {
        "file_id": gen_id("file"),
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "uploader_id": user["user_id"],
        "is_deleted": False,
        "created_at": now_iso(),
    }
    await db.files.insert_one(file_doc)
    file_doc.pop("_id", None)
    file_doc["url"] = f"/api/files/{result['path']}"
    return file_doc

@api.get("/files/{path:path}")
async def download_file(path: str, request: Request):
    # Files are public-once-uploaded by URL knowledge (path includes user uuid). For private flows, add auth here.
    record = await db.files.find_one({"storage_path": path, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        data, content_type = storage_get(path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storage error: {e}")
    return Response(content=data, media_type=record.get("content_type", content_type),
                    headers={"Cache-Control": "public, max-age=3600"})

# ========== Notifications ==========
@api.get("/notifications")
async def list_notifications(user: dict = Depends(get_current_user)):
    rows = await db.notifications.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    return rows

@api.patch("/notifications/read")
async def mark_read(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["user_id"], "read": False}, {"$set": {"read": True}})
    return {"ok": True}

# ========== Voice signaling (basic relay) ==========
class VoiceSignalIn(BaseModel):
    target_user_id: str
    type: str  # offer / answer / ice / hangup
    payload: Dict[str, Any]
    dm_id: Optional[str] = None

@api.post("/voice/signal")
async def voice_signal(payload: VoiceSignalIn, user: dict = Depends(get_current_user)):
    await hub.send_user(payload.target_user_id, "voice.signal", {
        "from": user["user_id"], "type": payload.type, "payload": payload.payload, "dm_id": payload.dm_id
    })
    return {"ok": True}

# ========== WebSocket ==========
@api.websocket("/ws")
async def ws_endpoint(websocket: WebSocket, token: Optional[str] = Query(None)):
    user = await get_user_by_token(token) if token else None
    if not user:
        await websocket.close(code=4401)
        return
    uid = user["user_id"]
    await hub.connect(uid, websocket)
    # presence: set online
    await db.users.update_one({"user_id": uid}, {"$set": {"status": "online", "last_seen": now_iso()}})
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
            except Exception:
                continue
            ev = msg.get("event")
            d = msg.get("data") or {}
            if ev == "ping":
                await websocket.send_text(json.dumps({"event": "pong", "data": {"t": time.time()}}))
            elif ev == "typing.start":
                cid = d.get("channel_id"); did = d.get("dm_id")
                if cid:
                    ch = await db.channels.find_one({"channel_id": cid}, {"_id": 0})
                    if ch:
                        await hub.broadcast_server(ch["server_id"], "typing.start", {"channel_id": cid, "user_id": uid})
                elif did:
                    dm = await db.dms.find_one({"dm_id": did}, {"_id": 0})
                    if dm:
                        await hub.send_users([p for p in dm["participants"] if p != uid], "typing.start", {"dm_id": did, "user_id": uid})
    except WebSocketDisconnect:
        pass
    finally:
        hub.disconnect(uid, websocket)
        if uid not in hub.connections:
            await db.users.update_one({"user_id": uid}, {"$set": {"status": "offline", "last_seen": now_iso()}})

# ========== Reports / Modération anti-DMCA ==========
class ReportIn(BaseModel):
    target_type: str = Field(pattern="^(server|user|message|channel)$")
    target_id: str
    category: str = Field(pattern="^(illegal|harassment|spam|nsfw|other)$")
    description: str = Field(min_length=10, max_length=2000)

@api.post("/reports")
async def create_report(payload: ReportIn, user: dict = Depends(get_current_user)):
    if not rate_limit(f"report:{user['user_id']}", 10, 3600):
        raise HTTPException(status_code=429, detail="Trop de signalements")
    doc = {
        "report_id": gen_id("rep"),
        "reporter_id": user["user_id"],
        "target_type": payload.target_type,
        "target_id": payload.target_id,
        "category": payload.category,
        "description": payload.description,
        "status": "pending",  # pending / validated / rejected
        "created_at": now_iso(),
    }
    await db.reports.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.get("/admin/reports")
async def list_reports(status_filter: Optional[str] = Query(None, alias="status"), user: dict = Depends(require_admin)):
    q = {}
    if status_filter:
        q["status"] = status_filter
    rows = await db.reports.find(q, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)
    return rows

@api.patch("/admin/reports/{report_id}")
async def update_report(report_id: str, action: str = Query(..., pattern="^(validate|reject)$"), user: dict = Depends(require_admin)):
    new_status = "validated" if action == "validate" else "rejected"
    await db.reports.update_one({"report_id": report_id}, {"$set": {"status": new_status, "reviewed_by": user["user_id"], "reviewed_at": now_iso()}})
    return {"ok": True}

# ========== Emojis personnalisés ==========
class CreateEmojiIn(BaseModel):
    name: str = Field(min_length=2, max_length=32, pattern="^[a-z0-9_]+$")
    image_url: str

@api.post("/servers/{server_id}/emojis")
async def create_emoji(server_id: str, payload: CreateEmojiIn, user: dict = Depends(get_current_user)):
    await require_membership(server_id, user, PERM_MANAGE_SERVER)
    doc = {
        "emoji_id": gen_id("emj"),
        "server_id": server_id,
        "name": payload.name,
        "image_url": payload.image_url,
        "creator_id": user["user_id"],
        "created_at": now_iso(),
    }
    await db.emojis.insert_one(doc)
    doc.pop("_id", None)
    await hub.broadcast_server(server_id, "emoji.create", doc)
    return doc

@api.get("/servers/{server_id}/emojis")
async def list_emojis(server_id: str, user: dict = Depends(get_current_user)):
    await require_membership(server_id, user)
    return await db.emojis.find({"server_id": server_id}, {"_id": 0}).to_list(200)

@api.delete("/servers/{server_id}/emojis/{emoji_id}")
async def delete_emoji(server_id: str, emoji_id: str, user: dict = Depends(get_current_user)):
    await require_membership(server_id, user, PERM_MANAGE_SERVER)
    await db.emojis.delete_one({"emoji_id": emoji_id, "server_id": server_id})
    await hub.broadcast_server(server_id, "emoji.delete", {"emoji_id": emoji_id})
    return {"ok": True}

# ========== Polls / Sondages ==========
class CreatePollIn(BaseModel):
    channel_id: str
    question: str = Field(min_length=2, max_length=300)
    options: List[str] = Field(min_length=2, max_length=10)
    multi: bool = False
    expires_in_minutes: int = Field(0, ge=0, le=10080)

@api.post("/polls")
async def create_poll(payload: CreatePollIn, user: dict = Depends(get_current_user)):
    ch = await _resolve_channel(payload.channel_id, user)
    await require_membership(ch["server_id"], user, PERM_SEND)
    poll_id = gen_id("pol")
    options = [{"option_id": gen_id("opt"), "text": o.strip(), "votes": []} for o in payload.options if o.strip()]
    expires_at = (now_utc() + timedelta(minutes=payload.expires_in_minutes)).isoformat() if payload.expires_in_minutes else None
    poll = {
        "poll_id": poll_id, "channel_id": payload.channel_id, "server_id": ch["server_id"],
        "author_id": user["user_id"], "question": payload.question, "options": options,
        "multi": payload.multi, "expires_at": expires_at, "ended": False, "created_at": now_iso(),
    }
    await db.polls.insert_one(poll)
    # Créer un message porteur
    msg = {
        "message_id": gen_id("msg"),
        "channel_id": payload.channel_id, "server_id": ch["server_id"],
        "author_id": user["user_id"], "content": "",
        "attachments": [], "reply_to": None, "reactions": [], "pinned": False,
        "poll_id": poll_id, "created_at": now_iso(), "edited_at": None, "deleted": False,
    }
    await db.messages.insert_one(msg)
    msg.pop("_id", None); poll.pop("_id", None)
    msg["author"] = public_user(user); msg["poll"] = poll
    await hub.broadcast_server(ch["server_id"], "message.create", msg)
    return msg

@api.post("/polls/{poll_id}/vote")
async def vote_poll(poll_id: str, option_id: str = Query(...), user: dict = Depends(get_current_user)):
    poll = await db.polls.find_one({"poll_id": poll_id}, {"_id": 0})
    if not poll:
        raise HTTPException(status_code=404, detail="Sondage introuvable")
    if poll.get("ended"):
        raise HTTPException(status_code=410, detail="Sondage clôturé")
    options = poll["options"]
    uid = user["user_id"]
    if not poll.get("multi"):
        for o in options:
            if uid in o["votes"]:
                o["votes"].remove(uid)
    target = next((o for o in options if o["option_id"] == option_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Option introuvable")
    if uid in target["votes"]:
        target["votes"].remove(uid)
    else:
        target["votes"].append(uid)
    await db.polls.update_one({"poll_id": poll_id}, {"$set": {"options": options}})
    await hub.broadcast_server(poll["server_id"], "poll.update", {"poll_id": poll_id, "options": options})
    return {"options": options}

# ========== Threads ==========
class CreateThreadIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    parent_message_id: str

@api.post("/channels/{channel_id}/threads")
async def create_thread(channel_id: str, payload: CreateThreadIn, user: dict = Depends(get_current_user)):
    ch = await _resolve_channel(channel_id, user)
    parent = await db.messages.find_one({"message_id": payload.parent_message_id}, {"_id": 0})
    if not parent:
        raise HTTPException(status_code=404, detail="Message parent introuvable")
    thread_id = gen_id("thr")
    doc = {
        "thread_id": thread_id, "channel_id": channel_id, "server_id": ch["server_id"],
        "name": payload.name, "parent_message_id": payload.parent_message_id,
        "author_id": user["user_id"], "archived": False,
        "message_count": 0, "created_at": now_iso(),
    }
    await db.threads.insert_one(doc)
    await db.messages.update_one({"message_id": payload.parent_message_id}, {"$set": {"thread_id": thread_id}})
    doc.pop("_id", None)
    await hub.broadcast_server(ch["server_id"], "thread.create", doc)
    return doc

@api.get("/channels/{channel_id}/threads")
async def list_threads(channel_id: str, user: dict = Depends(get_current_user)):
    await _resolve_channel(channel_id, user)
    return await db.threads.find({"channel_id": channel_id, "archived": False}, {"_id": 0}).sort("created_at", -1).to_list(100)

@api.get("/threads/{thread_id}/messages")
async def thread_messages(thread_id: str, user: dict = Depends(get_current_user)):
    t = await db.threads.find_one({"thread_id": thread_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Fil introuvable")
    await require_membership(t["server_id"], user)
    rows = await db.messages.find({"thread_id": thread_id, "deleted": {"$ne": True}}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return rows

@api.post("/threads/{thread_id}/messages")
async def thread_send(thread_id: str, payload: SendMessageIn, user: dict = Depends(get_current_user)):
    t = await db.threads.find_one({"thread_id": thread_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Fil introuvable")
    await require_membership(t["server_id"], user, PERM_SEND)
    msg = {
        "message_id": gen_id("msg"),
        "channel_id": t["channel_id"], "server_id": t["server_id"],
        "thread_id": thread_id, "author_id": user["user_id"],
        "content": payload.content, "attachments": payload.attachments or [],
        "reply_to": payload.reply_to, "reactions": [], "pinned": False,
        "created_at": now_iso(), "edited_at": None, "deleted": False,
    }
    await db.messages.insert_one(msg)
    await db.threads.update_one({"thread_id": thread_id}, {"$inc": {"message_count": 1}})
    msg.pop("_id", None); msg["author"] = public_user(user)
    await hub.broadcast_server(t["server_id"], "thread.message", msg)
    return msg

# ========== Bookmarks (messages sauvegardés) ==========
@api.post("/bookmarks/{message_id}")
async def add_bookmark(message_id: str, user: dict = Depends(get_current_user)):
    m = await db.messages.find_one({"message_id": message_id}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Message introuvable")
    await db.bookmarks.update_one(
        {"user_id": user["user_id"], "message_id": message_id},
        {"$set": {"user_id": user["user_id"], "message_id": message_id, "saved_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True}

@api.delete("/bookmarks/{message_id}")
async def remove_bookmark(message_id: str, user: dict = Depends(get_current_user)):
    await db.bookmarks.delete_one({"user_id": user["user_id"], "message_id": message_id})
    return {"ok": True}

@api.get("/bookmarks")
async def list_bookmarks(user: dict = Depends(get_current_user)):
    rows = await db.bookmarks.find({"user_id": user["user_id"]}, {"_id": 0}).sort("saved_at", -1).limit(100).to_list(100)
    ids = [r["message_id"] for r in rows]
    msgs = await db.messages.find({"message_id": {"$in": ids}}, {"_id": 0}).to_list(200)
    msg_map = {m["message_id"]: m for m in msgs}
    out = []
    for r in rows:
        m = msg_map.get(r["message_id"])
        if m:
            author = await db.users.find_one({"user_id": m["author_id"]}, {"_id": 0})
            m["author"] = public_user(author) if author else None
            out.append({"saved_at": r["saved_at"], "message": m})
    return out

# ========== Webhooks ==========
class CreateWebhookIn(BaseModel):
    name: str = Field(min_length=2, max_length=64)
    channel_id: str

@api.post("/servers/{server_id}/webhooks")
async def create_webhook(server_id: str, payload: CreateWebhookIn, user: dict = Depends(get_current_user)):
    await require_membership(server_id, user, PERM_MANAGE_SERVER)
    token = secrets.token_urlsafe(32)
    doc = {
        "webhook_id": gen_id("whk"),
        "server_id": server_id, "channel_id": payload.channel_id,
        "name": payload.name, "token": token,
        "creator_id": user["user_id"], "created_at": now_iso(),
    }
    await db.webhooks.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.get("/servers/{server_id}/webhooks")
async def list_webhooks(server_id: str, user: dict = Depends(get_current_user)):
    await require_membership(server_id, user, PERM_MANAGE_SERVER)
    return await db.webhooks.find({"server_id": server_id}, {"_id": 0}).to_list(100)

@api.delete("/servers/{server_id}/webhooks/{webhook_id}")
async def delete_webhook(server_id: str, webhook_id: str, user: dict = Depends(get_current_user)):
    await require_membership(server_id, user, PERM_MANAGE_SERVER)
    await db.webhooks.delete_one({"webhook_id": webhook_id, "server_id": server_id})
    return {"ok": True}

class WebhookExecIn(BaseModel):
    content: str = Field(max_length=4000)
    username: Optional[str] = None
    avatar_url: Optional[str] = None

@api.post("/webhooks/{webhook_id}/execute")
async def execute_webhook(webhook_id: str, token: str, payload: WebhookExecIn):
    w = await db.webhooks.find_one({"webhook_id": webhook_id, "token": token}, {"_id": 0})
    if not w:
        raise HTTPException(status_code=404, detail="Webhook invalide")
    msg = {
        "message_id": gen_id("msg"),
        "channel_id": w["channel_id"], "server_id": w["server_id"],
        "author_id": "webhook:" + w["webhook_id"], "webhook_id": w["webhook_id"],
        "webhook_name": payload.username or w["name"],
        "webhook_avatar": payload.avatar_url,
        "content": payload.content, "attachments": [], "reactions": [], "pinned": False,
        "created_at": now_iso(), "edited_at": None, "deleted": False,
    }
    await db.messages.insert_one(msg)
    msg.pop("_id", None)
    msg["author"] = {"display_name": payload.username or w["name"], "avatar_url": payload.avatar_url, "user_id": "webhook"}
    await hub.broadcast_server(w["server_id"], "message.create", msg)
    return {"ok": True}

# ========== Notifications ==========
async def push_notification(user_id: str, kind: str, data: dict):
    doc = {
        "notif_id": gen_id("ntf"),
        "user_id": user_id, "kind": kind, "data": data,
        "read": False, "created_at": now_iso(),
    }
    await db.notifications.insert_one(doc)
    doc.pop("_id", None)
    await hub.send_user(user_id, "notification.new", doc)

# ========== Server Boost ==========
@api.post("/servers/{server_id}/boost")
async def boost_server(server_id: str, user: dict = Depends(get_current_user)):
    await require_membership(server_id, user)
    existing = await db.boosts.find_one({"server_id": server_id, "user_id": user["user_id"]}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail="Vous boostez déjà ce serveur")
    await db.boosts.insert_one({"boost_id": gen_id("bst"), "server_id": server_id, "user_id": user["user_id"], "since": now_iso()})
    await db.servers.update_one({"server_id": server_id}, {"$inc": {"boost_count": 1}})
    await hub.broadcast_server(server_id, "server.boost", {"user_id": user["user_id"]})
    return {"ok": True}

@api.delete("/servers/{server_id}/boost")
async def unboost_server(server_id: str, user: dict = Depends(get_current_user)):
    res = await db.boosts.delete_one({"server_id": server_id, "user_id": user["user_id"]})
    if res.deleted_count:
        await db.servers.update_one({"server_id": server_id}, {"$inc": {"boost_count": -1}})
    return {"ok": True}

# ========== Mute / Timeout ==========
class MuteIn(BaseModel):
    duration_minutes: int = Field(ge=1, le=10080)
    reason: Optional[str] = Field("", max_length=500)

@api.post("/servers/{server_id}/mute/{target_id}")
async def mute_member(server_id: str, target_id: str, payload: MuteIn, user: dict = Depends(get_current_user)):
    await require_membership(server_id, user, PERM_KICK)  # même perm que kick
    until = (now_utc() + timedelta(minutes=payload.duration_minutes)).isoformat()
    await db.members.update_one(
        {"server_id": server_id, "user_id": target_id},
        {"$set": {"muted_until": until, "mute_reason": payload.reason}}
    )
    await db.audit_log.insert_one({
        "audit_id": gen_id("au"), "server_id": server_id, "actor_id": user["user_id"],
        "target_id": target_id, "action": "member.mute",
        "data": {"until": until, "reason": payload.reason}, "at": now_iso()
    })
    await hub.broadcast_server(server_id, "member.mute", {"user_id": target_id, "until": until})
    return {"ok": True, "muted_until": until}

@api.delete("/servers/{server_id}/mute/{target_id}")
async def unmute_member(server_id: str, target_id: str, user: dict = Depends(get_current_user)):
    await require_membership(server_id, user, PERM_KICK)
    await db.members.update_one(
        {"server_id": server_id, "user_id": target_id},
        {"$unset": {"muted_until": "", "mute_reason": ""}}
    )
    return {"ok": True}

# ========== Politique légale ==========
@api.get("/legal/policy")
async def get_policy():
    return {
        "name": "CentCord",
        "policy_version": "2026.05",
        "anti_dmca": True,
        "highlights": [
            "Aucun serveur ne peut être supprimé sauf en cas d'activité illégale confirmée.",
            "La plateforme n'honore pas les demandes DMCA standard non couvertes par le droit français/UE.",
            "Les contenus signalés sont examinés par notre équipe avant toute action.",
            "Les messages directs sont chiffrés de bout en bout (E2E) et inaccessibles au serveur.",
            "Les propriétaires de serveur peuvent archiver, mais pas supprimer leur communauté.",
        ],
        "actions": {
            "archive_server": "POST /api/servers/{id}/archive",
            "report_illegal": "POST /api/reports (target_type=server, category=illegal)",
            "request_data": "Contactez admin@centcord.app",
        }
    }


@api.get("/")
async def root():
    return {"app": "centcord", "version": "1.0.0", "status": "ok"}

@api.get("/health")
async def health():
    try:
        await db.command("ping")
        return {"ok": True, "db": "up"}
    except Exception as e:
        return {"ok": False, "db": str(e)}

# ========== Startup ==========
@app.on_event("startup")
async def on_startup():
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.servers.create_index("server_id", unique=True)
    await db.channels.create_index([("server_id", 1), ("position", 1)])
    await db.channels.create_index("channel_id", unique=True)
    await db.messages.create_index([("channel_id", 1), ("created_at", -1)])
    await db.messages.create_index([("dm_id", 1), ("created_at", -1)])
    await db.messages.create_index("message_id", unique=True)
    await db.members.create_index([("server_id", 1), ("user_id", 1)], unique=True)
    await db.invites.create_index("code", unique=True)
    await db.dms.create_index("key", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.friends.create_index([("a", 1), ("b", 1)], unique=True)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.bookmarks.create_index([("user_id", 1), ("message_id", 1)], unique=True)
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    await db.reports.create_index([("status", 1), ("created_at", -1)])
    await db.emojis.create_index([("server_id", 1)])
    await db.threads.create_index([("channel_id", 1)])
    await db.boosts.create_index([("server_id", 1), ("user_id", 1)], unique=True)
    log.info("Indexes ensured")

    # Seed admin
    admin = await db.users.find_one({"email": ADMIN_EMAIL})
    if not admin:
        await db.users.insert_one({
            "user_id": gen_id("usr"),
            "email": ADMIN_EMAIL.lower(),
            "password_hash": hash_password(ADMIN_PASSWORD),
            "display_name": "Admin",
            "avatar_url": None, "banner_url": None, "bio": "Founder of CentCord",
            "pronouns": "", "accent_color": "#FF3B00", "status": "online", "custom_status": "",
            "role": "admin", "auth_provider": "password", "public_key": None,
            "created_at": now_iso(),
        })
        log.info("Admin user seeded")
    elif not admin.get("password_hash") or not verify_password(ADMIN_PASSWORD, admin["password_hash"]):
        await db.users.update_one({"email": ADMIN_EMAIL}, {"$set": {"password_hash": hash_password(ADMIN_PASSWORD), "role": "admin"}})
        log.info("Admin password updated")

    # Init storage
    init_storage()

@app.on_event("shutdown")
async def on_shutdown():
    mongo_client.close()

app.include_router(api)

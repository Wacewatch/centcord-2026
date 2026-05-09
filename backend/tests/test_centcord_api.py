"""
CentCord backend API regression tests.
Covers: health, auth (register/login/me/refresh), users, servers, channels,
roles, members, invites, messages (send/edit/react/pin/search/delete),
DMs, friends, discover, moderation (kick/ban/audit), uploads, permissions.
"""
import os
import io
import time
import uuid
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://voice-chat-debug-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
ADMIN_EMAIL = "admin@centcord.app"
ADMIN_PASSWORD = "CentCordAdmin!2026"

UNIQUE = uuid.uuid4().hex[:8]

# ---------- shared state ----------
state = {
    "admin_token": None, "admin_id": None,
    "u1_token": None, "u1_id": None, "u1_email": None,
    "u2_token": None, "u2_id": None, "u2_email": None,
    "server_id": None, "default_channel": None, "default_role": None,
    "category_id": None, "new_channel": None, "role_id": None,
    "invite_code": None, "friend_id": None, "dm_id": None,
    "msg_id": None,
}


def auth_headers(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- 1. Health ----------
# Basic: service up and DB reachable
def test_health():
    r = requests.get(f"{API}/health", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data.get("ok") is True
    assert data.get("db") == "up"


def test_root():
    r = requests.get(f"{API}/", timeout=15)
    assert r.status_code == 200
    assert r.json().get("app") == "centcord"


# ---------- 2. Auth ----------
def test_admin_login():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "access_token" in data and "refresh_token" in data
    assert data["user"]["email"] == ADMIN_EMAIL
    assert data["user"]["role"] == "admin"
    state["admin_token"] = data["access_token"]
    state["admin_id"] = data["user"]["user_id"]


def test_admin_login_wrong_password():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrongpw"}, timeout=15)
    assert r.status_code == 401


def test_register_user1():
    state["u1_email"] = f"test_u1_{UNIQUE}@centcord.example.com"
    r = requests.post(f"{API}/auth/register", json={
        "email": state["u1_email"], "password": "Passw0rd!pass", "display_name": f"TEST_U1_{UNIQUE}"
    }, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["user"]["email"] == state["u1_email"]
    state["u1_token"] = d["access_token"]
    state["u1_id"] = d["user"]["user_id"]


def test_register_user2():
    state["u2_email"] = f"test_u2_{UNIQUE}@centcord.example.com"
    r = requests.post(f"{API}/auth/register", json={
        "email": state["u2_email"], "password": "Passw0rd!pass", "display_name": f"TEST_U2_{UNIQUE}"
    }, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    state["u2_token"] = d["access_token"]
    state["u2_id"] = d["user"]["user_id"]


def test_register_duplicate_email():
    r = requests.post(f"{API}/auth/register", json={
        "email": state["u1_email"], "password": "Passw0rd!pass", "display_name": "x"
    }, timeout=15)
    assert r.status_code == 409


def test_auth_me():
    r = requests.get(f"{API}/auth/me", headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 200
    assert r.json()["user_id"] == state["u1_id"]


def test_auth_me_unauthenticated():
    r = requests.get(f"{API}/auth/me", timeout=15)
    assert r.status_code == 401


def test_auth_refresh():
    # Login to get a refresh token (fresh session)
    r = requests.post(f"{API}/auth/login", json={"email": state["u1_email"], "password": "Passw0rd!pass"}, timeout=15)
    assert r.status_code == 200
    rt = r.json()["refresh_token"]
    r2 = requests.post(f"{API}/auth/refresh", headers={"Authorization": f"Bearer {rt}"}, timeout=15)
    assert r2.status_code == 200, r2.text
    assert "access_token" in r2.json()


# ---------- 3. Users ----------
def test_update_profile():
    r = requests.patch(f"{API}/users/me", headers=auth_headers(state["u1_token"]), json={
        "display_name": f"TEST_U1_updated_{UNIQUE}", "bio": "hello", "accent_color": "#123456",
        "status": "idle", "public_key": "pubkey-base64-xx"
    }, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["bio"] == "hello"
    assert d["accent_color"] == "#123456"
    assert d["status"] == "idle"
    assert d["public_key"] == "pubkey-base64-xx"


def test_user_search():
    r = requests.get(f"{API}/users/search/TEST_U1_{UNIQUE[:4]}", headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 200
    results = r.json()
    assert any(u["user_id"] == state["u1_id"] for u in results)


# ---------- 4. Servers ----------
def test_create_server():
    r = requests.post(f"{API}/servers", headers=auth_headers(state["u1_token"]),
                      json={"name": f"TEST_Server_{UNIQUE}", "description": "t", "is_public": True}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    state["server_id"] = d["server_id"]
    assert d["owner_id"] == state["u1_id"]
    assert d["is_public"] is True


def test_get_server():
    r = requests.get(f"{API}/servers/{state['server_id']}", headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert len(d["channels"]) >= 2  # general + general-voice
    assert len(d["roles"]) >= 1
    assert len(d["categories"]) >= 1
    assert d["my_perms"] > 0
    state["default_channel"] = next(c["channel_id"] for c in d["channels"] if c["type"] == "text")
    state["default_role"] = d["roles"][0]["role_id"]


def test_my_servers():
    r = requests.get(f"{API}/servers", headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 200
    assert any(s["server_id"] == state["server_id"] for s in r.json())


def test_non_member_cannot_read_server():
    r = requests.get(f"{API}/servers/{state['server_id']}", headers=auth_headers(state["u2_token"]), timeout=15)
    assert r.status_code == 403


def test_update_server():
    r = requests.patch(f"{API}/servers/{state['server_id']}", headers=auth_headers(state["u1_token"]),
                       json={"description": "updated desc"}, timeout=15)
    assert r.status_code == 200
    assert r.json()["description"] == "updated desc"


def test_create_category():
    r = requests.post(f"{API}/servers/{state['server_id']}/categories",
                      headers=auth_headers(state["u1_token"]),
                      json={"name": "TEST_CAT"}, timeout=15)
    assert r.status_code == 200
    state["category_id"] = r.json()["category_id"]


def test_create_channel():
    r = requests.post(f"{API}/servers/{state['server_id']}/channels",
                      headers=auth_headers(state["u1_token"]),
                      json={"name": "test-ch", "type": "text", "category_id": state["category_id"], "topic": "T"},
                      timeout=15)
    assert r.status_code == 200, r.text
    state["new_channel"] = r.json()["channel_id"]
    assert r.json()["name"] == "test-ch"


def test_update_channel():
    r = requests.patch(f"{API}/servers/{state['server_id']}/channels/{state['new_channel']}",
                       headers=auth_headers(state["u1_token"]),
                       json={"topic": "updated topic", "slowmode": 5}, timeout=15)
    assert r.status_code == 200
    assert r.json()["topic"] == "updated topic"
    assert r.json()["slowmode"] == 5


def test_create_role():
    r = requests.post(f"{API}/servers/{state['server_id']}/roles",
                      headers=auth_headers(state["u1_token"]),
                      json={"name": "TestRole", "color": "#00FF00", "permissions": 3, "mentionable": True},
                      timeout=15)
    assert r.status_code == 200
    state["role_id"] = r.json()["role_id"]


def test_list_members():
    r = requests.get(f"{API}/servers/{state['server_id']}/members",
                     headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 200
    members = r.json()
    assert any(m["user_id"] == state["u1_id"] for m in members)
    assert all("user" in m for m in members)


# ---------- 5. Invites & joining ----------
def test_create_invite():
    r = requests.post(f"{API}/servers/{state['server_id']}/invites",
                      headers=auth_headers(state["u1_token"]),
                      json={"max_uses": 0, "expires_in_minutes": 60}, timeout=15)
    assert r.status_code == 200
    state["invite_code"] = r.json()["code"]
    assert state["invite_code"]


def test_user2_joins_via_invite():
    r = requests.post(f"{API}/invites/{state['invite_code']}",
                      headers=auth_headers(state["u2_token"]), timeout=15)
    assert r.status_code == 200
    assert r.json()["server_id"] == state["server_id"]
    # verify membership
    r2 = requests.get(f"{API}/servers/{state['server_id']}", headers=auth_headers(state["u2_token"]), timeout=15)
    assert r2.status_code == 200


def test_invalid_invite():
    r = requests.post(f"{API}/invites/INVALID99",
                      headers=auth_headers(state["u2_token"]), timeout=15)
    assert r.status_code == 404


# ---------- 6. Messages ----------
def test_send_message():
    r = requests.post(f"{API}/channels/{state['default_channel']}/messages",
                      headers=auth_headers(state["u1_token"]),
                      json={"content": "hello TEST"}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    state["msg_id"] = d["message_id"]
    assert d["content"] == "hello TEST"
    assert d["author"]["user_id"] == state["u1_id"]


def test_get_messages():
    r = requests.get(f"{API}/channels/{state['default_channel']}/messages",
                     headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 200
    msgs = r.json()
    assert any(m["message_id"] == state["msg_id"] for m in msgs)
    # author info populated
    assert all(m.get("author") for m in msgs if not m.get("deleted"))


def test_edit_message():
    r = requests.patch(f"{API}/messages/{state['msg_id']}",
                       headers=auth_headers(state["u1_token"]),
                       json={"content": "edited TEST"}, timeout=15)
    assert r.status_code == 200
    # verify
    r2 = requests.get(f"{API}/channels/{state['default_channel']}/messages",
                      headers=auth_headers(state["u1_token"]), timeout=15)
    msg = next(m for m in r2.json() if m["message_id"] == state["msg_id"])
    assert msg["content"] == "edited TEST"
    assert msg["edited_at"] is not None


def test_edit_message_forbidden():
    r = requests.patch(f"{API}/messages/{state['msg_id']}",
                       headers=auth_headers(state["u2_token"]),
                       json={"content": "hacked"}, timeout=15)
    assert r.status_code == 403


def test_add_reaction():
    r = requests.post(f"{API}/messages/{state['msg_id']}/reactions",
                      headers=auth_headers(state["u2_token"]),
                      json={"emoji": "🔥"}, timeout=15)
    assert r.status_code == 200
    reactions = r.json()["reactions"]
    assert any(x["emoji"] == "🔥" and state["u2_id"] in x["users"] for x in reactions)


def test_pin_message():
    r = requests.post(f"{API}/messages/{state['msg_id']}/pin",
                      headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 200
    # verify in pins
    rp = requests.get(f"{API}/channels/{state['default_channel']}/pins",
                      headers=auth_headers(state["u1_token"]), timeout=15)
    assert rp.status_code == 200
    assert any(m["message_id"] == state["msg_id"] for m in rp.json())


def test_pin_forbidden_for_non_manager():
    # u2 is a regular member, no MANAGE_MESSAGES
    # send another message from u2 first
    r_send = requests.post(f"{API}/channels/{state['default_channel']}/messages",
                           headers=auth_headers(state["u2_token"]),
                           json={"content": "u2 msg"}, timeout=15)
    assert r_send.status_code == 200
    mid = r_send.json()["message_id"]
    r = requests.post(f"{API}/messages/{mid}/pin",
                      headers=auth_headers(state["u2_token"]), timeout=15)
    assert r.status_code == 403


def test_search_messages():
    r = requests.get(f"{API}/servers/{state['server_id']}/search",
                     params={"q": "edited"},
                     headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 200
    assert any(m["message_id"] == state["msg_id"] for m in r.json())


def test_delete_message():
    # create a throwaway message
    rc = requests.post(f"{API}/channels/{state['default_channel']}/messages",
                       headers=auth_headers(state["u1_token"]),
                       json={"content": "delete me"}, timeout=15)
    mid = rc.json()["message_id"]
    r = requests.delete(f"{API}/messages/{mid}",
                        headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 200
    # verify soft-deleted (not returned in list)
    r2 = requests.get(f"{API}/channels/{state['default_channel']}/messages",
                      headers=auth_headers(state["u1_token"]), timeout=15)
    assert all(m["message_id"] != mid for m in r2.json())


# ---------- 7. DMs ----------
def test_create_dm():
    r = requests.post(f"{API}/dms", headers=auth_headers(state["u1_token"]),
                      json={"user_id": state["u2_id"]}, timeout=15)
    assert r.status_code == 200
    state["dm_id"] = r.json()["dm_id"]


def test_list_dms():
    r = requests.get(f"{API}/dms", headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 200
    assert any(d["dm_id"] == state["dm_id"] for d in r.json())


def test_send_dm_plain():
    r = requests.post(f"{API}/dms/{state['dm_id']}/messages",
                      headers=auth_headers(state["u1_token"]),
                      json={"content": "hi u2"}, timeout=15)
    assert r.status_code == 200
    assert r.json()["encrypted"] is False


def test_send_dm_e2e():
    r = requests.post(f"{API}/dms/{state['dm_id']}/messages",
                      headers=auth_headers(state["u1_token"]),
                      json={"content": "base64-ciphertext", "nonce": "base64-nonce"}, timeout=15)
    assert r.status_code == 200
    assert r.json()["encrypted"] is True
    assert r.json()["nonce"] == "base64-nonce"


def test_get_dm_messages():
    r = requests.get(f"{API}/dms/{state['dm_id']}/messages",
                     headers=auth_headers(state["u2_token"]), timeout=15)
    assert r.status_code == 200
    assert len(r.json()) >= 2


# ---------- 8. Friends ----------
def test_friend_request():
    r = requests.post(f"{API}/friends/requests",
                      headers=auth_headers(state["u1_token"]),
                      json={"target": state["u2_email"]}, timeout=15)
    assert r.status_code == 200


def test_list_friends_pending():
    r = requests.get(f"{API}/friends", headers=auth_headers(state["u2_token"]), timeout=15)
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) >= 1
    state["friend_id"] = rows[0]["friend_id"]
    assert rows[0]["status"] == "pending"


def test_accept_friend():
    r = requests.patch(f"{API}/friends/{state['friend_id']}",
                       params={"action": "accept"},
                       headers=auth_headers(state["u2_token"]), timeout=15)
    assert r.status_code == 200
    # verify accepted
    r2 = requests.get(f"{API}/friends", headers=auth_headers(state["u1_token"]), timeout=15)
    f = next(x for x in r2.json() if x["friend_id"] == state["friend_id"])
    assert f["status"] == "accepted"


def test_remove_friend():
    r = requests.delete(f"{API}/friends/{state['friend_id']}",
                        headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 200


# ---------- 9. Discover ----------
def test_discover_public_servers():
    r = requests.get(f"{API}/servers/discover", headers=auth_headers(state["u2_token"]), timeout=15)
    assert r.status_code == 200
    servers = r.json()
    assert any(s["server_id"] == state["server_id"] for s in servers)


# ---------- 10. Moderation (kick/ban/audit) ----------
def test_audit_log():
    r = requests.get(f"{API}/servers/{state['server_id']}/audit-log",
                     headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_non_owner_cannot_delete():
    r = requests.delete(f"{API}/servers/{state['server_id']}",
                        headers=auth_headers(state["u2_token"]), timeout=15)
    assert r.status_code in (403, 404)  # u2 isn't owner


def test_kick_member():
    # owner (u1) kicks u2
    r = requests.delete(f"{API}/servers/{state['server_id']}/members/{state['u2_id']}",
                        headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 200, r.text
    # verify u2 no longer a member
    r2 = requests.get(f"{API}/servers/{state['server_id']}",
                      headers=auth_headers(state["u2_token"]), timeout=15)
    assert r2.status_code == 403


def test_ban_member():
    # re-add u2 via invite then ban
    rj = requests.post(f"{API}/invites/{state['invite_code']}",
                       headers=auth_headers(state["u2_token"]), timeout=15)
    assert rj.status_code == 200
    r = requests.post(f"{API}/servers/{state['server_id']}/bans/{state['u2_id']}",
                      headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 200
    # verify u2 can't rejoin
    rj2 = requests.post(f"{API}/invites/{state['invite_code']}",
                        headers=auth_headers(state["u2_token"]), timeout=15)
    assert rj2.status_code == 403


# ---------- 11. Channel delete ----------
def test_delete_channel():
    r = requests.delete(f"{API}/servers/{state['server_id']}/channels/{state['new_channel']}",
                        headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 200


# ---------- 12. Uploads ----------
def test_upload_file():
    files = {"file": ("test.txt", io.BytesIO(b"hello TEST upload"), "text/plain")}
    r = requests.post(f"{API}/uploads", headers=auth_headers(state["u1_token"]),
                      files=files, timeout=60)
    # Storage may be unavailable; accept 503 as skip
    if r.status_code == 503:
        pytest.skip("Emergent object storage unavailable")
    assert r.status_code == 200, r.text
    d = r.json()
    assert "url" in d and d["url"].startswith("/api/files/")
    # fetch
    r2 = requests.get(f"{BASE}{d['url']}", timeout=30)
    assert r2.status_code == 200
    assert b"hello TEST upload" in r2.content


def test_upload_bad_type():
    files = {"file": ("bad.exe", io.BytesIO(b"xxx"), "application/octet-stream")}
    r = requests.post(f"{API}/uploads", headers=auth_headers(state["u1_token"]),
                      files=files, timeout=30)
    assert r.status_code == 415


# ---------- 13. Rate limiting ----------
def test_login_rate_limit():
    email = f"test_rl_{uuid.uuid4().hex[:6]}@centcord.example.com"
    statuses = []
    for _ in range(12):
        rr = requests.post(f"{API}/auth/login", json={"email": email, "password": "x"}, timeout=10)
        statuses.append(rr.status_code)
    assert 429 in statuses, f"Expected 429 somewhere, got {statuses}"


# ---------- 14. Leave & delete server (cleanup) ----------
def test_owner_cannot_leave():
    r = requests.post(f"{API}/servers/{state['server_id']}/leave",
                      headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 400


def test_delete_server_cleanup():
    r = requests.delete(f"{API}/servers/{state['server_id']}",
                        headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 200
    # verify gone
    r2 = requests.get(f"{API}/servers/{state['server_id']}",
                      headers=auth_headers(state["u1_token"]), timeout=15)
    assert r2.status_code in (403, 404)

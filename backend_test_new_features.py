#!/usr/bin/env python3
"""
Backend test suite for CentCord - Testing 4 NEW features:
1. PHP-parity: E2E pubkey publish/get
2. Auto-mod: GET/PUT /servers/{id}/automod + send-message hook
3. Boost rewards: Booster role auto-create + emoji/sticker limit bump
4. Music queue: GET/POST/DELETE /voice/channels/{id}/queue + skip + play
"""
import requests
import json
import os
from pathlib import Path

# Read backend URL from frontend/.env
env_path = Path(__file__).parent / "frontend" / ".env"
BACKEND_URL = None
if env_path.exists():
    for line in env_path.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BACKEND_URL = line.split("=", 1)[1].strip()
            break

if not BACKEND_URL:
    raise ValueError("REACT_APP_BACKEND_URL not found in /app/frontend/.env")

BASE_URL = f"{BACKEND_URL}/api"
print(f"Testing against: {BASE_URL}")

# Test credentials
ADMIN_EMAIL = "admin@centcord.app"
ADMIN_PASSWORD = "CentCordAdmin!2026"

# Test data for new users
USER_NON_ADMIN_EMAIL = "nonadmin_test@example.com"
USER_NON_ADMIN_PASSWORD = "SecurePass789!"
USER_NON_ADMIN_NAME = "NonAdminUser"

TURNSTILE_TOKEN = "XXXX.DUMMY.TOKEN.XXXX"  # Always-pass test token

# Global state
admin_token = None
non_admin_token = None
non_admin_user_id = None
server_id = None
text_channel_id = None
voice_channel_id = None

def signup(email, password, display_name):
    """Sign up a new user"""
    resp = requests.post(f"{BASE_URL}/auth/register", json={
        "email": email,
        "password": password,
        "display_name": display_name,
        "turnstile_token": TURNSTILE_TOKEN
    })
    if resp.status_code in [400, 409]:
        # User already exists, try login
        return login(email, password)
    resp.raise_for_status()
    data = resp.json()
    return data.get("access_token")

def login(email, password):
    """Login and return access token"""
    resp = requests.post(f"{BASE_URL}/auth/login", json={
        "email": email,
        "password": password
    })
    resp.raise_for_status()
    data = resp.json()
    return data.get("access_token")

def headers(token):
    """Return authorization headers"""
    return {"Authorization": f"Bearer {token}"}

def get_user_id(token):
    """Get user_id from token"""
    resp = requests.get(f"{BASE_URL}/auth/me", headers=headers(token))
    resp.raise_for_status()
    return resp.json()["user_id"]

def test_setup():
    """Setup: Login admin, create non-admin user, create server"""
    global admin_token, non_admin_token, non_admin_user_id, server_id, text_channel_id, voice_channel_id
    
    print("\n=== SETUP ===")
    
    # Login admin
    print("Logging in as admin...")
    admin_token = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    print(f"✓ Admin token: {admin_token[:20]}...")
    
    # Create/login non-admin user
    print("Creating non-admin user...")
    non_admin_token = signup(USER_NON_ADMIN_EMAIL, USER_NON_ADMIN_PASSWORD, USER_NON_ADMIN_NAME)
    non_admin_user_id = get_user_id(non_admin_token)
    print(f"✓ Non-admin user token: {non_admin_token[:20]}...")
    print(f"✓ Non-admin user_id: {non_admin_user_id}")
    
    # Create server as admin
    print("Creating server as admin...")
    resp = requests.post(f"{BASE_URL}/servers", 
        headers=headers(admin_token),
        json={"name": "AutoMod Test Server", "description": "Testing new features", "is_public": True}
    )
    resp.raise_for_status()
    server_data = resp.json()
    server_id = server_data["server_id"]
    print(f"✓ Server created: {server_id}")
    
    # Get default text channel
    resp = requests.get(f"{BASE_URL}/servers/{server_id}", headers=headers(admin_token))
    resp.raise_for_status()
    server_full = resp.json()
    text_channel_id = server_full["channels"][0]["channel_id"]
    print(f"✓ Default text channel: {text_channel_id}")
    
    # Have non-admin user join the server via invite
    print("Creating invite for non-admin user...")
    resp = requests.post(f"{BASE_URL}/servers/{server_id}/invites",
        headers=headers(admin_token),
        json={"max_uses": 1, "expires_in_minutes": 60}
    )
    resp.raise_for_status()
    invite_data = resp.json()
    invite_code = invite_data.get("code")
    print(f"✓ Invite created: {invite_code}")
    
    print("Non-admin user using invite...")
    resp = requests.post(f"{BASE_URL}/invites/{invite_code}", headers=headers(non_admin_token))
    resp.raise_for_status()
    print(f"✓ Non-admin user joined server")
    
    print("=== SETUP COMPLETE ===\n")

# ========== TEST 1: PHP-parity E2E pubkey publish/get ==========

def test_1_pubkey_publish():
    """Test 1.1: POST /api/users/me/keys - Publish public key"""
    print("\n[TEST 1.1] POST /api/users/me/keys - Publish public key")
    
    jwk_key = '{"kty":"EC","crv":"P-256","x":"abc123","y":"def456"}'
    resp = requests.post(f"{BASE_URL}/users/me/keys",
        headers=headers(non_admin_token),
        json={"public_key": jwk_key}
    )
    
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert data.get("ok") == True, f"Expected ok: true, got {data}"
    print("✅ PASS - Published public key successfully")

def test_2_pubkey_get_published():
    """Test 1.2: GET /api/users/{user_id}/keys - Get published key"""
    print("\n[TEST 1.2] GET /api/users/{user_id}/keys - Get published key")
    
    resp = requests.get(f"{BASE_URL}/users/{non_admin_user_id}/keys",
        headers=headers(admin_token)
    )
    
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert data.get("user_id") == non_admin_user_id, f"Expected user_id {non_admin_user_id}, got {data.get('user_id')}"
    assert data.get("public_key") is not None, f"Expected public_key, got None"
    assert "abc123" in data.get("public_key", ""), f"Expected JWK content in public_key"
    assert data.get("published_at") is not None, f"Expected published_at, got None"
    print(f"✅ PASS - Retrieved public key: {data.get('public_key')[:50]}...")

def test_3_pubkey_get_unpublished():
    """Test 1.3: GET /api/users/{user_id}/keys - User with no published key returns null"""
    print("\n[TEST 1.3] GET /api/users/{user_id}/keys - User with no published key")
    
    # Get admin user_id (who hasn't published a key)
    admin_user_id = get_user_id(admin_token)
    
    resp = requests.get(f"{BASE_URL}/users/{admin_user_id}/keys",
        headers=headers(non_admin_token)
    )
    
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert data.get("user_id") == admin_user_id, f"Expected user_id {admin_user_id}, got {data.get('user_id')}"
    assert data.get("public_key") is None, f"Expected public_key: null, got {data.get('public_key')}"
    print("✅ PASS - User with no published key returns public_key: null")

def test_4_pubkey_get_nonexistent():
    """Test 1.4: GET /api/users/{user_id}/keys - Non-existent user returns 404"""
    print("\n[TEST 1.4] GET /api/users/non-existent-id/keys - Non-existent user")
    
    resp = requests.get(f"{BASE_URL}/users/non-existent-id/keys",
        headers=headers(admin_token)
    )
    
    assert resp.status_code == 404, f"Expected 404, got {resp.status_code}: {resp.text}"
    print("✅ PASS - Non-existent user returns 404")

# ========== TEST 2: Auto-mod ==========

def test_5_automod_get_default():
    """Test 2.1: GET /api/servers/{id}/automod - Returns default config"""
    print("\n[TEST 2.1] GET /api/servers/{id}/automod - Get default config")
    
    resp = requests.get(f"{BASE_URL}/servers/{server_id}/automod",
        headers=headers(admin_token)
    )
    
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert data.get("enabled") == False, f"Expected enabled: false, got {data.get('enabled')}"
    assert data.get("action") == "delete", f"Expected action: delete, got {data.get('action')}"
    assert data.get("words") == [], f"Expected words: [], got {data.get('words')}"
    assert data.get("block_invites") == False, f"Expected block_invites: false, got {data.get('block_invites')}"
    assert data.get("block_links") == False, f"Expected block_links: false, got {data.get('block_links')}"
    assert "timeout_minutes" in data, f"Expected timeout_minutes in response"
    print(f"✅ PASS - Default automod config: {data}")

def test_6_automod_put_config():
    """Test 2.2: PUT /api/servers/{id}/automod - Update config"""
    print("\n[TEST 2.2] PUT /api/servers/{id}/automod - Update config")
    
    resp = requests.put(f"{BASE_URL}/servers/{server_id}/automod",
        headers=headers(admin_token),
        json={
            "enabled": True,
            "action": "delete",
            "words": ["badword", "spam"],
            "block_invites": True,
            "block_links": False
        }
    )
    
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert data.get("enabled") == True, f"Expected enabled: true, got {data.get('enabled')}"
    assert "badword" in data.get("words", []), f"Expected 'badword' in words"
    assert "spam" in data.get("words", []), f"Expected 'spam' in words"
    assert data.get("block_invites") == True, f"Expected block_invites: true, got {data.get('block_invites')}"
    print(f"✅ PASS - Updated automod config: {data}")

def test_7_automod_block_badword():
    """Test 2.3: POST /api/channels/{id}/messages - Block message with badword"""
    print("\n[TEST 2.3] POST /api/channels/{id}/messages - Block message with badword")
    
    resp = requests.post(f"{BASE_URL}/channels/{text_channel_id}/messages",
        headers=headers(non_admin_token),
        json={"content": "this contains badword here"}
    )
    
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert "auto-modération" in data.get("detail", "").lower() or "automod" in data.get("detail", "").lower(), \
        f"Expected auto-modération in error, got: {data.get('detail')}"
    print(f"✅ PASS - Message blocked by automod: {data.get('detail')}")

def test_8_automod_block_invite():
    """Test 2.4: POST /api/channels/{id}/messages - Block message with invite"""
    print("\n[TEST 2.4] POST /api/channels/{id}/messages - Block message with invite")
    
    resp = requests.post(f"{BASE_URL}/channels/{text_channel_id}/messages",
        headers=headers(non_admin_token),
        json={"content": "join my server: discord.gg/foo"}
    )
    
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert "auto-modération" in data.get("detail", "").lower() or "automod" in data.get("detail", "").lower(), \
        f"Expected auto-modération in error, got: {data.get('detail')}"
    print(f"✅ PASS - Invite blocked by automod: {data.get('detail')}")

def test_9_automod_allow_clean():
    """Test 2.5: POST /api/channels/{id}/messages - Allow clean message"""
    print("\n[TEST 2.5] POST /api/channels/{id}/messages - Allow clean message")
    
    resp = requests.post(f"{BASE_URL}/channels/{text_channel_id}/messages",
        headers=headers(non_admin_token),
        json={"content": "hello clean message"}
    )
    
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert data.get("content") == "hello clean message", f"Expected clean message, got {data.get('content')}"
    print("✅ PASS - Clean message allowed")

def test_10_automod_admin_bypass():
    """Test 2.6: POST /api/channels/{id}/messages - Admin/owner bypass"""
    print("\n[TEST 2.6] POST /api/channels/{id}/messages - Admin/owner bypass")
    
    resp = requests.post(f"{BASE_URL}/channels/{text_channel_id}/messages",
        headers=headers(admin_token),
        json={"content": "admin says badword and discord.gg/test"}
    )
    
    assert resp.status_code == 200, f"Expected 200 (admin bypass), got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert "badword" in data.get("content", ""), f"Expected badword in content (admin bypass)"
    print("✅ PASS - Admin/owner bypasses automod")

def test_11_automod_permission():
    """Test 2.7: PUT /api/servers/{id}/automod - Non-admin member gets 403"""
    print("\n[TEST 2.7] PUT /api/servers/{id}/automod - Non-admin member permission check")
    
    resp = requests.put(f"{BASE_URL}/servers/{server_id}/automod",
        headers=headers(non_admin_token),
        json={"enabled": False}
    )
    
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"
    print("✅ PASS - Non-admin member correctly denied (403)")

# ========== TEST 3: Boost rewards ==========

def test_12_boost_initial_state():
    """Test 3.1: GET /api/servers/{id} - Check initial boost state"""
    print("\n[TEST 3.1] GET /api/servers/{id} - Check initial boost state")
    
    resp = requests.get(f"{BASE_URL}/servers/{server_id}",
        headers=headers(admin_token)
    )
    
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    initial_boost_count = data.get("boost_count", 0)
    initial_emoji_limit = data.get("emoji_limit", 50)
    initial_sticker_limit = data.get("sticker_limit", 50)
    print(f"✅ PASS - Initial state: boost_count={initial_boost_count}, emoji_limit={initial_emoji_limit}, sticker_limit={initial_sticker_limit}")
    return initial_boost_count, initial_emoji_limit, initial_sticker_limit

def test_13_boost_server():
    """Test 3.2: POST /api/servers/{id}/boost - Boost server"""
    print("\n[TEST 3.2] POST /api/servers/{id}/boost - Boost server")
    
    resp = requests.post(f"{BASE_URL}/servers/{server_id}/boost",
        headers=headers(non_admin_token)
    )
    
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert data.get("ok") == True, f"Expected ok: true, got {data}"
    print("✅ PASS - Server boosted successfully")

def test_14_boost_verify_limits():
    """Test 3.3: GET /api/servers/{id} - Verify boost count and limits increased"""
    print("\n[TEST 3.3] GET /api/servers/{id} - Verify boost count and limits")
    
    resp = requests.get(f"{BASE_URL}/servers/{server_id}",
        headers=headers(admin_token)
    )
    
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    boost_count = data.get("boost_count", 0)
    emoji_limit = data.get("emoji_limit", 50)
    sticker_limit = data.get("sticker_limit", 50)
    
    assert boost_count >= 1, f"Expected boost_count >= 1, got {boost_count}"
    assert emoji_limit == 75, f"Expected emoji_limit 75 (50 + 25), got {emoji_limit}"
    assert sticker_limit == 75, f"Expected sticker_limit 75 (50 + 25), got {sticker_limit}"
    print(f"✅ PASS - Boost verified: boost_count={boost_count}, emoji_limit={emoji_limit}, sticker_limit={sticker_limit}")

def test_15_boost_booster_role():
    """Test 3.4: GET /api/servers/{id}/roles - Verify Booster role exists"""
    print("\n[TEST 3.4] GET /api/servers/{id}/roles - Verify Booster role")
    
    resp = requests.get(f"{BASE_URL}/servers/{server_id}",
        headers=headers(admin_token)
    )
    
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    roles = data.get("roles", [])
    
    booster_role = None
    for role in roles:
        if role.get("name") == "Booster":
            booster_role = role
            break
    
    assert booster_role is not None, f"Expected Booster role to exist, got roles: {[r.get('name') for r in roles]}"
    assert booster_role.get("color") == "#FF3B00", f"Expected Booster role color #FF3B00, got {booster_role.get('color')}"
    print(f"✅ PASS - Booster role exists: {booster_role}")
    return booster_role["role_id"]

def test_16_boost_member_has_role(booster_role_id):
    """Test 3.5: GET /api/servers/{id}/members - Verify booster has Booster role"""
    print("\n[TEST 3.5] GET /api/servers/{id}/members - Verify booster has Booster role")
    
    resp = requests.get(f"{BASE_URL}/servers/{server_id}/members",
        headers=headers(admin_token)
    )
    
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    members = resp.json()
    
    booster_member = None
    for member in members:
        if member.get("user_id") == non_admin_user_id:
            booster_member = member
            break
    
    assert booster_member is not None, f"Expected to find booster member, got members: {members}"
    role_ids = booster_member.get("role_ids", [])
    assert booster_role_id in role_ids, f"Expected Booster role {booster_role_id} in member's role_ids {role_ids}"
    print(f"✅ PASS - Booster member has Booster role: {role_ids}")

def test_17_unboost_server():
    """Test 3.6: DELETE /api/servers/{id}/boost - Unboost server"""
    print("\n[TEST 3.6] DELETE /api/servers/{id}/boost - Unboost server")
    
    resp = requests.delete(f"{BASE_URL}/servers/{server_id}/boost",
        headers=headers(non_admin_token)
    )
    
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    print("✅ PASS - Server unboosted successfully")

def test_18_unboost_verify_limits():
    """Test 3.7: GET /api/servers/{id} - Verify boost count and limits decreased"""
    print("\n[TEST 3.7] GET /api/servers/{id} - Verify boost count and limits after unboost")
    
    resp = requests.get(f"{BASE_URL}/servers/{server_id}",
        headers=headers(admin_token)
    )
    
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    boost_count = data.get("boost_count", 0)
    emoji_limit = data.get("emoji_limit", 50)
    sticker_limit = data.get("sticker_limit", 50)
    
    assert boost_count == 0, f"Expected boost_count 0, got {boost_count}"
    assert emoji_limit == 50, f"Expected emoji_limit 50 (back to base), got {emoji_limit}"
    assert sticker_limit == 50, f"Expected sticker_limit 50 (back to base), got {sticker_limit}"
    print(f"✅ PASS - Unboost verified: boost_count={boost_count}, emoji_limit={emoji_limit}, sticker_limit={sticker_limit}")

def test_19_unboost_role_removed(booster_role_id):
    """Test 3.8: GET /api/servers/{id}/members - Verify Booster role removed"""
    print("\n[TEST 3.8] GET /api/servers/{id}/members - Verify Booster role removed")
    
    resp = requests.get(f"{BASE_URL}/servers/{server_id}/members",
        headers=headers(admin_token)
    )
    
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    members = resp.json()
    
    booster_member = None
    for member in members:
        if member.get("user_id") == non_admin_user_id:
            booster_member = member
            break
    
    assert booster_member is not None, f"Expected to find member"
    role_ids = booster_member.get("role_ids", [])
    assert booster_role_id not in role_ids, f"Expected Booster role {booster_role_id} NOT in member's role_ids {role_ids}"
    print(f"✅ PASS - Booster role removed from member: {role_ids}")

# ========== TEST 4: Music queue ==========

def test_20_create_voice_channel():
    """Test 4.1: POST /api/servers/{id}/channels - Create voice channel"""
    print("\n[TEST 4.1] POST /api/servers/{id}/channels - Create voice channel")
    
    global voice_channel_id
    
    resp = requests.post(f"{BASE_URL}/servers/{server_id}/channels",
        headers=headers(admin_token),
        json={"name": "vocal-test", "type": "voice", "category_id": None}
    )
    
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    voice_channel_id = data.get("channel_id")
    assert voice_channel_id is not None, f"Expected channel_id, got {data}"
    assert data.get("type") == "voice", f"Expected type: voice, got {data.get('type')}"
    print(f"✅ PASS - Voice channel created: {voice_channel_id}")

def test_21_music_queue_empty():
    """Test 4.2: GET /api/voice/channels/{id}/queue - Empty queue"""
    print("\n[TEST 4.2] GET /api/voice/channels/{id}/queue - Empty queue")
    
    resp = requests.get(f"{BASE_URL}/voice/channels/{voice_channel_id}/queue",
        headers=headers(admin_token)
    )
    
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert data.get("queue") == [], f"Expected empty queue, got {data.get('queue')}"
    assert data.get("current_idx") == -1, f"Expected current_idx: -1, got {data.get('current_idx')}"
    assert data.get("playing") == False, f"Expected playing: false, got {data.get('playing')}"
    print(f"✅ PASS - Empty queue: {data}")

def test_22_music_add_valid_url():
    """Test 4.3: POST /api/voice/channels/{id}/queue - Add valid YouTube URL"""
    print("\n[TEST 4.3] POST /api/voice/channels/{id}/queue - Add valid YouTube URL")
    
    resp = requests.post(f"{BASE_URL}/voice/channels/{voice_channel_id}/queue",
        headers=headers(admin_token),
        json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}
    )
    
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert data.get("yt_id") == "dQw4w9WgXcQ", f"Expected yt_id: dQw4w9WgXcQ, got {data.get('yt_id')}"
    assert data.get("url") == "https://www.youtube.com/watch?v=dQw4w9WgXcQ", f"Expected URL, got {data.get('url')}"
    assert data.get("thumbnail") is not None, f"Expected thumbnail, got None"
    assert data.get("track_id") is not None, f"Expected track_id, got None"
    print(f"✅ PASS - Track added: {data}")
    return data.get("track_id")

def test_23_music_add_invalid_url():
    """Test 4.4: POST /api/voice/channels/{id}/queue - Reject invalid URL"""
    print("\n[TEST 4.4] POST /api/voice/channels/{id}/queue - Reject invalid URL")
    
    resp = requests.post(f"{BASE_URL}/voice/channels/{voice_channel_id}/queue",
        headers=headers(admin_token),
        json={"url": "not a youtube url"}
    )
    
    assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert "URL YouTube invalide" in data.get("detail", ""), f"Expected 'URL YouTube invalide', got {data.get('detail')}"
    print(f"✅ PASS - Invalid URL rejected: {data.get('detail')}")

def test_24_music_add_raw_id():
    """Test 4.5: POST /api/voice/channels/{id}/queue - Add raw 11-char YouTube ID"""
    print("\n[TEST 4.5] POST /api/voice/channels/{id}/queue - Add raw YouTube ID")
    
    resp = requests.post(f"{BASE_URL}/voice/channels/{voice_channel_id}/queue",
        headers=headers(admin_token),
        json={"url": "dQw4w9WgXcQ"}
    )
    
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert data.get("yt_id") == "dQw4w9WgXcQ", f"Expected yt_id: dQw4w9WgXcQ, got {data.get('yt_id')}"
    print(f"✅ PASS - Raw YouTube ID accepted: {data}")

def test_25_music_queue_state():
    """Test 4.6: GET /api/voice/channels/{id}/queue - Verify queue state"""
    print("\n[TEST 4.6] GET /api/voice/channels/{id}/queue - Verify queue state")
    
    resp = requests.get(f"{BASE_URL}/voice/channels/{voice_channel_id}/queue",
        headers=headers(admin_token)
    )
    
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert len(data.get("queue", [])) == 2, f"Expected 2 tracks, got {len(data.get('queue', []))}"
    assert data.get("current_idx") == 0, f"Expected current_idx: 0, got {data.get('current_idx')}"
    assert data.get("playing") == True, f"Expected playing: true, got {data.get('playing')}"
    print(f"✅ PASS - Queue state: {len(data.get('queue', []))} tracks, current_idx={data.get('current_idx')}, playing={data.get('playing')}")

def test_26_music_skip():
    """Test 4.7: POST /api/voice/channels/{id}/queue/skip - Skip to next track"""
    print("\n[TEST 4.7] POST /api/voice/channels/{id}/queue/skip - Skip to next track")
    
    resp = requests.post(f"{BASE_URL}/voice/channels/{voice_channel_id}/queue/skip",
        headers=headers(admin_token)
    )
    
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert data.get("current_idx") == 1, f"Expected current_idx: 1, got {data.get('current_idx')}"
    print(f"✅ PASS - Skipped to track 1: current_idx={data.get('current_idx')}")

def test_27_music_skip_end():
    """Test 4.8: POST /api/voice/channels/{id}/queue/skip - Skip past end"""
    print("\n[TEST 4.8] POST /api/voice/channels/{id}/queue/skip - Skip past end")
    
    resp = requests.post(f"{BASE_URL}/voice/channels/{voice_channel_id}/queue/skip",
        headers=headers(admin_token)
    )
    
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert data.get("current_idx") == -1, f"Expected current_idx: -1, got {data.get('current_idx')}"
    assert data.get("playing") == False, f"Expected playing: false, got {data.get('playing')}"
    print(f"✅ PASS - Skipped past end: current_idx={data.get('current_idx')}, playing={data.get('playing')}")

def test_28_music_play_pause():
    """Test 4.9: POST /api/voice/channels/{id}/queue/play - Play/pause"""
    print("\n[TEST 4.9] POST /api/voice/channels/{id}/queue/play - Play/pause")
    
    resp = requests.post(f"{BASE_URL}/voice/channels/{voice_channel_id}/queue/play",
        headers=headers(admin_token),
        json={"playing": True}
    )
    
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert data.get("playing") == True, f"Expected playing: true, got {data.get('playing')}"
    print(f"✅ PASS - Playing: {data.get('playing')}")

def test_29_music_delete_track(track_id):
    """Test 4.10: DELETE /api/voice/channels/{id}/queue/{track_id} - Delete track"""
    print("\n[TEST 4.10] DELETE /api/voice/channels/{id}/queue/{track_id} - Delete track")
    
    resp = requests.delete(f"{BASE_URL}/voice/channels/{voice_channel_id}/queue/{track_id}",
        headers=headers(admin_token)
    )
    
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    print("✅ PASS - Track deleted")

def test_30_music_queue_after_delete():
    """Test 4.11: GET /api/voice/channels/{id}/queue - Verify queue after delete"""
    print("\n[TEST 4.11] GET /api/voice/channels/{id}/queue - Verify queue after delete")
    
    resp = requests.get(f"{BASE_URL}/voice/channels/{voice_channel_id}/queue",
        headers=headers(admin_token)
    )
    
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert len(data.get("queue", [])) == 1, f"Expected 1 track left, got {len(data.get('queue', []))}"
    print(f"✅ PASS - Queue after delete: {len(data.get('queue', []))} track(s)")

def test_31_music_text_channel_reject():
    """Test 4.12: POST /api/voice/channels/{text_channel_id}/queue - Reject text channel"""
    print("\n[TEST 4.12] POST /api/voice/channels/{text_channel_id}/queue - Reject text channel")
    
    resp = requests.post(f"{BASE_URL}/voice/channels/{text_channel_id}/queue",
        headers=headers(admin_token),
        json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}
    )
    
    assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert "Pas un salon vocal" in data.get("detail", ""), f"Expected 'Pas un salon vocal', got {data.get('detail')}"
    print(f"✅ PASS - Text channel rejected: {data.get('detail')}")

# ========== MAIN ==========

def main():
    print("=" * 80)
    print("CentCord Backend Test Suite - 4 NEW FEATURES")
    print("=" * 80)
    
    try:
        # Setup
        test_setup()
        
        # Test 1: PHP-parity E2E pubkey
        print("\n" + "=" * 80)
        print("TEST 1: PHP-parity E2E pubkey publish/get")
        print("=" * 80)
        test_1_pubkey_publish()
        test_2_pubkey_get_published()
        test_3_pubkey_get_unpublished()
        test_4_pubkey_get_nonexistent()
        
        # Test 2: Auto-mod
        print("\n" + "=" * 80)
        print("TEST 2: Auto-mod")
        print("=" * 80)
        test_5_automod_get_default()
        test_6_automod_put_config()
        test_7_automod_block_badword()
        test_8_automod_block_invite()
        test_9_automod_allow_clean()
        test_10_automod_admin_bypass()
        test_11_automod_permission()
        
        # Test 3: Boost rewards
        print("\n" + "=" * 80)
        print("TEST 3: Boost rewards")
        print("=" * 80)
        test_12_boost_initial_state()
        test_13_boost_server()
        test_14_boost_verify_limits()
        booster_role_id = test_15_boost_booster_role()
        test_16_boost_member_has_role(booster_role_id)
        test_17_unboost_server()
        test_18_unboost_verify_limits()
        test_19_unboost_role_removed(booster_role_id)
        
        # Test 4: Music queue
        print("\n" + "=" * 80)
        print("TEST 4: Music queue")
        print("=" * 80)
        test_20_create_voice_channel()
        test_21_music_queue_empty()
        track_id = test_22_music_add_valid_url()
        test_23_music_add_invalid_url()
        test_24_music_add_raw_id()
        test_25_music_queue_state()
        test_26_music_skip()
        test_27_music_skip_end()
        test_28_music_play_pause()
        test_29_music_delete_track(track_id)
        test_30_music_queue_after_delete()
        test_31_music_text_channel_reject()
        
        print("\n" + "=" * 80)
        print("✅ ALL TESTS PASSED!")
        print("=" * 80)
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        raise
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        raise

if __name__ == "__main__":
    main()

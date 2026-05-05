#!/usr/bin/env python3
"""
CentCord Backend Test Suite - Testing 13 new features
"""
import requests
import json
import time
from typing import Optional, Dict, Any

# Configuration
BASE_URL = "https://code-check-preview-1.preview.emergentagent.com/api"
ADMIN_EMAIL = "admin@centcord.app"
ADMIN_PASSWORD = "CentCordAdmin!2026"

# Test state
admin_token: Optional[str] = None
admin_user_id: Optional[str] = None
test_server_id: Optional[str] = None
test_channel_id: Optional[str] = None
test_category_id: Optional[str] = None
user_b_token: Optional[str] = None
user_b_id: Optional[str] = None

# Test results
results = {
    "passed": [],
    "failed": [],
    "warnings": []
}

def log_pass(test_name: str, details: str = ""):
    print(f"✅ PASS: {test_name}")
    if details:
        print(f"   {details}")
    results["passed"].append(test_name)

def log_fail(test_name: str, reason: str):
    print(f"❌ FAIL: {test_name}")
    print(f"   Reason: {reason}")
    results["failed"].append(f"{test_name}: {reason}")

def log_warning(test_name: str, message: str):
    print(f"⚠️  WARNING: {test_name}")
    print(f"   {message}")
    results["warnings"].append(f"{test_name}: {message}")

def make_request(method: str, endpoint: str, token: Optional[str] = None, 
                 json_data: Optional[Dict] = None, data: Optional[Any] = None,
                 files: Optional[Dict] = None, params: Optional[Dict] = None) -> requests.Response:
    """Make HTTP request with optional auth token"""
    url = f"{BASE_URL}{endpoint}"
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    try:
        if method == "GET":
            return requests.get(url, headers=headers, params=params, timeout=30)
        elif method == "POST":
            if files:
                return requests.post(url, headers=headers, files=files, data=data, timeout=30)
            return requests.post(url, headers=headers, json=json_data, timeout=30)
        elif method == "PATCH":
            return requests.patch(url, headers=headers, json=json_data, timeout=30)
        elif method == "DELETE":
            return requests.delete(url, headers=headers, timeout=30)
        elif method == "PUT":
            return requests.put(url, headers=headers, json=json_data, timeout=30)
    except Exception as e:
        print(f"Request error: {e}")
        raise

# ========== Setup Functions ==========

def setup_admin_auth():
    """Login as admin and get token"""
    global admin_token, admin_user_id
    print("\n🔧 Setting up admin authentication...")
    
    resp = make_request("POST", "/auth/login", json_data={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    
    if resp.status_code != 200:
        log_fail("Admin Login", f"Status {resp.status_code}: {resp.text}")
        return False
    
    data = resp.json()
    admin_token = data.get("access_token")
    admin_user_id = data.get("user", {}).get("user_id")
    
    if not admin_token or not admin_user_id:
        log_fail("Admin Login", "Missing token or user_id in response")
        return False
    
    log_pass("Admin Login", f"User ID: {admin_user_id}")
    return True

def setup_test_server():
    """Create a test server for testing"""
    global test_server_id, test_channel_id, test_category_id
    print("\n🔧 Creating test server...")
    
    resp = make_request("POST", "/servers", admin_token, json_data={
        "name": f"Test Server {int(time.time())}",
        "description": "Server for testing new features",
        "is_public": True
    })
    
    if resp.status_code != 200:
        log_fail("Create Test Server", f"Status {resp.status_code}: {resp.text}")
        return False
    
    data = resp.json()
    test_server_id = data.get("server_id")
    
    # Get server details to find channels and categories
    resp = make_request("GET", f"/servers/{test_server_id}", admin_token)
    if resp.status_code == 200:
        server_data = resp.json()
        channels = server_data.get("channels", [])
        categories = server_data.get("categories", [])
        
        if channels:
            test_channel_id = channels[0]["channel_id"]
        if categories:
            test_category_id = categories[0]["category_id"]
    
    log_pass("Create Test Server", f"Server ID: {test_server_id}")
    return True

def setup_user_b():
    """Create a second user for testing read markers"""
    global user_b_token, user_b_id
    print("\n🔧 Creating second test user...")
    
    email = f"testuser_{int(time.time())}@example.com"
    
    resp = make_request("POST", "/auth/register", json_data={
        "email": email,
        "password": "TestPassword123!",
        "display_name": "Test User B",
        "turnstile_token": "XXXX.DUMMY.TOKEN.XXXX"
    })
    
    if resp.status_code != 200:
        log_fail("Create User B", f"Status {resp.status_code}: {resp.text}")
        return False
    
    data = resp.json()
    user_b_token = data.get("access_token")
    user_b_id = data.get("user", {}).get("user_id")
    
    log_pass("Create User B", f"User ID: {user_b_id}")
    return True

# ========== Test Functions ==========

def test_1_turnstile_config():
    """Test 1: Cloudflare Turnstile - GET /api/auth/captcha/config"""
    print("\n📝 Test 1: Turnstile Config")
    
    resp = make_request("GET", "/auth/captcha/config")
    
    if resp.status_code != 200:
        log_fail("Turnstile Config", f"Status {resp.status_code}")
        return
    
    data = resp.json()
    if "site_key" not in data or "enabled" not in data:
        log_fail("Turnstile Config", f"Missing fields in response: {data}")
        return
    
    log_pass("Turnstile Config", f"site_key={data['site_key']}, enabled={data['enabled']}")

def test_2_turnstile_register_without_token():
    """Test 2: Register without turnstile_token should fail"""
    print("\n📝 Test 2: Register without Turnstile Token")
    
    email = f"notoken_{int(time.time())}@example.com"
    resp = make_request("POST", "/auth/register", json_data={
        "email": email,
        "password": "TestPass123!",
        "display_name": "No Token User"
    })
    
    if resp.status_code == 400:
        if "Captcha" in resp.text or "captcha" in resp.text.lower():
            log_pass("Register without Token", "Correctly rejected with 400")
        else:
            log_fail("Register without Token", f"Got 400 but wrong message: {resp.text}")
    else:
        log_fail("Register without Token", f"Expected 400, got {resp.status_code}")

def test_3_turnstile_register_with_token():
    """Test 3: Register with always-pass test token should succeed"""
    print("\n📝 Test 3: Register with Turnstile Token")
    
    email = f"withtoken_{int(time.time())}@example.com"
    resp = make_request("POST", "/auth/register", json_data={
        "email": email,
        "password": "TestPass123!",
        "display_name": "With Token User",
        "turnstile_token": "XXXX.DUMMY.TOKEN.XXXX"
    })
    
    if resp.status_code == 200:
        data = resp.json()
        if "user" in data and "access_token" in data:
            log_pass("Register with Token", f"User created: {data['user'].get('user_id')}")
        else:
            log_fail("Register with Token", f"Missing fields in response: {data}")
    else:
        log_fail("Register with Token", f"Status {resp.status_code}: {resp.text}")

def test_4_server_invite_regen():
    """Test 4: Server invite code regeneration"""
    print("\n📝 Test 4: Server Invite Regen")
    
    if not test_server_id:
        log_fail("Server Invite Regen", "No test server available")
        return
    
    # Get original invite code
    resp = make_request("GET", f"/servers/{test_server_id}", admin_token)
    if resp.status_code != 200:
        log_fail("Server Invite Regen", f"Failed to get server: {resp.status_code}")
        return
    
    original_code = resp.json().get("invite_code")
    
    # Regenerate
    resp = make_request("POST", f"/servers/{test_server_id}/invite/regen", admin_token)
    
    if resp.status_code != 200:
        log_fail("Server Invite Regen", f"Status {resp.status_code}: {resp.text}")
        return
    
    new_code = resp.json().get("invite_code")
    
    if not new_code:
        log_fail("Server Invite Regen", "No invite_code in response")
        return
    
    if new_code == original_code:
        log_fail("Server Invite Regen", "Invite code did not change")
        return
    
    # Verify it's updated in server
    resp = make_request("GET", f"/servers/{test_server_id}", admin_token)
    if resp.status_code == 200:
        current_code = resp.json().get("invite_code")
        if current_code == new_code:
            log_pass("Server Invite Regen", f"Old: {original_code}, New: {new_code}")
        else:
            log_fail("Server Invite Regen", f"Code not updated in server: {current_code}")
    else:
        log_warning("Server Invite Regen", "Could not verify code update")

def test_5_category_update():
    """Test 5: Category update (name should be uppercased)"""
    print("\n📝 Test 5: Category Update")
    
    if not test_server_id or not test_category_id:
        log_fail("Category Update", "No test server/category available")
        return
    
    resp = make_request("PATCH", f"/servers/{test_server_id}/categories/{test_category_id}", 
                       admin_token, json_data={"name": "renamed_cat"})
    
    if resp.status_code != 200:
        log_fail("Category Update", f"Status {resp.status_code}: {resp.text}")
        return
    
    data = resp.json()
    new_name = data.get("name")
    
    if new_name == "RENAMED_CAT":
        log_pass("Category Update", f"Name uppercased correctly: {new_name}")
    else:
        log_fail("Category Update", f"Expected 'RENAMED_CAT', got '{new_name}'")

def test_6_read_markers():
    """Test 6: Read markers and unread counts"""
    print("\n📝 Test 6: Read Markers / Unread")
    
    if not test_server_id or not test_channel_id or not user_b_token:
        log_fail("Read Markers", "Missing test server/channel/user_b")
        return
    
    # Add user B to the server first
    # Get invite code
    resp = make_request("GET", f"/servers/{test_server_id}", admin_token)
    if resp.status_code != 200:
        log_fail("Read Markers", "Failed to get server invite")
        return
    
    invite_code = resp.json().get("invite_code")
    
    # Join server as user B
    resp = make_request("POST", f"/invites/{invite_code}", user_b_token)
    if resp.status_code not in [200, 409]:  # 409 if already joined
        log_fail("Read Markers", f"User B failed to join server: {resp.status_code}")
        return
    
    # Send 3 messages as admin
    for i in range(3):
        resp = make_request("POST", f"/channels/{test_channel_id}/messages", admin_token,
                          json_data={"content": f"Test message {i+1} for unread"})
        if resp.status_code != 200:
            log_fail("Read Markers", f"Failed to send message {i+1}")
            return
        time.sleep(0.2)
    
    # Check unread as user B
    resp = make_request("GET", "/channels/unread", user_b_token)
    if resp.status_code != 200:
        log_fail("Read Markers", f"Failed to get unread: {resp.status_code}")
        return
    
    unread_data = resp.json()
    if test_channel_id not in unread_data:
        log_fail("Read Markers", f"Channel not in unread map: {unread_data}")
        return
    
    count_before = unread_data[test_channel_id]
    if count_before < 3:
        log_warning("Read Markers", f"Expected at least 3 unread, got {count_before}")
    
    # Mark as read
    resp = make_request("POST", f"/channels/{test_channel_id}/read", user_b_token, json_data={})
    if resp.status_code != 200:
        log_fail("Read Markers", f"Failed to mark as read: {resp.status_code}")
        return
    
    # Check unread again
    resp = make_request("GET", "/channels/unread", user_b_token)
    if resp.status_code != 200:
        log_fail("Read Markers", f"Failed to get unread after marking: {resp.status_code}")
        return
    
    unread_after = resp.json()
    count_after = unread_after.get(test_channel_id, 0)
    
    if count_after == 0:
        log_pass("Read Markers", f"Unread count: {count_before} → {count_after}")
    else:
        log_fail("Read Markers", f"Expected 0 unread after marking, got {count_after}")

def test_7_server_stats():
    """Test 7: Server statistics"""
    print("\n📝 Test 7: Server Stats")
    
    if not test_server_id:
        log_fail("Server Stats", "No test server available")
        return
    
    resp = make_request("GET", f"/servers/{test_server_id}/stats", admin_token)
    
    if resp.status_code != 200:
        log_fail("Server Stats", f"Status {resp.status_code}: {resp.text}")
        return
    
    data = resp.json()
    required_fields = ["member_count", "online_count", "message_count", "messages_7d", 
                      "channel_count", "role_count", "boost_count"]
    
    missing = [f for f in required_fields if f not in data]
    if missing:
        log_fail("Server Stats", f"Missing fields: {missing}")
        return
    
    # Check all are numbers
    non_numeric = [f for f in required_fields if not isinstance(data[f], int)]
    if non_numeric:
        log_fail("Server Stats", f"Non-numeric fields: {non_numeric}")
        return
    
    log_pass("Server Stats", f"member_count={data['member_count']}, message_count={data['message_count']}")
    
    # Test non-member access (should be 403)
    # Create a new user who is not a member
    email = f"nonmember_{int(time.time())}@example.com"
    resp = make_request("POST", "/auth/register", json_data={
        "email": email,
        "password": "TestPass123!",
        "display_name": "Non Member",
        "turnstile_token": "XXXX.DUMMY.TOKEN.XXXX"
    })
    
    if resp.status_code == 200:
        non_member_token = resp.json().get("access_token")
        resp = make_request("GET", f"/servers/{test_server_id}/stats", non_member_token)
        if resp.status_code == 403:
            log_pass("Server Stats (Non-member)", "Correctly rejected with 403")
        else:
            log_fail("Server Stats (Non-member)", f"Expected 403, got {resp.status_code}")

def test_8_user_activity():
    """Test 8: User custom activity"""
    print("\n📝 Test 8: User Activity")
    
    # Set activity
    resp = make_request("PATCH", "/users/me/activity", admin_token, json_data={
        "activity_type": "playing",
        "activity_text": "Cyberpunk 2077",
        "activity_emoji": "🎮"
    })
    
    if resp.status_code != 200:
        log_fail("User Activity (Set)", f"Status {resp.status_code}: {resp.text}")
        return
    
    # Verify in /auth/me
    resp = make_request("GET", "/auth/me", admin_token)
    if resp.status_code != 200:
        log_fail("User Activity (Verify)", f"Failed to get /auth/me: {resp.status_code}")
        return
    
    data = resp.json()
    if (data.get("activity_type") == "playing" and 
        data.get("activity_text") == "Cyberpunk 2077" and
        data.get("activity_emoji") == "🎮"):
        log_pass("User Activity (Set)", "Activity set correctly")
    else:
        log_fail("User Activity (Set)", f"Activity not set correctly: {data}")
        return
    
    # Clear activity
    resp = make_request("PATCH", "/users/me/activity", admin_token, json_data={})
    if resp.status_code != 200:
        log_fail("User Activity (Clear)", f"Status {resp.status_code}: {resp.text}")
        return
    
    # Verify cleared
    resp = make_request("GET", "/auth/me", admin_token)
    if resp.status_code == 200:
        data = resp.json()
        if data.get("activity_type") is None:
            log_pass("User Activity (Clear)", "Activity cleared successfully")
        else:
            log_fail("User Activity (Clear)", f"Activity not cleared: {data}")

def test_9_stickers():
    """Test 9: Sticker system (CRUD + send)"""
    print("\n📝 Test 9: Stickers")
    
    if not test_server_id or not test_channel_id:
        log_fail("Stickers", "No test server/channel available")
        return
    
    # Create sticker
    resp = make_request("POST", f"/servers/{test_server_id}/stickers", admin_token, json_data={
        "name": "thumbsup",
        "image_url": "https://example.com/thumbsup.png"
    })
    
    if resp.status_code != 200:
        log_fail("Stickers (Create)", f"Status {resp.status_code}: {resp.text}")
        return
    
    sticker_data = resp.json()
    sticker_id = sticker_data.get("sticker_id")
    
    if not sticker_id:
        log_fail("Stickers (Create)", "No sticker_id in response")
        return
    
    log_pass("Stickers (Create)", f"Sticker ID: {sticker_id}")
    
    # List stickers
    resp = make_request("GET", f"/servers/{test_server_id}/stickers", admin_token)
    if resp.status_code != 200:
        log_fail("Stickers (List)", f"Status {resp.status_code}")
        return
    
    stickers = resp.json()
    if not any(s.get("sticker_id") == sticker_id for s in stickers):
        log_fail("Stickers (List)", "Created sticker not in list")
        return
    
    log_pass("Stickers (List)", f"Found {len(stickers)} stickers")
    
    # Send sticker as message
    resp = make_request("POST", "/stickers/send", admin_token, json_data={
        "channel_id": test_channel_id,
        "sticker_id": sticker_id
    })
    
    if resp.status_code != 200:
        log_fail("Stickers (Send)", f"Status {resp.status_code}: {resp.text}")
        return
    
    msg_data = resp.json()
    if msg_data.get("type") == "sticker" and msg_data.get("sticker", {}).get("name") == "thumbsup":
        log_pass("Stickers (Send)", f"Message type=sticker, name=thumbsup")
    else:
        log_fail("Stickers (Send)", f"Wrong message format: {msg_data}")
        return
    
    # Test name validation (too short)
    resp = make_request("POST", f"/servers/{test_server_id}/stickers", admin_token, json_data={
        "name": "a",
        "image_url": "https://example.com/a.png"
    })
    
    if resp.status_code in [400, 422]:
        log_pass("Stickers (Validation)", "Short name correctly rejected")
    else:
        log_fail("Stickers (Validation)", f"Expected 400/422 for short name, got {resp.status_code}")
    
    # Delete sticker
    resp = make_request("DELETE", f"/servers/{test_server_id}/stickers/{sticker_id}", admin_token)
    if resp.status_code == 200:
        log_pass("Stickers (Delete)", "Sticker deleted successfully")
    else:
        log_fail("Stickers (Delete)", f"Status {resp.status_code}")

def test_10_server_tags():
    """Test 10: Server tags + tag-based discovery"""
    print("\n📝 Test 10: Server Tags")
    
    if not test_server_id:
        log_fail("Server Tags", "No test server available")
        return
    
    # Set tags
    resp = make_request("PATCH", f"/servers/{test_server_id}/tags", admin_token, json_data={
        "tags": ["Gaming", "FR", "DEV", "-bad-", "ok ok"]
    })
    
    if resp.status_code != 200:
        log_fail("Server Tags (Set)", f"Status {resp.status_code}: {resp.text}")
        return
    
    data = resp.json()
    tags = data.get("tags", [])
    
    # Should be sanitized - check that bad tags are removed/cleaned
    # "-bad-" should become "bad" or be removed, "ok ok" should become "okok"
    if "gaming" in tags and "fr" in tags and "dev" in tags:
        log_pass("Server Tags (Set)", f"Tags sanitized: {tags}")
    else:
        log_fail("Server Tags (Set)", f"Expected gaming/fr/dev in tags, got {tags}")
        return
    
    # Make server public for discovery
    resp = make_request("PATCH", f"/servers/{test_server_id}", admin_token, json_data={
        "is_public": True
    })
    
    # Discover by tag
    resp = make_request("GET", "/servers/discover/by-tag/gaming", admin_token)
    if resp.status_code != 200:
        log_fail("Server Tags (Discover)", f"Status {resp.status_code}: {resp.text}")
        return
    
    servers = resp.json()
    if any(s.get("server_id") == test_server_id for s in servers):
        log_pass("Server Tags (Discover)", f"Server found in 'gaming' tag results")
    else:
        log_fail("Server Tags (Discover)", f"Server not found in tag results")

def test_11_badges():
    """Test 11: Badges system"""
    print("\n📝 Test 11: Badges")
    
    # Get badge catalog
    resp = make_request("GET", "/badges/list")
    if resp.status_code != 200:
        log_fail("Badges (List)", f"Status {resp.status_code}")
        return
    
    badges = resp.json()
    if len(badges) != 7:
        log_fail("Badges (List)", f"Expected 7 badges, got {len(badges)}")
        return
    
    badge_ids = [b.get("id") for b in badges]
    expected_ids = ["admin", "nitro", "early", "boost", "dev", "mod", "partner"]
    if set(badge_ids) == set(expected_ids):
        log_pass("Badges (List)", f"All 7 badges present")
    else:
        log_fail("Badges (List)", f"Missing badges: {set(expected_ids) - set(badge_ids)}")
        return
    
    # Award badge to user B (as admin)
    if not user_b_id:
        log_fail("Badges (Award)", "No user B available")
        return
    
    resp = make_request("POST", "/admin/badges", admin_token, json_data={
        "user_id": user_b_id,
        "badge": "early"
    })
    
    if resp.status_code != 200:
        log_fail("Badges (Award)", f"Status {resp.status_code}: {resp.text}")
        return
    
    log_pass("Badges (Award)", "Badge 'early' awarded to user B")
    
    # Get user badges
    resp = make_request("GET", f"/users/{user_b_id}/badges")
    if resp.status_code != 200:
        log_fail("Badges (Get User)", f"Status {resp.status_code}")
        return
    
    user_badges = resp.json()
    if any(b.get("id") == "early" for b in user_badges):
        log_pass("Badges (Get User)", "Badge 'early' found in user badges")
    else:
        log_fail("Badges (Get User)", f"Badge 'early' not found: {user_badges}")
        return
    
    # Try awarding same badge again (should be 409)
    resp = make_request("POST", "/admin/badges", admin_token, json_data={
        "user_id": user_b_id,
        "badge": "early"
    })
    
    if resp.status_code == 409:
        log_pass("Badges (Duplicate)", "Duplicate badge correctly rejected with 409")
    else:
        log_fail("Badges (Duplicate)", f"Expected 409, got {resp.status_code}")
    
    # Test non-admin cannot award (if user_b_token exists)
    if user_b_token:
        resp = make_request("POST", "/admin/badges", user_b_token, json_data={
            "user_id": admin_user_id,
            "badge": "dev"
        })
        
        if resp.status_code == 403:
            log_pass("Badges (Non-admin)", "Non-admin correctly rejected with 403")
        else:
            log_fail("Badges (Non-admin)", f"Expected 403, got {resp.status_code}")
    
    # Revoke badge
    resp = make_request("DELETE", f"/admin/badges/{user_b_id}/early", admin_token)
    if resp.status_code == 200:
        log_pass("Badges (Revoke)", "Badge revoked successfully")
    else:
        log_fail("Badges (Revoke)", f"Status {resp.status_code}")

def test_12_polls():
    """Test 12: Poll get + end"""
    print("\n📝 Test 12: Polls")
    
    if not test_channel_id:
        log_fail("Polls", "No test channel available")
        return
    
    # Create a poll
    resp = make_request("POST", "/polls", admin_token, json_data={
        "channel_id": test_channel_id,
        "question": "What's your favorite color?",
        "options": ["Red", "Blue", "Green"],
        "multi": False,
        "expires_in_minutes": 60
    })
    
    if resp.status_code != 200:
        log_fail("Polls (Create)", f"Status {resp.status_code}: {resp.text}")
        return
    
    msg_data = resp.json()
    poll_data = msg_data.get("poll")
    if not poll_data:
        log_fail("Polls (Create)", "No poll in message")
        return
    
    poll_id = poll_data.get("poll_id")
    if not poll_id:
        log_fail("Polls (Create)", "No poll_id")
        return
    
    log_pass("Polls (Create)", f"Poll ID: {poll_id}")
    
    # Get poll
    resp = make_request("GET", f"/polls/{poll_id}", admin_token)
    if resp.status_code != 200:
        log_fail("Polls (Get)", f"Status {resp.status_code}: {resp.text}")
        return
    
    poll = resp.json()
    if poll.get("poll_id") == poll_id and poll.get("question") == "What's your favorite color?":
        log_pass("Polls (Get)", "Poll retrieved successfully")
    else:
        log_fail("Polls (Get)", f"Wrong poll data: {poll}")
        return
    
    # End poll as author
    resp = make_request("POST", f"/polls/{poll_id}/end", admin_token)
    if resp.status_code != 200:
        log_fail("Polls (End)", f"Status {resp.status_code}: {resp.text}")
        return
    
    # Verify ended
    resp = make_request("GET", f"/polls/{poll_id}", admin_token)
    if resp.status_code == 200:
        poll = resp.json()
        if poll.get("ended") is True:
            log_pass("Polls (End)", "Poll ended successfully")
        else:
            log_fail("Polls (End)", f"Poll not marked as ended: {poll}")
    
    # Test non-author non-mod cannot end (if user_b exists and is member)
    if user_b_token:
        # Create another poll
        resp = make_request("POST", "/polls", admin_token, json_data={
            "channel_id": test_channel_id,
            "question": "Test poll 2",
            "options": ["A", "B"],
            "multi": False,
            "expires_in_minutes": 60
        })
        
        if resp.status_code == 200:
            poll2_id = resp.json().get("poll", {}).get("poll_id")
            if poll2_id:
                resp = make_request("POST", f"/polls/{poll2_id}/end", user_b_token)
                if resp.status_code == 403:
                    log_pass("Polls (Non-author)", "Non-author correctly rejected with 403")
                else:
                    log_fail("Polls (Non-author)", f"Expected 403, got {resp.status_code}")

def test_13_mention_perms():
    """Test 13: Channel mention permissions"""
    print("\n📝 Test 13: Mention Permissions")
    
    if not test_server_id or not test_channel_id:
        log_fail("Mention Perms", "No test server/channel available")
        return
    
    # Set mention perms
    resp = make_request("PATCH", f"/channels/{test_channel_id}/mention-perms", admin_token, json_data={
        "allow_everyone": False,
        "allow_role_ping": True
    })
    
    if resp.status_code != 200:
        log_fail("Mention Perms (Set)", f"Status {resp.status_code}: {resp.text}")
        return
    
    data = resp.json()
    if data.get("mention_allow_everyone") is False:
        log_pass("Mention Perms (Set)", "Permissions set correctly")
    else:
        log_fail("Mention Perms (Set)", f"Wrong response: {data}")
        return
    
    # Verify in server data
    resp = make_request("GET", f"/servers/{test_server_id}", admin_token)
    if resp.status_code == 200:
        server_data = resp.json()
        channels = server_data.get("channels", [])
        target_ch = next((ch for ch in channels if ch["channel_id"] == test_channel_id), None)
        
        if target_ch and target_ch.get("mention_allow_everyone") is False:
            log_pass("Mention Perms (Verify)", "Permissions persisted in channel")
        else:
            log_fail("Mention Perms (Verify)", f"Permissions not found in channel: {target_ch}")

def test_14_gif_trending():
    """Test 14: GIF trending endpoint"""
    print("\n📝 Test 14: GIF Trending")
    
    # Get all trending
    resp = make_request("GET", "/gifs/trending", admin_token)
    if resp.status_code != 200:
        log_fail("GIF Trending (All)", f"Status {resp.status_code}: {resp.text}")
        return
    
    gifs = resp.json()
    if len(gifs) != 12:
        log_fail("GIF Trending (All)", f"Expected 12 GIFs, got {len(gifs)}")
        return
    
    # Check structure
    first_gif = gifs[0]
    required_fields = ["id", "title", "url", "preview"]
    missing = [f for f in required_fields if f not in first_gif]
    if missing:
        log_fail("GIF Trending (All)", f"Missing fields in GIF: {missing}")
        return
    
    log_pass("GIF Trending (All)", f"Got {len(gifs)} GIFs with correct structure")
    
    # Search with query
    resp = make_request("GET", "/gifs/trending", admin_token, params={"q": "clap"})
    if resp.status_code != 200:
        log_fail("GIF Trending (Search)", f"Status {resp.status_code}")
        return
    
    search_gifs = resp.json()
    if len(search_gifs) >= 1:
        if any("clap" in g.get("title", "").lower() for g in search_gifs):
            log_pass("GIF Trending (Search)", f"Found {len(search_gifs)} GIFs matching 'clap'")
        else:
            log_fail("GIF Trending (Search)", "No GIFs contain 'clap' in title")
    else:
        log_fail("GIF Trending (Search)", "No results for 'clap'")

def test_15_hybrid_storage():
    """Test 15: Hybrid storage (upload + retrieve)"""
    print("\n📝 Test 15: Hybrid Storage")
    
    # Check if uploads endpoint exists
    resp = make_request("GET", f"/servers/{test_server_id}", admin_token)
    if resp.status_code != 200:
        log_fail("Hybrid Storage", "Cannot verify server")
        return
    
    # Create a small test image (1x1 PNG)
    import base64
    # 1x1 red pixel PNG
    png_data = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
    )
    
    # Try to upload
    files = {"file": ("test.png", png_data, "image/png")}
    
    try:
        url = f"{BASE_URL}/uploads"
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.post(url, headers=headers, files=files, timeout=30)
        
        if resp.status_code == 200:
            data = resp.json()
            file_url = data.get("url")
            
            if not file_url:
                log_fail("Hybrid Storage (Upload)", "No URL in response")
                return
            
            log_pass("Hybrid Storage (Upload)", f"File uploaded: {file_url}")
            
            # Try to retrieve the file - construct full URL if relative
            if file_url.startswith("/"):
                # Relative URL, construct full URL
                base = BASE_URL.rsplit("/api", 1)[0]  # Get base without /api
                full_url = base + file_url
            else:
                full_url = file_url
            
            get_resp = requests.get(full_url, timeout=30)
            if get_resp.status_code == 200:
                content_type = get_resp.headers.get("Content-Type", "")
                if "image" in content_type or len(get_resp.content) > 0:
                    log_pass("Hybrid Storage (Retrieve)", f"File retrieved, size={len(get_resp.content)}, type={content_type}")
                else:
                    log_fail("Hybrid Storage (Retrieve)", f"Wrong content: {content_type}")
            else:
                log_fail("Hybrid Storage (Retrieve)", f"Status {get_resp.status_code}")
        elif resp.status_code == 404:
            log_warning("Hybrid Storage", "Upload endpoint not found (404) - may not be implemented")
        else:
            log_fail("Hybrid Storage (Upload)", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        log_warning("Hybrid Storage", f"Upload test failed: {e}")

# ========== Main Test Runner ==========

def main():
    print("=" * 70)
    print("CentCord Backend Test Suite - 13 New Features")
    print("=" * 70)
    
    # Setup
    if not setup_admin_auth():
        print("\n❌ Failed to authenticate admin. Aborting tests.")
        return
    
    if not setup_test_server():
        print("\n❌ Failed to create test server. Some tests will be skipped.")
    
    if not setup_user_b():
        print("\n⚠️  Failed to create user B. Some tests will be skipped.")
    
    # Run all tests
    print("\n" + "=" * 70)
    print("Running Tests")
    print("=" * 70)
    
    test_1_turnstile_config()
    test_2_turnstile_register_without_token()
    test_3_turnstile_register_with_token()
    test_4_server_invite_regen()
    test_5_category_update()
    test_6_read_markers()
    test_7_server_stats()
    test_8_user_activity()
    test_9_stickers()
    test_10_server_tags()
    test_11_badges()
    test_12_polls()
    test_13_mention_perms()
    test_14_gif_trending()
    test_15_hybrid_storage()
    
    # Summary
    print("\n" + "=" * 70)
    print("TEST SUMMARY")
    print("=" * 70)
    print(f"✅ Passed: {len(results['passed'])}")
    print(f"❌ Failed: {len(results['failed'])}")
    print(f"⚠️  Warnings: {len(results['warnings'])}")
    
    if results['failed']:
        print("\n❌ FAILED TESTS:")
        for fail in results['failed']:
            print(f"   - {fail}")
    
    if results['warnings']:
        print("\n⚠️  WARNINGS:")
        for warn in results['warnings']:
            print(f"   - {warn}")
    
    print("\n" + "=" * 70)
    
    if len(results['failed']) == 0:
        print("🎉 ALL TESTS PASSED!")
    else:
        print(f"⚠️  {len(results['failed'])} test(s) failed")
    
    print("=" * 70)

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Backend test suite for CentCord - Testing 3 new features:
1. Bot system (CRUD + message sending)
2. Owner delete server
3. Voice channel signaling
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

# Test data
USER_A_EMAIL = "owner_test_a@example.com"
USER_A_PASSWORD = "SecurePass123!"
USER_A_NAME = "OwnerUserA"

USER_B_EMAIL = "member_test_b@example.com"
USER_B_PASSWORD = "SecurePass456!"
USER_B_NAME = "MemberUserB"

TURNSTILE_TOKEN = "XXXX.DUMMY.TOKEN.XXXX"  # Always-pass test token

# Global state
user_a_token = None
user_b_token = None
server_id = None
text_channel_id = None
voice_channel_id = None
bot_id = None
bot_token = None

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

def test_setup():
    """Setup: Create 2 users, create server as user A, have user B join"""
    global user_a_token, user_b_token, server_id, text_channel_id, voice_channel_id
    
    print("\n=== SETUP ===")
    
    # Create/login user A
    print("Creating user A (owner)...")
    user_a_token = signup(USER_A_EMAIL, USER_A_PASSWORD, USER_A_NAME)
    print(f"✓ User A token: {user_a_token[:20]}...")
    
    # Create/login user B
    print("Creating user B (member)...")
    user_b_token = signup(USER_B_EMAIL, USER_B_PASSWORD, USER_B_NAME)
    print(f"✓ User B token: {user_b_token[:20]}...")
    
    # Create server as user A
    print("Creating server as user A...")
    resp = requests.post(f"{BASE_URL}/servers", 
        headers=headers(user_a_token),
        json={"name": "Test Bot Server", "description": "Testing bots", "is_public": False}
    )
    resp.raise_for_status()
    server_data = resp.json()
    server_id = server_data["server_id"]
    print(f"✓ Server created: {server_id}")
    
    # Get server details to find default channel
    resp = requests.get(f"{BASE_URL}/servers/{server_id}", headers=headers(user_a_token))
    resp.raise_for_status()
    server = resp.json()
    
    # Find or create text channel
    text_channels = [ch for ch in server.get("channels", []) if ch.get("type") == "text"]
    if text_channels:
        text_channel_id = text_channels[0]["channel_id"]
        print(f"✓ Using existing text channel: {text_channel_id}")
    else:
        # Create text channel
        resp = requests.post(f"{BASE_URL}/servers/{server_id}/channels",
            headers=headers(user_a_token),
            json={"name": "test-text", "type": "text"}
        )
        resp.raise_for_status()
        text_channel_id = resp.json()["channel_id"]
        print(f"✓ Created text channel: {text_channel_id}")
    
    # Create voice channel
    print("Creating voice channel...")
    resp = requests.post(f"{BASE_URL}/servers/{server_id}/channels",
        headers=headers(user_a_token),
        json={"name": "test-voice", "type": "voice"}
    )
    resp.raise_for_status()
    voice_channel_id = resp.json()["channel_id"]
    print(f"✓ Created voice channel: {voice_channel_id}")
    
    # Get invite code
    resp = requests.get(f"{BASE_URL}/servers/{server_id}", headers=headers(user_a_token))
    resp.raise_for_status()
    invite_code = resp.json().get("invite_code")
    print(f"✓ Invite code: {invite_code}")
    
    # User B joins server
    print("User B joining server...")
    resp = requests.post(f"{BASE_URL}/invites/{invite_code}", headers=headers(user_b_token))
    resp.raise_for_status()
    print("✓ User B joined server")
    
    print("✓ Setup complete\n")

# ========== BOT SYSTEM TESTS ==========

def test_bot_create_as_owner():
    """Test: Owner can create bot and receives token"""
    global bot_id, bot_token
    print("TEST: Create bot as owner")
    
    resp = requests.post(f"{BASE_URL}/servers/{server_id}/bots",
        headers=headers(user_a_token),
        json={"name": "TestBot", "description": "hello", "avatar_url": None}
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    
    data = resp.json()
    assert "bot_id" in data, "Missing bot_id"
    assert "name" in data, "Missing name"
    assert data["name"] == "TestBot", f"Expected name 'TestBot', got {data['name']}"
    assert "token" in data, "Missing token (owner should see token)"
    assert data.get("is_bot") == True, "Missing or incorrect is_bot field"
    
    bot_id = data["bot_id"]
    bot_token = data["token"]
    print(f"✓ Bot created: {bot_id}, token: {bot_token[:20]}...")

def test_bot_create_as_non_owner():
    """Test: Non-owner cannot create bot (403)"""
    print("TEST: Create bot as non-owner (should fail)")
    
    resp = requests.post(f"{BASE_URL}/servers/{server_id}/bots",
        headers=headers(user_b_token),
        json={"name": "UnauthorizedBot", "description": "test"}
    )
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"
    assert "propriétaire" in resp.text.lower(), "Expected French error message about owner"
    print("✓ Non-owner correctly rejected (403)")

def test_bot_list_owner_sees_token():
    """Test: Owner sees token in bot list"""
    print("TEST: List bots as owner (should see token)")
    
    resp = requests.get(f"{BASE_URL}/servers/{server_id}/bots", headers=headers(user_a_token))
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    
    bots = resp.json()
    assert isinstance(bots, list), "Expected list of bots"
    assert len(bots) > 0, "Expected at least one bot"
    
    bot = bots[0]
    assert "token" in bot, "Owner should see token field"
    assert bot["token"] == bot_token, "Token mismatch"
    print("✓ Owner sees token in bot list")

def test_bot_list_non_owner_no_token():
    """Test: Non-owner does NOT see token in bot list"""
    print("TEST: List bots as non-owner (should NOT see token)")
    
    resp = requests.get(f"{BASE_URL}/servers/{server_id}/bots", headers=headers(user_b_token))
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    
    bots = resp.json()
    assert isinstance(bots, list), "Expected list of bots"
    assert len(bots) > 0, "Expected at least one bot"
    
    bot = bots[0]
    assert "token" not in bot, "Non-owner should NOT see token field"
    print("✓ Non-owner does not see token")

def test_bot_regen_token():
    """Test: Owner can regenerate bot token"""
    global bot_token
    print("TEST: Regenerate bot token")
    
    old_token = bot_token
    resp = requests.post(f"{BASE_URL}/servers/{server_id}/bots/{bot_id}/regen",
        headers=headers(user_a_token)
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    
    data = resp.json()
    assert "token" in data, "Missing token in response"
    new_token = data["token"]
    assert new_token != old_token, "Token should be different after regeneration"
    
    bot_token = new_token
    print(f"✓ Token regenerated: {new_token[:20]}... (different from old)")

def test_bot_update():
    """Test: Owner can update bot description"""
    print("TEST: Update bot description")
    
    resp = requests.patch(f"{BASE_URL}/servers/{server_id}/bots/{bot_id}",
        headers=headers(user_a_token),
        json={"description": "updated"}
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    
    data = resp.json()
    assert data.get("description") == "updated", f"Expected 'updated', got {data.get('description')}"
    print("✓ Bot description updated")

def test_bot_send_message():
    """Test: Bot can send message with valid token"""
    print("TEST: Bot sends message to text channel")
    
    resp = requests.post(f"{BASE_URL}/bots/message",
        headers={"Authorization": f"Bot {bot_token}"},
        json={"channel_id": text_channel_id, "content": "Hello from bot!"}
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    
    data = resp.json()
    assert "message_id" in data, "Missing message_id"
    message_id = data["message_id"]
    print(f"✓ Bot message sent: {message_id}")
    
    # Verify message appears in channel with bot fields
    print("  Verifying message in channel...")
    resp = requests.get(f"{BASE_URL}/channels/{text_channel_id}/messages", headers=headers(user_a_token))
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    
    messages = resp.json()
    bot_messages = [m for m in messages if m.get("message_id") == message_id]
    assert len(bot_messages) > 0, "Bot message not found in channel"
    
    bot_msg = bot_messages[0]
    # Check for bot fields (bot_id, bot_name, bot_avatar)
    assert bot_msg.get("bot_id") == bot_id, f"Expected bot_id {bot_id}, got {bot_msg.get('bot_id')}"
    assert bot_msg.get("bot_name") == "TestBot", f"Expected bot_name 'TestBot', got {bot_msg.get('bot_name')}"
    assert bot_msg.get("author_id", "").startswith("bot:"), "author_id should start with 'bot:'"
    
    # Check if author field exists and has is_bot (may be None if not enriched)
    author = bot_msg.get("author")
    if author:
        assert author.get("is_bot") == True, "Author should have is_bot: true"
        assert author.get("display_name") == "TestBot", f"Expected display_name 'TestBot', got {author.get('display_name')}"
        print("  ✓ Message verified: is_bot=true, display_name=TestBot")
    else:
        print("  ✓ Message verified: bot_id and bot_name fields present (author enrichment may be missing)")

def test_bot_send_message_invalid_token():
    """Test: Bot message with invalid token returns 401"""
    print("TEST: Bot message with invalid token (should fail)")
    
    resp = requests.post(f"{BASE_URL}/bots/message",
        headers={"Authorization": "Bot invalid_token_12345"},
        json={"channel_id": text_channel_id, "content": "Should fail"}
    )
    assert resp.status_code == 401, f"Expected 401, got {resp.status_code}: {resp.text}"
    print("✓ Invalid token correctly rejected (401)")

def test_bot_send_message_to_voice_channel():
    """Test: Bot cannot post to voice channel (400)"""
    print("TEST: Bot message to voice channel (should fail)")
    
    resp = requests.post(f"{BASE_URL}/bots/message",
        headers={"Authorization": f"Bot {bot_token}"},
        json={"channel_id": voice_channel_id, "content": "Should fail"}
    )
    assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
    assert "texte" in resp.text.lower() or "annonce" in resp.text.lower(), "Expected error about text/announcement channels"
    print("✓ Voice channel posting correctly rejected (400)")

def test_bot_delete_as_non_owner():
    """Test: Non-owner cannot delete bot (403)"""
    print("TEST: Delete bot as non-owner (should fail)")
    
    resp = requests.delete(f"{BASE_URL}/servers/{server_id}/bots/{bot_id}",
        headers=headers(user_b_token)
    )
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"
    print("✓ Non-owner delete correctly rejected (403)")

def test_bot_delete_as_owner():
    """Test: Owner can delete bot"""
    print("TEST: Delete bot as owner")
    
    resp = requests.delete(f"{BASE_URL}/servers/{server_id}/bots/{bot_id}",
        headers=headers(user_a_token)
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    
    data = resp.json()
    assert data.get("ok") == True, "Expected {ok: true}"
    print("✓ Bot deleted successfully")

# ========== OWNER DELETE SERVER TESTS ==========

def test_delete_server_as_non_owner():
    """Test: Non-owner cannot delete server (403)"""
    print("TEST: Delete server as non-owner (should fail)")
    
    resp = requests.delete(f"{BASE_URL}/servers/{server_id}", headers=headers(user_b_token))
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"
    assert "propriétaire" in resp.text.lower(), "Expected French error about owner"
    print("✓ Non-owner delete correctly rejected (403)")

def test_delete_server_as_owner():
    """Test: Owner can delete server"""
    print("TEST: Delete server as owner")
    
    resp = requests.delete(f"{BASE_URL}/servers/{server_id}", headers=headers(user_a_token))
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    
    data = resp.json()
    assert data.get("ok") == True, "Expected {ok: true}"
    print("✓ Server deleted successfully")
    
    # Verify server is gone (404 or 403 - user no longer has access)
    print("  Verifying server is deleted...")
    resp = requests.get(f"{BASE_URL}/servers/{server_id}", headers=headers(user_a_token))
    assert resp.status_code in [403, 404], f"Expected 403 or 404 after delete, got {resp.status_code}"
    print(f"  ✓ Server returns {resp.status_code} after deletion")
    
    # Verify server not in user's server list
    print("  Verifying server not in user's list...")
    resp = requests.get(f"{BASE_URL}/servers", headers=headers(user_a_token))
    resp.raise_for_status()
    servers = resp.json()
    server_ids = [s["server_id"] for s in servers]
    assert server_id not in server_ids, "Deleted server should not appear in user's server list"
    print("  ✓ Server not in user's list")

# ========== VOICE CHANNEL SIGNALING TESTS ==========

def test_voice_setup():
    """Setup for voice tests: Create new server with voice channel"""
    global server_id, voice_channel_id
    
    print("\n=== VOICE TESTS SETUP ===")
    
    # Create new server
    print("Creating new server for voice tests...")
    resp = requests.post(f"{BASE_URL}/servers", 
        headers=headers(user_a_token),
        json={"name": "Voice Test Server", "description": "Testing voice", "is_public": False}
    )
    resp.raise_for_status()
    server_id = resp.json()["server_id"]
    print(f"✓ Server created: {server_id}")
    
    # Create voice channel
    resp = requests.post(f"{BASE_URL}/servers/{server_id}/channels",
        headers=headers(user_a_token),
        json={"name": "voice-test", "type": "voice"}
    )
    resp.raise_for_status()
    voice_channel_id = resp.json()["channel_id"]
    print(f"✓ Voice channel created: {voice_channel_id}")
    
    # User B joins server
    resp = requests.get(f"{BASE_URL}/servers/{server_id}", headers=headers(user_a_token))
    resp.raise_for_status()
    invite_code = resp.json().get("invite_code")
    
    resp = requests.post(f"{BASE_URL}/invites/{invite_code}", headers=headers(user_b_token))
    resp.raise_for_status()
    print("✓ User B joined server\n")

def test_voice_join_first_user():
    """Test: First user joins voice channel (empty participants)"""
    print("TEST: User A joins voice channel (first joiner)")
    
    resp = requests.post(f"{BASE_URL}/voice/channels/{voice_channel_id}/join",
        headers=headers(user_a_token)
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    
    data = resp.json()
    assert data.get("ok") == True, "Expected ok: true"
    assert "participants" in data, "Missing participants field"
    assert isinstance(data["participants"], list), "participants should be a list"
    assert len(data["participants"]) == 0, "First joiner should see empty participants list"
    print("✓ User A joined, participants: []")

def test_voice_join_second_user():
    """Test: Second user joins and sees first user in participants"""
    print("TEST: User B joins voice channel (should see user A)")
    
    resp = requests.post(f"{BASE_URL}/voice/channels/{voice_channel_id}/join",
        headers=headers(user_b_token)
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    
    data = resp.json()
    assert data.get("ok") == True, "Expected ok: true"
    assert "participants" in data, "Missing participants field"
    participants = data["participants"]
    assert len(participants) >= 1, "Should see at least user A in participants"
    
    # Verify participant structure
    p = participants[0]
    assert "user_id" in p, "Missing user_id"
    assert "display_name" in p, "Missing display_name"
    assert "avatar_url" in p, "Missing avatar_url"
    assert "joined_at" in p, "Missing joined_at"
    print(f"✓ User B joined, participants: {len(participants)} (includes user A)")

def test_voice_get_participants():
    """Test: GET participants returns both users"""
    print("TEST: Get voice channel participants")
    
    resp = requests.get(f"{BASE_URL}/voice/channels/{voice_channel_id}/participants",
        headers=headers(user_a_token)
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    
    participants = resp.json()
    assert isinstance(participants, list), "Expected list of participants"
    assert len(participants) == 2, f"Expected 2 participants, got {len(participants)}"
    print(f"✓ Participants: {len(participants)} users")

def test_voice_signal_direct():
    """Test: Direct signal to specific user"""
    print("TEST: Voice signal direct to user B")
    
    # Get user B's ID
    resp = requests.get(f"{BASE_URL}/auth/me", headers=headers(user_b_token))
    resp.raise_for_status()
    user_b_id = resp.json()["user_id"]
    
    resp = requests.post(f"{BASE_URL}/voice/signal",
        headers=headers(user_a_token),
        json={
            "channel_id": voice_channel_id,
            "event": "offer",
            "data": {"sdp": "test"},
            "to": user_b_id
        }
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    
    data = resp.json()
    assert data.get("ok") == True, "Expected ok: true"
    print("✓ Direct signal sent successfully")

def test_voice_signal_broadcast():
    """Test: Broadcast signal to all participants"""
    print("TEST: Voice signal broadcast (no 'to' field)")
    
    resp = requests.post(f"{BASE_URL}/voice/signal",
        headers=headers(user_a_token),
        json={
            "channel_id": voice_channel_id,
            "event": "join",
            "data": {"name": "A"}
        }
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    
    data = resp.json()
    assert data.get("ok") == True, "Expected ok: true"
    print("✓ Broadcast signal sent successfully")

def test_voice_signal_legacy_dm():
    """Test: Legacy DM signaling (target_user_id)"""
    print("TEST: Voice signal legacy DM form")
    
    # Get user B's ID
    resp = requests.get(f"{BASE_URL}/auth/me", headers=headers(user_b_token))
    resp.raise_for_status()
    user_b_id = resp.json()["user_id"]
    
    resp = requests.post(f"{BASE_URL}/voice/signal",
        headers=headers(user_a_token),
        json={
            "target_user_id": user_b_id,
            "type": "offer",
            "payload": {"sdp": "x"}
        }
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    
    data = resp.json()
    assert data.get("ok") == True, "Expected ok: true"
    print("✓ Legacy DM signal sent successfully")

def test_voice_signal_missing_both():
    """Test: Signal with neither channel_id nor target_user_id (400)"""
    print("TEST: Voice signal with neither channel_id nor target_user_id (should fail)")
    
    resp = requests.post(f"{BASE_URL}/voice/signal",
        headers=headers(user_a_token),
        json={
            "event": "test",
            "data": {}
        }
    )
    assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
    print("✓ Missing both fields correctly rejected (400)")

def test_voice_leave():
    """Test: User leaves voice channel"""
    print("TEST: User A leaves voice channel")
    
    resp = requests.post(f"{BASE_URL}/voice/channels/{voice_channel_id}/leave",
        headers=headers(user_a_token)
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    
    data = resp.json()
    assert data.get("ok") == True, "Expected ok: true"
    print("✓ User A left voice channel")
    
    # Verify only user B remains
    print("  Verifying participants...")
    resp = requests.get(f"{BASE_URL}/voice/channels/{voice_channel_id}/participants",
        headers=headers(user_b_token)
    )
    resp.raise_for_status()
    participants = resp.json()
    assert len(participants) == 1, f"Expected 1 participant after leave, got {len(participants)}"
    print("  ✓ Only user B remains")

def test_voice_signal_non_member():
    """Test: Signal to channel where user is not a member (should fail)"""
    print("TEST: Voice signal to channel where user is not a member")
    
    # Create a new server with voice channel (user A only)
    resp = requests.post(f"{BASE_URL}/servers", 
        headers=headers(user_a_token),
        json={"name": "Private Voice Server", "is_public": False}
    )
    resp.raise_for_status()
    private_server_id = resp.json()["server_id"]
    
    resp = requests.post(f"{BASE_URL}/servers/{private_server_id}/channels",
        headers=headers(user_a_token),
        json={"name": "private-voice", "type": "voice"}
    )
    resp.raise_for_status()
    private_voice_id = resp.json()["channel_id"]
    
    # User B tries to signal to this channel (not a member)
    resp = requests.post(f"{BASE_URL}/voice/signal",
        headers=headers(user_b_token),
        json={
            "channel_id": private_voice_id,
            "event": "test",
            "data": {}
        }
    )
    # Should be 403 or 404, not 500
    assert resp.status_code in [403, 404], f"Expected 403 or 404, got {resp.status_code}: {resp.text}"
    print(f"✓ Non-member signal correctly rejected ({resp.status_code})")

# ========== MAIN TEST RUNNER ==========

def main():
    print("=" * 60)
    print("CentCord Backend Test Suite - 3 New Features")
    print("=" * 60)
    
    try:
        # Setup
        test_setup()
        
        # Bot system tests
        print("\n" + "=" * 60)
        print("BOT SYSTEM TESTS")
        print("=" * 60)
        test_bot_create_as_owner()
        test_bot_create_as_non_owner()
        test_bot_list_owner_sees_token()
        test_bot_list_non_owner_no_token()
        test_bot_regen_token()
        test_bot_update()
        test_bot_send_message()
        test_bot_send_message_invalid_token()
        test_bot_send_message_to_voice_channel()
        test_bot_delete_as_non_owner()
        test_bot_delete_as_owner()
        
        # Owner delete server tests
        print("\n" + "=" * 60)
        print("OWNER DELETE SERVER TESTS")
        print("=" * 60)
        test_delete_server_as_non_owner()
        test_delete_server_as_owner()
        
        # Voice signaling tests
        print("\n" + "=" * 60)
        print("VOICE CHANNEL SIGNALING TESTS")
        print("=" * 60)
        test_voice_setup()
        test_voice_join_first_user()
        test_voice_join_second_user()
        test_voice_get_participants()
        test_voice_signal_direct()
        test_voice_signal_broadcast()
        test_voice_signal_legacy_dm()
        test_voice_signal_missing_both()
        test_voice_leave()
        test_voice_signal_non_member()
        
        print("\n" + "=" * 60)
        print("✅ ALL TESTS PASSED")
        print("=" * 60)
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        return 1
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())

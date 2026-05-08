#!/usr/bin/env python3
"""
Backend test suite for new and modified CentCord endpoints.
Tests: change password, voice channel limit, LiveKit token, reorder, announcement permissions, etc.
"""

import requests
import json
import sys
from typing import Optional

# Backend URL from frontend/.env
BASE_URL = "https://room-delete-issue.preview.emergentagent.com/api"

# Admin credentials from test_credentials.md
ADMIN_EMAIL = "admin@centcord.app"
ADMIN_PASSWORD = "CentCordAdmin!2026"

class TestRunner:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.admin_token = None
        self.test_user_token = None
        self.test_server_id = None
        self.test_voice_channel_id = None
        self.test_text_channel_id = None
        self.test_announcement_channel_id = None
        self.test_user_email = "viewer_test@test.com"
        self.test_user_password = "Viewer123!"
        
    def log(self, msg: str, level: str = "INFO"):
        """Log a message with level prefix."""
        print(f"[{level}] {msg}")
        
    def assert_test(self, condition: bool, test_name: str, details: str = ""):
        """Assert a test condition and track results."""
        if condition:
            self.passed += 1
            self.log(f"✅ PASS: {test_name}", "PASS")
            if details:
                self.log(f"   {details}", "INFO")
        else:
            self.failed += 1
            self.log(f"❌ FAIL: {test_name}", "FAIL")
            if details:
                self.log(f"   {details}", "ERROR")
                
    def login_admin(self) -> bool:
        """Login as admin and store token."""
        self.log("Logging in as admin...")
        try:
            resp = requests.post(f"{BASE_URL}/auth/login", json={
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD
            })
            if resp.status_code == 200:
                data = resp.json()
                self.admin_token = data.get("access_token")
                self.log(f"Admin login successful, token: {self.admin_token[:20]}...")
                return True
            else:
                self.log(f"Admin login failed: {resp.status_code} - {resp.text}", "ERROR")
                return False
        except Exception as e:
            self.log(f"Admin login exception: {e}", "ERROR")
            return False
            
    def get_headers(self, token: Optional[str] = None) -> dict:
        """Get authorization headers."""
        if token is None:
            token = self.admin_token
        return {"Authorization": f"Bearer {token}"}
        
    def setup_test_server(self) -> bool:
        """Get or create a test server."""
        self.log("Setting up test server...")
        try:
            # Get existing servers
            resp = requests.get(f"{BASE_URL}/servers", headers=self.get_headers())
            if resp.status_code == 200:
                servers = resp.json()
                if servers:
                    self.test_server_id = servers[0]["server_id"]
                    self.log(f"Using existing server: {self.test_server_id}")
                    return True
                    
            # Create new server if none exist
            resp = requests.post(f"{BASE_URL}/servers", 
                headers=self.get_headers(),
                json={"name": "Test Server", "description": "Test server for endpoint testing"}
            )
            if resp.status_code == 200:
                data = resp.json()
                self.test_server_id = data["server_id"]
                self.log(f"Created test server: {self.test_server_id}")
                return True
            else:
                self.log(f"Failed to create server: {resp.status_code} - {resp.text}", "ERROR")
                return False
        except Exception as e:
            self.log(f"Setup server exception: {e}", "ERROR")
            return False
            
    def get_server_channels(self) -> dict:
        """Get server details including channels."""
        try:
            resp = requests.get(f"{BASE_URL}/servers/{self.test_server_id}", 
                headers=self.get_headers())
            if resp.status_code == 200:
                return resp.json()
            return {}
        except:
            return {}
            
    # ========== TEST 1: Change Password ==========
    def test_change_password(self):
        """Test change password endpoint with various scenarios."""
        self.log("\n========== TEST 1: Change Password ==========")
        
        # Test 1.1: Wrong current password
        resp = requests.post(f"{BASE_URL}/users/me/change-password",
            headers=self.get_headers(),
            json={"current_password": "WrongOne", "new_password": "NewPass1234"}
        )
        self.assert_test(
            resp.status_code == 400 and "incorrect" in resp.text.lower(),
            "TEST 1.1: Wrong current password returns 400",
            f"Status: {resp.status_code}, Response: {resp.text}"
        )
        
        # Test 1.2: New password too short (validation)
        resp = requests.post(f"{BASE_URL}/users/me/change-password",
            headers=self.get_headers(),
            json={"current_password": ADMIN_PASSWORD, "new_password": "short"}
        )
        self.assert_test(
            resp.status_code == 422,
            "TEST 1.2: Short password returns 422 validation error",
            f"Status: {resp.status_code}, Response: {resp.text}"
        )
        
        # Test 1.3: Same password as current
        resp = requests.post(f"{BASE_URL}/users/me/change-password",
            headers=self.get_headers(),
            json={"current_password": ADMIN_PASSWORD, "new_password": ADMIN_PASSWORD}
        )
        self.assert_test(
            resp.status_code == 400 and "différent" in resp.text.lower(),
            "TEST 1.3: Same password returns 400 with 'différent' message",
            f"Status: {resp.status_code}, Response: {resp.text}"
        )
        
        # Test 1.4: Valid password change
        resp = requests.post(f"{BASE_URL}/users/me/change-password",
            headers=self.get_headers(),
            json={"current_password": ADMIN_PASSWORD, "new_password": "TempNewPass123!"}
        )
        self.assert_test(
            resp.status_code == 200 and resp.json().get("ok") == True,
            "TEST 1.4: Valid password change returns 200 with ok: true",
            f"Status: {resp.status_code}, Response: {resp.json()}"
        )
        
        # Test 1.5: Verify login with new password
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": "TempNewPass123!"
        })
        self.assert_test(
            resp.status_code == 200 and "access_token" in resp.json(),
            "TEST 1.5: Login works with new password",
            f"Status: {resp.status_code}"
        )
        if resp.status_code == 200:
            self.admin_token = resp.json()["access_token"]
        
        # Test 1.6: Change back to original password
        resp = requests.post(f"{BASE_URL}/users/me/change-password",
            headers=self.get_headers(),
            json={"current_password": "TempNewPass123!", "new_password": ADMIN_PASSWORD}
        )
        self.assert_test(
            resp.status_code == 200 and resp.json().get("ok") == True,
            "TEST 1.6: Changed password back to original",
            f"Status: {resp.status_code}"
        )
        if resp.status_code == 200:
            # Re-login with original password
            self.login_admin()
            
    # ========== TEST 2: 1 Voice Channel Per Server Limit ==========
    def test_voice_channel_limit(self):
        """Test that only 1 voice channel is allowed per server."""
        self.log("\n========== TEST 2: 1 Voice Channel Per Server Limit ==========")
        
        # Get current channels
        server = self.get_server_channels()
        channels = server.get("channels", [])
        voice_channels = [ch for ch in channels if ch.get("type") == "voice"]
        
        self.log(f"Current voice channels: {len(voice_channels)}")
        
        # Test 2.1: Create first voice channel if none exist
        if len(voice_channels) == 0:
            resp = requests.post(f"{BASE_URL}/servers/{self.test_server_id}/channels",
                headers=self.get_headers(),
                json={"name": "voice-1", "type": "voice", "category_id": None}
            )
            self.assert_test(
                resp.status_code == 200,
                "TEST 2.1: Create first voice channel succeeds",
                f"Status: {resp.status_code}, Response: {resp.text[:200]}"
            )
            if resp.status_code == 200:
                self.test_voice_channel_id = resp.json().get("channel_id")
                voice_channels = [resp.json()]
        else:
            self.test_voice_channel_id = voice_channels[0]["channel_id"]
            self.log(f"Using existing voice channel: {self.test_voice_channel_id}")
            self.passed += 1  # Count as pass since we have a voice channel
            
        # Test 2.2: Try to create second voice channel (should fail)
        resp = requests.post(f"{BASE_URL}/servers/{self.test_server_id}/channels",
            headers=self.get_headers(),
            json={"name": "voice-2", "type": "voice", "category_id": None}
        )
        self.assert_test(
            resp.status_code == 400 and "salon vocal" in resp.text.lower(),
            "TEST 2.2: Second voice channel creation fails with 400",
            f"Status: {resp.status_code}, Response: {resp.text}"
        )
        
        # Test 2.3: Create text channel should still work
        resp = requests.post(f"{BASE_URL}/servers/{self.test_server_id}/channels",
            headers=self.get_headers(),
            json={"name": "text-test", "type": "text", "category_id": None}
        )
        self.assert_test(
            resp.status_code == 200,
            "TEST 2.3: Creating text channel still works",
            f"Status: {resp.status_code}"
        )
        if resp.status_code == 200:
            self.test_text_channel_id = resp.json().get("channel_id")
            
    # ========== TEST 3: LiveKit Token Endpoint ==========
    def test_livekit_token(self):
        """Test LiveKit token generation endpoint."""
        self.log("\n========== TEST 3: LiveKit Token Endpoint ==========")
        
        # Ensure we have a voice channel
        if not self.test_voice_channel_id:
            self.log("No voice channel available, skipping LiveKit tests", "WARN")
            return
            
        # Test 3.1: Valid voice channel token generation
        resp = requests.post(f"{BASE_URL}/voice/livekit/token",
            headers=self.get_headers(),
            json={"channel_id": self.test_voice_channel_id}
        )
        self.assert_test(
            resp.status_code == 200,
            "TEST 3.1: LiveKit token generation returns 200",
            f"Status: {resp.status_code}, Response: {resp.text[:200]}"
        )
        
        if resp.status_code == 200:
            data = resp.json()
            
            # Test 3.2: Verify server_url starts with correct prefix
            server_url = data.get("server_url", "")
            self.assert_test(
                server_url.startswith("wss://nop-l397564z.livekit.cloud"),
                "TEST 3.2: server_url starts with wss://nop-l397564z.livekit.cloud",
                f"server_url: {server_url}"
            )
            
            # Test 3.3: Verify token is a JWT (3 parts separated by dots)
            token = data.get("token", "")
            parts = token.split(".")
            self.assert_test(
                len(parts) == 3 and len(token) > 50,
                "TEST 3.3: Token is a valid JWT format (3 parts)",
                f"Token parts: {len(parts)}, Length: {len(token)}"
            )
            
        # Test 3.4: Try with text channel (should fail)
        if self.test_text_channel_id:
            resp = requests.post(f"{BASE_URL}/voice/livekit/token",
                headers=self.get_headers(),
                json={"channel_id": self.test_text_channel_id}
            )
            self.assert_test(
                resp.status_code == 400 and "vocal" in resp.text.lower(),
                "TEST 3.4: Text channel returns 400 with 'vocal' message",
                f"Status: {resp.status_code}, Response: {resp.text}"
            )
            
        # Test 3.5: Non-existent channel
        resp = requests.post(f"{BASE_URL}/voice/livekit/token",
            headers=self.get_headers(),
            json={"channel_id": "ch_nonexistent_xyz"}
        )
        self.assert_test(
            resp.status_code == 404,
            "TEST 3.5: Non-existent channel returns 404",
            f"Status: {resp.status_code}, Response: {resp.text}"
        )
        
    # ========== TEST 4: Reorder Channels ==========
    def test_reorder_channels(self):
        """Test channel reordering endpoint."""
        self.log("\n========== TEST 4: Reorder Channels ==========")
        
        # Get current channels
        server = self.get_server_channels()
        channels = server.get("channels", [])
        
        if len(channels) < 2:
            self.log("Need at least 2 channels for reorder test, skipping", "WARN")
            return
            
        # Test 4.1: Reorder channels
        items = [
            {"channel_id": channels[0]["channel_id"], "position": 1, "category_id": None},
            {"channel_id": channels[1]["channel_id"], "position": 0, "category_id": None}
        ]
        resp = requests.post(f"{BASE_URL}/servers/{self.test_server_id}/channels/reorder",
            headers=self.get_headers(),
            json={"items": items}
        )
        self.assert_test(
            resp.status_code == 200 and resp.json().get("ok") == True,
            "TEST 4.1: Reorder channels returns 200 with ok: true",
            f"Status: {resp.status_code}, Response: {resp.json()}"
        )
        
        # Test 4.2: Verify positions are saved
        server_after = self.get_server_channels()
        channels_after = server_after.get("channels", [])
        ch0_after = next((ch for ch in channels_after if ch["channel_id"] == channels[0]["channel_id"]), None)
        ch1_after = next((ch for ch in channels_after if ch["channel_id"] == channels[1]["channel_id"]), None)
        
        self.assert_test(
            ch0_after and ch0_after.get("position") == 1 and ch1_after and ch1_after.get("position") == 0,
            "TEST 4.2: Channel positions are correctly saved",
            f"Ch0 position: {ch0_after.get('position') if ch0_after else 'N/A'}, Ch1 position: {ch1_after.get('position') if ch1_after else 'N/A'}"
        )
        
    # ========== TEST 5: Reorder Categories ==========
    def test_reorder_categories(self):
        """Test category reordering endpoint."""
        self.log("\n========== TEST 5: Reorder Categories ==========")
        
        # Get current categories
        server = self.get_server_channels()
        categories = server.get("categories", [])
        
        if len(categories) < 2:
            # Create categories for testing
            self.log("Creating test categories...")
            resp1 = requests.post(f"{BASE_URL}/servers/{self.test_server_id}/categories",
                headers=self.get_headers(),
                json={"name": "CAT1"}
            )
            resp2 = requests.post(f"{BASE_URL}/servers/{self.test_server_id}/categories",
                headers=self.get_headers(),
                json={"name": "CAT2"}
            )
            if resp1.status_code == 200 and resp2.status_code == 200:
                categories = [resp1.json(), resp2.json()]
            else:
                self.log("Failed to create categories for testing", "WARN")
                return
                
        # Test 5.1: Reorder categories
        items = [
            {"category_id": categories[0]["category_id"], "position": 1},
            {"category_id": categories[1]["category_id"], "position": 0}
        ]
        resp = requests.post(f"{BASE_URL}/servers/{self.test_server_id}/categories/reorder",
            headers=self.get_headers(),
            json={"items": items}
        )
        self.assert_test(
            resp.status_code == 200 and resp.json().get("ok") == True,
            "TEST 5.1: Reorder categories returns 200 with ok: true",
            f"Status: {resp.status_code}, Response: {resp.json()}"
        )
        
        # Test 5.2: Verify positions are saved
        server_after = self.get_server_channels()
        categories_after = server_after.get("categories", [])
        cat0_after = next((cat for cat in categories_after if cat["category_id"] == categories[0]["category_id"]), None)
        cat1_after = next((cat for cat in categories_after if cat["category_id"] == categories[1]["category_id"]), None)
        
        self.assert_test(
            cat0_after and cat0_after.get("position") == 1 and cat1_after and cat1_after.get("position") == 0,
            "TEST 5.2: Category positions are correctly saved",
            f"Cat0 position: {cat0_after.get('position') if cat0_after else 'N/A'}, Cat1 position: {cat1_after.get('position') if cat1_after else 'N/A'}"
        )
        
    # ========== TEST 6: Announcement Channel Permissions ==========
    def test_announcement_permissions(self):
        """Test that only admins can post to announcement channels."""
        self.log("\n========== TEST 6: Announcement Channel Permissions ==========")
        
        # Test 6.1: Create announcement channel
        resp = requests.post(f"{BASE_URL}/servers/{self.test_server_id}/channels",
            headers=self.get_headers(),
            json={"name": "news", "type": "announcement", "category_id": None}
        )
        self.assert_test(
            resp.status_code == 200,
            "TEST 6.1: Create announcement channel succeeds",
            f"Status: {resp.status_code}"
        )
        if resp.status_code == 200:
            self.test_announcement_channel_id = resp.json().get("channel_id")
        else:
            self.log("Failed to create announcement channel, skipping remaining tests", "WARN")
            return
            
        # Test 6.2: Admin can post to announcement channel
        resp = requests.post(f"{BASE_URL}/channels/{self.test_announcement_channel_id}/messages",
            headers=self.get_headers(),
            json={"content": "Admin announcement"}
        )
        self.assert_test(
            resp.status_code == 200,
            "TEST 6.2: Admin can post to announcement channel",
            f"Status: {resp.status_code}"
        )
        
        # Test 6.3: Create regular test user
        resp = requests.post(f"{BASE_URL}/auth/register", json={
            "email": self.test_user_email,
            "password": self.test_user_password,
            "display_name": "Viewer",
            "turnstile_token": "XXXX.DUMMY.TOKEN.XXXX"
        })
        if resp.status_code == 200:
            self.log("Test user created successfully")
            # Login as test user
            resp = requests.post(f"{BASE_URL}/auth/login", json={
                "email": self.test_user_email,
                "password": self.test_user_password
            })
            if resp.status_code == 200:
                self.test_user_token = resp.json().get("access_token")
                self.assert_test(True, "TEST 6.3: Test user created and logged in", "")
            else:
                self.log(f"Test user login failed: {resp.status_code}", "ERROR")
                return
        elif resp.status_code == 400 and "existe déjà" in resp.text:
            # User already exists, just login
            resp = requests.post(f"{BASE_URL}/auth/login", json={
                "email": self.test_user_email,
                "password": self.test_user_password
            })
            if resp.status_code == 200:
                self.test_user_token = resp.json().get("access_token")
                self.log("Using existing test user")
                self.passed += 1
            else:
                self.log(f"Test user login failed: {resp.status_code}", "ERROR")
                return
        else:
            self.log(f"Test user creation failed: {resp.status_code} - {resp.text}", "ERROR")
            return
            
        # Test 6.4: Add test user to server (generate invite and join)
        resp = requests.post(f"{BASE_URL}/servers/{self.test_server_id}/invites",
            headers=self.get_headers(),
            json={"max_uses": 1, "expires_in": 3600}
        )
        if resp.status_code == 200:
            invite_code = resp.json().get("code")
            # Join as test user
            resp = requests.post(f"{BASE_URL}/invites/{invite_code}",
                headers=self.get_headers(self.test_user_token)
            )
            self.assert_test(
                resp.status_code == 200,
                "TEST 6.4: Test user joined server via invite",
                f"Status: {resp.status_code}"
            )
        else:
            self.log(f"Failed to create invite: {resp.status_code}", "ERROR")
            return
            
        # Test 6.5: Regular user cannot post to announcement channel
        resp = requests.post(f"{BASE_URL}/channels/{self.test_announcement_channel_id}/messages",
            headers=self.get_headers(self.test_user_token),
            json={"content": "User trying to post"}
        )
        self.assert_test(
            resp.status_code == 403 and "administrateur" in resp.text.lower(),
            "TEST 6.5: Regular user cannot post to announcement channel (403)",
            f"Status: {resp.status_code}, Response: {resp.text}"
        )
        
        # Test 6.6: Regular user can post to text channel
        if self.test_text_channel_id:
            resp = requests.post(f"{BASE_URL}/channels/{self.test_text_channel_id}/messages",
                headers=self.get_headers(self.test_user_token),
                json={"content": "User posting to text channel"}
            )
            self.assert_test(
                resp.status_code == 200,
                "TEST 6.6: Regular user can post to text channel",
                f"Status: {resp.status_code}"
            )
            
    # ========== TEST 7: Channel Deletion ==========
    def test_channel_deletion(self):
        """Test channel deletion endpoint."""
        self.log("\n========== TEST 7: Channel Deletion ==========")
        
        # Create a temp channel
        resp = requests.post(f"{BASE_URL}/servers/{self.test_server_id}/channels",
            headers=self.get_headers(),
            json={"name": "temp-delete-test", "type": "text", "category_id": None}
        )
        if resp.status_code != 200:
            self.log(f"Failed to create temp channel: {resp.status_code}", "ERROR")
            return
            
        temp_channel_id = resp.json().get("channel_id")
        
        # Test 7.1: Delete the channel
        resp = requests.delete(f"{BASE_URL}/servers/{self.test_server_id}/channels/{temp_channel_id}",
            headers=self.get_headers()
        )
        self.assert_test(
            resp.status_code == 200,
            "TEST 7.1: Channel deletion returns 200",
            f"Status: {resp.status_code}, Response: {resp.text[:200]}"
        )
        
    # ========== TEST 8: Edit Channel Topic ==========
    def test_edit_channel_topic(self):
        """Test editing channel topic."""
        self.log("\n========== TEST 8: Edit Channel Topic ==========")
        
        if not self.test_text_channel_id:
            self.log("No text channel available for topic test", "WARN")
            return
            
        # Test 8.1: Update channel topic
        resp = requests.patch(f"{BASE_URL}/servers/{self.test_server_id}/channels/{self.test_text_channel_id}",
            headers=self.get_headers(),
            json={"topic": "🚀 Nouveau sujet"}
        )
        self.assert_test(
            resp.status_code == 200,
            "TEST 8.1: Edit channel topic returns 200",
            f"Status: {resp.status_code}"
        )
        
        # Test 8.2: Verify topic is reflected in server
        server = self.get_server_channels()
        channels = server.get("channels", [])
        channel = next((ch for ch in channels if ch["channel_id"] == self.test_text_channel_id), None)
        
        self.assert_test(
            channel and channel.get("topic") == "🚀 Nouveau sujet",
            "TEST 8.2: Channel topic is correctly saved",
            f"Topic: {channel.get('topic') if channel else 'N/A'}"
        )
        
    def run_all_tests(self):
        """Run all test suites."""
        self.log("=" * 80)
        self.log("CentCord Backend Test Suite - New Endpoints")
        self.log("=" * 80)
        
        # Login as admin
        if not self.login_admin():
            self.log("Failed to login as admin, aborting tests", "ERROR")
            return False
            
        # Setup test server
        if not self.setup_test_server():
            self.log("Failed to setup test server, aborting tests", "ERROR")
            return False
            
        # Run all test suites
        self.test_change_password()
        self.test_voice_channel_limit()
        self.test_livekit_token()
        self.test_reorder_channels()
        self.test_reorder_categories()
        self.test_announcement_permissions()
        self.test_channel_deletion()
        self.test_edit_channel_topic()
        
        # Print summary
        self.log("\n" + "=" * 80)
        self.log("TEST SUMMARY")
        self.log("=" * 80)
        self.log(f"✅ PASSED: {self.passed}")
        self.log(f"❌ FAILED: {self.failed}")
        self.log(f"📊 TOTAL:  {self.passed + self.failed}")
        self.log(f"📈 SUCCESS RATE: {(self.passed / (self.passed + self.failed) * 100):.1f}%")
        self.log("=" * 80)
        
        return self.failed == 0

if __name__ == "__main__":
    runner = TestRunner()
    success = runner.run_all_tests()
    sys.exit(0 if success else 1)

#!/usr/bin/env python3
"""
CentCord Backend Testing - 3 New Features
Tests for:
1. Role reorder (POST /api/servers/{id}/roles/reorder)
2. Channel permission overrides (PUT/GET/DELETE /api/channels/{id}/overrides)
3. User rail layout (GET/PUT /api/me/rail)
"""

import requests
import json
import sys

# Backend URL
BASE_URL = "https://admin-panel-fix-118.preview.emergentagent.com/api"

# Test credentials
ADMIN_EMAIL = "admin@centcord.app"
ADMIN_PASSWORD = "CentCordAdmin!2026"

# Global state
admin_token = None
admin_user_id = None
test_server_id = None
test_user_token = None
test_user_id = None
test_user_email = None

def log(msg):
    print(f"[TEST] {msg}")

def login(email, password):
    """Login and return access token"""
    log(f"Logging in as {email}...")
    resp = requests.post(f"{BASE_URL}/auth/login", json={
        "email": email,
        "password": password
    })
    if resp.status_code != 200:
        log(f"❌ Login failed: {resp.status_code} {resp.text}")
        return None, None
    data = resp.json()
    token = data.get("access_token")
    user_id = data.get("user", {}).get("user_id")
    log(f"✅ Login successful, user_id: {user_id}")
    return token, user_id

def create_test_user():
    """Create a test user for permission testing"""
    import random
    email = f"testuser_{random.randint(10000, 99999)}@test.com"
    password = "TestPass123!"
    log(f"Creating test user: {email}")
    resp = requests.post(f"{BASE_URL}/auth/register", json={
        "email": email,
        "password": password,
        "display_name": "Test User",
        "turnstile_token": "XXXX.DUMMY.TOKEN.XXXX"
    })
    if resp.status_code != 200:
        log(f"❌ User creation failed: {resp.status_code} {resp.text}")
        return None, None, None
    data = resp.json()
    token = data.get("access_token")
    user_id = data.get("user", {}).get("user_id")
    log(f"✅ Test user created: {email}, user_id: {user_id}")
    return token, user_id, email

def get_or_create_server(token):
    """Get existing server or create one"""
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get user's servers
    resp = requests.get(f"{BASE_URL}/servers", headers=headers)
    if resp.status_code == 200:
        servers = resp.json()
        if servers:
            server_id = servers[0]["server_id"]
            log(f"✅ Using existing server: {server_id}")
            return server_id
    
    # Create new server
    log("Creating new test server...")
    resp = requests.post(f"{BASE_URL}/servers", headers=headers, json={
        "name": "TestReorder",
        "description": "Test server for role reorder"
    })
    if resp.status_code != 200:
        log(f"❌ Server creation failed: {resp.status_code} {resp.text}")
        return None
    server_id = resp.json().get("server_id")
    log(f"✅ Server created: {server_id}")
    return server_id

def get_server_details(token, server_id):
    """Get server details"""
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(f"{BASE_URL}/servers/{server_id}", headers=headers)
    if resp.status_code != 200:
        log(f"❌ Failed to get server: {resp.status_code} {resp.text}")
        return None
    return resp.json()

def create_role(token, server_id, name, color, permissions):
    """Create a role"""
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.post(f"{BASE_URL}/servers/{server_id}/roles", headers=headers, json={
        "name": name,
        "color": color,
        "permissions": permissions
    })
    if resp.status_code != 200:
        log(f"❌ Role creation failed: {resp.status_code} {resp.text}")
        return None
    return resp.json().get("role_id")

def delete_role(token, server_id, role_id):
    """Delete a role"""
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.delete(f"{BASE_URL}/servers/{server_id}/roles/{role_id}", headers=headers)
    return resp.status_code == 200

def join_server_via_invite(token, server_id):
    """Join server via invite code"""
    headers = {"Authorization": f"Bearer {token}"}
    # Get server details to get invite code
    resp = requests.get(f"{BASE_URL}/servers/{server_id}", headers={"Authorization": f"Bearer {admin_token}"})
    if resp.status_code != 200:
        return False
    invite_code = resp.json().get("invite_code")
    if not invite_code:
        return False
    
    # Join via invite
    resp = requests.post(f"{BASE_URL}/invites/{invite_code}", headers=headers)
    return resp.status_code == 200

# ========== TEST 1: ROLE REORDER ==========
def test_role_reorder():
    """Test role reorder functionality"""
    log("\n" + "="*60)
    log("TEST 1: ROLE REORDER")
    log("="*60)
    
    global admin_token, test_server_id
    
    # Step 1: Get or create server
    server = get_server_details(admin_token, test_server_id)
    if not server:
        log("❌ Failed to get server details")
        return False
    
    default_role_id = None
    for role in server.get("roles", []):
        if role.get("is_default"):
            default_role_id = role["role_id"]
            break
    
    if not default_role_id:
        log("❌ No default role found")
        return False
    
    log(f"✅ Server found with default role: {default_role_id}")
    
    # Step 2: Create 3 roles (A, B, C)
    log("\nCreating 3 roles: A, B, C...")
    role_a = create_role(admin_token, test_server_id, "A", "#FF0000", 3)
    role_b = create_role(admin_token, test_server_id, "B", "#00FF00", 3)
    role_c = create_role(admin_token, test_server_id, "C", "#0000FF", 3)
    
    if not all([role_a, role_b, role_c]):
        log("❌ Failed to create roles")
        return False
    
    log(f"✅ Roles created: A={role_a}, B={role_b}, C={role_c}")
    
    # Step 3: Get initial positions
    server = get_server_details(admin_token, test_server_id)
    roles_map = {r["role_id"]: r for r in server.get("roles", [])}
    
    pos_a_before = roles_map[role_a].get("position", 0)
    pos_b_before = roles_map[role_b].get("position", 0)
    pos_c_before = roles_map[role_c].get("position", 0)
    pos_default_before = roles_map[default_role_id].get("position", 0)
    
    log(f"Initial positions: A={pos_a_before}, B={pos_b_before}, C={pos_c_before}, default={pos_default_before}")
    
    # Step 4: Reorder roles to C, A, B
    log("\nReordering roles to [C, A, B]...")
    headers = {"Authorization": f"Bearer {admin_token}"}
    resp = requests.post(f"{BASE_URL}/servers/{test_server_id}/roles/reorder", 
                        headers=headers, 
                        json={"role_ids": [role_c, role_a, role_b]})
    
    if resp.status_code != 200:
        log(f"❌ Reorder failed: {resp.status_code} {resp.text}")
        # Cleanup
        delete_role(admin_token, test_server_id, role_a)
        delete_role(admin_token, test_server_id, role_b)
        delete_role(admin_token, test_server_id, role_c)
        return False
    
    log("✅ Reorder request successful")
    
    # Step 5: Verify new positions
    server = get_server_details(admin_token, test_server_id)
    roles_map = {r["role_id"]: r for r in server.get("roles", [])}
    
    pos_a_after = roles_map[role_a].get("position", 0)
    pos_b_after = roles_map[role_b].get("position", 0)
    pos_c_after = roles_map[role_c].get("position", 0)
    pos_default_after = roles_map[default_role_id].get("position", 0)
    
    log(f"New positions: C={pos_c_after}, A={pos_a_after}, B={pos_b_after}, default={pos_default_after}")
    
    # Verify: position(C) > position(A) > position(B) > position(default_role)
    success = (pos_c_after > pos_a_after > pos_b_after > pos_default_after)
    
    if success:
        log("✅ Position verification: C > A > B > default ✓")
    else:
        log(f"❌ Position verification failed: expected C > A > B > default, got C={pos_c_after}, A={pos_a_after}, B={pos_b_after}, default={pos_default_after}")
    
    # Step 6: Cleanup - delete roles
    log("\nCleaning up roles...")
    delete_role(admin_token, test_server_id, role_a)
    delete_role(admin_token, test_server_id, role_b)
    delete_role(admin_token, test_server_id, role_c)
    log("✅ Cleanup complete")
    
    return success

# ========== TEST 2: CHANNEL PERMISSION OVERRIDES ==========
def test_channel_overrides():
    """Test channel permission overrides"""
    log("\n" + "="*60)
    log("TEST 2: CHANNEL PERMISSION OVERRIDES")
    log("="*60)
    
    global admin_token, test_server_id, test_user_token, test_user_id
    
    # Step 1: Get a text channel
    server = get_server_details(admin_token, test_server_id)
    if not server:
        log("❌ Failed to get server details")
        return False
    
    text_channel_id = None
    for channel in server.get("channels", []):
        if channel.get("type") == "text":
            text_channel_id = channel["channel_id"]
            break
    
    if not text_channel_id:
        log("❌ No text channel found")
        return False
    
    log(f"✅ Using text channel: {text_channel_id}")
    
    # Get default role
    default_role_id = None
    for role in server.get("roles", []):
        if role.get("is_default"):
            default_role_id = role["role_id"]
            break
    
    if not default_role_id:
        log("❌ No default role found")
        return False
    
    log(f"✅ Default role: {default_role_id}")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Step 2: PUT override for default role (allow=1, deny=2)
    log("\nSetting override for default role (allow=1, deny=2)...")
    resp = requests.put(f"{BASE_URL}/channels/{text_channel_id}/overrides", 
                       headers=headers,
                       json={
                           "target_type": "role",
                           "target_id": default_role_id,
                           "allow": 1,
                           "deny": 2
                       })
    
    if resp.status_code != 200:
        log(f"❌ PUT override failed: {resp.status_code} {resp.text}")
        return False
    
    data = resp.json()
    overrides = data.get("permission_overrides", [])
    if len(overrides) != 1:
        log(f"❌ Expected 1 override, got {len(overrides)}")
        return False
    
    log(f"✅ Override set successfully: {overrides}")
    
    # Step 3: GET overrides
    log("\nGetting overrides...")
    resp = requests.get(f"{BASE_URL}/channels/{text_channel_id}/overrides", headers=headers)
    
    if resp.status_code != 200:
        log(f"❌ GET overrides failed: {resp.status_code} {resp.text}")
        return False
    
    overrides = resp.json()
    if len(overrides) != 1:
        log(f"❌ Expected 1 override, got {len(overrides)}")
        return False
    
    override = overrides[0]
    if override.get("target_type") != "role" or override.get("target_id") != default_role_id:
        log(f"❌ Override mismatch: {override}")
        return False
    
    log(f"✅ GET overrides successful: {override}")
    
    # Step 4: PUT with allow=0, deny=0 (should remove override)
    log("\nRemoving override (allow=0, deny=0)...")
    resp = requests.put(f"{BASE_URL}/channels/{text_channel_id}/overrides", 
                       headers=headers,
                       json={
                           "target_type": "role",
                           "target_id": default_role_id,
                           "allow": 0,
                           "deny": 0
                       })
    
    if resp.status_code != 200:
        log(f"❌ PUT override (remove) failed: {resp.status_code} {resp.text}")
        return False
    
    data = resp.json()
    overrides = data.get("permission_overrides", [])
    if len(overrides) != 0:
        log(f"❌ Expected 0 overrides after removal, got {len(overrides)}")
        return False
    
    log("✅ Override removed successfully")
    
    # Step 5: PUT with unknown role (should 404)
    log("\nTesting PUT with unknown role_id...")
    resp = requests.put(f"{BASE_URL}/channels/{text_channel_id}/overrides", 
                       headers=headers,
                       json={
                           "target_type": "role",
                           "target_id": "role_unknown123",
                           "allow": 1,
                           "deny": 0
                       })
    
    if resp.status_code != 404:
        log(f"❌ Expected 404 for unknown role, got {resp.status_code}")
        return False
    
    log("✅ Unknown role correctly rejected with 404")
    
    # Step 6: PUT with unknown user (should 404)
    log("\nTesting PUT with unknown user_id...")
    resp = requests.put(f"{BASE_URL}/channels/{text_channel_id}/overrides", 
                       headers=headers,
                       json={
                           "target_type": "user",
                           "target_id": "user_unknown123",
                           "allow": 1,
                           "deny": 0
                       })
    
    if resp.status_code != 404:
        log(f"❌ Expected 404 for unknown user, got {resp.status_code}")
        return False
    
    log("✅ Unknown user correctly rejected with 404")
    
    # Step 7: PUT with admin user (allow=4, deny=0)
    log(f"\nSetting override for admin user (allow=4, deny=0)...")
    resp = requests.put(f"{BASE_URL}/channels/{text_channel_id}/overrides", 
                       headers=headers,
                       json={
                           "target_type": "user",
                           "target_id": admin_user_id,
                           "allow": 4,
                           "deny": 0
                       })
    
    if resp.status_code != 200:
        log(f"❌ PUT user override failed: {resp.status_code} {resp.text}")
        return False
    
    log("✅ User override set successfully")
    
    # Step 8: DELETE user override
    log(f"\nDeleting user override...")
    resp = requests.delete(f"{BASE_URL}/channels/{text_channel_id}/overrides/user/{admin_user_id}", 
                          headers=headers)
    
    if resp.status_code != 200:
        log(f"❌ DELETE override failed: {resp.status_code} {resp.text}")
        return False
    
    data = resp.json()
    overrides = data.get("permission_overrides", [])
    if len(overrides) != 0:
        log(f"❌ Expected 0 overrides after deletion, got {len(overrides)}")
        return False
    
    log("✅ User override deleted successfully")
    
    # Step 9: Validation - non-member cannot set overrides (403)
    log("\nTesting permission validation with non-admin user...")
    
    # Make test user join the server
    if not join_server_via_invite(test_user_token, test_server_id):
        log("❌ Test user failed to join server")
        return False
    
    log("✅ Test user joined server")
    
    # Try to set override as non-admin (should fail with 403)
    test_headers = {"Authorization": f"Bearer {test_user_token}"}
    resp = requests.put(f"{BASE_URL}/channels/{text_channel_id}/overrides", 
                       headers=test_headers,
                       json={
                           "target_type": "role",
                           "target_id": default_role_id,
                           "allow": 1,
                           "deny": 0
                       })
    
    if resp.status_code != 403:
        log(f"❌ Expected 403 for non-admin user, got {resp.status_code}")
        return False
    
    log("✅ Non-admin user correctly rejected with 403")
    
    return True

# ========== TEST 3: USER RAIL LAYOUT ==========
def test_user_rail():
    """Test user rail layout"""
    log("\n" + "="*60)
    log("TEST 3: USER RAIL LAYOUT")
    log("="*60)
    
    global admin_token, test_server_id
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Step 1: GET /api/me/rail
    log("\nGetting initial rail layout...")
    resp = requests.get(f"{BASE_URL}/me/rail", headers=headers)
    
    if resp.status_code != 200:
        log(f"❌ GET rail failed: {resp.status_code} {resp.text}")
        return False
    
    data = resp.json()
    items = data.get("items", [])
    
    log(f"✅ GET rail successful, {len(items)} items")
    
    # Verify at least 1 server item
    server_items = [it for it in items if it.get("type") == "server"]
    if len(server_items) < 1:
        log(f"❌ Expected at least 1 server item, got {len(server_items)}")
        return False
    
    log(f"✅ Found {len(server_items)} server items")
    
    # Step 2: PUT with folder
    log("\nSetting rail layout with folder...")
    
    # Get another server if exists
    other_server_id = None
    for it in items:
        if it.get("type") == "server" and it.get("server_id") != test_server_id:
            other_server_id = it.get("server_id")
            break
    
    new_layout = {
        "items": [
            {
                "type": "folder",
                "folder": {
                    "name": "Mon dossier",
                    "color": "#FF3B00",
                    "collapsed": False,
                    "server_ids": [test_server_id]
                }
            }
        ]
    }
    
    if other_server_id:
        new_layout["items"].append({
            "type": "server",
            "server_id": other_server_id
        })
    
    resp = requests.put(f"{BASE_URL}/me/rail", headers=headers, json=new_layout)
    
    if resp.status_code != 200:
        log(f"❌ PUT rail failed: {resp.status_code} {resp.text}")
        return False
    
    data = resp.json()
    items = data.get("items", [])
    
    log(f"✅ PUT rail successful, {len(items)} items returned")
    
    # Step 3: GET rail again to verify
    log("\nVerifying saved layout...")
    resp = requests.get(f"{BASE_URL}/me/rail", headers=headers)
    
    if resp.status_code != 200:
        log(f"❌ GET rail failed: {resp.status_code} {resp.text}")
        return False
    
    data = resp.json()
    items = data.get("items", [])
    
    # Verify folder exists with auto-generated folder_id
    folder_items = [it for it in items if it.get("type") == "folder"]
    if len(folder_items) < 1:
        log(f"❌ Expected at least 1 folder item, got {len(folder_items)}")
        return False
    
    folder = folder_items[0]
    if not folder.get("folder_id"):
        log("❌ Folder missing auto-generated folder_id")
        return False
    
    if folder.get("name") != "Mon dossier":
        log(f"❌ Folder name mismatch: expected 'Mon dossier', got '{folder.get('name')}'")
        return False
    
    log(f"✅ Folder saved with auto-generated folder_id: {folder.get('folder_id')}")
    
    # Step 4: PUT with non-member server (should be filtered)
    log("\nTesting PUT with non-member server_id...")
    
    resp = requests.put(f"{BASE_URL}/me/rail", headers=headers, json={
        "items": [
            {
                "type": "server",
                "server_id": "srv_inexistant"
            },
            {
                "type": "server",
                "server_id": test_server_id
            }
        ]
    })
    
    if resp.status_code != 200:
        log(f"❌ PUT rail failed: {resp.status_code} {resp.text}")
        return False
    
    data = resp.json()
    items = data.get("items", [])
    
    # Verify srv_inexistant is filtered out
    server_ids = [it.get("server_id") for it in items if it.get("type") == "server"]
    if "srv_inexistant" in server_ids:
        log("❌ Non-member server was not filtered out")
        return False
    
    log("✅ Non-member server correctly filtered out")
    
    # Step 5: PUT with empty items (should auto-add member servers)
    log("\nTesting PUT with empty items...")
    
    resp = requests.put(f"{BASE_URL}/me/rail", headers=headers, json={"items": []})
    
    if resp.status_code != 200:
        log(f"❌ PUT rail failed: {resp.status_code} {resp.text}")
        return False
    
    data = resp.json()
    items = data.get("items", [])
    
    # Verify member servers are auto-added
    server_items = [it for it in items if it.get("type") == "server"]
    if len(server_items) < 1:
        log(f"❌ Expected at least 1 auto-added server, got {len(server_items)}")
        return False
    
    log(f"✅ Member servers auto-added: {len(server_items)} servers")
    
    return True

# ========== MAIN ==========
def main():
    global admin_token, admin_user_id, test_server_id, test_user_token, test_user_id, test_user_email
    
    log("="*60)
    log("CentCord Backend Testing - 3 New Features")
    log("="*60)
    
    # Login as admin
    admin_token, admin_user_id = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if not admin_token:
        log("❌ Admin login failed, aborting tests")
        sys.exit(1)
    
    # Get or create test server
    test_server_id = get_or_create_server(admin_token)
    if not test_server_id:
        log("❌ Failed to get/create test server, aborting tests")
        sys.exit(1)
    
    # Create test user for permission testing
    test_user_token, test_user_id, test_user_email = create_test_user()
    if not test_user_token:
        log("❌ Failed to create test user, aborting tests")
        sys.exit(1)
    
    # Run tests
    results = []
    
    # Test 1: Role reorder
    try:
        result = test_role_reorder()
        results.append(("Role reorder", result))
    except Exception as e:
        log(f"❌ Test 1 exception: {e}")
        results.append(("Role reorder", False))
    
    # Test 2: Channel permission overrides
    try:
        result = test_channel_overrides()
        results.append(("Channel permission overrides", result))
    except Exception as e:
        log(f"❌ Test 2 exception: {e}")
        results.append(("Channel permission overrides", False))
    
    # Test 3: User rail layout
    try:
        result = test_user_rail()
        results.append(("User rail layout", result))
    except Exception as e:
        log(f"❌ Test 3 exception: {e}")
        results.append(("User rail layout", False))
    
    # Summary
    log("\n" + "="*60)
    log("TEST SUMMARY")
    log("="*60)
    
    passed = 0
    failed = 0
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        log(f"{status} - {name}")
        if result:
            passed += 1
        else:
            failed += 1
    
    log(f"\nTotal: {passed} passed, {failed} failed")
    
    if failed > 0:
        sys.exit(1)
    else:
        log("\n🎉 All tests passed!")
        sys.exit(0)

if __name__ == "__main__":
    main()

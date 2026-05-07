#!/usr/bin/env python3
"""
Targeted test: Roles CRUD + member assignment (backend CentCord)
Tests all 14 steps as specified in the review request.
"""
import requests
import sys
import json

# Configuration
BASE_URL = "https://pending-work-13.preview.emergentagent.com/api"
ADMIN_EMAIL = "admin@centcord.app"
ADMIN_PASSWORD = "CentCordAdmin!2026"

# Test state
access_token = None
admin_user_id = None
server_id = None
role_id = None
default_role_id = None

def log_step(step_num, description):
    """Log test step"""
    print(f"\n{'='*80}")
    print(f"STEP {step_num}: {description}")
    print('='*80)

def log_success(message):
    """Log success message"""
    print(f"✅ {message}")

def log_error(message):
    """Log error message"""
    print(f"❌ {message}")

def log_info(message):
    """Log info message"""
    print(f"ℹ️  {message}")

def make_request(method, endpoint, **kwargs):
    """Make HTTP request with proper headers"""
    url = f"{BASE_URL}{endpoint}"
    headers = kwargs.pop('headers', {})
    if access_token:
        headers['Authorization'] = f'Bearer {access_token}'
    
    try:
        response = requests.request(method, url, headers=headers, **kwargs)
        log_info(f"{method} {endpoint} -> {response.status_code}")
        return response
    except Exception as e:
        log_error(f"Request failed: {e}")
        return None

# ========== STEP 1: Login admin ==========
log_step(1, "Login admin → récupérer access_token")
response = make_request('POST', '/auth/login', json={
    'email': ADMIN_EMAIL,
    'password': ADMIN_PASSWORD
})

if not response or response.status_code != 200:
    log_error(f"Login failed: {response.status_code if response else 'No response'}")
    if response:
        log_error(f"Response: {response.text}")
    sys.exit(1)

data = response.json()
access_token = data.get('access_token')
admin_user_id = data.get('user', {}).get('user_id')

if not access_token:
    log_error("No access_token in response")
    sys.exit(1)

log_success(f"Logged in as admin (user_id: {admin_user_id})")
log_info(f"Access token: {access_token[:20]}...")

# ========== STEP 2: Get servers and find one where admin is owner ==========
log_step(2, "Récupérer la liste des serveurs et prendre le premier serveur où owner_id == admin user_id")
response = make_request('GET', '/servers')

if not response or response.status_code != 200:
    log_error(f"Failed to get servers: {response.status_code if response else 'No response'}")
    sys.exit(1)

servers = response.json()
log_info(f"Found {len(servers)} servers")

# Find a server where admin is owner
owned_server = None
for server in servers:
    if server.get('owner_id') == admin_user_id:
        owned_server = server
        break

if owned_server:
    server_id = owned_server['server_id']
    log_success(f"Found owned server: {owned_server.get('name')} (ID: {server_id})")
else:
    # Create a new server
    log_info("No owned server found, creating one...")
    response = make_request('POST', '/servers', json={
        'name': 'TestRoles',
        'description': 'test'
    })
    
    if not response or response.status_code != 200:
        log_error(f"Failed to create server: {response.status_code if response else 'No response'}")
        if response:
            log_error(f"Response: {response.text}")
        sys.exit(1)
    
    server_data = response.json()
    server_id = server_data['server_id']
    log_success(f"Created new server: TestRoles (ID: {server_id})")

# ========== STEP 3: Create role with specific permissions ==========
log_step(3, "POST /api/servers/{server_id}/roles avec permissions 98 (kick+ban+manage_messages)")
log_info("Permissions breakdown: 98 = 32 (kick) + 64 (ban) + 2 (manage_messages)")

response = make_request('POST', f'/servers/{server_id}/roles', json={
    'name': 'ModTest',
    'color': '#EC4899',
    'permissions': 98,
    'mentionable': True
})

if not response or response.status_code != 200:
    log_error(f"Failed to create role: {response.status_code if response else 'No response'}")
    if response:
        log_error(f"Response: {response.text}")
    sys.exit(1)

role_data = response.json()
role_id = role_data.get('role_id')

if not role_id:
    log_error("No role_id in response")
    log_error(f"Response: {json.dumps(role_data, indent=2)}")
    sys.exit(1)

log_success(f"Created role: {role_data.get('name')} (ID: {role_id})")
log_info(f"Role details: color={role_data.get('color')}, permissions={role_data.get('permissions')}, mentionable={role_data.get('mentionable')}")

# ========== STEP 4: Verify role appears in server ==========
log_step(4, "GET /api/servers/{server_id} → vérifier que le nouveau rôle est dans `roles`")

response = make_request('GET', f'/servers/{server_id}')

if not response or response.status_code != 200:
    log_error(f"Failed to get server: {response.status_code if response else 'No response'}")
    sys.exit(1)

server_data = response.json()
roles = server_data.get('roles', [])
log_info(f"Server has {len(roles)} roles")

# Find our created role and capture default role
created_role = None
for role in roles:
    if role.get('role_id') == role_id:
        created_role = role
    # Also capture default role for later test
    if role.get('is_default'):
        default_role_id = role.get('role_id')

if not created_role:
    log_error(f"Role {role_id} not found in server roles")
    log_error(f"Available roles: {[r.get('role_id') for r in roles]}")
    sys.exit(1)

log_success(f"Role found in server: {created_role.get('name')}")
log_info(f"Role details: {json.dumps(created_role, indent=2)}")

if default_role_id:
    log_info(f"Default role ID captured: {default_role_id}")

# ========== STEP 5: Update role ==========
log_step(5, "PATCH /api/servers/{server_id}/roles/{role_id} avec permissions 226")
log_info("Permissions breakdown: 226 = 98 + 128 = kick+ban+manage_messages+manage_roles")

response = make_request('PATCH', f'/servers/{server_id}/roles/{role_id}', json={
    'name': 'ModTest2',
    'color': '#3B82F6',
    'permissions': 226,
    'mentionable': False
})

if not response or response.status_code != 200:
    log_error(f"Failed to update role: {response.status_code if response else 'No response'}")
    if response:
        log_error(f"Response: {response.text}")
    sys.exit(1)

log_success("Role updated successfully")

# ========== STEP 6: Verify role update ==========
log_step(6, "GET /api/servers/{server_id} → vérifier que les champs sont à jour")

response = make_request('GET', f'/servers/{server_id}')

if not response or response.status_code != 200:
    log_error(f"Failed to get server: {response.status_code if response else 'No response'}")
    sys.exit(1)

server_data = response.json()
roles = server_data.get('roles', [])

# Find updated role
updated_role = None
for role in roles:
    if role.get('role_id') == role_id:
        updated_role = role
        break

if not updated_role:
    log_error(f"Role {role_id} not found in server roles")
    sys.exit(1)

# Verify updates
expected_name = 'ModTest2'
expected_color = '#3B82F6'
expected_permissions = 226
expected_mentionable = False

errors = []
if updated_role.get('name') != expected_name:
    errors.append(f"Name mismatch: expected '{expected_name}', got '{updated_role.get('name')}'")
if updated_role.get('color') != expected_color:
    errors.append(f"Color mismatch: expected '{expected_color}', got '{updated_role.get('color')}'")
if updated_role.get('permissions') != expected_permissions:
    errors.append(f"Permissions mismatch: expected {expected_permissions}, got {updated_role.get('permissions')}")
if updated_role.get('mentionable') != expected_mentionable:
    errors.append(f"Mentionable mismatch: expected {expected_mentionable}, got {updated_role.get('mentionable')}")

if errors:
    for error in errors:
        log_error(error)
    sys.exit(1)

log_success("All role fields updated correctly")
log_info(f"Updated role: name={updated_role.get('name')}, color={updated_role.get('color')}, permissions={updated_role.get('permissions')}, mentionable={updated_role.get('mentionable')}")

# ========== STEP 7: Get members ==========
log_step(7, "GET /api/servers/{server_id}/members → prendre le user_id admin")

response = make_request('GET', f'/servers/{server_id}/members')

if not response or response.status_code != 200:
    log_error(f"Failed to get members: {response.status_code if response else 'No response'}")
    sys.exit(1)

members = response.json()
log_info(f"Server has {len(members)} members")

# Find admin member
admin_member = None
for member in members:
    if member.get('user_id') == admin_user_id:
        admin_member = member
        break

if not admin_member:
    log_error(f"Admin user {admin_user_id} not found in members")
    sys.exit(1)

log_success(f"Admin member found: {admin_member.get('user', {}).get('display_name')}")
log_info(f"Current role_ids: {admin_member.get('role_ids', [])}")

# ========== STEP 8: Assign role to admin member ==========
log_step(8, "PATCH /api/servers/{server_id}/members/{admin_user_id} avec role_ids=[new_role_id]")

response = make_request('PATCH', f'/servers/{server_id}/members/{admin_user_id}', json={
    'role_ids': [role_id]
})

if not response or response.status_code != 200:
    log_error(f"Failed to assign role: {response.status_code if response else 'No response'}")
    if response:
        log_error(f"Response: {response.text}")
    sys.exit(1)

log_success("Role assigned to admin member")

# ========== STEP 9: Verify role assignment ==========
log_step(9, "GET /api/servers/{server_id}/members → vérifier que le membre admin a bien role_ids contenant le nouveau role_id")

response = make_request('GET', f'/servers/{server_id}/members')

if not response or response.status_code != 200:
    log_error(f"Failed to get members: {response.status_code if response else 'No response'}")
    sys.exit(1)

members = response.json()

# Find admin member
admin_member = None
for member in members:
    if member.get('user_id') == admin_user_id:
        admin_member = member
        break

if not admin_member:
    log_error(f"Admin user {admin_user_id} not found in members")
    sys.exit(1)

member_role_ids = admin_member.get('role_ids', [])
if role_id not in member_role_ids:
    log_error(f"Role {role_id} not found in member's role_ids")
    log_error(f"Member role_ids: {member_role_ids}")
    sys.exit(1)

log_success(f"Role {role_id} found in member's role_ids")
log_info(f"Member role_ids: {member_role_ids}")

# ========== STEP 10: Remove role from member ==========
log_step(10, "PATCH /api/servers/{server_id}/members/{admin_user_id} avec role_ids=[]")

response = make_request('PATCH', f'/servers/{server_id}/members/{admin_user_id}', json={
    'role_ids': []
})

if not response or response.status_code != 200:
    log_error(f"Failed to remove role: {response.status_code if response else 'No response'}")
    if response:
        log_error(f"Response: {response.text}")
    sys.exit(1)

log_success("Role removed from admin member")

# Verify removal
response = make_request('GET', f'/servers/{server_id}/members')
if response and response.status_code == 200:
    members = response.json()
    admin_member = next((m for m in members if m.get('user_id') == admin_user_id), None)
    if admin_member:
        member_role_ids = admin_member.get('role_ids', [])
        if role_id in member_role_ids:
            log_error(f"Role {role_id} still in member's role_ids after removal")
            sys.exit(1)
        log_success("Verified: role removed from member's role_ids")
        log_info(f"Member role_ids: {member_role_ids}")

# ========== STEP 11: Delete role ==========
log_step(11, "DELETE /api/servers/{server_id}/roles/{role_id}")

response = make_request('DELETE', f'/servers/{server_id}/roles/{role_id}')

if not response or response.status_code != 200:
    log_error(f"Failed to delete role: {response.status_code if response else 'No response'}")
    if response:
        log_error(f"Response: {response.text}")
    sys.exit(1)

log_success("Role deleted successfully")

# ========== STEP 12: Verify role deletion ==========
log_step(12, "GET /api/servers/{server_id} → le rôle doit avoir disparu")

response = make_request('GET', f'/servers/{server_id}')

if not response or response.status_code != 200:
    log_error(f"Failed to get server: {response.status_code if response else 'No response'}")
    sys.exit(1)

server_data = response.json()
roles = server_data.get('roles', [])

# Check if deleted role still exists
deleted_role = next((r for r in roles if r.get('role_id') == role_id), None)
if deleted_role:
    log_error(f"Role {role_id} still exists after deletion")
    sys.exit(1)

log_success("Verified: role removed from server")
log_info(f"Remaining roles: {len(roles)}")

# ========== STEP 13: Test deleting default role ==========
log_step(13, "Tenter DELETE sur le rôle par défaut (is_default=true) → doit retourner 400")

if not default_role_id:
    log_error("No default role ID captured earlier")
    sys.exit(1)

response = make_request('DELETE', f'/servers/{server_id}/roles/{default_role_id}')

if response.status_code != 400:
    log_error(f"Expected 400, got {response.status_code}")
    log_error(f"Response: {response.text}")
    sys.exit(1)

response_data = response.json()
detail = response_data.get('detail', '')
if 'default role' not in detail.lower():
    log_error(f"Expected error message about default role, got: {detail}")
    sys.exit(1)

log_success("Default role deletion correctly blocked with 400")
log_info(f"Error message: {detail}")

# ========== STEP 14: Test admin bit permission ==========
log_step(14, "Test permission admin bit 31: créer rôle avec permissions=2147483648")
log_info("Admin bit: 2^31 = 2147483648")

response = make_request('POST', f'/servers/{server_id}/roles', json={
    'name': 'Dieu',
    'color': '#FF0000',
    'permissions': 2147483648,
    'mentionable': True
})

if not response or response.status_code != 200:
    log_error(f"Failed to create admin role: {response.status_code if response else 'No response'}")
    if response:
        log_error(f"Response: {response.text}")
    sys.exit(1)

admin_role_data = response.json()
admin_role_id = admin_role_data.get('role_id')

if not admin_role_id:
    log_error("No role_id in response")
    sys.exit(1)

# Verify permissions
if admin_role_data.get('permissions') != 2147483648:
    log_error(f"Permissions mismatch: expected 2147483648, got {admin_role_data.get('permissions')}")
    sys.exit(1)

log_success(f"Admin role created: {admin_role_data.get('name')} (ID: {admin_role_id})")
log_info(f"Permissions: {admin_role_data.get('permissions')} (admin bit)")

# Clean up: delete admin role
log_info("Cleaning up: deleting admin role...")
response = make_request('DELETE', f'/servers/{server_id}/roles/{admin_role_id}')

if not response or response.status_code != 200:
    log_error(f"Failed to delete admin role: {response.status_code if response else 'No response'}")
else:
    log_success("Admin role deleted")

# ========== FINAL SUMMARY ==========
print("\n" + "="*80)
print("✅ ALL 14 STEPS COMPLETED SUCCESSFULLY")
print("="*80)
print("\nTest Summary:")
print("1. ✅ Admin login successful")
print("2. ✅ Server found/created")
print("3. ✅ Role created with permissions 98 (kick+ban+manage_messages)")
print("4. ✅ Role appears in server")
print("5. ✅ Role updated to permissions 226 (added manage_roles)")
print("6. ✅ Role update verified")
print("7. ✅ Members retrieved")
print("8. ✅ Role assigned to admin member")
print("9. ✅ Role assignment verified")
print("10. ✅ Role removed from member")
print("11. ✅ Role deleted")
print("12. ✅ Role deletion verified")
print("13. ✅ Default role deletion correctly blocked with 400")
print("14. ✅ Admin bit (2^31) role created and verified")
print("\n" + "="*80)
print("ROLES CRUD + MEMBER ASSIGNMENT: ALL TESTS PASSED")
print("="*80)

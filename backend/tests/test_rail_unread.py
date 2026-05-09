"""
Regression tests for the bug fix:
- /api/servers/unread route ordering (was being matched as /servers/{server_id} -> 403)
- /api/channels/unread basic 200
- /api/me/rail GET / PUT layout (folders, server cleanup, auto-append)
"""
import os
import uuid
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://voice-chat-debug-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
ADMIN_EMAIL = "admin@centcord.app"
ADMIN_PASSWORD = "CentCordAdmin!2026"
UNIQUE = uuid.uuid4().hex[:8]


def hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def user_token():
    """Register a fresh user (so we can test rail layout without polluting admin)."""
    email = f"test_rail_{UNIQUE}@centcord.example.com"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Passw0rd!pass",
        "display_name": f"TEST_RAIL_{UNIQUE}",
        "turnstile_token": "test-bypass-token"
    }, timeout=15)
    if r.status_code == 400 and "Captcha" in r.text:
        pytest.skip("Captcha verification active and rejecting test tokens")
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def user_servers(user_token):
    """Create 2 servers owned by user — needed to test folder grouping."""
    sids = []
    for i in range(2):
        r = requests.post(f"{API}/servers", headers=hdr(user_token),
                          json={"name": f"TEST_RailSrv{i}_{UNIQUE}", "is_public": False}, timeout=15)
        assert r.status_code == 200, r.text
        sids.append(r.json()["server_id"])
    yield sids
    # cleanup
    for sid in sids:
        try:
            requests.delete(f"{API}/servers/{sid}", headers=hdr(user_token), timeout=10)
        except Exception:
            pass


# --- 1. /servers/unread route ordering ---
def test_servers_unread_returns_200_for_admin(admin_token):
    r = requests.get(f"{API}/servers/unread", headers=hdr(admin_token), timeout=15)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    data = r.json()
    assert isinstance(data, dict), f"Expected dict, got {type(data)}"


def test_servers_unread_returns_200_for_new_user(user_token):
    """New user with no servers should get 200 + empty dict (not 403)."""
    r = requests.get(f"{API}/servers/unread", headers=hdr(user_token), timeout=15)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    assert isinstance(r.json(), dict)


def test_servers_unread_unauthenticated():
    r = requests.get(f"{API}/servers/unread", timeout=15)
    assert r.status_code == 401


# --- 2. /channels/unread ---
def test_channels_unread_returns_200(admin_token):
    r = requests.get(f"{API}/channels/unread", headers=hdr(admin_token), timeout=15)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"


# --- 3. /me/rail GET ---
def test_me_rail_get_returns_layout(user_token, user_servers):
    r = requests.get(f"{API}/me/rail", headers=hdr(user_token), timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "items" in data
    assert isinstance(data["items"], list)
    # Both member servers appear (auto-append on first read)
    server_items = [it for it in data["items"] if it["type"] == "server"]
    sids_in_rail = {it["server_id"] for it in server_items}
    for sid in user_servers:
        assert sid in sids_in_rail, f"Server {sid} missing from rail layout: {data}"


# --- 4. /me/rail PUT folder grouping + persistence ---
def test_me_rail_put_creates_folder_with_two_servers(user_token, user_servers):
    sid_a, sid_b = user_servers
    payload = {
        "items": [
            {
                "type": "folder",
                "folder": {
                    "name": "TEST_Folder",
                    "color": "#00AAFF",
                    "collapsed": False,
                    "server_ids": [sid_a, sid_b],
                },
            }
        ]
    }
    r = requests.put(f"{API}/me/rail", headers=hdr(user_token), json=payload, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    folders = [it for it in body["items"] if it["type"] == "folder"]
    assert len(folders) == 1
    assert folders[0]["name"] == "TEST_Folder"
    assert set(folders[0]["server_ids"]) == {sid_a, sid_b}
    assert folders[0].get("folder_id"), "folder_id should be auto-generated"

    # GET back and verify persistence
    r2 = requests.get(f"{API}/me/rail", headers=hdr(user_token), timeout=15)
    assert r2.status_code == 200
    body2 = r2.json()
    folders2 = [it for it in body2["items"] if it["type"] == "folder"]
    assert len(folders2) == 1
    assert set(folders2[0]["server_ids"]) == {sid_a, sid_b}


# --- 5. PUT drops unknown server_ids ---
def test_me_rail_put_drops_unknown_server_ids(user_token, user_servers):
    sid_a = user_servers[0]
    bogus = "srv_DOESNOTEXIST"
    payload = {
        "items": [
            {"type": "server", "server_id": sid_a},
            {"type": "server", "server_id": bogus},
        ]
    }
    r = requests.put(f"{API}/me/rail", headers=hdr(user_token), json=payload, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    server_items = [it for it in body["items"] if it["type"] == "server"]
    sids = {it["server_id"] for it in server_items}
    assert bogus not in sids, "Unknown server_id should be dropped"
    assert sid_a in sids


# --- 6. PUT auto-appends missing member servers ---
def test_me_rail_put_auto_appends_missing_member_servers(user_token, user_servers):
    sid_a, sid_b = user_servers
    # Send only sid_a
    payload = {"items": [{"type": "server", "server_id": sid_a}]}
    r = requests.put(f"{API}/me/rail", headers=hdr(user_token), json=payload, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    server_items = [it for it in body["items"] if it["type"] == "server"]
    sids = {it["server_id"] for it in server_items}
    assert sid_a in sids
    assert sid_b in sids, f"Server B should be auto-appended even though missing from payload, got {sids}"


def test_me_rail_unauthenticated():
    r = requests.get(f"{API}/me/rail", timeout=15)
    assert r.status_code == 401

#!/usr/bin/env python3
"""
Test the two bug fixes:
1. Messages in announcement channels should load
2. Voice server should be configured (LiveKit token endpoint)
"""
import requests
import json

BASE_URL = "http://localhost:8001/api"

def test_livekit_token_endpoint():
    """Test that LiveKit token endpoint is properly configured."""
    print("\n=== Test 1: LiveKit Token Endpoint ===")
    
    # First login as admin
    login_resp = requests.post(f"{BASE_URL}/auth/login", json={
        "email": "admin@centcord.app",
        "password": "CentCordAdmin!2026"
    })
    
    if login_resp.status_code != 200:
        print(f"❌ Login failed: {login_resp.status_code}")
        return False
    
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get servers to find a voice channel
    servers_resp = requests.get(f"{BASE_URL}/servers", headers=headers)
    if servers_resp.status_code != 200:
        print(f"❌ Failed to get servers: {servers_resp.status_code}")
        return False
    
    servers = servers_resp.json()
    if not servers:
        print("⚠️  No servers found, skipping voice test")
        return True
    
    server = servers[0]
    server_id = server["server_id"]
    
    # Get server details to find channels
    server_resp = requests.get(f"{BASE_URL}/servers/{server_id}", headers=headers)
    if server_resp.status_code != 200:
        print(f"❌ Failed to get server details: {server_resp.status_code}")
        return False
    
    server_data = server_resp.json()
    voice_channels = [ch for ch in server_data.get("channels", []) if ch.get("type") == "voice"]
    
    if not voice_channels:
        # Create a voice channel for testing
        print("Creating a voice channel for testing...")
        create_resp = requests.post(f"{BASE_URL}/servers/{server_id}/channels", 
            headers=headers,
            json={"name": "Test Vocal", "type": "voice"}
        )
        if create_resp.status_code != 200:
            print(f"❌ Failed to create voice channel: {create_resp.status_code}")
            return False
        voice_channel_id = create_resp.json()["channel_id"]
    else:
        voice_channel_id = voice_channels[0]["channel_id"]
    
    # Test LiveKit token endpoint
    print(f"Testing LiveKit token for channel {voice_channel_id}...")
    livekit_resp = requests.post(f"{BASE_URL}/voice/livekit/token",
        headers=headers,
        json={"channel_id": voice_channel_id}
    )
    
    if livekit_resp.status_code == 503:
        print(f"❌ FAIL: Voice server not configured (503)")
        print(f"   Error: {livekit_resp.json().get('detail', 'Unknown error')}")
        return False
    elif livekit_resp.status_code == 200:
        data = livekit_resp.json()
        if "token" in data and "server_url" in data:
            print(f"✅ PASS: LiveKit token endpoint working")
            print(f"   Server URL: {data['server_url']}")
            return True
        else:
            print(f"❌ FAIL: Response missing required fields")
            return False
    else:
        print(f"❌ FAIL: Unexpected status code {livekit_resp.status_code}")
        print(f"   Response: {livekit_resp.text}")
        return False


def test_announcement_channel_messages():
    """Test that messages can be loaded from announcement channels."""
    print("\n=== Test 2: Announcement Channel Messages ===")
    
    # Login as admin
    login_resp = requests.post(f"{BASE_URL}/auth/login", json={
        "email": "admin@centcord.app",
        "password": "CentCordAdmin!2026"
    })
    
    if login_resp.status_code != 200:
        print(f"❌ Login failed: {login_resp.status_code}")
        return False
    
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get servers
    servers_resp = requests.get(f"{BASE_URL}/servers", headers=headers)
    if servers_resp.status_code != 200:
        print(f"❌ Failed to get servers: {servers_resp.status_code}")
        return False
    
    servers = servers_resp.json()
    if not servers:
        print("⚠️  No servers found, creating one...")
        create_server_resp = requests.post(f"{BASE_URL}/servers", 
            headers=headers,
            json={"name": "Test Server"}
        )
        if create_server_resp.status_code != 200:
            print(f"❌ Failed to create server")
            return False
        server_id = create_server_resp.json()["server_id"]
    else:
        server_id = servers[0]["server_id"]
    
    # Get server details
    server_resp = requests.get(f"{BASE_URL}/servers/{server_id}", headers=headers)
    if server_resp.status_code != 200:
        print(f"❌ Failed to get server details")
        return False
    
    server_data = server_resp.json()
    announcement_channels = [ch for ch in server_data.get("channels", []) if ch.get("type") == "announcement"]
    
    if not announcement_channels:
        # Create an announcement channel
        print("Creating an announcement channel for testing...")
        create_resp = requests.post(f"{BASE_URL}/servers/{server_id}/channels",
            headers=headers,
            json={"name": "Annonces", "type": "announcement"}
        )
        if create_resp.status_code != 200:
            print(f"❌ Failed to create announcement channel: {create_resp.status_code}")
            return False
        announcement_channel_id = create_resp.json()["channel_id"]
    else:
        announcement_channel_id = announcement_channels[0]["channel_id"]
    
    # Post a message in the announcement channel (admin can post)
    print(f"Posting a test message in announcement channel {announcement_channel_id}...")
    post_resp = requests.post(f"{BASE_URL}/channels/{announcement_channel_id}/messages",
        headers=headers,
        json={"content": "Test announcement message"}
    )
    
    if post_resp.status_code != 200:
        print(f"❌ Failed to post message: {post_resp.status_code}")
        print(f"   Error: {post_resp.json().get('detail', 'Unknown error')}")
        return False
    
    message_id = post_resp.json()["message_id"]
    
    # Now try to load messages from the announcement channel
    print(f"Loading messages from announcement channel...")
    get_resp = requests.get(f"{BASE_URL}/channels/{announcement_channel_id}/messages?limit=50",
        headers=headers
    )
    
    if get_resp.status_code != 200:
        print(f"❌ Failed to get messages: {get_resp.status_code}")
        return False
    
    messages = get_resp.json()
    if not messages:
        print(f"❌ FAIL: No messages returned from announcement channel")
        return False
    
    if any(m["message_id"] == message_id for m in messages):
        print(f"✅ PASS: Message successfully loaded from announcement channel")
        print(f"   Found {len(messages)} message(s) in channel")
        return True
    else:
        print(f"❌ FAIL: Posted message not found in channel")
        return False


def main():
    print("=" * 60)
    print("CentCord Bug Fixes Test Suite")
    print("=" * 60)
    
    results = []
    
    # Test 1: LiveKit token endpoint
    try:
        results.append(("LiveKit Token Endpoint", test_livekit_token_endpoint()))
    except Exception as e:
        print(f"❌ Test failed with exception: {e}")
        results.append(("LiveKit Token Endpoint", False))
    
    # Test 2: Announcement channel messages
    try:
        results.append(("Announcement Channel Messages", test_announcement_channel_messages()))
    except Exception as e:
        print(f"❌ Test failed with exception: {e}")
        results.append(("Announcement Channel Messages", False))
    
    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    for test_name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    all_passed = all(result[1] for result in results)
    print("\n" + ("🎉 ALL TESTS PASSED" if all_passed else "❌ SOME TESTS FAILED"))
    print("=" * 60)
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    exit(main())

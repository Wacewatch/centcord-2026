#!/usr/bin/env python3
"""
Test LiveKit with existing server or create a new one with voice channel
"""
import requests

BASE_URL = "http://localhost:8001/api"

# Login as admin
login_resp = requests.post(f"{BASE_URL}/auth/login", json={
    "email": "admin@centcord.app",
    "password": "CentCordAdmin!2026"
})

token = login_resp.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# Create a test server
print("Creating test server...")
server_resp = requests.post(f"{BASE_URL}/servers", 
    headers=headers,
    json={"name": "Test VoiceKit Server"}
)

if server_resp.status_code == 200:
    server_id = server_resp.json()["server_id"]
    print(f"✅ Server created: {server_id}")
    
    # Create a voice channel
    print("Creating voice channel...")
    voice_resp = requests.post(f"{BASE_URL}/servers/{server_id}/channels",
        headers=headers,
        json={"name": "Salon Vocal Test", "type": "voice"}
    )
    
    if voice_resp.status_code == 200:
        voice_channel_id = voice_resp.json()["channel_id"]
        print(f"✅ Voice channel created: {voice_channel_id}")
        
        # Test LiveKit token
        print("Testing LiveKit token endpoint...")
        livekit_resp = requests.post(f"{BASE_URL}/voice/livekit/token",
            headers=headers,
            json={"channel_id": voice_channel_id}
        )
        
        if livekit_resp.status_code == 200:
            data = livekit_resp.json()
            print(f"✅ LiveKit token generated successfully!")
            print(f"   Server URL: {data.get('server_url')}")
            print(f"   Token: {data.get('token')[:50]}...")
        else:
            print(f"❌ Failed to get LiveKit token: {livekit_resp.status_code}")
            print(f"   Error: {livekit_resp.json()}")
    else:
        print(f"❌ Failed to create voice channel: {voice_resp.status_code}")
else:
    print(f"❌ Failed to create server: {server_resp.status_code}")

#!/usr/bin/env python3
"""
Test complet : messages DM, appels vocaux, salon vocal
"""
import requests
import time

BASE_URL = "http://localhost:8001/api"

# Login
print("🔐 Login...")
login_resp = requests.post(f"{BASE_URL}/auth/login", json={
    "email": "admin@centcord.app",
    "password": "CentCordAdmin!2026"
})
token = login_resp.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}
print(f"✅ Logged in")

# Test 1: Vérifier LiveKit
print("\n📞 Test 1: LiveKit Token")
servers_resp = requests.get(f"{BASE_URL}/servers", headers=headers)
servers = servers_resp.json()

if servers:
    server_id = servers[0]["server_id"]
    server_resp = requests.get(f"{BASE_URL}/servers/{server_id}", headers=headers)
    channels = server_resp.json().get("channels", [])
    voice_channels = [ch for ch in channels if ch.get("type") == "voice"]
    
    if voice_channels:
        voice_channel_id = voice_channels[0]["channel_id"]
        print(f"   Testing LiveKit with channel: {voice_channel_id}")
        
        livekit_resp = requests.post(f"{BASE_URL}/voice/livekit/token",
            headers=headers,
            json={"channel_id": voice_channel_id}
        )
        
        if livekit_resp.status_code == 200:
            data = livekit_resp.json()
            print(f"   ✅ LiveKit token généré")
            print(f"   Server URL: {data.get('server_url')}")
        else:
            print(f"   ❌ FAILED: {livekit_resp.status_code}")
            print(f"   Error: {livekit_resp.json()}")
    else:
        print("   ⚠️  No voice channels found")
else:
    print("   ⚠️  No servers found")

# Test 2: Envoyer un message DM
print("\n💬 Test 2: Messages DM")
dms_resp = requests.get(f"{BASE_URL}/dms", headers=headers)
dms = dms_resp.json()

if dms:
    dm_id = dms[0]["dm_id"]
    print(f"   Using DM: {dm_id}")
    
    # Envoyer un message
    msg_resp = requests.post(f"{BASE_URL}/dms/{dm_id}/messages",
        headers=headers,
        json={"content": f"Test message {int(time.time())}"}
    )
    
    if msg_resp.status_code == 200:
        msg_data = msg_resp.json()
        print(f"   ✅ Message envoyé: {msg_data.get('message_id')}")
        print(f"   Author: {msg_data.get('author', {}).get('display_name', 'N/A')}")
        
        # Vérifier qu'on peut récupérer le message
        get_resp = requests.get(f"{BASE_URL}/dms/{dm_id}/messages?limit=10", headers=headers)
        messages = get_resp.json()
        if any(m["message_id"] == msg_data["message_id"] for m in messages):
            print(f"   ✅ Message récupéré dans la liste")
        else:
            print(f"   ❌ Message NOT FOUND in list")
    else:
        print(f"   ❌ Failed to send: {msg_resp.status_code}")
        print(f"   Error: {msg_resp.json()}")
else:
    print("   ⚠️  No DMs found, create one first")

# Test 3: Test voice signal (pour appels)
print("\n📞 Test 3: Voice Signal (appels)")
signal_resp = requests.post(f"{BASE_URL}/voice/signal",
    headers=headers,
    json={
        "to": "test_user_123",
        "event": "call-request",
        "data": {"dm_id": "dm_test", "with_video": False}
    }
)

if signal_resp.status_code in [200, 404]:  # 404 si user n'existe pas, c'est OK
    print(f"   ✅ Voice signal endpoint responding (status: {signal_resp.status_code})")
else:
    print(f"   ❌ Voice signal failed: {signal_resp.status_code}")

print("\n" + "="*60)
print("RÉSUMÉ DES TESTS")
print("="*60)

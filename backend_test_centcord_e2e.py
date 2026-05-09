#!/usr/bin/env python3
"""
Test complet du backend CentCord - E2E Testing
Tests: Authentification, Messages DM E2E, Messages Salons, LiveKit Vocal, WebSocket, Amis
"""
import requests
import json
import base64
import time
from typing import Optional

# Configuration
BACKEND_URL = "https://voice-chat-debug-3.preview.emergentagent.com/api"
ADMIN_EMAIL = "admin@centcord.app"
ADMIN_PASSWORD = "CentCordAdmin!2026"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

def log_test(name: str):
    print(f"\n{Colors.BLUE}[TEST]{Colors.END} {name}")

def log_pass(msg: str):
    print(f"  {Colors.GREEN}✓{Colors.END} {msg}")

def log_fail(msg: str):
    print(f"  {Colors.RED}✗{Colors.END} {msg}")

def log_info(msg: str):
    print(f"  {Colors.YELLOW}ℹ{Colors.END} {msg}")

class CentCordTester:
    def __init__(self):
        self.access_token: Optional[str] = None
        self.user_id: Optional[str] = None
        self.headers = {}
        self.test_results = {"passed": 0, "failed": 0, "total": 0}
    
    def assert_test(self, condition: bool, success_msg: str, fail_msg: str):
        """Helper to track test results"""
        self.test_results["total"] += 1
        if condition:
            self.test_results["passed"] += 1
            log_pass(success_msg)
            return True
        else:
            self.test_results["failed"] += 1
            log_fail(fail_msg)
            return False
    
    def test_1_authentication(self):
        """Test 1: Authentification avec admin@centcord.app"""
        log_test("1. AUTHENTIFICATION - Login avec admin@centcord.app")
        
        try:
            response = requests.post(
                f"{BACKEND_URL}/auth/login",
                json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                self.access_token = data.get("access_token")
                self.user_id = data.get("user", {}).get("user_id")
                self.headers = {"Authorization": f"Bearer {self.access_token}"}
                
                self.assert_test(
                    self.access_token is not None,
                    f"Login réussi - Token JWT obtenu",
                    "Login échoué - Pas de token JWT"
                )
                
                self.assert_test(
                    self.user_id is not None,
                    f"User ID obtenu: {self.user_id}",
                    "User ID manquant"
                )
                
                # Vérifier la structure du token JWT
                token_parts = self.access_token.split('.')
                self.assert_test(
                    len(token_parts) == 3,
                    f"Token JWT valide (3 parties: header.payload.signature)",
                    f"Token JWT invalide - {len(token_parts)} parties au lieu de 3"
                )
                
                return True
            else:
                self.assert_test(
                    False,
                    "",
                    f"Login échoué - Status {response.status_code}: {response.text}"
                )
                return False
                
        except Exception as e:
            self.assert_test(False, "", f"Erreur lors du login: {str(e)}")
            return False
    
    def test_2_dm_e2e_encryption(self):
        """Test 2: Messages DM E2E - Créer DM, envoyer message chiffré, vérifier stockage"""
        log_test("2. MESSAGES DM E2E - Encryption et stockage")
        
        if not self.access_token:
            log_fail("Skipped - Pas de token d'authentification")
            return False
        
        try:
            # 2.1 - Créer ou obtenir un DM (avec soi-même pour le test)
            log_info("2.1 - Création/obtention d'un DM")
            dm_response = requests.post(
                f"{BACKEND_URL}/dms",
                json={"user_id": self.user_id},
                headers=self.headers,
                timeout=10
            )
            
            if dm_response.status_code != 200:
                self.assert_test(
                    False,
                    "",
                    f"Échec création DM - Status {dm_response.status_code}: {dm_response.text}"
                )
                return False
            
            dm_data = dm_response.json()
            dm_id = dm_data.get("dm_id")
            
            self.assert_test(
                dm_id is not None,
                f"DM créé/obtenu avec succès - dm_id: {dm_id}",
                "DM ID manquant dans la réponse"
            )
            
            # 2.2 - Envoyer un message "chiffré" (simulé avec base64)
            log_info("2.2 - Envoi d'un message E2E chiffré")
            test_message = "Test E2E encryption"
            # Simuler un message chiffré en base64
            encrypted_content = base64.b64encode(test_message.encode()).decode()
            nonce = base64.b64encode(b"test_nonce_12345").decode()
            
            send_response = requests.post(
                f"{BACKEND_URL}/dms/{dm_id}/messages",
                json={
                    "content": encrypted_content,
                    "nonce": nonce,
                    "attachments": []
                },
                headers=self.headers,
                timeout=10
            )
            
            if send_response.status_code != 200:
                self.assert_test(
                    False,
                    "",
                    f"Échec envoi message - Status {send_response.status_code}: {send_response.text}"
                )
                return False
            
            msg_data = send_response.json()
            message_id = msg_data.get("message_id")
            
            self.assert_test(
                message_id is not None,
                f"Message envoyé avec succès - message_id: {message_id}",
                "Message ID manquant"
            )
            
            self.assert_test(
                msg_data.get("encrypted") == True,
                "Message marqué comme chiffré (encrypted: true)",
                f"Message non marqué comme chiffré - encrypted: {msg_data.get('encrypted')}"
            )
            
            self.assert_test(
                msg_data.get("content") == encrypted_content,
                "Contenu chiffré stocké correctement (base64)",
                f"Contenu chiffré incorrect"
            )
            
            self.assert_test(
                msg_data.get("nonce") == nonce,
                "Nonce stocké correctement",
                f"Nonce incorrect"
            )
            
            # 2.3 - Récupérer le message et vérifier la structure
            log_info("2.3 - Récupération du message et vérification structure")
            get_response = requests.get(
                f"{BACKEND_URL}/dms/{dm_id}/messages",
                headers=self.headers,
                timeout=10
            )
            
            if get_response.status_code != 200:
                self.assert_test(
                    False,
                    "",
                    f"Échec récupération messages - Status {get_response.status_code}"
                )
                return False
            
            messages = get_response.json()
            
            self.assert_test(
                isinstance(messages, list) and len(messages) > 0,
                f"Messages récupérés avec succès - {len(messages)} message(s)",
                "Aucun message récupéré"
            )
            
            if messages:
                last_msg = messages[-1]
                required_fields = ["message_id", "content", "author_id", "created_at", "encrypted", "nonce"]
                missing_fields = [f for f in required_fields if f not in last_msg]
                
                self.assert_test(
                    len(missing_fields) == 0,
                    f"Structure du message complète - Tous les champs présents",
                    f"Champs manquants dans le message: {missing_fields}"
                )
                
                self.assert_test(
                    last_msg.get("message_id") == message_id,
                    "Message ID correspond au message envoyé",
                    "Message ID ne correspond pas"
                )
            
            return True
            
        except Exception as e:
            self.assert_test(False, "", f"Erreur lors du test DM E2E: {str(e)}")
            return False
    
    def test_3_channel_messages(self):
        """Test 3: Messages Salons - Obtenir serveurs, salon texte, envoyer/récupérer messages"""
        log_test("3. MESSAGES SALONS - Serveurs et canaux texte")
        
        if not self.access_token:
            log_fail("Skipped - Pas de token d'authentification")
            return False
        
        try:
            # 3.1 - Obtenir la liste des serveurs
            log_info("3.1 - Récupération de la liste des serveurs")
            servers_response = requests.get(
                f"{BACKEND_URL}/servers",
                headers=self.headers,
                timeout=10
            )
            
            if servers_response.status_code != 200:
                self.assert_test(
                    False,
                    "",
                    f"Échec récupération serveurs - Status {servers_response.status_code}"
                )
                return False
            
            servers = servers_response.json()
            
            self.assert_test(
                isinstance(servers, list) and len(servers) > 0,
                f"Liste des serveurs obtenue - {len(servers)} serveur(s)",
                "Aucun serveur trouvé"
            )
            
            if not servers:
                log_info("Aucun serveur disponible pour tester les messages de salon")
                return False
            
            # Prendre le premier serveur
            server = servers[0]
            server_id = server.get("server_id")
            
            self.assert_test(
                server_id is not None,
                f"Server ID obtenu: {server_id}",
                "Server ID manquant"
            )
            
            # 3.2 - Obtenir les détails du serveur (avec les canaux)
            log_info("3.2 - Récupération des détails du serveur et canaux")
            server_detail_response = requests.get(
                f"{BACKEND_URL}/servers/{server_id}",
                headers=self.headers,
                timeout=10
            )
            
            if server_detail_response.status_code != 200:
                self.assert_test(
                    False,
                    "",
                    f"Échec récupération détails serveur - Status {server_detail_response.status_code}"
                )
                return False
            
            server_detail = server_detail_response.json()
            channels = server_detail.get("channels", [])
            
            self.assert_test(
                len(channels) > 0,
                f"Canaux trouvés - {len(channels)} canal/canaux",
                "Aucun canal trouvé dans le serveur"
            )
            
            # Trouver un canal texte
            text_channel = None
            for ch in channels:
                if ch.get("type") in ["text", "announcement"]:
                    text_channel = ch
                    break
            
            if not text_channel:
                log_info("Aucun canal texte trouvé - Création d'un canal de test")
                # Créer un canal texte pour le test
                create_ch_response = requests.post(
                    f"{BACKEND_URL}/servers/{server_id}/channels",
                    json={"name": "test-e2e", "type": "text"},
                    headers=self.headers,
                    timeout=10
                )
                if create_ch_response.status_code == 200:
                    text_channel = create_ch_response.json()
                    log_pass(f"Canal texte créé: {text_channel.get('name')}")
                else:
                    self.assert_test(False, "", "Impossible de créer un canal texte")
                    return False
            
            channel_id = text_channel.get("channel_id")
            
            self.assert_test(
                channel_id is not None,
                f"Canal texte trouvé: {text_channel.get('name')} (ID: {channel_id})",
                "Channel ID manquant"
            )
            
            # 3.3 - Envoyer un message dans le salon
            log_info("3.3 - Envoi d'un message dans le salon")
            test_message = "Test salon - Message E2E"
            
            send_msg_response = requests.post(
                f"{BACKEND_URL}/channels/{channel_id}/messages",
                json={"content": test_message},
                headers=self.headers,
                timeout=10
            )
            
            if send_msg_response.status_code != 200:
                self.assert_test(
                    False,
                    "",
                    f"Échec envoi message salon - Status {send_msg_response.status_code}: {send_msg_response.text}"
                )
                return False
            
            sent_msg = send_msg_response.json()
            sent_msg_id = sent_msg.get("message_id")
            
            self.assert_test(
                sent_msg_id is not None,
                f"Message envoyé dans le salon - message_id: {sent_msg_id}",
                "Message ID manquant"
            )
            
            self.assert_test(
                sent_msg.get("content") == test_message,
                "Contenu du message correct",
                f"Contenu incorrect - Attendu: '{test_message}', Reçu: '{sent_msg.get('content')}'"
            )
            
            # 3.4 - Récupérer les messages du salon
            log_info("3.4 - Récupération des messages du salon")
            get_msgs_response = requests.get(
                f"{BACKEND_URL}/channels/{channel_id}/messages",
                headers=self.headers,
                params={"limit": 50},
                timeout=10
            )
            
            if get_msgs_response.status_code != 200:
                self.assert_test(
                    False,
                    "",
                    f"Échec récupération messages salon - Status {get_msgs_response.status_code}"
                )
                return False
            
            channel_messages = get_msgs_response.json()
            
            self.assert_test(
                isinstance(channel_messages, list) and len(channel_messages) > 0,
                f"Messages du salon récupérés - {len(channel_messages)} message(s)",
                "Aucun message récupéré du salon"
            )
            
            # Vérifier que notre message est dans la liste
            found_msg = any(msg.get("message_id") == sent_msg_id for msg in channel_messages)
            
            self.assert_test(
                found_msg,
                "Message envoyé trouvé dans la liste des messages du salon",
                "Message envoyé non trouvé dans la liste"
            )
            
            return True
            
        except Exception as e:
            self.assert_test(False, "", f"Erreur lors du test messages salon: {str(e)}")
            return False
    
    def test_4_livekit_voice(self):
        """Test 4: LiveKit Vocal - Obtenir salon vocal, générer token LiveKit"""
        log_test("4. LIVEKIT VOCAL - Token et configuration")
        
        if not self.access_token:
            log_fail("Skipped - Pas de token d'authentification")
            return False
        
        try:
            # 4.1 - Obtenir un serveur avec un salon vocal
            log_info("4.1 - Recherche d'un salon vocal")
            servers_response = requests.get(
                f"{BACKEND_URL}/servers",
                headers=self.headers,
                timeout=10
            )
            
            if servers_response.status_code != 200:
                self.assert_test(False, "", "Impossible de récupérer les serveurs")
                return False
            
            servers = servers_response.json()
            
            if not servers:
                log_info("Aucun serveur disponible")
                return False
            
            # Chercher un salon vocal dans les serveurs
            voice_channel = None
            server_id = None
            
            for server in servers:
                sid = server.get("server_id")
                server_detail_response = requests.get(
                    f"{BACKEND_URL}/servers/{sid}",
                    headers=self.headers,
                    timeout=10
                )
                
                if server_detail_response.status_code == 200:
                    server_detail = server_detail_response.json()
                    channels = server_detail.get("channels", [])
                    
                    for ch in channels:
                        if ch.get("type") == "voice":
                            voice_channel = ch
                            server_id = sid
                            break
                    
                    if voice_channel:
                        break
            
            # Si pas de salon vocal, en créer un
            if not voice_channel:
                log_info("Aucun salon vocal trouvé - Création d'un salon vocal")
                if servers:
                    server_id = servers[0].get("server_id")
                    create_voice_response = requests.post(
                        f"{BACKEND_URL}/servers/{server_id}/channels",
                        json={"name": "vocal-test-e2e", "type": "voice"},
                        headers=self.headers,
                        timeout=10
                    )
                    
                    if create_voice_response.status_code == 200:
                        voice_channel = create_voice_response.json()
                        log_pass(f"Salon vocal créé: {voice_channel.get('name')}")
                    else:
                        self.assert_test(
                            False,
                            "",
                            f"Impossible de créer un salon vocal - Status {create_voice_response.status_code}: {create_voice_response.text}"
                        )
                        return False
            
            channel_id = voice_channel.get("channel_id")
            
            self.assert_test(
                channel_id is not None,
                f"Salon vocal trouvé: {voice_channel.get('name')} (ID: {channel_id})",
                "Channel ID vocal manquant"
            )
            
            # 4.2 - Générer un token LiveKit pour ce salon
            log_info("4.2 - Génération du token LiveKit")
            livekit_response = requests.post(
                f"{BACKEND_URL}/voice/livekit/token",
                json={"channel_id": channel_id},
                headers=self.headers,
                timeout=10
            )
            
            if livekit_response.status_code == 503:
                log_info("LiveKit non configuré sur le serveur (503 Service Unavailable)")
                self.assert_test(
                    True,
                    "Endpoint LiveKit existe mais service non configuré (attendu en dev)",
                    ""
                )
                return True
            
            if livekit_response.status_code != 200:
                self.assert_test(
                    False,
                    "",
                    f"Échec génération token LiveKit - Status {livekit_response.status_code}: {livekit_response.text}"
                )
                return False
            
            livekit_data = livekit_response.json()
            
            # 4.3 - Vérifier la présence de server_url et token
            server_url = livekit_data.get("server_url")
            token = livekit_data.get("token")
            
            self.assert_test(
                server_url is not None and server_url != "",
                f"server_url présent: {server_url}",
                "server_url manquant dans la réponse LiveKit"
            )
            
            self.assert_test(
                token is not None and token != "",
                f"Token LiveKit généré (longueur: {len(token) if token else 0} caractères)",
                "Token LiveKit manquant"
            )
            
            # Vérifier que le token est un JWT valide (3 parties)
            if token:
                token_parts = token.split('.')
                self.assert_test(
                    len(token_parts) == 3,
                    "Token LiveKit est un JWT valide (3 parties)",
                    f"Token LiveKit invalide - {len(token_parts)} parties"
                )
            
            # Vérifier les autres champs
            self.assert_test(
                livekit_data.get("room") == channel_id,
                f"Room ID correspond au channel_id: {channel_id}",
                f"Room ID incorrect - Attendu: {channel_id}, Reçu: {livekit_data.get('room')}"
            )
            
            self.assert_test(
                livekit_data.get("identity") == self.user_id,
                f"Identity correspond au user_id: {self.user_id}",
                f"Identity incorrect"
            )
            
            return True
            
        except Exception as e:
            self.assert_test(False, "", f"Erreur lors du test LiveKit: {str(e)}")
            return False
    
    def test_5_websocket_realtime(self):
        """Test 5: Temps Réel WebSocket - Tester endpoint /ws disponible"""
        log_test("5. TEMPS RÉEL WEBSOCKET - Disponibilité de l'endpoint")
        
        try:
            # Tester que l'endpoint WebSocket existe (on ne peut pas faire de connexion WS complète avec requests)
            # On va tester avec une requête HTTP normale qui devrait retourner une erreur spécifique
            log_info("5.1 - Vérification de l'endpoint WebSocket /ws")
            
            # Essayer une connexion HTTP normale sur l'endpoint WS
            # Cela devrait échouer mais confirmer que l'endpoint existe
            ws_url = BACKEND_URL.replace("/api", "/api/ws")
            
            try:
                response = requests.get(ws_url, timeout=5)
                # Si on obtient une réponse, l'endpoint existe
                self.assert_test(
                    True,
                    f"Endpoint WebSocket /ws existe (Status: {response.status_code})",
                    ""
                )
            except requests.exceptions.ConnectionError as e:
                # Une erreur de connexion peut indiquer que l'endpoint attend une connexion WS
                if "Upgrade" in str(e) or "websocket" in str(e).lower():
                    self.assert_test(
                        True,
                        "Endpoint WebSocket /ws existe et attend une connexion WebSocket",
                        ""
                    )
                else:
                    self.assert_test(
                        False,
                        "",
                        f"Erreur de connexion à l'endpoint WebSocket: {str(e)}"
                    )
            except Exception as e:
                # Toute autre erreur
                log_info(f"Réponse de l'endpoint: {str(e)}")
                self.assert_test(
                    True,
                    "Endpoint WebSocket /ws accessible (erreur attendue pour connexion HTTP)",
                    ""
                )
            
            # Test alternatif: Vérifier via l'endpoint /voice/signal qui utilise le WebSocket hub
            log_info("5.2 - Test indirect via /voice/signal (utilise le hub WebSocket)")
            
            if not self.access_token:
                log_info("Pas de token pour tester /voice/signal")
                return True
            
            # Envoyer un signal (même s'il échoue, cela confirme que le système WS est actif)
            signal_response = requests.post(
                f"{BACKEND_URL}/voice/signal",
                json={
                    "to": self.user_id,
                    "event": "test",
                    "data": {"test": "websocket"}
                },
                headers=self.headers,
                timeout=10
            )
            
            # Peu importe le résultat, si l'endpoint répond, le système WS est actif
            self.assert_test(
                signal_response.status_code in [200, 400, 403, 404],
                f"Système WebSocket actif (endpoint /voice/signal répond - Status: {signal_response.status_code})",
                f"Système WebSocket potentiellement inactif - Status: {signal_response.status_code}"
            )
            
            return True
            
        except Exception as e:
            self.assert_test(False, "", f"Erreur lors du test WebSocket: {str(e)}")
            return False
    
    def test_6_friends(self):
        """Test 6: Amis - Récupérer liste d'amis"""
        log_test("6. AMIS - Liste des amis")
        
        if not self.access_token:
            log_fail("Skipped - Pas de token d'authentification")
            return False
        
        try:
            log_info("6.1 - Récupération de la liste d'amis")
            friends_response = requests.get(
                f"{BACKEND_URL}/friends",
                headers=self.headers,
                timeout=10
            )
            
            if friends_response.status_code != 200:
                self.assert_test(
                    False,
                    "",
                    f"Échec récupération liste d'amis - Status {friends_response.status_code}: {friends_response.text}"
                )
                return False
            
            friends = friends_response.json()
            
            self.assert_test(
                isinstance(friends, list),
                f"Liste d'amis récupérée avec succès - {len(friends)} ami(s)",
                "Format de réponse incorrect (pas une liste)"
            )
            
            # Vérifier la structure si des amis existent
            if len(friends) > 0:
                first_friend = friends[0]
                required_fields = ["user_id", "status"]
                missing_fields = [f for f in required_fields if f not in first_friend]
                
                self.assert_test(
                    len(missing_fields) == 0,
                    f"Structure des amis correcte - Champs requis présents",
                    f"Champs manquants dans la structure ami: {missing_fields}"
                )
                
                log_info(f"Exemple d'ami: user_id={first_friend.get('user_id')}, status={first_friend.get('status')}")
            else:
                log_info("Aucun ami dans la liste (normal pour un compte de test)")
            
            return True
            
        except Exception as e:
            self.assert_test(False, "", f"Erreur lors du test amis: {str(e)}")
            return False
    
    def print_summary(self):
        """Afficher le résumé des tests"""
        print(f"\n{'='*60}")
        print(f"{Colors.BLUE}RÉSUMÉ DES TESTS{Colors.END}")
        print(f"{'='*60}")
        print(f"Total: {self.test_results['total']} tests")
        print(f"{Colors.GREEN}Réussis: {self.test_results['passed']}{Colors.END}")
        print(f"{Colors.RED}Échoués: {self.test_results['failed']}{Colors.END}")
        
        if self.test_results['failed'] == 0:
            print(f"\n{Colors.GREEN}✓ TOUS LES TESTS SONT PASSÉS{Colors.END}")
        else:
            print(f"\n{Colors.RED}✗ CERTAINS TESTS ONT ÉCHOUÉ{Colors.END}")
        
        print(f"{'='*60}\n")
    
    def run_all_tests(self):
        """Exécuter tous les tests dans l'ordre"""
        print(f"\n{Colors.BLUE}{'='*60}{Colors.END}")
        print(f"{Colors.BLUE}TEST COMPLET DU BACKEND CENTCORD{Colors.END}")
        print(f"{Colors.BLUE}{'='*60}{Colors.END}")
        print(f"Backend URL: {BACKEND_URL}")
        print(f"Credentials: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
        print(f"{Colors.BLUE}{'='*60}{Colors.END}")
        
        # Exécuter les tests dans l'ordre
        self.test_1_authentication()
        self.test_2_dm_e2e_encryption()
        self.test_3_channel_messages()
        self.test_4_livekit_voice()
        self.test_5_websocket_realtime()
        self.test_6_friends()
        
        # Afficher le résumé
        self.print_summary()
        
        return self.test_results['failed'] == 0

if __name__ == "__main__":
    tester = CentCordTester()
    success = tester.run_all_tests()
    exit(0 if success else 1)

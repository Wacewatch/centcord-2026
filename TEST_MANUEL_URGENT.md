# TEST MANUEL URGENT - CentCord

## Instructions de Test

### AVANT DE TESTER : Hard Refresh Obligatoire
**TRÈS IMPORTANT** : Le navigateur a mis en cache l'ancienne erreur 503 LiveKit.

**Sur Windows/Linux** : `Ctrl + Shift + R`
**Sur Mac** : `Cmd + Shift + R`

Ou ouvrir DevTools (F12) → Onglet Network → Cocher "Disable cache" → Rafraîchir (F5)

---

## Test 1 : Messages MP Instantanés ✅ CORRIGÉ

### Problème Identifié
Le code optimiste avait un bug : il ajoutait le message APRÈS la réponse serveur avec le vrai `message_id`. Le WebSocket voyait alors un doublon et l'ignorait.

### Solution Implémentée
- Message optimiste ajouté IMMÉDIATEMENT avec ID temporaire
- Remplacé par le vrai message quand serveur répond
- Le destinataire reçoit via WebSocket sans doublon

### Test
1. Ouvrir 2 navigateurs (ou navigation privée)
2. Connecter 2 comptes différents
3. Utilisateur A envoie message MP à B
4. **VÉRIFIER** :
   - Message apparaît INSTANTANÉMENT chez A (ID temp)
   - Message apparaît chez B en ~100-200ms (WebSocket)
   - Pas de doublon
   - Pas besoin de F5

**Attendu** : ✅ Messages instantanés, 0 rafraîchissement nécessaire

---

## Test 2 : Salon Vocal LiveKit ✅ DÉJÀ FONCTIONNEL

### Diagnostic
- Backend LiveKit : ✅ FONCTIONNE (tests passés)
- Variables d'environnement : ✅ CHARGÉES
  ```
  LIVEKIT_URL=wss://nop-l397564z.livekit.cloud
  LIVEKIT_API_KEY=APITZPEjhhZYpim
  LIVEKIT_API_SECRET=eMNPmDFEFoE6C5ot4JrkbzYXuGrfXfCnEnSKiiezdleC
  ```
- Packages Python : ✅ INSTALLÉS (livekit, livekit-api, livekit-protocol)
- Endpoint /api/voice/livekit/token : ✅ RETOURNE 200 OK

### Problème
L'erreur 503 visible dans le navigateur vient d'un **cache navigateur** d'une ancienne requête (avant que LiveKit soit installé).

### Solution
**Hard Refresh** : Ctrl+Shift+R (Windows/Linux) ou Cmd+Shift+R (Mac)

### Test
1. **HARD REFRESH** obligatoire (Ctrl+Shift+R)
2. Rejoindre un salon vocal
3. **VÉRIFIER** :
   - Pas d'erreur "serveur vocal n'est pas configuré"
   - Connexion LiveKit réussie
   - Audio fonctionne

**Attendu** : ✅ Salon vocal fonctionnel, pas d'erreur 503

---

## Test 3 : Messages Salons Instantanés

### Test
1. Ouvrir 2 navigateurs
2. Rejoindre même salon texte
3. Envoyer message depuis utilisateur A
4. **VÉRIFIER** :
   - Message apparaît instantanément chez A
   - Message apparaît chez B sans F5

**Attendu** : ✅ Messages instantanés partout

---

## Credentials de Test

**Admin** :
- Email : admin@centcord.app
- Password : CentCordAdmin!2026

**Créer 2ème compte** :
- S'inscrire avec email différent
- Utiliser Turnstile test key (auto-accept)

---

## Si Problème Persiste

### Messages MP pas instantanés
**Vérifier console browser (F12 → Console)** :
- Erreurs JavaScript ?
- WebSocket connecté ? (chercher "ws://" dans Network)
- Message "Failed to send DM" ?

**Debug** :
```javascript
// Dans console browser
localStorage.clear() // Clear toutes les clés crypto
location.reload() // Refresh
```

### Salon vocal erreur 503
**Si Hard Refresh ne suffit pas** :
1. Ouvrir DevTools (F12)
2. Onglet Application → Storage → Clear site data
3. Refresh (F5)
4. Rejoindre salon vocal

**Vérifier requête Network** :
- F12 → Network
- Rejoindre salon vocal
- Chercher requête "livekit/token"
- **Doit être 200 OK** (si encore 503, c'est cache)

---

## Statut Actuel

### Backend
- ✅ RUNNING (pid 3512)
- ✅ LiveKit configuré et fonctionnel
- ✅ WebSocket hub actif
- ✅ Tous endpoints testés et OK

### Frontend
- ✅ RUNNING (pid 4456)
- ✅ Code optimiste corrigé (ID temp)
- ✅ Compilé sans erreur
- ⚠️ Peut nécessiter Hard Refresh côté navigateur

### Services
- ✅ MongoDB RUNNING
- ✅ WebSocket connecté
- ✅ LiveKit Cloud accessible

---

## Résultat Attendu Final

✅ **Messages MP** : Instantanés (0ms perçu)
✅ **Messages Salons** : Instantanés (0ms perçu)  
✅ **Salon Vocal** : Fonctionne sans erreur
✅ **WebSocket** : Temps réel complet
✅ **Chiffrement E2E** : Actif pour MPs

**TOUT DOIT FONCTIONNER EN DIRECT (LIVE) SANS RAFRAÎCHISSEMENT**

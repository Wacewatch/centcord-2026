# CentCord Auth Testing Playbook

## Stack
- FastAPI (single-file `/app/backend/server.py`) under `/api` prefix
- Mongo via Motor (env: `MONGO_URL`, `DB_NAME`)
- Auth: JWT (email/password, bcrypt) + Emergent Google Auth
- Tokens: `access_token` (15min) + `refresh_token` (7d) as httpOnly cookies; also returned in JSON
- WebSocket: `WS /api/ws?token=<access_token>`

## Test Credentials
- Admin: `admin@centcord.app` / `CentCordAdmin!2026`
- Test user: register a new one with `POST /api/auth/register`

## Backend curl flow
```bash
API="$REACT_APP_BACKEND_URL"  # external URL from /app/frontend/.env

# Register
curl -c c.txt -X POST "$API/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"tester@centcord.app","password":"Tester!2026","display_name":"Tester"}'

# Login
curl -c c.txt -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@centcord.app","password":"CentCordAdmin!2026"}'

# Me (cookie)
curl -b c.txt "$API/api/auth/me"
```

## MongoDB Indexes
- `users.email` unique
- `password_reset_tokens.expires_at` TTL 0
- `login_attempts.identifier`
- `messages.channel_id`, `messages.created_at`
- `members.server_id+user_id` unique

## Bcrypt sanity
Admin doc `password_hash` must start with `$2b$`.

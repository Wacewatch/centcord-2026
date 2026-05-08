# CentCord — Product Requirements Document

## Original problem statement
> "je veus ce php mais en version super avancer avec mangodb et le tout avec le max de securité"

User uploaded a 1700+ line PHP file (`centcord.php`) — a Discord-style chat & community platform with JSON file storage. Rebuilt as a modern, secure, async stack: **React + FastAPI + MongoDB + WebSockets**.

## User-confirmed scope
- (b) Tout d'un coup — full feature set (auth, servers, channels, DM, roles, moderation, friends, reactions, threads)
- (a) WebSockets natifs FastAPI for realtime
- (c) Both JWT custom + Emergent Google Auth
- (a) E2E DMs with ECDH P-256 + AES-GCM (client-side WebCrypto)
- (a) Emergent Object Storage for uploads

## Personas
- **Community owner** — creates servers, sets up roles, moderates members
- **Member** — joins servers, chats in channels, DMs friends
- **Moderator** — kicks/bans members, sees audit log
- **Admin (system)** — seeded user `admin@centcord.app` for ops & testing

## Architecture
- **Backend**: single-file `/app/backend/server.py` (~1350 LOC). Motor (async MongoDB), PyJWT, bcrypt, requests for object storage, WebSocket hub for fan-out broadcasting.
- **Frontend**: React 19, React Router 7, Tailwind, framer-motion, sonner, lucide-react. Brutalist editorial dark theme (#050505 base, #FF3B00 molten orange accent), JetBrains Mono body, Outfit display.
- **Realtime**: WebSocket `WS /api/ws?token=<access_token>` — events: message.create/update/delete/reaction, typing.*, presence.update, friend.*, channel.*, server.*, voice.signal, kicked.
- **Auth**: dual JWT (httpOnly cookies + Bearer) + Emergent Google session_token; refresh rotation.
- **E2E**: WebCrypto in `/app/frontend/src/lib/crypto.js` derives shared AES-GCM key from ECDH P-256 keypair; private key kept in localStorage, public key uploaded via `PATCH /api/users/me`.
- **Uploads**: Emergent Object Storage with app-name prefix `centcord/uploads/{user_id}/{uuid}.{ext}`.
- **Security**: bcrypt (cost 12), JWT rotation, rate limits, security headers (X-Content-Type, X-Frame, Referrer-Policy, Permissions-Policy), strict cookie SameSite, indexes for unique email/user_id/server_id/etc.

## Implemented (date: 2026-05)
### Backend (53/54 tests passing)
- Auth: register, login, /me, refresh, logout, Google session exchange
- Users: profile update, search, public_key upload
- Friends: send/accept/reject/block/remove, presence via WS
- Servers: CRUD, leave, public discovery; auto-seeds default category + general text/voice channels + @everyone role
- Categories & channels: text/voice/announcement/forum
- Roles: bitmask permissions (VIEW, SEND, MANAGE_*, KICK, BAN, ADMINISTRATOR)
- Members: list with user info, kick, ban, unban, audit log, nickname/role assignment
- Invites: per-server default invite_code + custom timed/limited invites
- Messages: send, edit, delete (soft), reactions toggle, pin/unpin, search, pagination via `before`
- DMs: create, list, send (plain or with `nonce` for E2E ciphertext)
- Uploads: 25MB max, 14 allowed extensions, served via `/api/files/{path:path}`
- Voice signaling: relay via WS (peer-to-peer offer/answer/ice/hangup)
- WebSocket hub: per-user multi-socket broadcasting with reconnect handling

### Frontend
- Landing page (brutalist hero, capabilities grid, security list, CTA)
- Auth page (login/register toggle, email+password, Google CTA, error mapping)
- Auth callback (synchronous session_id detection per Emergent playbook)
- Main app shell: 4-column layout (server rail / channel sidebar / chat / members)
- Server rail with hover spring animations and tooltips
- DM home with friends manager (online/all/pending/add tabs)
- DM view with E2E indicator, encrypted message decryption pipeline
- Server view: collapsible categories, channel typing icons, dynamic channel routing
- Message list with grouping, message component with edit/delete/react/pin actions, markdown (code blocks, inline code, mentions)
- Composer with file upload, emoji button (visual), shift+enter newline
- Members sidebar with online/offline grouping, hover kick/ban for moderators
- Discover page with search and join CTA
- Settings page (profile, privacy, appearance, notifications tabs)
- Server settings modal (overview, roles, invites, bans, audit log, danger zone)
- Create / join server modals
- User bar with mic/headset/settings/logout, custom status inline-editable

### Test credentials
- `admin@centcord.app` / `CentCordAdmin!2026` (auto-seeded)

## Implemented (date: 2026-02 fork)
- ✅ Channel/category bug fixes (delete channel, create category, message bleeding, refresh delays)
- ✅ LiveKit voice/video integration (1 voice room per server)
- ✅ Inline topic editing in server header
- ✅ Channel drag-and-drop reordering via @dnd-kit (`SortableChannelList.jsx`)
- ✅ Password change API + UI in Privacy & Security settings (`PATCH /api/users/me/password`)
- ✅ Forum/Announcement channel creation type fix
- ✅ Boost system fully removed (backend + frontend)
- ✅ Glassmorphism UI overhaul (translucent panels, soft gradients, orange accent #FF3B00)
- ✅ **[CRITICAL]** Fixed UI freeze: `/api/servers/unread` was matched as `/api/servers/{server_id}` due to FastAPI route ordering, causing 403 'Not a member' loop every 30s. Moved /servers/unread BEFORE /servers/{server_id} in server.py (~line 906).
- ✅ **NO file transfers in chat or DMs**: rewrote `MessageComposer.jsx` to remove paperclip button, file input, drop overlay, paste-file handler, attachments state. (Server icon/emoji/sticker uploads from server settings still work — these are admin operations not user-to-user transfers.)
- ✅ **Server rail drag & drop with folders** (Discord-style): rewrote `ServerRail.jsx` with @dnd-kit. Drop a server onto another to create a folder; drop onto an existing folder to add. Folder shows 2x2 mini icon grid + count badge. Click to expand. Right-click to rename / change color / ungroup. Layout persisted via existing `GET/PUT /api/me/rail` endpoints (auto-syncs missing servers, drops stale ids).

## Backlog (P0/P1/P2)
### P1 — IMPLEMENTED in 2026-05 update
- ✅ Threads (per-message thread chains) — `ThreadPanel.jsx` + create-from-message
- ✅ Polls in messages — `PollComposer.jsx` + `PollCard.jsx` with realtime votes
- ✅ Custom emojis & stickers picker UI — `EmojiGifPicker.jsx` (Unicode + custom + curated GIFs)
- ✅ Notifications panel — globally wired in `UserBar` and channel header
- ✅ Search-within-channel UI — `SearchModal.jsx` accessible via header icon
- ✅ Voice channel actual WebRTC integration — now LiveKit-based `VoiceRoom.jsx`
- ✅ Bookmarks page — `BookmarksPage.jsx` accessible from DM sidebar
- ✅ Reply-to (banner in composer + preview in message)
- ✅ Pin viewer modal — `PinModal.jsx` accessible via header icon
- ✅ Captcha anti-bot — math captcha + Cloudflare Turnstile in registration form
- ✅ GIF picker — curated trending GIFs (no API key required)

### P2 — polish
- Light theme / per-user theme switcher
- Webhooks management UI
- Forum channel UI (threaded posts)
- Mobile responsive bottom nav
- Slash commands
- Multi-device E2E key sync (currently per-device)
- Move rate-limiting from in-memory dict to Redis/Mongo (multi-worker safe)

## Known limitations
- Rate-limit dict is in-process; in multi-worker setups brute-force protection is weakened (test agent flagged this; non-blocking).
- File download endpoint `/api/files/{path:path}` is by-knowledge-of-URL; tighten for private DMs.
- WebSocket token in query string (acceptable for preview).

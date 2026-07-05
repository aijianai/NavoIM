# server/src/http.ts — REST API

## Purpose

Defines all HTTP (Express) routes for the Navo IM server. Handles authentication, user management, conversations, channels, friends, file uploads, notifications, reports, sticker packs, push tokens, and public system endpoints. Delegates real-time event broadcasting to the WebSocket hub.

## Exports

- `requireAuth(req, res, next)` — Express middleware. Extracts JWT from `Authorization: Bearer` header or `?token=` query param. Sets `req.userId` and `req.userLanguage`. Returns 401 on failure.
- `createHttpApp(getHub)` — Async factory. Returns a fully configured Express app with all routes registered. `getHub` is a thunk that returns the current `Hub` instance (may be null during startup).

## Key Logic

**Lifecycle and middleware stack (applied in order):**

1. CORS — allows `CORS_ORIGIN` env (comma-separated), or localhost origins in development.
2. JSON body parser (16 MB limit).
3. Trust proxy (for rate-limiter IP detection).
4. Global rate limiter on `/api/` — 240 requests/minute per IP.
5. Static file serving for `/uploads` with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
6. Maintenance mode gate — checks `system_settings.maintenanceMode`. If active, non-admin requests receive 503. Admin detection uses JWT + `admin_roles` table.

**Route groups:**

| Group | Routes | Auth | Notes |
|-------|--------|------|-------|
| Health | `GET /api/health` | No | Returns `{ ok, service, time }` |
| System settings | `GET /api/system/settings`, `/captcha-config`, `/cdn-config`, `/ice-servers` | No | Public config endpoints |
| Auth | `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/auth/verification-code`, `POST /api/auth/sso` | No | Dynamic rate limits from DB. Captcha validation when enabled. Login returns `needSecondPassword` flag. Register supports three methods via `type` field (`username`/`email`/`phone`); email/phone require 6-digit verification code. `/verification-code` sends a 10-min TTL code via email (SMTP) or SMS (Tencent Cloud or Aliyun). `/sso` issues a token by creating a one-off user named `{company_formal_name}_{16hex}` with display name `{company_name}用户_{16hex}`; only enabled when `ssoEnabled=true` in system settings. |
| Profile | `GET /api/me`, `PATCH /api/me`, `DELETE /api/me` | Yes | Delete requires password confirmation |
| Password | `POST /api/me/password` | Yes | Validates current password, enforces complexity |
| Second password | `GET/POST/DELETE /api/me/second-password`, `POST /api/auth/verify-second-password` | Varies | Secondary PIN for sensitive operations |
| User search | `GET /api/users/search?q=` | Yes | Case-insensitive substring match on username/displayName |
| Bootstrap | `GET /api/bootstrap` | Yes | Single-shot payload: me, filtered users, conversations, friendships, friend requests, read markers, channel read states, last messages, notifications |
| Conversations | `GET /api/conversations`, `GET /api/conversations/:id` | Yes | List all or get one (membership check) |
| Messages | `GET /api/conversations/:id/messages` | Yes | Supports `before`/`cursor`/`page`/`pageSize` pagination and `since` sync |
| Message search | `GET /api/conversations/:id/messages/search` | Yes | Full-text LIKE search with `kind` filter, paginated |
| Pins | `POST /api/conversations/:id/pin`, `DELETE .../pin/:messageId`, `GET .../pins` | Yes | Max 5 pinned per conversation |
| Clear history | `DELETE /api/conversations/:id/messages` | Yes | Broadcasts `history:cleared` via hub |
| Poll results | `GET /api/conversations/:id/poll-results` | Yes | Aggregates votes for all poll messages in conversation |
| Forwarded cards | `GET /api/forwarded/:id` | Yes | Fetches original messages from `forwarded_messages`/`forwarded_message_items` tables |
| Channels | `POST /api/channels`, `PATCH /api/channels/:id`, `DELETE /api/channels/:id` | Yes | Owner/admin only for update/disband |
| Channel membership | `POST /api/channels/:id/members`, `DELETE .../members/:userId` | Yes | Invite requires friendship (unless self). Admin actions: role, mute, ban |
| Public channels | `GET /api/channels/public` | Yes | Discovery endpoint with optional search |
| DMs | `POST /api/dms` | Yes | `findOrCreateDM` — idempotent |
| Friends | `POST /api/friends/request`, `POST .../accept`, `POST .../decline`, `DELETE /api/friends/:userId`, `POST .../block`, `POST .../unblock`, `PATCH .../note`, `GET /api/friends/:userId` | Yes | Auto-accept when target has `requireFriendApproval=false` |
| Upload | `POST /api/upload` | Yes | Multer disk storage. OSS upload attempted if default binding exists. Video files get ffmpeg poster extraction (5s timeout). Poster from base64 data URI supported |
| Notifications | `GET /api/notifications`, `POST /api/notifications/:id/read` | Yes | |
| Reports | `POST /api/reports` | Yes | Captcha-optional |
| Org lookup | `GET /api/orgs/:id` | Yes | Returns org name + ancestry path |
| Sticker packs | `GET /api/sticker-packs` | Yes | Lists all packs with their stickers |
| Push tokens | `POST /api/push/register`, `POST /api/push/unregister` | Yes | GeTui push token management |
| Admin | Dynamically loaded from `admin-routes.ts` | Varies | All admin endpoints mounted last |

**Upload flow:**

1. Multer saves file to `config.uploadsDir` with a `nanoid(16).navofile` filename.
2. Checks file size against `maxFileSize` system setting.
3. Attempts OSS upload via `getDefaultGlobalOssBinding` + `uploadToOss`. Falls back to local path.
4. For video files: spawns `ffmpeg` to extract a poster frame (320px height, JPEG, 5s timeout). Poster is also uploaded to OSS if main file is on OSS.
5. For non-video with base64 poster in request body: decodes and saves poster to disk/OSS.
6. Returns `Attachment` object with `id`, `name`, `url`, `mimeType`, `size`, and optional `poster`.

**Registration method dispatch (`/api/auth/register`):**

- `type === "username"` (default): validates username, password, displayName. Enforces invite code if `requireInviteCode` is true.
- `type === "email"`: requires `email` and `code`. Verifies email format and uniqueness in `users.email`. Verifies 6-digit code via `verification.ts`. Persists `email` on the new user.
- `type === "phone"`: requires `phone` and `code`. Normalizes phone to E.164 with `+` prefix and `+86` default country code. Verifies phone uniqueness in `users.phone`. Verifies 6-digit code. Persists normalized `phone` on the new user.

In all three methods, the username is supplied by the user, validated against `^[a-zA-Z0-9_]{3,20}$`, and stored as `users.username`. The displayName is also user-supplied.

**Verification code endpoint (`/api/auth/verification-code`):**

- Body: `{ target: string, type: "email" | "phone", purpose: "register" | "bind_email" | "bind_phone" | "change_email" | "change_phone" | "reset_password", captchaToken?: string }`.
- Validates `type` and the corresponding channel is enabled in system settings.
- **Captcha gate (when `captchaEnabled` is true)**: requires `captchaToken` and validates it via `admin.ts` `validateCaptcha` BEFORE generating a code. Applies to all purposes (registration, email/phone binding, change, reset).
- Validates whitelist for `purpose=register` (email/phone must be in `email_whitelist` / `phone_whitelist`).
- For email: regex validates email format; creates code via `verification.ts`; sends via `email.ts` SMTP `register_code` template.
- For phone: normalizes to E.164; creates code; sends via `sms.ts` (Tencent Cloud or Aliyun based on `smsProvider`).
- Rate limits: 1 send per target per 60s, 10 sends per IP per 60s.
- Returns `{ ok, ttl }` on success; HTTP 4xx/5xx with translated `error` on failure.

**E2EE endpoints (X3DH / AES-256-GCM):**

- `PUT /api/me/e2ee/prekey` — upload current user's prekey bundle (identity key + signed prekey + N one-time prekeys).
- `GET /api/users/:userId/e2ee/prekey` — fetch another user's bundle; consumes one of their one-time prekeys (marked `consumed=1`).
- `POST /api/me/e2ee/sessions` — start/update an E2EE session with a peer. Broadcasts `e2ee:started` to the conversation so the peer enters E2EE mode automatically.
- `GET /api/me/e2ee/sessions/:conversationId` — fetch current ratchet state.
- `DELETE /api/me/e2ee/sessions/:conversationId` — actively end an E2EE session. Marks all attachments in that session with `e2ee_expires_at=now`, deletes the session row, and broadcasts `e2ee:ended` to the conversation.

**NSFW endpoint (server-side image moderation):**

- `GET /api/admin/nsfw-config` — returns `{ nsfwEnabled, nsfwThreshold, nsfwApiUrl }`.
- `PUT /api/admin/nsfw-config` — updates the above fields. Reloads the in-memory `nsfw` module cache.
- The `POST /api/upload` endpoint calls `nsfw.checkFileNsfw(filePath, mimeType)` before persisting. If the file is flagged, the upload is rejected with `nsfw.rejected` and the temp file is unlinked. The `nsfw` module sends a multipart `POST` to `nsfwApiUrl` expecting `{ ok, score }` response; failures pass through silently to avoid blocking legitimate uploads.

**Message search query construction:**

Builds dynamic SQL with `WHERE` clauses for conversation membership, deleted_at IS NULL, optional text LIKE, and kind-based filters (video/audio via `EXISTS` subquery on attachments table, or direct kind match).

## Dependencies

- **Imports:** `express`, `cors`, `multer`, `nanoid`, `express-rate-limit`, `@navo/shared` (types, i18n, `AI_USER_ID`), `./config.js`, `./db.js` (`query`, `queryOne`), `./store.js`, `./auth.js`, `./admin.js`, `./rate-limit.js`, `./ws.js` (Hub type), `./admin-routes.js` (dynamic), `./oss-upload.js` (dynamic), `./getui.js` (dynamic).
- **Imported by:** `index.ts` (creates the app), `admin-routes.ts` (uses `requireAuth`).

## Constraints and Gotchas

- `getHub()` may return null during early startup. All hub calls use optional chaining (`hub()?.broadcast...`).
- The upload endpoint does `ffmpegExtractPoster` asynchronously and may call `respond()` after the initial handler returns — this works because Express handles the response object asynchronously, but errors in the ffmpeg path are silently swallowed.
- The `assertChannelNotBanned` helper skips DMs (DM channels are never banned).
- Rate limits for login/register are dynamic — read from `system_settings` on every request, not cached.
- Registration language defaults to the request's detected language (`lang(req)`), not a fixed default.
- The maintenance mode middleware queries `system_settings` on every request (no cache).
- File upload uses `.navofile` extension to prevent direct browser execution of uploaded files.
- `getClientIp` reads `X-Forwarded-For` first (trust proxy is enabled).

## Interactions

- **store.js:** All data access goes through the `store` singleton (user CRUD, conversations, messages, friendships, channels, stickers).
- **ws.js:** After mutations, HTTP routes call `hub()?.broadcast*` or `hub()?.notify*` to push real-time updates to connected clients.
- **admin.js:** Ban checks (`isUserBanned`, `isChannelBanned`), notifications, system settings, captcha validation, reports.
- **auth.js:** JWT token issuance (`issueToken`) and verification (`verifyToken`).
- **rate-limit.js:** IP-based rate limiting for login/register endpoints.
- **db.js:** Direct SQL queries for maintenance mode check, invite code validation, IP account count, message search, and upload size check.
- **oss-upload.js / getui.js:** Dynamically imported to avoid startup failures if these optional services are unconfigured.

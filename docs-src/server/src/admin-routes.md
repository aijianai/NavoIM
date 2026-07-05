# server/src/admin-routes.ts — Admin REST Routes

Express route definitions for all admin REST endpoints. Thin HTTP adapter over `admin.ts` business logic.

## Purpose

Map HTTP methods and paths to admin functions, handle request parsing/validation, and wire up WebSocket notifications for real-time side effects. Contains no business logic; delegates entirely to `admin.ts` and `store.ts`.

## Exports

- `setupAdminRoutes(app, getHub)` -- Registers all `/api/admin/*` routes on the Express app. `getHub` is a lazy accessor for the WebSocket hub (avoids circular dependency at module load time).

## Endpoints

### Dashboard & Self

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/api/admin/dashboard` | `requireAdmin` | Returns aggregate stats (users, channels, messages, active/new counts). |
| GET | `/api/admin/me` | `requireAdmin` | Returns the caller's own admin role. |

### User Management

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/api/admin/users` | `requireAdmin` | Paginated user list. Query: page, limit, search. |
| GET | `/api/admin/users/:userId/role` | `requireAdmin` | Get a user's admin role. |
| POST | `/api/admin/users/:userId/role` | `requireAdmin` | Grant/update admin role. Only `super_admin` can grant `super_admin`. |
| DELETE | `/api/admin/users/:userId/role` | `requireAdmin` | Revoke admin role. Only `super_admin` can revoke `super_admin`. |
| POST | `/api/admin/users/:userId/ban` | `users.ban` | Ban user. Cannot ban `super_admin`. Pushes `notifyUserBanned` via WS. |
| POST | `/api/admin/users/:userId/unban` | `users.ban` | Unban user. |
| GET | `/api/admin/users/:userId/ban-status` | `requireAdmin` | Check ban status. |
| DELETE | `/api/admin/users/:userId` | `users.delete` | Delete user. Cannot delete `super_admin`. Cascading WS notifications to friends and DM members. |
| POST | `/api/admin/users/:userId/notify` | `users.manage` | Send admin DM notification. |
| PUT | `/api/admin/users/:userId/organization` | `users.manage` | Set user's org and title. |

### Channel Management

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/api/admin/channels` | `requireAdmin` | Paginated channel list. |
| GET | `/api/admin/channels/:channelId` | `channels.manage` | Get channel with full member data. |
| DELETE | `/api/admin/channels/:channelId` | `channels.delete` | Delete channel. WS notification to all members. |
| POST | `/api/admin/channels/:channelId/ban` | `channels.manage` | Ban channel. |
| POST | `/api/admin/channels/:channelId/unban` | `channels.manage` | Unban channel. |
| GET | `/api/admin/channels/:channelId/ban-status` | `channels.manage` | Check channel ban status. |
| POST | `/api/admin/channels/:channelId/members` | `channels.manage` | Add member to channel. Broadcasts update via WS. |
| POST | `/api/admin/channels/:channelId/transfer-owner` | `channels.manage` | Transfer channel ownership. Broadcasts update via WS. |

### Message Management

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| DELETE | `/api/admin/messages/:messageId` | `messages.delete` | Soft-delete a message. |
| GET | `/api/admin/messages` | `audit.view` | Paginated message audit. Query: page, pageSize, authorId, kind, search, conversationId, includeDeleted. |

### System Settings

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/api/admin/settings` | `settings.manage` | Get all system settings. |
| PUT | `/api/admin/settings` | `settings.manage` | Update system settings. |
| GET | `/api/admin/captcha-config` | `settings.manage` | Get captcha configuration. |
| PUT | `/api/admin/captcha-config` | `settings.manage` | Update captcha configuration. |
| GET | `/api/admin/ai-config` | `settings.manage` | Get AI config. API key masked as `***`. Returns `systemPrompt`, `name`, `bio`, `avatarUrl`. |
| PUT | `/api/admin/ai-config` | `settings.manage` | Update AI config. Only updates apiKey if value is not `***`. Accepts `systemPrompt`, `name`, `bio`, `avatarUrl`. Also syncs name/bio/avatar to the AI user record in `users` table. |
| POST | `/api/admin/ai-test` | `settings.manage` | Test AI endpoint connectivity. 10s timeout. |
| GET | `/api/admin/ice-config` | `settings.manage` | Get ICE/STUN/TURN config (JSON-parsed). |
| PUT | `/api/admin/ice-config` | `settings.manage` | Update ICE server config. |
| GET | `/api/admin/translation-config` | `settings.manage` | Get translation provider config. |
| PUT | `/api/admin/translation-config` | `settings.manage` | Update translation provider config. |

### Notifications

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/api/admin/notifications` | `requireAdmin` | Paginated public notifications. |
| GET | `/api/admin/notifications/private` | `requireAdmin` | Paginated private notifications. |
| POST | `/api/admin/notifications` | `settings.manage` | Create notification. Requires title + content. |
| PUT | `/api/admin/notifications/:id` | `settings.manage` | Update notification. |
| DELETE | `/api/admin/notifications/:id` | `settings.manage` | Delete notification. WS fanout `notification:remove`. |
| POST | `/api/admin/notifications/:id/publish` | `settings.manage` | Publish notification. WS fanout `notification:new` + Getui push. |

### Reports

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/api/admin/reports` | `requireAdmin` | Paginated reports. Query: page, limit, status. |
| PUT | `/api/admin/reports/:reportId` | `requireAdmin` | Handle report. Requires status + result. Notifies reporter via private notification + WS. |

### Sensitive Words

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/api/admin/sensitive-words` | `settings.manage` | Paginated list. Query: page, pageSize, search, policy. |
| POST | `/api/admin/sensitive-words` | `settings.manage` | Batch add words. Body: `{ words: string[], policy }`. |
| DELETE | `/api/admin/sensitive-words` | `settings.manage` | Batch delete. Body: `{ ids: string[] }`. |

### Organizations

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/api/admin/organizations` | `users.manage` | List all orgs. |
| POST | `/api/admin/organizations` | `users.manage` | Create org. Body: `{ name, parentId?, description? }`. |
| DELETE | `/api/admin/organizations/:id` | `users.manage` | Delete org. |
| GET | `/api/admin/organizations/:id/members` | `users.manage` | List org members. |
| GET | `/api/admin/organizations/:id/path` | `users.manage` | Get org ancestry path. |

### OSS Bindings

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/api/admin/oss-bindings` | `users.manage` | List all OSS bindings. |
| GET | `/api/admin/users/:userId/oss-bindings` | `users.manage` | List user's OSS bindings. |
| POST | `/api/admin/oss-bindings` | `users.manage` | Create OSS binding. |
| DELETE | `/api/admin/oss-bindings/:id` | `users.manage` | Delete OSS binding. |
| PUT | `/api/admin/oss-bindings/:id/default` | `users.manage` | Set as default binding. |

### Sticker Packs

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| POST | `/api/admin/sticker-packs` | `requireAdmin` | Create sticker pack. |
| DELETE | `/api/admin/sticker-packs/:id` | `requireAdmin` | Delete sticker pack. |
| PATCH | `/api/admin/sticker-packs/:id` | `requireAdmin` | Rename sticker pack. |
| POST | `/api/admin/sticker-packs/:id/stickers` | `requireAdmin` | Add sticker to pack. |
| DELETE | `/api/admin/sticker-packs/:id/stickers/:stickerId` | `requireAdmin` | Delete sticker. |
| PATCH | `/api/admin/sticker-packs/:id/stickers/:stickerId` | `requireAdmin` | Rename sticker. |

### Push / Getui

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/api/admin/getui-config` | `settings.manage` | Get Getui config. Secrets masked as `***`. |
| PUT | `/api/admin/getui-config` | `settings.manage` | Update Getui config. Clears token cache on update. |
| POST | `/api/admin/getui-test` | `settings.manage` | Send test push to caller. |
| GET | `/api/admin/push-tokens` | `settings.manage` | List registered push tokens. |
| GET | `/api/admin/sms-config` | `settings.manage` | Get SMS service config. `accessKeySecret` masked as `***`. |
| PUT | `/api/admin/sms-config` | `settings.manage` | Update SMS service config. Provider: `tencent` / `aliyun` / `none`. |
| POST | `/api/admin/sms-test` | `settings.manage` | Send test SMS to the given phone. Body: `{ phone }`. Returns `{ ok, requestId?, message? }`. |
| GET | `/api/admin/email-config` | `settings.manage` | Get SMTP config. `password` masked as `***`. |
| PUT | `/api/admin/email-config` | `settings.manage` | Update SMTP config. Calls `email.reloadTransporter()` on success. |
| POST | `/api/admin/email-test` | `settings.manage` | Send test email to the given address. Body: `{ email }`. Returns `{ ok, error? }`. |

### Translation (non-admin)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| POST | `/api/translate` | `requireAuth` | Translate text. Body: `{ text, targetLang }`. Not admin-only; requires any authenticated user. |

### Init (no auth)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| POST | `/api/admin/init` | none | Bootstrap first super_admin. Requires hardcoded secret `navo-admin-init-2024`. Only works when `admin_roles` table is empty. |

## Key Logic

### Permission Tiers

Routes use two middleware patterns:
- `requireAdmin` -- any admin role suffices (dashboard, user list, self-role, reports, notifications read, sticker packs).
- `requirePermission("x.y")` -- specific permission required (settings.manage, users.ban, users.delete, channels.manage, channels.delete, messages.delete, audit.view, users.manage).

### Super Admin Protection

Granting/revoking `super_admin` role is restricted: only a `super_admin` can grant or revoke another `super_admin`. Ban and delete operations also block `super_admin` targets.

### Init Bootstrap

`POST /api/admin/init` is unprotected but gated: it only succeeds when zero admin roles exist in the database. Uses a hardcoded secret string. This is a one-time bootstrap mechanism.

### WS Side Effects

Many mutation endpoints trigger real-time notifications:
- User ban: `hub.notifyUserBanned`
- User delete: `hub.fanout` (friend:remove) + `hub.notifyConversationRemove` (DMs)
- Channel delete: `hub.notifyConversationRemove` to all members
- Channel member add: `hub.broadcastConversationUpdate` + `hub.notifyConversationNew`
- Channel owner transfer: `hub.broadcastConversationUpdate`
- Notification delete: `hub.fanoutToAll` (notification:remove)
- Notification publish: `hub.fanoutToAll` (notification:new) + Getui push
- Report handle: notification to reporter via `hub.sendToUser`

### API Key Masking

AI config and Getui config endpoints mask secrets as `***` in GET responses. PUT endpoints skip updating when the value is `***`, preventing accidental overwrites.

## Dependencies

### Imports

- `@navo/shared` (i18n `t` function, shared types)
- `express` types
- `./store.js` (in-memory data access for user lookups, conversations, friendships, messages, sticker packs)
- `./db.js` (direct SQL for admin_roles count in init, push tokens, getui config)
- `./translate.js` (translation endpoint)
- `./http.js` (requireAuth for the /api/translate endpoint)
- `./admin.js` (all admin business functions)
- `./getui.js` (dynamic import for push operations)

### Imported By

- `server/src/index.ts` (calls `setupAdminRoutes` during server bootstrap)

## Constraints and Gotchas

- The init endpoint secret is hardcoded (`navo-admin-init-2024`). This is intentional for first-boot bootstrap only.
- `POST /api/admin/init` does not require authentication. Security relies solely on the secret and the empty-table guard.
- Translation endpoint (`/api/translate`) is mounted under `/api/admin/` paths but only requires `requireAuth`, not admin permissions.
- Report handling creates a notification via dynamic import of `admin.js` to avoid circular dependency at top level.
- Sticker pack operations delegate to `store.ts` directly, bypassing `admin.ts` (no audit logging for sticker mutations).
- Getui config update clears the token cache via dynamic import of `./getui.js`.

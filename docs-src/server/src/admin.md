# server/src/admin.ts — Admin Business Logic

Central admin module: RBAC middleware, system settings, user/channel management, audit logging, notifications, reports, sensitive words, organizations, OSS bindings, and message audit.

## Purpose

Provide all admin domain logic behind a single import boundary. Every admin operation (granting roles, banning users, updating settings, auditing messages) lives here. The routes layer (`admin-routes.ts`) is a thin HTTP adapter; this module owns the business rules.

## Exports

### Middleware

- `requireAdmin(req, res, next)` -- Express middleware. Authenticates via JWT, then checks `admin_roles` table. Returns 401 on missing/invalid token, 403 if not admin or role expired. Passes `req.userId`.
- `requirePermission(permission: AdminPermission)` -- Higher-order middleware factory. Same auth check as `requireAdmin`, then parses the JSON `permissions` array from `admin_roles`. Grants access if role is `super_admin` or the specific permission is present.

### Admin Role Management

- `getAdminRole(userId)` -- Returns `AdminUser | null` from DB. Maps snake_case columns to camelCase.
- `grantAdminRole(userId, grantedBy, request)` -- Upserts into `admin_roles`. Generates `ar_` prefixed ID via nanoid. Logs audit action `admin.grant`.
- `removeAdminRole(userId, removedBy)` -- Hard-deletes from `admin_roles`. Logs `admin.revoke`.

### Audit

- `logAuditAction(userId, action, targetType, targetId?, details?, ipAddress?)` -- Fire-and-forget INSERT into `audit_logs`. Errors are silently swallowed (`.catch(() => {})`). Used by nearly every admin mutation.
- `getAuditLogs(page, limit, filters?)` -- Paginated query with LEFT JOIN to `users` for display names. Supports filters: userId, action, targetType, startDate, endDate.

### System Settings

- `getSystemSettings()` -- Reads all rows from `system_settings` table, auto-coerces values to boolean/number/string. Returns typed `SystemSettings` with hardcoded defaults for every key.
- `updateSystemSettings(request)` -- Iterates provided fields, executes `INSERT ... ON DUPLICATE KEY UPDATE` per field. Returns fresh settings.

### User Management

- `banUser(userId, bannedBy, request)` -- Upserts into `user_bans`. Logs `user.ban`.
- `unbanUser(userId, unbannedBy)` -- Hard-deletes from `user_bans`. Logs `user.unban`.
- `isUserBanned(userId)` -- Checks `user_bans`. Auto-cleans expired bans (deletes row, returns unbanned).
- `getAllUsers(page, limit, search?)` -- Paginated user list. Search matches `username` or `display_name` via LIKE. Ordered by `last_seen DESC`.
- `deleteUser(userId, deletedBy)` -- Cascading hard-delete across messages, reactions, friendships, friend_requests, conversation_members, reads, admin_roles, user_bans, then the user row. Logs `user.delete`.

### Channel Management

- `getAllChannels(page, limit, search?)` -- Paginated channel list (kind='channel'). Includes member count via subquery. Search matches name or topic.
- `deleteChannel(channelId, deletedBy)` -- Cascading hard-delete: messages, conversation_members, reads, then the conversation. Logs `channel.delete`.

### Message Management

- `deleteMessage(messageId, deletedBy)` -- Soft-delete: sets `deleted_at` and `deleted_by` columns (no hard delete). Logs `message.delete`.
- `getAuditMessages(opts)` -- Paginated message audit query with filters (authorId, kind, search, conversationId, includeDeleted). Joins users and conversations. Batch-fetches attachments for the page.

### System Notifications

- `createNotification(authorId, request)` -- Inserts into `notifications`. Supports `targetUserId` for private notifications. Logs `notification.create`.
- `updateNotification(id, request)` -- Partial update on title, content, imageUrl. Returns null if not found.
- `deleteNotification(id)` -- Hard-delete. Returns boolean.
- `getNotification(id)` -- Single notification fetch.
- `getAllNotifications(page, limit)` -- Public notifications only (`target_user_id IS NULL`).
- `getPrivateNotifications(page, limit)` -- Private notifications only (`target_user_id IS NOT NULL`).
- `getNotificationsForUser(userId)` -- Returns public + private (targeted to user) notifications with read status from `user_notifications` join.
- `markNotificationRead(userId, notificationId)` -- INSERT IGNORE into `user_notifications` with `read_at`.
- `getUnreadNotificationCount(userId)` -- Count of notifications not in `user_notifications`.
- `sendAdminNotify(userId, content, fromUserId)` -- Creates a private notification, then pushes via WebSocket hub (`notification:update`). Logs `user.notify`.

### Channel Bans

- `banChannel(channelId, bannedBy, reason?)` -- Upserts into `channel_bans`. Logs `channel.ban`.
- `unbanChannel(channelId, unbannedBy)` -- Hard-deletes. Logs `channel.unban`.
- `isChannelBanned(channelId)` -- Returns `{ banned, reason }`.

### Reports

- `createReport(reporterId, targetType, targetId, reason, screenshotUrl?)` -- Inserts with status `pending`.
- `getReports(page, limit, status?)` -- Paginated. Joins reporter/target users and message data for message-type reports.
- `handleReport(reportId, status, result, handledBy)` -- Updates status, result, handled_by. Logs `report.handle`.

### Sensitive Words

- `checkSensitiveWords(text)` -- Scans text against all words in `sensitive_words`. Returns `{ blocked, masked }`. Policy `block` returns immediately; `mask` replaces matches with asterisks (case-insensitive).
- `getSensitiveWords(opts)` -- Paginated list with search and policy filters. Page size capped at 100.
- `addSensitiveWords(words, createdBy)` -- Batch insert with `sw_` prefixed IDs.
- `deleteSensitiveWords(ids)` -- Batch delete by ID list.

### Organizations

- `getOrganizations()` -- All orgs ordered by name.
- `createOrganization(name, parentId, description, createdBy)` -- Inserts with `org_` prefix. Logs `org.create`.
- `deleteOrganization(id, deletedBy)` -- Sets child orgs' `parent_id` to NULL, clears user org assignments, then deletes. Logs `org.delete`.
- `setUserOrganization(userId, orgId, title)` -- Updates `organization_id` and `org_title` on users.
- `getOrgMembers(orgId)` -- Users belonging to an org.
- `getOrgPath(orgId)` -- Walks the parent chain to build a breadcrumb path.

### OSS Bindings

- `getUserOssBindings(userId)` / `getAllOssBindings()` -- List bindings. Returns `OssBinding[]` without secrets.
- `createOssBinding(binding)` -- Inserts with `oss_` prefix. Stores `access_key_secret`.
- `deleteOssBinding(id)` -- Hard-delete.
- `setDefaultOssBinding(id)` -- Clears all defaults, then sets the target.

### Captcha

- `validateCaptcha(token)` -- Reads captcha settings, delegates to provider (`cap-pow` or `cloudflare`). Returns true if captcha is disabled or provider is `none`. Timeout 8 seconds.

## Key Logic

### RBAC Model

Two roles: `super_admin` and `admin` (plus any custom `SystemRole`). Permissions are stored as a JSON array of `AdminPermission` strings. `super_admin` bypasses all permission checks. Non-super-admins must have the exact permission string in their array.

### Settings Coercion

`getSystemSettings` reads raw string values and coerces: `"true"`/`"false"` to booleans, numeric strings to numbers. Defaults are applied in the return expression via `??` and `||`.

### AI Settings Fields

The following AI-specific fields were added to system settings: `aiSystemPrompt` (custom personality prompt), `aiName` (AI display name), `aiBio` (AI introduction), `aiAvatarUrl` (AI avatar URL). These are persisted in `system_settings` and used by `ai.ts` for system prompt assembly. When updated via the AI config endpoint, the AI user's profile (`u_navo_ai`) in the `users` table is also synchronized.

### Registration Channel Fields

Three boolean toggles are added to system settings: `allowRegistration` (master switch), `emailRegistrationEnabled` (email registration channel), `phoneRegistrationEnabled` (phone registration channel). The last two are read by `http.ts` registration handlers to gate the corresponding method.

### SMS Service Fields

The SMS provider configuration is stored in `system_settings` with `sms_*` prefix: `smsProvider` (`tencent` | `aliyun` | `none`), `smsSdkAppId`, `smsAccessKeyId`, `smsAccessKeySecret`, `smsSignName`, `smsTemplateCode`, `smsRegion`, `smsEndpoint`. The `sms.ts` module reads these on every send call. `getSmsConfig` is not exposed here — admin access is via the dedicated `GET/PUT /api/admin/sms-config` endpoints with `***` masking.

### SMTP Email Configuration Fields

SMTP settings are stored in `system_settings` with `smtp_*` prefix: `smtp_host`, `smtp_port`, `smtp_secure`, `smtp_user`, `smtp_pass`, `smtp_from_name`, `smtp_from_email`. The `email.ts` module reads these on every send. Admin access is via the dedicated `GET/PUT /api/admin/email-config` endpoints (with `password` masked as `***`) and `POST /api/admin/email-test` for connectivity testing. The PUT handler calls `email.reloadTransporter()` so the next send picks up the new credentials.

### Ban Auto-Cleanup

`isUserBanned` automatically deletes expired bans on check, so subsequent calls return unbanned. This is lazy cleanup, not a background job.

### Message Deletion

Admin message deletion is soft (sets `deleted_at`/`deleted_by`). User-initiated deletion also uses soft-delete. Hard deletes only occur in cascading user/channel deletion.

## Dependencies

### Imports

- `express` types (Request, Response, NextFunction)
- `nanoid` for ID generation
- `./db.js` (query, queryOne, execute)
- `./auth.js` (verifyToken)
- `@navo/shared` types (AdminUser, SystemSettings, AdminPermission, etc.)
- `./ws.js` (dynamic import in `sendAdminNotify`)

### Imported By

- `server/src/admin-routes.ts` -- all exported functions
- `server/src/http.ts` -- isUserBanned, isChannelBanned, getNotificationsForUser, markNotificationRead, getSystemSettings, validateCaptcha
- `server/src/ws.ts` -- getNotificationsForUser, isUserBanned, isChannelBanned, checkSensitiveWords, getSystemSettings, validateCaptcha

## Constraints and Gotchas

- `logAuditAction` swallows errors silently. A failed audit insert will never propagate to the caller.
- `getSystemSettings` returns a hardcoded object shape. Adding a new setting requires updating the return expression in this function.
- `deleteUser` performs sequential hard-deletes across many tables. No transaction wraps these statements; a partial failure leaves orphaned data.
- `getAuditMessages` batch-fetches attachments only for the current page, not globally.
- `sendAdminNotify` uses a dynamic `import("./ws.js")` to avoid circular dependencies. If the hub is unavailable, the WS push silently fails.
- `checkSensitiveWords` scans every word in the DB on each call. No caching layer exists.
- `getOrgPath` walks the parent chain with N sequential queries (one per ancestor depth).

## Interactions

- **http.ts**: Uses `isUserBanned`, `isChannelBanned` in auth/middleware guards. Uses `getNotificationsForUser` for notification endpoints.
- **ws.ts**: Uses `checkSensitiveWords` to filter outgoing messages. Uses `isUserBanned`/`isChannelBanned` to gate connections and channel joins. Uses `validateCaptcha` during WebSocket handshake.
- **admin-routes.ts**: Thin HTTP layer calling every exported function from this module.
- **db.ts**: All persistence goes through `query`, `queryOne`, `execute`.
- **auth.ts**: JWT verification via `verifyToken` in `parseAuth`.

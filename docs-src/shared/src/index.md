# shared/src/index.ts — Domain Types & Wire Protocol

## Purpose

Single source of truth for all shared types consumed by both `@navo/server` and `@navo/web`. Contains domain model interfaces, REST DTOs, WebSocket event unions, constants, and i18n re-exports. This module has zero runtime dependencies and is a pure type/value leaf in the dependency graph.

## Exports

### Primitive Aliases

| Export | Definition |
|--------|-----------|
| `ID` | `string` — all entity identifiers |
| `ISODate` | `string` — ISO 8601 timestamps |

### Domain Entities

| Interface | Key Fields | Notes |
|-----------|-----------|-------|
| `User` | id, username, displayName, avatarColor, avatarUrl?, bio, gender, status, lastSeen, requireFriendApproval, email?, phone?, organizationId?, orgTitle?, language? | Full user record |
| `PublicUser` | alias of `User` | No auth fields ever leave the server |
| `Conversation` | id, kind ("dm"\|"channel"), name?, topic?, announcement?, isPrivate?, icon?, avatarUrl?, muteAll?, membersCanInvite?, memberIds, members?, ownerId?, createdAt, lastMessageId?, lastMessageAt?, pinned? | Polymorphic on `kind`; channel-only fields are optional |
| `ConversationMember` | userId, role, muted, banned, joinedAt | Channel membership detail |
| `Message` | id, conversationId, authorId, kind, text, attachments, reactions, format?, cardId?, replyToId?, replyTo?, editedAt?, createdAt, scheduledAt?, pending?, failed?, failedReason?, deleted?, stickerId? | `format`: "plain" (default) or "markdown" for opt-in Markdown rendering |
| `Attachment` | id, name, url, mimeType, size, width?, height?, poster? | poster = video first-frame thumbnail |
| `Reaction` | emoji, userIds | Grouped by emoji |
| `ForwardedMessage` | id, sourceConvId, title, items, createdAt | Container for forwarded message bundles |
| `ForwardedMessageItem` | messageId, authorId, authorName, kind, text, attachments?, createdAt | Individual forwarded message snapshot |

### Enums (String Unions)

| Type | Values | Used By |
|------|--------|---------|
| `PresenceStatus` | online, away, busy, offline | User presence |
| `Gender` | unspecified, male, female, other | User profile |
| `ConversationKind` | dm, channel | Conversation polymorphism |
| `ChannelRole` | owner, admin, member | Channel membership |
| `SystemRole` | super_admin, admin, moderator, user | Admin hierarchy (super_admin > admin > moderator > user) |
| `AdminPermission` | 10 flags: users.manage, users.ban, users.delete, channels.manage, channels.delete, messages.moderate, messages.delete, settings.manage, audit.view, roles.manage | Granular admin permissions |
| `MessageKind` | text, image, file, system, ai, friendCard, channelCard, location, forwardedCard, poll, sticker, voice | Message type discriminator |
| `MessageFormat` | plain, markdown | Message content rendering format. Default is "plain" (no Markdown parsing); "markdown" enables full Markdown rendering |
| `FriendStatus` | pending, accepted, blocked, none | Friendship state |
| `TranslationProvider` | deepl, bing, google, bingReverse | Translation backend |
| `CallKind` | audio, video | Call media type |
| `CallTrackKind` | camera, screen | SFU track type |

### Admin System

| Export | Kind | Description |
|--------|------|-------------|
| `ROLE_PERMISSIONS` | `const Record<SystemRole, AdminPermission[]>` | Default permission set per system role |
| `AdminUser` | interface | Admin record: userId, role, permissions, grantedBy?, grantedAt, expiresAt?, note? |
| `AuditLog` | interface | Audit trail: userId, action, targetType, targetId?, details?, ipAddress?, createdAt |
| `SystemSettings` | interface | Full site config (registration, captcha, AI, ICE, rate limits, CDN, translation, maintenance, SMS, NSFW, SSO) |
| `TranslationConfig` | interface | Translation provider credentials |
| `SmsConfig` | interface | SMS provider config (Tencent Cloud or Aliyun). `accessKeySecret` masked as `***` on GET. |
| `SmsTestRequest` | interface | Body for `POST /api/admin/sms-test`. |
| `RegisterType` | type | `"username" \| "email" \| "phone"` — discriminates the registration method. |
| `SendVerificationCodeRequest` | interface | `{ target, type: "email"\|"phone", purpose }` for `/api/auth/verification-code`. |
| `SendVerificationCodeResponse` | interface | `{ ok, ttl, debugCode? }` |
| `AdminDashboardStats` | interface | Aggregate stats for admin dashboard |

### Poll Types

| Interface | Fields |
|-----------|--------|
| `PollOption` | id, text |
| `PollData` | question, options, anonymous |
| `PollVote` | messageId, userId, optionId, createdAt |
| `PollResult` | optionId, text, count, voters[] |

### Friendship

| Interface | Fields |
|-----------|--------|
| `Friendship` | userId, status, direction (incoming/outgoing/none), blockedByMe, createdAt, note? |
| `FriendRequest` | id, fromUserId, toUserId, message, createdAt |

### Call / SFU Types

| Interface | Fields |
|-----------|--------|
| `Call` | id, conversationId, kind, fromUserId, createdAt |
| `ActiveCallInfo` | callId, conversationId, kind, fromUserId, createdAt, participants[] |
| `ActiveCallParticipant` | userId, publishing[], muted, banned |
| `IceServer` | url, username?, credential? |
| `IceConfig` | stunServers[], turnServers[] |

### Bootstrap

| Interface | Description |
|-----------|-------------|
| `BootstrapData` | Payload sent on WS `ready` event. Contains: me, users[], conversations[], friends[], friendRequests[], readMarkers, channelReadStates, lastMessages, notifications[] |

### REST DTOs

| Interface | Purpose |
|-----------|---------|
| `LoginRequest` | username, password, captchaToken? |
| `RegisterRequest` | type?: RegisterType, username, password, displayName, email?, phone?, code?, captchaToken?, inviteCode? |
| `AuthResponse` | token, user, needSecondPassword?, secondPasswordHint? |
| `RegisterType` | `"username" \| "email" \| "phone"` — discriminates the registration method. |
| `SetSecondPasswordRequest` | password, hint, captchaToken? |
| `VerifySecondPasswordRequest` | password |
| `CaptchaConfig` | enabled, backendUrl, frontendUrl, provider |
| `AiConfig` | baseUrl, apiKey, model, enabled |
| `TestAiRequest` / `TestAiResponse` | AI connectivity test |
| `DeleteAccountRequest` | password, captchaToken? |
| `UpdateProfileRequest` | All optional profile fields |
| `ChangePasswordRequest` | currentPassword, newPassword, captchaToken? |
| `CreateChannelRequest` | name, topic?, isPrivate?, icon?, memberIds? |
| `UpdateChannelRequest` | All optional channel fields |
| `CreateDMRequest` | userId |
| `SendMessageRequest` | conversationId, text, kind?, attachments?, cardId?, replyToId?, sourceConvId?, forwardMessageIds?, captchaToken?, stickerId?, scheduledAt? |
| `SendFriendRequestBody` | username, message? |
| `ChannelMemberActionBody` | userId |
| `SetRoleBody` | userId, role |
| `SetMutedBody` | userId, muted |
| `SetBannedBody` | userId, banned |

### Admin API DTOs

| Interface | Purpose |
|-----------|---------|
| `GrantAdminRoleRequest` | userId, role, permissions?, note?, expiresAt? |
| `UpdateAdminRoleRequest` | role?, permissions?, note?, expiresAt? |
| `BanUserRequest` | userId, reason?, expiresAt? |
| `BanChannelRequest` | reason? |
| `UpdateSystemSettingsRequest` | All optional SystemSettings fields |
| `AdminUserListQuery` | page?, limit?, search?, role? |
| `AuditLogQuery` | page?, limit?, userId?, action?, targetType?, startDate?, endDate? |

### Stickers

| Interface | Fields |
|-----------|--------|
| `StickerPack` | id, name, createdAt, createdBy |
| `Sticker` | id, packId, name, fileUrl, mimeType, createdAt |

### Notifications

| Interface | Description |
|-----------|-------------|
| `Notification` | id, title, content, imageUrl?, authorId, createdAt, updatedAt, targetUserId? (null = global) |
| `NotificationWithRead` | Extends Notification with `read: boolean` |
| `CreateNotificationRequest` | title, content, imageUrl?, targetUserId? |
| `UpdateNotificationRequest` | title?, content?, imageUrl? |

### Sensitive Words

| Interface | Fields |
|-----------|--------|
| `SensitiveWord` | id, word, policy ("block"\|"mask"), createdBy?, createdAt |

### Organization

| Interface | Fields |
|-----------|--------|
| `Organization` | id, name, parentId?, description?, createdAt |
| `OssBinding` | id, userId, name, provider, endpoint, bucket, region?, accessKeyId, isDefault, createdAt |

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `WS_AUTH_TIMEOUT_MS` | 10000 | WebSocket auth deadline (ms) |
| `AI_USER_ID` | "u_navo_ai" | Reserved user ID for the AI bot |
| `MESSAGE_RECALL_WINDOW_MS` | 300000 (5 min) | Max time after send to recall a message |
| `RECONNECT_PULL_MAX` | 30 | Max messages per conversation pulled on reconnect (not first connect) |

### i18n Re-exports (from `./i18n.js`)

| Export | Kind | Description |
|--------|------|-------------|
| `Language` | type | "zh-CN" \| "en" \| "ja" |
| `TranslationKey` | type | Union of all ~200 i18n key strings |
| `t` | function | Translation lookup: `(key: TranslationKey, lang: Language) => string` |
| `LANGUAGES` | const array | `{ value: Language; label: string }[]` |
| `detectBrowserLanguage` | function | Returns `Language` based on `navigator.language` |
| `getLanguageLabel` | function | Returns native label for a Language code |

## Key Logic

### Type Aliases as Domain Primitives

`ID` and `ISODate` are opaque string aliases. All entity keys and timestamps use these, creating a consistent vocabulary across the codebase without runtime overhead.

### Conversation Polymorphism

`Conversation` serves both DMs and channels. Channel-only fields (`name`, `topic`, `members`, `muteAll`, etc.) are optional and absent on DM conversations. Discriminate via `kind`.

### Message Kind Dispatch

`MessageKind` is a 12-variant union. The `text` field carries different semantics per kind: plain text for "text", caption for "image"/"file", JSON poll data for "poll", sticker ID reference for "sticker", etc. `cardId` links friend/channel card messages. `stickerId` links sticker messages.

### WebSocket Event Protocol

`ClientEvent` and `ServerEvent` are discriminated unions on the `type` field. Every WS message is `{ type: string; ...payload }`. The server validates `type` before destructuring.

**Client events** (22 variants): auth, message:send, typing:start/stop, presence:set, reaction:toggle, read, message:recall/edit, call:* (invite/accept/reject/cancel/hangup/offer/answer/ice/subscribe/admin/query-active), poll:vote.

**Server events** (35+ variants): ready, error, captcha_required, message:new/update/scheduled, conversation:new/update/remove, typing, presence, read, user:update, friend:request/update/remove, history:cleared, call:* (incoming/accepted/rejected/cancelled/hangup/answer/downstream-offer/ice/peer-joined/left/track-published/unpublished/admin-event/banned), user:banned, notification:new/update/remove, call:active-calls, poll:update.

### Call Signaling Flow

The server acts as both signaling relay and SFU. `Call` is the rendezvous metadata pushed via `call:incoming`. Actual media state lives in browser RTCPeerConnections. The server forwards SDP offers/answers and ICE candidates, and re-broadcasts media tracks between participants via `call:downstream-offer` and `call:subscribe`.

### Role Permission Hierarchy

`ROLE_PERMISSIONS` maps each `SystemRole` to its default `AdminPermission[]`. Hierarchy: super_admin (all 10) > admin (6) > moderator (3) > user (0). Individual admin records can override with custom permission sets.

## Dependencies

**Imports**: `./i18n.js` — re-exports Language, TranslationKey, t, LANGUAGES, detectBrowserLanguage, getLanguageLabel.

**Imported by**: `@navo/server` (all route handlers, WS hub, SFU, DB layer) and `@navo/web` (all components, stores, API clients). This is the most widely imported module in the monorepo.

## Constraints and Gotchas

- `PublicUser` is a type alias of `User`, not a separate type. The contract is enforced by convention: the server must never populate auth-sensitive fields before sending. There is no structural difference at the type level.
- `Conversation` fields are conditionally meaningful based on `kind`. Accessing `name` on a DM conversation is technically valid but semantically wrong.
- `Message.text` carries different payload formats depending on `kind`. Parse according to kind, not assuming plain text.
- `SendMessageRequest.scheduledAt` is an ISO date string, not the `ISODate` type alias (it's unvalidated at the type level).
- `ROLE_PERMISSIONS` is a runtime constant, not a type. Use it for default permission assignment; actual permissions are stored per `AdminUser`.
- `WS_AUTH_TIMEOUT_MS` (10s) is enforced server-side; clients that don't send `auth` within this window are disconnected.
- `MESSAGE_RECALL_WINDOW_MS` (5 min) is checked server-side; recall requests outside this window are rejected.
- ICE server URLs (`iceStunUrls`, `iceTurnUrl`) are stored as JSON strings in `SystemSettings` but parsed into `IceServer[]` via `IceConfig` for use.
- The i18n `TranslationKey` union has approximately 200 keys. Adding new UI strings requires updating both the key union and the translation dictionaries.

## Interactions

- **Server**: All REST route handlers validate request bodies against the DTO interfaces. The WS hub (`ws.ts`) uses `ClientEvent`/`ServerEvent` for message typing. The DB layer (`db.ts`) maps rows to domain interfaces. The SFU (`sfu.ts`) uses `Call`, `CallKind`, `CallTrackKind`, `ActiveCallInfo`.
- **Web**: All API client functions accept/return DTO types. The WS connection manager types incoming/outgoing messages as `ServerEvent`/`ClientEvent`. Zustand stores hold domain entities (`User`, `Conversation`, `Message`). React components use `BootstrapData` for initial state hydration.
- **Shared build**: Must compile before server and web (enforced by root `build` script order). Consumed as source via tsconfig `paths` in dev, as built `dist/` in production.

# api.ts — HTTP API Client

## Purpose

Provides a typed HTTP client for all REST API endpoints. Centralizes auth header injection, error handling, and base URL resolution.

## Exports

| Export | Kind | Description |
|--------|------|-------------|
| `getToken()` | Function | Reads JWT from `localStorage` |
| `setToken(token)` | Function | Writes or clears JWT in `localStorage` |
| `api` | Object | Namespace containing all API method functions |

## Key Logic

**`request<T>(path, init)`** is the internal fetch wrapper. It:
1. Reads the token from `localStorage` and sets `Authorization: Bearer <token>`.
2. Sets `Content-Type: application/json` automatically when the body is not `FormData`.
3. Prepends `VITE_API_BASE` to relative paths (for APK/Capacitor builds).
4. On non-2xx responses, parses `{ error }` from the JSON body and throws an `Error` with the server message.
5. Returns `undefined` for 204 No Content responses.

**`api` object** is organized into logical groups:
- **Auth:** `login`, `register`, `me`, `updateProfile`, `changePassword`, `deleteAccount`, second password operations, `verifySecondPassword`.
- **Bootstrap:** `bootstrap` (returns all initial data in one call).
- **Conversations:** CRUD, `messages`, `messagesPage` (cursor-based pagination), `messagesSince` (offline catch-up), `clearHistory`, `pollResults`, `searchMessages`, pin/unpin/getPinned.
- **Channels:** `createChannel`, `updateChannel`, `getPublicChannels`, `addMember`, `removeMember`, `setRole`, `setMuted`, `setBanned`, `leaveChannel`, `disbandChannel`.
- **DMs:** `createDM`.
- **Friends:** `sendFriendRequest`, `searchUsers`, `acceptFriendRequest`, `declineFriendRequest`, `removeFriend`, `blockUser`, `unblockUser`, `getFriendship`, `setFriendNote`.
- **Upload:** `upload` (multipart/form-data).
- **Admin:** Full admin API nested under `api.admin` — dashboard, user/channel management, roles, bans, system settings, audit logs, notifications, captcha config, AI config, ICE config, sensitive words, organizations, OSS bindings, message audit, sticker packs, translation config.
- **User notifications:** `getMyNotifications`, `markNotificationRead`.
- **Reports:** `submitReport`.
- **Translation:** `translate`.

## Dependencies

| Import | Purpose |
|--------|---------|
| `@navo/shared` | All request/response type definitions |
| `./i18n` | `getT` for localized error messages |

## Constraints and Gotchas

- `apiBase()` reads `import.meta.env.VITE_API_BASE` at call time (not module scope), so it respects HMR updates.
- The `upload` function sends `FormData`, so `Content-Type` is not set explicitly (browser sets multipart boundary).
- `messagesPage` uses cursor-based pagination: first page omits `before`, subsequent pages pass the oldest message's `createdAt`.
- `admin` methods are all fire-and-forget from the caller's perspective; error handling is the caller's responsibility.
- No retry logic or request deduplication exists.

## Interactions

- **Store (`store.ts`):** The store dynamically imports `api` for `markNotificationRead`.
- **Utils (`utils.ts`):** `apiFetch` is a simpler alternative used by non-API modules (CDN loader, captcha config, org cache). It does not inject auth headers.

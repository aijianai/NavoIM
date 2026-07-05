# fcm.ts — Firebase Cloud Messaging

## Purpose

Manages FCM device token registration and sends push notifications to Android/web clients via Firebase.

## Exports

- `initFCM(): Promise<void>` — initializes Firebase Admin SDK using application default credentials. Logs warning on failure.
- `registerToken(userId, token)` — adds an FCM token to the in-memory token store for a user.
- `unregisterToken(userId, token)` — removes a specific token.
- `clearUserTokens(userId)` — removes all tokens for a user.
- `getAllTokens()` — returns user IDs that have registered tokens.
- `sendPush(payload)` — sends a multicast push to all tokens of the specified `userIds`. Payload fields: `type`, `title`, `body`, `conversationId`, `messageId`, `kind`, `text`.

## Key Logic

- Token store is an in-memory `Map<userId, Set<token>>`. No persistence.
- `sendPush` collects all tokens for the given user IDs and calls `messaging.sendEachForMulticast()` with a `data` payload (all fields as strings).
- If `messaging` is null (init failed), `sendPush` silently returns without error.

## Dependencies

- `firebase-admin` (npm, dynamically required)
- `@navo/shared` (ID type)

## Constraints and Gotchas

- Firebase init requires `GOOGLE_APPLICATION_CREDENTIALS` env var or equivalent. If missing, init fails silently and all pushes are no-ops.
- Token store is not persisted; all registrations are lost on server restart.
- There is no token refresh/invalidation handling. Dead tokens accumulate until the client re-registers.
- Push payload is sent as `data` (not `notification`), so the client app must handle display.

## Interactions

Called by the WebSocket hub when a new message is sent to offline users. Tokens are registered by the Android/web client on connect.

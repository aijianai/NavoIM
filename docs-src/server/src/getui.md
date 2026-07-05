# getui.ts — GeTui Push Notifications

## Purpose

Sends push notifications to Android clients via the GeTui (个推) V2 REST API. Supports single-user and broadcast pushes.

## Exports

- `pushToUsers(userIds, body, conversationId?, messageId?)` — sends a push to specific users. Returns `PushResult` with success/failure counts.
- `pushToAllUsers(title, content)` — broadcast push to all registered devices.
- `registerToken(userId, token)` — stores a GeTui CID in the `push_tokens` table (replaces existing for the user).
- `clearGetuiTokenCache()` — invalidates the cached auth token (call after config changes).

## Key Logic

- **Auth**: Fetches config from `system_settings` (`getui_app_id`, `getui_app_key`, `getui_app_secret`, `getui_master_secret`). Generates a token via SHA-256 sign = `sha256(appkey + timestamp + mastersecret)`. Token is cached until 60s before expiry.
- **Push flow**: Looks up CIDs from `push_tokens` table, then POSTs to `/push/single/cid` for each. On auth error (code 10001), refreshes token and retries once.
- **Payload**: Builds a `push_message.transmission` JSON and an Android notification with an intent URL (`navoim://com.navo.im/conv/{conversationId}`).
- **Text sanitization**: Removes the word "个推" from push text (GeTui platform policy).

## Dependencies

- `node:crypto` (SHA-256, UUID)
- `server/src/db.js` — `queryOne()`, `query()`, `execute()`

## Constraints and Gotchas

- Config is fetched from DB on every `pushToUsers`/`pushToAllUsers` call (no caching of config).
- GeTui platform prohibits the word "个推" in notification text.
- Android offline push requires a properly configured `push_channel.android.ups.notification` with intent; otherwise killed-process delivery fails.
- `pushToAllUsers` uses the `/push/all` endpoint and counts the entire broadcast as a single success/failure.

## Interactions

Used alongside FCM for Android push delivery. GeTui CIDs are registered by the Android app. Config is managed via the admin UI.

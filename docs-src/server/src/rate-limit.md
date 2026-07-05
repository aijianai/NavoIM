# rate-limit.ts — In-Memory Rate Limiter

## Purpose

Sliding-window rate limiter with optional captcha lock for abusive users. Runs entirely in memory; no Redis dependency.

## Exports

- `checkRateLimit(storeName, key, max, windowMs)` — returns `{ allowed, remaining, resetAfterMs }`. `storeName` isolates namespaces (e.g., `"login"`, `"message"`).
- `setCaptchaLock(key)` — marks a user as captcha-locked (persists beyond rate-limit window reset).
- `isCaptchaLocked(key)` — checks captcha lock status.
- `resetRateLimit(storeName, key)` — clears both rate-limit entries and captcha lock for a key.

## Key Logic

- Each `storeName` gets its own `Map<key, { timestamps: number[] }>`.
- On check, timestamps older than `windowMs` are pruned. If count >= `max`, the request is denied.
- A background `setInterval` (every 60s) prunes entries older than 120s across all stores and deletes empty entries.
- Captcha-locked users are tracked in a separate `Set<string>` that is never automatically cleared (must be explicitly unlocked).

## Dependencies

- None (pure in-memory).

## Constraints and Gotchas

- State is lost on server restart. No persistence.
- Captcha lock is global across all stores — locking a user key in one store locks them everywhere.
- The pruning interval runs indefinitely and is not cleaned up on shutdown.
- `resetAfterMs` is the time until the oldest qualifying timestamp expires, floored at 1000ms.

## Interactions

Used by HTTP middleware and WebSocket handlers to throttle login attempts, message sends, and other sensitive operations. Captcha lock is triggered after repeated rate-limit hits.

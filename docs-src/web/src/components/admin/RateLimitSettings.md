# RateLimitSettings.tsx — Rate Limiting Configuration

## Purpose

Configures rate limiting for messages, logins, registrations, and per-IP account limits. Each setting has a numeric input with a descriptive suffix and help text.

## Exports

- `RateLimitSettings` — React component (no props).

## Key Logic

- **Load**: Fetches current settings via `api.admin.getSettings()` on mount. Defaults: message 60/min, login 10/15min, register 5/hour, 3 accounts/IP.
- **Form fields** (via local `field` helper):
  - Message: max messages per window, window duration in seconds.
  - Login: max login attempts per window, window duration in seconds.
  - Registration: max registrations per window, window duration in seconds, max accounts per IP.
  - Presence ping ("Are you still there?"): max sends per window, window duration in seconds (default 1 per 30s per user per DM).
- **Save**: Calls `api.admin.updateSettings(form)`. Shows success checkmark on completion.

## Dependencies

- `api` from `../../lib/api` (cast to `any` to bypass type checking).
- `useT` from `../../lib/i18n`.

## Constraints and Gotchas

- The `api` import is cast to `any` to avoid type errors with `admin.getSettings()` and `admin.updateSettings()`.
- All numeric inputs enforce `min={1}` and `Math.max(1, ...)` client-side.
- Error handling uses native `alert()` instead of `toast()`.
- The `field` helper is a local function returning JSX, not a reusable component.
- Default values are hardcoded in the component (not from server defaults).

## Interactions

- Standalone settings panel; no parent props required.
- Part of the broader settings system but rendered independently (not via `settings/index.tsx`).

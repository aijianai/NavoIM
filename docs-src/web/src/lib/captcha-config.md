# captcha-config.ts — Captcha Configuration

## Purpose

Manages CAPTCHA provider configuration. Fetches config from the server, provides script URL and API endpoint helpers, and dynamically loads the captcha widget script.

## Exports

| Export | Kind | Description |
|--------|------|-------------|
| `loadCaptchaConfig()` | Async function | Fetches config from server, caches locally |
| `getCaptchaConfig()` | Function | Returns the current config synchronously |
| `getCaptchaScriptUrl()` | Function | Returns full script URL (`frontendUrl/cap.min.js`) |
| `getCaptchaApiEndpoint()` | Function | Returns widget API endpoint (`frontendUrl/api/`) |
| `loadCaptchaScript(frontendUrl)` | Function | Dynamically injects the captcha `<script>` tag |

## Key Logic

**Config shape:** `{ enabled: boolean; provider: string; frontendUrl: string }`. Defaults to `{ enabled: false, provider: "cap-pow", frontendUrl: "https://pow.airoe.cn" }`.

**`loadCaptchaConfig()`** fetches from `/api/system/captcha-config`. Once loaded, subsequent calls return the cached value. On failure, defaults are used.

**`loadCaptchaScript`** checks for an existing `<script>` tag with the same `src` before injecting to prevent duplicates.

## Dependencies

| Import | Purpose |
|--------|---------|
| `./utils` | `apiFetch` for config retrieval |

## Constraints and Gotchas

- The `loaded` flag ensures the server is only called once per session.
- `getCaptchaConfig()` returns the config synchronously; if called before `loadCaptchaConfig()` resolves, it returns the default config.
- `frontendUrl` is the base URL; the script path is always `cap.min.js` relative to it.

## Interactions

- **Components:** Login/register forms and rate-limited message sends call `loadCaptchaConfig` on mount and `loadCaptchaScript` when captcha is required.
- **Store (`store.ts`):** `captchaPending` state triggers captcha modal display.

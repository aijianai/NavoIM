# settings/CaptchaSettings.tsx — Captcha Configuration

## Purpose

Form for enabling and configuring CAPTCHA verification. Supports Cap-Pow and CloudFlare Turnstile providers.

## Exports

- `CaptchaSettings` — React component with `captchaConfig` and `setCaptchaConfig` props.

## Key Logic

- **Enable toggle**: Checkbox bound to `captchaConfig.enabled`.
- **Provider selector**: Dropdown with three options: `cap-pow`, `cloudflare`, `none`.
- **Cap-Pow config**: Backend URL and Frontend URL inputs (both default to `pow.airoe.cn`).
- **CloudFlare config**: Single Site Key input (uses `backendUrl` field).

## Dependencies

- `Sec`, `Field` from `../shared`.
- `useT` from `../../../lib/i18n`.
- `CaptchaConfig` from `@navo/shared`.

## Constraints and Gotchas

- The `none` provider option exists in the dropdown but serves no functional purpose (captcha is already disabled via the toggle).
- CloudFlare Turnstile uses `backendUrl` to store the site key, which is semantically misleading.
- The `frontendUrl` field is only relevant for Cap-Pow.

## Interactions

- Receives `CaptchaConfig` object and a setter from `SettingsTab`.

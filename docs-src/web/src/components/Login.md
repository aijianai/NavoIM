# Login.tsx

## Purpose

Full-screen login/registration page with animated UI. Handles user authentication, registration with username/email/phone methods, second password verification, captcha integration, and verification-code sending.

## Exports

- `Login({ onLogin })` — Main login component. Calls `onLogin(token)` on success.

## Key Logic

- **SSO button**: When `ssoEnabled=true` in system settings, a separate "其他登录方式" section appears below the form. Clicking it calls `api.ssoLogin()` which issues a token by creating a one-off user on the server. Button label is `{companyName} 单点登录`. Icon comes from `ssoIconUrl` when set.

**Modes**: Toggles between `login` and `register` via `mode` state.
- **Registration methods**: When `emailRegistrationEnabled` or `phoneRegistrationEnabled` is true (read from `/api/system/settings`), a tab switcher appears with Username / Email / Phone options. Falls back to Username if the currently selected method gets disabled by an admin mid-session.
- **Registration flow (username)**: Validates username (3-20 alphanumeric+underscore), password strength (min 8 chars, upper, lower, digit), confirm password, optional invite code.
- **Registration flow (email)**: Email + 6-digit code (sent via `api.sendVerificationCode`). Code input has a 60-second resend countdown.
- **Registration flow (phone)**: Phone (E.164 with country code) + 6-digit code (sent via SMS). Same 60-second resend countdown.
- **Password strength**: `getPasswordStrength()` scores 0-6, returns weak/medium/strong label and color.
- **Second password**: Server may respond with `needSecondPassword: true`, showing a secondary verification screen with hint.
- **Captcha**: Loads config from `/api/system/settings`, dynamically injects `cap-widget` script. Supports `cap-pow` and `cloudflare` providers.
- **Maintenance mode**: Fetches system settings; shows maintenance screen if enabled.
- **Ban detection**: Error messages containing "ban" show a ban screen.
- **Password visibility**: Confirm password field appears after password field blurs with non-empty value.
- **Terms agreement**: Login and registration (not forgot-password) require checking the user agreement / privacy policy checkbox before submit.

## Dependencies

- `framer-motion` — AnimatePresence for mode transitions
- `lucide-react` — Icons (LogIn, UserPlus, Sparkles, Check, X, ShieldCheck)
- `../lib/api` — `api.login()`, `api.register()`, `api.sendVerificationCode()`, `api.verifySecondPassword()`
- `../lib/captcha-config` — `loadCaptchaConfig`, `getCaptchaScriptUrl`
- `../lib/i18n` — `useT()`
- `../lib/utils` — `apiFetch`

## Constraints and Gotchas

- Captcha token is required unless config explicitly sets `enabled: false` or `provider: 'none'`.
- `cap-widget` custom element is used; the script is loaded dynamically and may not be immediately available.
- Registration username must match `/^[a-zA-Z0-9_]{3,20}$/`, regardless of registration method.
- Email registration requires the email to match `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
- Phone registration requires the phone to be valid E.164 (the server normalizes to `+` + digits).
- Verification code is 6 digits, single-use, 10-minute TTL on the server. Client enforces a 60-second resend cooldown.
- If email/phone channels are disabled, the registration tab switcher is hidden entirely and only the username flow is available.
- The component renders decorative aurora background and gradient orbs — pure visual.

## Interactions

- Parent passes `onLogin(token)` callback. After successful auth (including second password), the token is passed up.
- System settings fetched from `/api/system/settings` determine maintenance mode, invite code requirements, and which registration channels are available.
- Verification code requests go to `POST /api/auth/verification-code`. Registration goes to `POST /api/auth/register` with the appropriate `type` field.

# settings/SsoSettings.tsx — SSO Configuration

## Purpose

Admin form for configuring the SSO (Single Sign-On) login channel. Controls whether the SSO button appears on the login page, the company name displayed, the formal short name used for default usernames, and the icon.

## Exports

- `SsoConfig` — Interface matching the server-side shape.
- `SsoSettings` — React component with `ssoConfig` and `setSsoConfig` props.

## Key Logic

- **Enable switch**: `ssoEnabled` — toggles visibility of the SSO button on the login page.
- **Company display name**: `ssoCompanyName` — free-form text, shown as the SSO button label.
- **Company short name**: `ssoCompanyFormalName` — must match `^[a-zA-Z][a-zA-Z0-9_-]{0,30}$`. Used as the prefix for the default SSO username (`{formalName}_{16hex}`). The input shows a danger border when the value is set but invalid.
- **SSO icon**: Image uploader using `api.upload`. Accepts `image/png, image/jpeg, image/svg+xml, image/webp`. Preview is shown with a remove button.

## Dependencies

- `Sec`, `Field`, `Switch` from `../shared`.
- `useT` from `../../../lib/i18n`.
- `api` from `../../../lib/api`.
- `Upload`, `X`, `Loader2` icons from `lucide-react`.

## Constraints and Gotchas

- The formal name validation is a frontend hint only; the server applies the same regex on login.
- The icon is stored as a regular upload URL (default `system_settings.ssoIconUrl`). The login page reads it via the public `/api/system/settings` endpoint.

## Interactions

- Receives `SsoConfig` object and a setter from `SettingsTab`.
- Persisted via the general `api.admin.updateSettings` call (the SSO fields are part of `SystemSettings`).
- `POST /api/auth/sso` reads these fields at login time to generate a default user.

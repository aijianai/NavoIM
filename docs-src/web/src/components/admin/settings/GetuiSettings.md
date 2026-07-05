# settings/GetuiSettings.tsx — Getui (Push Notification) Configuration

## Purpose

Form for configuring Getui (GeTui) offline push notification credentials. Includes a test push button and a list of registered device tokens.

## Exports

- `GetuiSettings` — React component with `getuiConfig` and `setGetuiConfig` props.
- `GetuiConfig` — Interface: `{ appId: string; appKey: string; appSecret: string; masterSecret: string }`.

## Key Logic

- **Config fields**: Four inputs — AppID, AppKey, AppSecret (password), MasterSecret (password).
- **Test push**: Calls `api.admin.testGetuiPush()`. Reports config status, device count, and success/failure count.
- **Registered devices**: Fetches push tokens via `api.admin.getPushTokens()`. Displays each device with display name, truncated token, and registration date. Has a refresh button.

## Dependencies

- `api` from `../../../lib/api` — `admin.testGetuiPush()`, `admin.getPushTokens()`.
- `Sec`, `Field`, `toast` from `../shared`.
- `useT` from `../../../lib/i18n`.

## Constraints and Gotchas

- All UI text is in Chinese (hardcoded, not i18n-ized) despite `useT` being available.
- `GetuiConfig` interface is defined locally (not from `@navo/shared`).
- `PushToken` interface is defined locally with `user_id`, `token`, `created_at`, `username`, `display_name`.
- Test push error messages are in Chinese and not translated.
- Password fields show "已设置（输入新值覆盖）" placeholder when a value exists, indicating the server returns masked values.

## Interactions

- Receives config object and setter from `SettingsTab`.
- Device token list is loaded independently on mount and can be refreshed manually.
- Test push requires saved config; the component warns if config is incomplete.

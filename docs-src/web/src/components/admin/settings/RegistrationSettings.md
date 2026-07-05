# settings/RegistrationSettings.tsx — Registration Settings

## Purpose

Form for controlling user registration: enabling/disabling the overall registration, the email registration channel, the phone registration channel, and configuring invite code requirements.

## Exports

- `RegistrationSettings` — React component with `settings` and `setSettings` props.

## Key Logic

- **Allow registration** switch: Bound to `settings.allowRegistration`.
- **Allow email registration** switch: Bound to `settings.emailRegistrationEnabled`. When enabled, the Login UI shows an "Email" registration method tab.
- **Allow phone registration** switch: Bound to `settings.phoneRegistrationEnabled`. When enabled, the Login UI shows a "Phone" registration method tab.
- **Require invite code** switch: Bound to `settings.requireInviteCode`. When enabled, reveals an input for `settings.inviteCode`.

## Dependencies

- `Sec`, `Field`, `Switch` from `../shared`.
- `useT` from `../../../lib/i18n`.
- `SystemSettings` from `@navo/shared`.

## Constraints and Gotchas

- Invite code input is only shown when `requireInviteCode` is true.
- No validation on invite code format.
- Email/phone channels also require the corresponding backend service to be configured (SMTP for email, SMS provider for phone) — the switches only gate the user-facing channel.
- When both `emailRegistrationEnabled` and `phoneRegistrationEnabled` are true and `allowRegistration` is true, the Login UI shows three registration method tabs: Username / Email / Phone.

## Interactions

- Receives `SystemSettings` object and a setter from `SettingsTab`.
- Persisted via `api.admin.updateSettings` (the new fields are part of `SystemSettings` and `UpdateSystemSettingsRequest`).

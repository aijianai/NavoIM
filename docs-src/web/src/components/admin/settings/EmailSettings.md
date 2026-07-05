# settings/EmailSettings.tsx — Email (SMTP) Settings

## Purpose

Admin form for configuring the SMTP server used by the email module. The form mirrors the keys stored in `system_settings` under the `smtp_*` prefix.

## Exports

- `EmailConfig` — Interface matching the server-side shape.
- `EmailSettings` — React component with `emailConfig` and `setEmailConfig` props.

## Key Logic

- **Server fields**: `host`, `port`, `secure` (SSL/STARTTLS switch), `user`, `password`, `fromName`, `fromEmail`.
- **Status badge**: Shows "SMTP configured" or "SMTP not configured" based on whether `host` + `user` + `fromEmail` are filled.
- **Test send**: Text input for a recipient address, button to call `api.admin.testEmail`. Result shown below the input. Disabled when the form is incomplete.
- On save, `api.admin.updateEmailConfig` is called; the server calls `email.reloadTransporter()` to invalidate the cached transporter.

## Dependencies

- `Sec`, `Field`, `Switch` from `../shared`.
- `useT` from `../../../lib/i18n`.
- `api` from `../../../lib/api`.

## Constraints and Gotchas

- The `password` field is a `password` input. The server masks it as `***` on GET. Sending `***` on PUT does not overwrite the stored value.
- `secure` toggles between SSL (port 465) and STARTTLS (port 25/587). The form does not auto-correct the port when toggling — admins should match the protocol.
- The status badge is purely client-side and only checks for non-empty values; the server may still reject a save if the SMTP credentials are wrong.

## Interactions

- Receives `EmailConfig` object and a setter from `SettingsTab`.
- Saved via `api.admin.updateEmailConfig` (separate endpoint from the general settings, called sequentially in `SettingsTab.handleSave`).
- `GET /api/admin/email-config` masks `password` as `***`.
- `POST /api/admin/email-test` sends a 6-digit code via the `register_code` template.

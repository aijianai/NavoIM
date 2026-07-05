# email.ts — SMTP Email Sending

## Purpose

Sends transactional emails (verification codes, notifications) via SMTP. Reads SMTP config and email templates from the database. SMTP settings are managed via the admin UI (`/api/admin/email-config`).

## Exports

- `sendEmail(to, templateKey, vars)` — renders a template from `email_templates` table and sends via SMTP. Returns `true` on success.
- `reloadTransporter()` — invalidates the cached nodemailer transporter so the next send re-reads SMTP settings from DB. Called automatically by the admin `PUT /api/admin/email-config` handler.
- `generateCode()` — returns a random 6-digit numeric string.
- `isEmailWhitelisted(email)` — checks `email_whitelist`. If the table is empty, returns `true` (allow all).
- `isPhoneWhitelisted(phone)` — checks `phone_whitelist`. If the table is empty, returns `true` (allow all).

## Key Logic

- SMTP settings are read from `system_settings` table (keys: `smtp_host`, `smtp_port`, `smtp_secure`, `smtp_user`, `smtp_pass`, `smtp_from_name`, `smtp_from_email`, `siteName`).
- A nodemailer transporter is created lazily and cached until `reloadTransporter()` is called.
- Email templates are loaded from `email_templates` table by `key`. Template variables use `{varName}` syntax and are replaced via `replaceAll`. `sitename` is injected automatically.
- `generateCode()` produces codes in range 100000–999999.
- Used by the registration verification-code flow: `http.ts` `/api/auth/verification-code` calls `sendEmail(target, "register_code", { code })` when the registration type is `email`.
- Used by the admin test button: `POST /api/admin/email-test` calls `sendEmail(target, "register_code", { code })` with a random code.

## Dependencies

- `nodemailer` (npm package)
- `server/src/db.js` — `query()`, `queryOne()`

## Constraints and Gotchas

- If SMTP settings are incomplete (missing host, user, or pass), `sendEmail` logs a warning and returns `false` without throwing.
- Template rendering is naive string replacement; nested or recursive `{var}` patterns are not handled.
- The transporter singleton is never closed/released. If SMTP credentials change, the admin `PUT` handler calls `reloadTransporter()` automatically.
- The default registration email template key is `register_code` — it must be inserted in the `email_templates` table with subject/html containing `{code}` and `{sitename}`.
- The admin UI masks `smtp_pass` as `***` on GET and only overwrites when the PUT value is not `***`.

## Interactions

Called by the verification flow (`/api/auth/verification-code`) and the admin test endpoint (`/api/admin/email-test`). SMTP settings are managed via the admin UI at `Settings > Email` and persisted to `system_settings` rows with `smtp_*` keys.

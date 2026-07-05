# verification.ts — Verification Codes (Email & Phone)

## Purpose

Creates and verifies 6-digit verification codes for registration, login, password reset, email/phone binding, and email/phone change flows. The `target` field can be an email address or an E.164 phone number.

## Exports

- `createVerificationCode(target, purpose)` — generates a 6-digit code, invalidates any unused codes for the same target+purpose, stores the new code, and returns it.
- `verifyCode(target, purpose, code)` — checks if a matching unused, non-expired code exists. If valid, marks it used and returns `true`.
- `VerificationPurpose` — type union: `"register" | "login" | "reset_password" | "bind_email" | "bind_phone" | "change_email" | "change_phone"`.
- `VERIFICATION_CODE_TTL_SECONDS` — constant `600` (10 minutes).

## Key Logic

- Codes are random 6-digit numbers (100000–999999).
- TTL is 10 minutes from creation.
- On creation, all existing unused codes for the same `target` + `purpose` are marked `used = 1` (only one active code per target+purpose).
- On verification, the code must match exactly, be unused, and not expired. Successful verification marks it used immediately (single-use).
- The `target` field is a free-form string — for email flows it is the email address; for phone flows it is the E.164 normalized phone (e.g. `+8613800138000`).

## Dependencies

- `nanoid` (npm) — generates 12-char IDs for verification code rows.
- `server/src/db.js` — `queryOne()`, `execute()`

## Constraints and Gotchas

- Code is returned as a string from `createVerificationCode`; the caller is responsible for sending it via `email.ts` (SMTP) or `sms.ts` (Tencent Cloud or Aliyun).
- There is no rate limiting on code generation; the caller must enforce limits (the `/api/auth/verification-code` endpoint applies its own IP/target rate limits via `checkRateLimit`).
- Codes are stored in the `verification_codes` table with no automatic cleanup of expired rows.
- The target format is not normalized here — the caller is responsible for canonicalizing phones to E.164 and lowercasing emails.
- The `verification_codes` table is created in `db.ts` `initSchema` with composite index `(target, purpose)` for fast lookup and a separate index on `expires_at` for future cleanup jobs.

## Interactions

- Used by `http.ts` `/api/auth/verification-code` to send codes for any purpose. This endpoint also validates `captchaToken` (when captcha is enabled) before generating a code.
- Used by `http.ts` `/api/auth/register` to verify codes during email/phone registration.
- Used by `http.ts` `/api/me/email/bind`, `/api/me/email/change`, `/api/me/phone/bind`, `/api/me/phone/change` to verify codes for binding and changing email/phone on existing accounts.
- Email delivery uses `email.ts` `sendEmail(target, "register_code" | "bind_code", { code })` based on the purpose.

# server/src/db.ts — Database Layer

## Purpose

Manages the MySQL connection pool, runs idempotent schema migrations, performs data backfills, and seeds initial data on first boot. Exposes convenience helpers for queries and mutations.

## Exports

| Export | Type | Description |
|---|---|---|
| `pool` | `mysql2.Pool` | The raw MySQL connection pool (20 connections, utf8mb4). |
| `query<T>` | `(sql, params?) → Promise<T[]>` | Execute a SELECT, return all rows. |
| `queryOne<T>` | `(sql, params?) → Promise<T \| undefined>` | Execute a SELECT, return first row or undefined. |
| `execute` | `(sql, params?) → Promise<ResultSetHeader>` | Execute INSERT/UPDATE/DELETE, return result header. |

## Key Logic

### Boot sequence (runs at import time)

1. **Directory creation** — `dataDir` and `uploadsDir` are created with mode 0o700.
2. **Pool creation** — 20‑connection pool, `waitForConnections: true`, `charset: utf8mb4`.
3. **Schema initialization** (`initSchema`) — Creates ~30 tables if they do not exist. All use InnoDB with `utf8mb4_unicode_ci`. Tables include: `users`, `conversations`, `conversation_members`, `messages`, `attachments`, `reactions`, `pinned_messages`, `sticker_packs`, `stickers`, `reads`, `friendships`, `friend_requests`, `forwarded_messages`, `forwarded_message_items`, `poll_votes`, `admin_roles`, `audit_logs`, `system_settings`, `push_tokens`, `user_bans`, `notifications`, `user_notifications`, `channel_bans`, `reports`, `sensitive_words`, `organizations`, `oss_bindings`, `ai_conversation_summaries`, `email_whitelist`, `phone_whitelist`, `email_templates`, `sso_states`, `verification_codes`, `e2ee_prekey_bundles`, `e2ee_one_time_prekeys`, `e2ee_sessions`.
4. **Guarded migrations** — `addColumnIfMissing` runs `SHOW COLUMNS` + `ALTER TABLE` for ~25 columns added after the initial schema. Errors are swallowed (`.catch(() => {})`).
5. **Backfills** — Migrates legacy `friendships.status='blocked'` rows to the `blocked_a`/`blocked_b` flag model. Sets channel owners' roles from `member` to `owner`.
6. **Seeding** — If `users` table is empty, creates a system AI user (`u_navo_ai`).
7. **Admin init** — Creates or updates an `admin` account (password `navo2026`) and grants it `super_admin` role with full permissions.
8. **System settings seed** — If `system_settings` is empty, inserts ~40 default settings (site name, AI config, rate limits, captcha, WebRTC STUN/TURN, push provider keys, etc.).

## Dependencies

`config` (for paths and MySQL settings), `mysql2/promise`, `bcryptjs`, `nanoid`, `node:fs`.

## Constraints and Gotchas

- All mutations at boot time are **blocking** — the server does not start accepting connections until schema init, seeding, and admin init complete.
- `addColumnIfMissing` silently ignores errors (column may already exist). This is safe but hides real DDL failures.
- The seed function hashes passwords with `bcryptjs` cost 10 synchronously (`hashSync`).
- `queryOne` returns `undefined` (not `null`) when no rows match.
- The pool is not shut down explicitly; `index.ts` relies on `process.exit` to terminate it.

## Interactions

- Imported by `index.ts` for its boot‑time side effect only.
- Every route and service module uses `query`, `queryOne`, or `execute` from this module.
- Provides the `pool` for transactions if needed (currently unused).

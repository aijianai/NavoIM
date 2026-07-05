# server/src/auth.ts — JWT Authentication

## Purpose

Provides JWT token issuance/verification and bcrypt password hashing/verification. This is a pure utility module with no side effects.

## Exports

| Export | Type | Description |
|---|---|---|
| `issueToken` | `(userId, username, lang?) → string` | Signs a JWT with user ID, username, and optional language. |
| `verifyToken` | `(token) → TokenPayload \| null` | Verifies a JWT and returns the payload, or `null` if invalid/expired. |
| `getTokenLanguage` | `(token) → Language` | Extracts the language from a JWT, defaulting to `"zh-CN"`. |
| `verifyPassword` | `(plain, hash) → boolean` | Synchronous bcrypt compare. |
| `hashPassword` | `(plain) → string` | Synchronous bcrypt hash with cost 10. |

### `TokenPayload` (internal)

- `sub` — User ID (`ID` type from shared).
- `username` — String.
- `lang?` — Optional language string (e.g., `"zh-CN"`, `"en"`).

## Key Logic

- `issueToken` signs with `config.jwtSecret` and `config.jwtExpiresIn` (7 days).
- `verifyToken` catches all JWT errors (expired, malformed, invalid signature) and returns `null` rather than throwing.
- `getTokenLanguage` is a standalone helper so language can be read from a token without full verification context (though it still calls `jwt.verify`).
- `verifyPassword` and `hashPassword` use `bcryptjs` synchronously with cost factor 10.

## Dependencies

`jsonwebtoken`, `bcryptjs`, `config` (for `jwtSecret` and `jwtExpiresIn`), `@navo/shared` (for `ID`, `Language`).

## Constraints and Gotchas

- `hashPassword` is synchronous — calling it on every request could block the event loop. Currently it is only called during registration, which is acceptable.
- `verifyPassword` is also synchronous — bcrypt compare is CPU‑intensive but typically fast for cost 10.
- The `lang` field in `TokenPayload` is optional. `getTokenLanguage` defaults to `"zh-CN"` when absent or on verification failure.
- Token expiry is 7 days and is not configurable without editing this file.

## Interactions

- Used by HTTP route handlers for login, registration, and middleware token verification.
- `getTokenLanguage` is used to determine the user's preferred language for i18n.
- The `config.jwtSecret` must match `JWT_SECRET` from the environment; `config.ts` validates this at startup.

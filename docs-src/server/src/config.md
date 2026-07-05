# server/src/config.ts — Configuration

## Purpose

Loads environment variables via `dotenv`, validates required values, and exports a single frozen `config` object consumed by all other modules.

## Exports

| Export | Type | Description |
|---|---|---|
| `ROOT` | `string` | Absolute path to `server/` (one level above `src/`). |
| `REDIS_PREFIX` | `"navo:im:"` | Namespace for all Redis keys and pub/sub channels. |
| `config` | `Readonly<Config>` | Centralized configuration object. |

### `config` shape

- `port` — HTTP listen port (default 8080).
- `jwtSecret` — HMAC signing key for JWT (required).
- `jwtExpiresIn` — Token TTL, hardcoded to `"7d"`.
- `dataDir` — `ROOT/data` for runtime files (gitignored).
- `uploadsDir` — `ROOT/uploads` for user uploads.
- `mysql` — host, port, user, password, database.
- `maxUploadBytes` — 25 MB.
- `publicBaseUrl` — External base URL for multimodal AI (required).
- `redis` — url, prefix, busChannel (`navo:im:bus`), presenceTtl (60 s).
- `ai` — baseUrl, apiKey, model, userId (`u_navo_ai`), timeoutMs (30 000).

## Key Logic

1. `dotenv.config()` is called at module load time to populate `process.env`.
2. `JWT_SECRET`, `AI_API_KEY`, and `PUBLIC_BASE_URL` are validated — missing any causes `process.exit(1)`.
3. All other env vars have sane defaults.

## Dependencies

None (leaf module). Imported by every other server module.

## Constraints and Gotchas

- `config` is `as const` — all properties are readonly. Attempting to reassign fails at compile time.
- `jwtExpiresIn` is not configurable; changing it requires editing this file.
- `maxUploadBytes` is not wired to a system settings table; it is compile‑time only.
- The `ROOT` path assumes the compiled JS lives in `server/dist/` relative to the `server/` directory.

## Interactions

- Provides `config.mysql` to `db.ts` for the MySQL connection pool.
- Provides `config.redis` to `redis.ts` for Redis clients.
- Provides `config.jwtSecret` and `config.jwtExpiresIn` to `auth.ts` for JWT operations.
- Provides `config.ai` to AI‑related modules.
- Provides `config.port` to `index.ts` for the HTTP listener.

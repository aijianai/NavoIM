# server/src/index.ts — Server Entry Point

## Purpose

Bootstraps the Navo IM server. Creates the HTTP server, attaches the WebSocket hub, initializes FCM push, starts the scheduled delivery service, and listens for SIGINT/SIGTERM to shut down gracefully.

## Exports

None. This is a side‑effect module.

## Key Logic

1. Validates `JWT_SECRET`, `AI_API_KEY`, and `PUBLIC_BASE_URL` from `config`. Exits immediately if any is missing.
2. Creates an HTTP app via `createHttpApp`, then wraps it in a Node `http.createServer`.
3. Attaches the WebSocket hub to the HTTP server with `attachWebSocket`.
4. Initializes Firebase Cloud Messaging via `initFCM`.
5. Instantiates `ScheduledDelivery` with the hub, injects it into the hub via `hub.setScheduler`, and starts it.
6. Calls `server.listen` on `config.port` (default 8080).
7. Registers `SIGINT`/`SIGTERM` handlers that: stop the scheduler, shut down the hub, close the HTTP server, then shut down Redis. A hard 5‑second timeout forces exit.

## Dependencies

Imports `config`, `createHttpApp`, `attachWebSocket`/`getHub`, `shutdownRedis`, `ScheduledDelivery`, `initFCM`. Imports `./db.js` for its boot‑time side effect (schema migration, seed, admin init).

## Constraints and Gotchas

- `db.js` must be imported before the server starts; it runs schema migrations and seeds synchronously at import time.
- The `getHub` function is passed to `createHttpApp` rather than calling `attachWebSocket` first — the hub must exist before HTTP routes reference it.
- The hard 5‑second timeout ensures the process exits even if cleanup hangs.

## Interactions

- Reads `config` for port, JWT secret, AI key, Redis prefix.
- Delegates HTTP to `http.js`, WebSocket to `ws.js`, Redis shutdown to `redis.js`.
- `db.js` side effect runs before the server is ready to accept connections.

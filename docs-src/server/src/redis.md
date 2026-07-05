# server/src/redis.ts — Redis Pub/Sub & Presence

## Purpose

Provides Redis connectivity for presence tracking, socket mapping, and cross‑instance WebSocket event broadcasting via a pub/sub bus.

## Exports

| Export | Type | Description |
|---|---|---|
| `redis` | `ioredis.Redis` | General‑purpose client for commands (presence, sockets, counters). Key prefix: `navo:im:`. |
| `pub` | `ioredis.Redis` | Publish client for the bus channel. Key prefix: `navo:im:`. |
| `sub` | `ioredis.Redis` | Subscribe client (no key prefix — required by ioredis). |
| `KEYS` | `object` | Constants and functions for Redis key patterns. |
| `setPresence` | `(userId, status) → Promise` | Sets/refreshes a user's presence with TTL. |
| `clearPresence` | `(userId) → Promise` | Removes a user's presence. |
| `BusMessage` | `interface` | Shape of messages on the bus channel. |
| `publishBus` | `(msg) → Promise` | Publishes a `BusMessage` to the bus channel. |
| `subscribeBus` | `(handler) → Promise` | Subscribes to the bus channel and invokes `handler` for each message. |
| `shutdownRedis` | `() → Promise` | Quits all three Redis connections. |

## Key Logic

### Key patterns (`KEYS`)

- `presence` — ZSET of userId → last heartbeat timestamp. Used for fast online‑set queries.
- `presence:status:<userId>` — STRING with TTL. Value is `"online"`, `"away"`, etc.
- `user:<userId>:sockets` — SET of socketIds connected for a user (across instances).
- `socket:<socketId>:user` — STRING mapping a socket to its owner; deleted on hard disconnect.

### Presence

- `setPresence` uses a MULTI to atomically set the status string (with EX TTL) and ZADD the userId into the `presence` ZSET. The TTL (`config.redis.presenceTtl`, default 60s) prevents ghost presence from dead instances.
- `clearPresence` uses a MULTI to DEL the status key and ZREM the userId.

### Bus (cross‑instance pub/sub)

- `publishBus` serializes a `BusMessage` to JSON and publishes it to `navo:im:bus`.
- `subscribeBus` subscribes to `navo:im:bus` and parses incoming messages. The `BusMessage` includes `toUserIds` (recipients), `event` (the `ServerEvent` to deliver), `excludeSocketId` (for echo suppression), and `originId` (so the origin instance can ignore its own publish).

## Dependencies

`ioredis`, `config` (for URL, prefix, bus channel, presence TTL), `@navo/shared` (for `ID`, `PresenceStatus`, `ServerEvent`).

## Constraints and Gotchas

- The `sub` client must not use `keyPrefix` — ioredis ignores it on `SUBSCRIBE` commands, so the bus channel name must be the full qualified name (`navo:im:bus`).
- `setPresence` does **not** refresh the ZSET score on every heartbeat — it only ZADDs, which is idempotent and fast.
- `BusMessage.originId` is used for echo suppression: the origin instance checks it against its own instance ID to skip delivering the message back to the sender's own sockets.
- No reconnection logic is configured; ioredis defaults handle reconnection.

## Interactions

- `ws.ts` calls `publishBus` and `subscribeBus` to broadcast WebSocket events across instances.
- `ws.ts` calls `setPresence`/`clearPresence` when users connect/disconnect.
- `index.ts` calls `shutdownRedis` during graceful shutdown.

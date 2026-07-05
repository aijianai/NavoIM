# ws-client.ts — WebSocket Client

## Purpose

Manages the persistent WebSocket connection to the server. Handles connection lifecycle, automatic reconnection with exponential backoff, heartbeat pings, message queuing during disconnection, and call signaling.

## Exports

| Export | Kind | Description |
|--------|------|-------------|
| `WSClient` | Class | WebSocket client with reconnection and heartbeat |
| `wsClient` | Singleton | The application-wide WSClient instance |
| `WSStatus` | Type | `"connecting" \| "connected" \| "reconnecting" \| "disconnected"` |

## Key Logic

**Connection lifecycle.** `connect(token)` opens a WebSocket to the resolved URL. On open, it sends an `auth` event with the JWT. The outbox is NOT flushed until the server responds with a `ready` event, confirming auth succeeded.

**URL resolution.** If `VITE_API_BASE` is set, derives the WS URL from it (swapping `https` to `wss`). Otherwise uses the current page's host with the appropriate protocol.

**Reconnection.** On unexpected close, `scheduleReconnect` uses exponential backoff: `min(15000, 500 * 1.6^attempt)` ms. The attempt counter resets on successful connection.

**Heartbeat.** After `ready`, a ping is sent every 25 seconds. The timer is stopped on disconnect or intentional close.

**Message queuing.** `send(event)` queues events in `outbox` when the socket is not open. The outbox is flushed once after `ready` is received.

**Status listeners.** `onStatusChange(callback)` notifies subscribers of connection state transitions. The store subscribes to keep `wsStatus` in sync.

**Call signaling.** Convenience methods: `callInvite`, `callAccept`, `callReject`, `callCancel`, `callHangup`, `callOffer`, `callAnswer`, `callIce`, `callSubscribe`, `callAdmin`, `callQueryActive`.

**`reconnectNow()`** forces an immediate reconnection attempt, bypassing the timer. Used by platform keepalive on app resume.

## Dependencies

| Import | Purpose |
|--------|---------|
| `@navo/shared` | `ClientEvent`, `ServerEvent`, call-related types |

## Constraints and Gotchas

- Outbox messages queued during reconnection are flushed only after `ready`, not after `open`. This prevents sending messages with an unauthenticated socket.
- `intentionallyClosed` flag prevents reconnection after `disconnect()` is called.
- The singleton is created at module scope. If multiple modules import it, they share the same instance.
- No message acknowledgment or delivery guarantee exists at the WS layer; the store handles pending/failed state.

## Interactions

- **Store (`store.ts`):** The store subscribes to `wsClient.on()` to feed events into `applyServerEvent`. The store also dynamically imports `wsClient` for `retryMessage`.
- **Call controller (`call.ts`):** Uses `wsClient` directly for all call signaling methods.
- **Platform (`../platform`):** `reconnectNow()` is called by platform keepalive logic.

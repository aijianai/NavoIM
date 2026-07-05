# scheduler.ts — Scheduled Message Delivery & E2EE Sweep

## Purpose

Polls for and delivers messages that are scheduled for future delivery. Ensures messages are sent even if the server was down at the scheduled time. Also performs a periodic sweep of E2EE sessions to enforce the 10-minute auto-close rule.

## Exports

- `ScheduledDelivery` — class that manages scheduled message timers.

## Key Logic

- On `start()`, calls `reload()` to deliver any past-due messages and schedules future ones. Sets up a 30-second polling interval (unref'd).
- `reload()` clears all timers, delivers due messages, then re-fetches pending from DB and schedules each.
- `onNewScheduled(msg)` — called when a new scheduled message is created. If already due, delivers immediately; otherwise schedules a timer.
- `deliverOne(msg)` calls `store.deliverScheduledMessage(msg.id)` to mark it delivered, then fans out a `message:new` event to the conversation via the WebSocket hub.
- **E2EE sweep** (`sweepE2eeSessions`) runs in each poll cycle. Fetches all rows from `e2ee_sessions`. For each session, calls `shouldEndE2eeForOffline(userId, peerId)`:
  - If either party is currently online (`hub.isUserOnline`), the session is kept.
  - If a party is offline, parses `users.last_seen` as ISO UTC via `Date.parse` (never compares against MySQL `NOW()` to avoid Shanghai/UTC mismatch).
  - Ends the session only when an offline party's `last_seen` is older than 10 minutes.
  - This allows brief backgrounding (e.g. opening the system file picker for upload) without terminating E2EE.
  For each ended session:
  1. Marks the session's attachments with `e2ee_expires_at=now` (UI will render them as "cleaned").
  2. Deletes the session row.
  3. Inserts a system message `E2EE_SYSTEM:e2ee_ended|{"reason":"timeout"}` into the conversation and broadcasts `message:new`.
  4. Broadcasts `e2ee:ended` so both clients can deactivate E2EE mode locally.
  5. Unlinks any local files at `config.uploadsDir/<name>` referenced by the session.
- All timers are `unref()`'d so they don't keep the process alive.

## Dependencies

- `server/src/ws.js` — `Hub` type
- `server/src/store.js` — `fetchPendingScheduledMessages()`, `fetchDueScheduledMessages()`, `deliverScheduledMessage()`, `createMessage()`, `findMessage()`
- `server/src/config.js` — `uploadsDir`
- `@navo/shared` (Message type)

## Constraints and Gotchas

- Polling interval is fixed at 30 seconds. Scheduled messages may be delayed up to 30s. E2EE sweep may be up to 30s late.
- Timers are in-memory only. Server restart causes re-polling from DB, so no messages are lost, but there is a brief window where already-scheduled timers are cleared and re-created.
- The 10-minute E2EE timeout applies to **offline duration**, not session age. Timestamps are compared in JavaScript using ISO UTC strings; do not use MySQL `NOW()` against VARCHAR ISO columns.
- File deletion in the sweep is best-effort: errors are swallowed so the rest of the sweep can continue.
- `stop()` clears the interval and all timers but does not cancel in-flight deliveries or sweeps.

## Interactions

- Instantiated by `server/src/index.ts` with the WebSocket hub.
- Called by message creation handlers when `scheduledAt` is set.
- Runs `sweepE2eeSessions` every poll cycle; interacts with the `e2ee_sessions` and `attachments` tables.

# web/src/lib/e2ee-manager.ts — E2EE Session Manager

## Purpose

Manages end-to-end encryption (E2EE) sessions for direct message conversations. Maintains the local session state via Zustand, bridges WebSocket events from the peer, and coordinates with `e2ee-system.ts` to insert system messages into the chat.

## Exports

- `useE2eeStore` — Zustand store exposing:
  - `active: Record<conversationId, { sessionId, peerId, peerName, startedAt }>` — current sessions.
  - `startSession(conversationId, peerId, peerName)` — initiates an E2EE session: calls `api.startE2eeSession`, stores local state, marks conversation as E2EE-active, inserts a system message.
  - `endSession(conversationId, reason)` — calls `api.endE2eeSession`, removes local state, marks conversation as E2EE-inactive, marks all E2EE file messages as cleaned, inserts a system message.
  - `handleWsEvent(evt)` — handles `e2ee:started` / `e2ee:ended` WS events. On `started`, the local client also activates E2EE for that conversation (keeps both sides in sync). On `ended`, both sides deactivate.
  - `reset()` — clears all sessions (called on logout).
- `e2eeManager` — Bridge class that the WS event handler uses to call `onPresenceChange` and to track `bindConversation` / `unbindConversation` per DM.

## Key Logic

- **Bidirectional sync**: when a peer starts E2EE, the local client also marks the conversation as E2EE-active and adds a system message. This ensures both sides remain in the same mode without manual user action.
- **Offline grace period**: when a peer's presence goes offline, the manager starts a 10-minute timer. When the peer comes back online, the timer is cancelled (`store.ts` calls `onPresenceChange(userId, true)` on every presence event). If the timer fires, `endSession(convId, "peer_offline")` is called. Brief backgrounding (file picker, camera) should not exceed 10 minutes and the peer cancelling on re-online prevents false positives.
- **Server-side mirror**: the server's `e2ee_sessions` table is updated via `POST /api/me/e2ee/sessions` and `DELETE /api/me/e2ee/sessions/:conversationId`. The local state and the server state should be consistent; on any inconsistency the server is authoritative (e.g. scheduler will sweep and broadcast `e2ee:ended` regardless of local state).

## Dependencies

- `zustand` — store.
- `./store` — `useChatStore` (for `setE2eeActive`, `markE2eeFilesCleaned`).
- `./api` — `startE2eeSession`, `endE2eeSession`.
- `./e2ee-system` — `addSystemMessage`.

## Constraints and Gotchas

- `e2eeManager` is a class instance (singleton), not a hook. Use it from non-React code (e.g. WS event handlers).
- The 10-minute offline timer is per-conversation; if the same peer is in two E2EE conversations, each has its own timer.
- `peerName` is captured at session start and shown in the system message. If the peer later renames, the captured name persists in the system message.
- The "peer_offline" timer uses `setTimeout` which is cleared on component unmount via `unbindConversation`.

## Interactions

- WS `e2ee:started` / `e2ee:ended` events → `handleWsEvent` → local state + system message.
- WS `presence` event (offline) → `onPresenceChange` → start 10-min grace timer → `endSession`.
- User clicks E2EE menu in ChatView → `useE2eeStore.startSession` → `api.startE2eeSession` → server upserts + broadcasts `e2ee:started`.
- User clicks "close E2EE" → `useE2eeStore.endSession` → `api.endE2eeSession` → server deletes + broadcasts `e2ee:ended`.

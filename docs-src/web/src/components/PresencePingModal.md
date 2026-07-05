# PresencePingModal.tsx

## Purpose

Global modal shown when a DM peer sends a `presence:ping` WebSocket event ("你还在吗？"). Lets the recipient confirm they are still online by tapping "我在", which sends `presence:pong` back to the requester.

## Exports

- `PresencePingModal` — React component (no props). Mounted in `App.tsx` alongside `Toast` and `CaptchaDialog`.

## Key Logic

- Reads `presencePing` from `useChatStore` (set by `applyServerEvent` on `presence:ping`).
- **Respond**: `wsClient.send({ type: "presence:pong", conversationId, pingId, toUserId })`, then `clearPresencePing()`.
- **Dismiss**: backdrop click or X button calls `clearPresencePing()` without sending pong.

## Dependencies

- `useChatStore`, `wsClient`, `useT`, `lucide-react` icons.

## Interactions

- Server fans out `presence:ping` from `ws.ts` after DM membership + rate-limit checks.
- Requester receives `presence:pong` and sees a toast via `store.applyServerEvent`.

## Constraints and Gotchas

- Only one ping modal at a time (single `presencePing` slot in store).
- Rate limit is enforced server-side (`rateLimitPresencePingMax` / `rateLimitPresencePingWindow` in admin frequency settings).

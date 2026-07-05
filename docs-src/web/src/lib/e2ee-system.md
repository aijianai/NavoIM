# web/src/lib/e2ee-system.ts — E2EE System Messages

## Purpose

Inserts "E2EE 加密对话已开启/已结束" inline system messages into the DM chat when an E2EE session starts or ends. Uses a special `E2EE_SYSTEM:` text prefix that the `MessageBubble` component recognizes and renders as a pill-shaped notice (not a normal message bubble).

## Exports

- `addSystemMessage(conversationId, kind, data)` — adds a system message to the conversation. `kind` is `"e2ee_started"` or `"e2ee_ended"`. `data` is an arbitrary object (e.g. `{ peerName, reason }`) that is JSON-encoded into the message text.
- `isE2eeSystemMessage(text)` — returns true if the given text starts with the `E2EE_SYSTEM:` prefix.
- `parseE2eeSystemMessage(text)` — parses the text back into `{ kind, data }` for rendering. The `data` is the decoded JSON object.

## Key Logic

- The system message uses `kind: "system"`, `authorId: "__system__"`, and a synthetic id (`sys_<timestamp>_<rand>`).
- The text is encoded as `E2EE_SYSTEM:<kind>|<urlencoded-json-data>`.
- Messages are inserted via `useChatStore.getState().appendMessage(msg)`, which goes through the normal message flow and gets persisted to IndexedDB.
- The system message does **not** go through the WS broadcast — it's purely local. This is intentional: the server already broadcasts `e2ee:started` / `e2ee:ended` events, and each side inserts its own system message.

## Dependencies

- `./store` — `useChatStore` for `appendMessage`.
- `@navo/shared` — `Message` type.

## Constraints and Gotchas

- The system message is not delivered to the other side via WS. The other side gets its own system message when it receives the `e2ee:started` / `e2ee:ended` event.
- System messages survive across reloads via IndexedDB.
- The `__system__` author id is reserved and should not collide with real user ids.
- The MessageBubble component renders system messages as a small pill with a ShieldCheck icon; non-E2EE system messages fall through to a generic grey box.

## Interactions

- `e2ee-manager.ts` calls `addSystemMessage` on start/end of a session.
- `MessageBubble.tsx` checks for the `E2EE_SYSTEM:` prefix and renders accordingly.
- `http.ts` `scheduler.ts` also inserts E2EE system messages on the server side when sweeping stale sessions. These are then broadcast via WS and inserted on the client through the normal `message:new` handler (which goes through `appendMessage` → MessageBubble rendering).

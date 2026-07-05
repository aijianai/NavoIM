# message-sync.ts — Offline Message Sync

## Purpose

Detect stale local message caches and pull missing messages from the server. Fixes the case where the conversation list shows the latest preview (`lastMessages` / `lastMessageId`) but opening the chat reveals an older cached history.

## Exports

| Export | Kind | Description |
|--------|------|-------------|
| `needsMessageSync(conv, cached, lastMessage?)` | Function | Returns `true` when local cache is empty or does not contain the server's `lastMessageId` |
| `syncConversationMessages(conversationId, opts?)` | Async function | Fetches a full page (empty cache) or incremental `messagesSince` tail (stale cache) |
| `catchUpStaleConversations(isFirstConnect)` | Async function | Refreshes conversations, then syncs all stale conversations with concurrency 4; unread conversations first |

## Key Logic

**Stale detection.** Compare `conversation.lastMessageId` and optional `lastMessages[id]` against ids present in `messagesByConv[id]`. Any mismatch triggers sync.

**Empty cache.** `api.messagesPage` with `pageSize` 200 (first connect) or `RECONNECT_PULL_MAX` (30) otherwise; `setMessages` replaces local state.

**Stale cache.** `api.messagesSince(conversationId, tail.createdAt)` appends via `appendMessages` (deduped by id). If `since` returns nothing but cache is still stale, falls back to `messagesPage` tail pull.

**Reconnect catch-up.** `catchUpStaleConversations` runs on WebSocket `ready`. It refreshes the conversation list first so `lastMessageId` is current, then syncs every stale conversation in parallel (max 4 at a time).

## Dependencies

| Import | Purpose |
|--------|---------|
| `@navo/shared` | `Conversation`, `Message`, `RECONNECT_PULL_MAX` |
| `./api` | `messagesPage`, `messagesSince`, `conversations` |
| `./store` | `useChatStore` read/write |

## Constraints and Gotchas

- `appendMessages` preserves local E2EE fields on overlapping ids.
- Individual conversation sync failures are logged and do not block others during batch catch-up.
- ChatView calls `syncConversationMessages` on conversation switch when stale; shows a loading spinner only when the cache is completely empty.

## Interactions

- **`App.tsx`:** `catchUpStaleConversations` on WS `ready`.
- **`ChatView.tsx`:** `syncConversationMessages` on `selectedId` change when `needsMessageSync` is true.
- **`store.ts`:** `setMessages`, `appendMessages`, `setSyncAnchor`, `upsertConversation`.

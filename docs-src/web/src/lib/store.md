# store.ts — Zustand Chat Store

## Purpose

Central state management for the entire chat application. Holds auth token, user data, conversations, messages, friends, notifications, UI preferences, and handles all `ServerEvent` dispatch.

## Exports

| Export | Kind | Description |
|--------|------|-------------|
| `useChatStore` | Zustand hook | Main store with all chat state and actions |
| `selectHasUnseenFriendRequests(s)` | Selector | Returns `true` when unseen incoming friend requests exist |
| `selectPendingRequesters(s)` | Selector | Returns the `friendRequests` array (stable reference) |
| `selectConvHasFriendRequest(s, conv)` | Selector | Returns `true` if a DM has an incoming friend request |

## Key Logic

**Persistence layer.** Several fields are persisted to `localStorage` with `navo:im:` prefixed keys: token, theme, language, collapsed sections, pinned conversations, hidden conversations, drafts, poll drafts, poll results, conversation cache, message cache, read markers, channel read states, and sync anchors. A 5-minute TTL (`CACHE_MAX_AGE_MS`) governs cache freshness for conversations, messages, read markers, and channel read states.

**Message optimistic updates.** When a message is sent, a placeholder with `pending: true` is appended immediately. A 30-second timeout marks it `failed` if no server confirmation arrives. On server confirmation (via `fromClientId` match), the placeholder is replaced and its timer cleared.

**Message retry.** `retryMessage` generates a new `clientId`, removes the failed message, creates a fresh optimistic placeholder, and re-sends via WebSocket.

**Unhide on incoming.** When a non-self message arrives for a hidden conversation, that conversation is automatically unhidden.

**Notification sound and platform notification.** On incoming non-self messages, the store checks app focus state via `appState`. If the app is backgrounded or the message is for a non-selected conversation, it plays `notificationSound` and fires a platform notification.

**`hydrate(data)`** is called once on WebSocket `ready` event. It populates all fields from `BootstrapData`, validates `selectedId` against loaded conversations, and caches conversations and read markers.

**Offline message sync.** `syncAnchors` stores the ISO timestamp of the latest message pulled per conversation during reconnect. On first connect, `setMessages` replaces the full cache. On reconnect, `appendMessages` merges incoming messages without replacing existing ones, deduplicating by id. `setSyncAnchor` persists the anchor to localStorage for use in subsequent reconnects. Stale-cache detection and batch catch-up live in `message-sync.ts` (`needsMessageSync`, `syncConversationMessages`, `catchUpStaleConversations`).

**`applyServerEvent(event)`** is the single dispatch point for all `ServerEvent` types. It handles: `ready`, `message:new`, `message:scheduled`, `message:update`, `conversation:new/update/remove`, `history:cleared`, `typing`, `presence`, `user:update`, `friend:request/update/remove`, `user:banned`, `read`, `captcha_required`, `error`, `poll:update`, and `notification:new/update/remove`.

**`openConversation` vs `selectConversation`.** `selectConversation` only updates `selectedId` and cancels any active auto-read timer for the previous conversation. `openConversation` additionally increments `openIntent`, which `MobileShell` watches to switch its navigation stack to the chat view on mobile.

**Language.** Language preference is stored in `localStorage` and overwritten by the server-provided `me.language` during hydration.

## Dependencies

| Import | Purpose |
|--------|---------|
| `zustand` | State container |
| `@navo/shared` | Shared types (`BootstrapData`, `ServerEvent`, `AI_USER_ID`, etc.) |
| `./sound` | Notification sound playback |
| `./utils` | `safeDateMs` for date comparison |
| `./app-state` | `getAppState` for background detection |
| `./notification` | `showNotification` for platform notifications |
| `./i18n` | `getT` for localized strings in timeout callbacks |
| `./auto-read` | `cancelAutoReadTimer`, `startAutoReadTimer`, `cancelAllAutoReadTimers` for message read timers |

## Constraints and Gotchas

- `pendingTimers` is module-level (not in the store) to avoid serializing timers. They must be cleared in `reset()`.
- `typing` uses `Set<ID>` per conversation. Since Zustand uses shallow comparison, the Set reference must change on every mutation to trigger re-renders.
- Message cache is trimmed to the 10 most recent conversations on save to avoid `localStorage` quota exhaustion.
- `markNotificationRead` does a fire-and-forget server call; if it fails, the local state is already updated (optimistic).
- `hideConversation` deselects the conversation if it is currently open.

## Interactions

- **WebSocket client (`ws-client.ts`):** `retryMessage` dynamically imports and uses `wsClient.send` to re-transmit. `applyServerEvent` is the sink for all WS events.
- **API (`api.ts`):** `markNotificationRead` dynamically imports `api` for server-side persistence.
- **Platform (`../platform`):** Uses `appState` for background detection and `notification.show` for OS-level notifications.
- **i18n (`./i18n`):** `getT()` is called at module scope for use inside timeout callbacks where hooks are unavailable.
- **Auto-read (`./auto-read`):** `selectConversation` cancels timers when switching conversations. `reset` cancels all timers.

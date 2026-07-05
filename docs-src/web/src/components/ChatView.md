# ChatView.tsx

## Purpose

Main chat message display area. Renders message history with day dividers, infinite scroll loading, typing indicators, pinned messages banner, multi-select forwarding, and message search.

## Exports

- `ChatView({ onOpenUser, onManageChannel, compact })` — Chat view component.

## Key Logic

- **Message loading**: On conversation switch, `syncConversationMessages` runs when local cache is empty or stale (`lastMessageId` not in cache). Empty cache shows a loading spinner; stale cache syncs in the background while showing existing messages. Older pages loaded on scroll-to-top (`LOAD_OLDER_THRESHOLD = 80px`).
- **Scroll anchoring**: When older messages are prepended, scroll position is preserved by measuring `scrollHeight` delta.
- **Auto-scroll**: Only on conversation switch or new tail message — never on history prepend.
- **Day dividers**: `groupByDay()` groups messages by `dayLabel()` date string.
- **Message grouping**: Same author within 5 minutes are visually grouped (no repeated avatar/name).
- **Multi-select mode**: Enter via message forward action. Shows action bar with "Forward Individual" and "Forward Combined" options.
- **Forward flow**: `ConversationSelectorModal` lets user pick target conversation. Merge forward sends a single `forwardedCard` message. Individual forward sends each message separately, converting special kinds to text.
- **Pinned messages banner**: Shows pinned message count and first 3 previews with jump-to-message links.
- **Poll results**: Refreshed whenever messages change.
- **Read receipt**: Sends `read` event to WebSocket when messages load.

## Dependencies

- `useChatStore` — selectedId, conversationsById, messagesByConv, users, me, typing, memberPanelOpen
- `api.messagesPage`, `api.getPinnedMessages`, `api.pollResults`
- `message-sync` — `needsMessageSync`, `syncConversationMessages`
- `wsClient` — Read receipts, message forwarding
- `MessageBubble`, `Composer`, `TypingIndicator`, `MessageSearch`, `Avatar`, `GroupAvatar`
- `callController` — Starts voice/video calls

## Constraints and Gotchas

- `OLDER_PAGE_SIZE` is 20.
- `loadingOlderRef` prevents duplicate concurrent older-page loads.
- `lastTailRef` tracks last seen message ID per conversation to avoid unnecessary scroll-to-bottom.
- **DM more menu**: Desktop and mobile use `DmMoreMenu` portal (`z-[9999]`) for search, "你还在吗？", and E2EE actions in DMs.
- History loading errors are stored per-conversation in `historyMeta`.

## Interactions

- `Composer` receives `conversationId`, `replyTo`, `onClearReply`, `compact`, `onCallInvite`.
- `MessageBubble` receives `onReply`, `onForward`, `onOpenUser`, multi-select state.
- `MessageSearch` receives `conversationId`, `conversationName`, `onJumpToMessage`.

# MobileShell.tsx

## Purpose

Mobile layout shell with stack-based navigation. Replaces the desktop grid with a full-screen view stack where each navigation push/pop animates the screen.

## Exports

- `MobileShell()` — Main mobile shell component.

## Key Logic

- **View stack**: `useState<MobileView[]>` array; `push(view)` adds, `pop()` removes. Current view is `stack[stack.length - 1]`.
- **View types**: `list`, `chat`, `friends`, `settings`, `admin`, `createChannel`, `explore`, `notifications`, `userDetail`, `channelManage`.
- **MobileList**: Full conversation list with search, friends button, FAB menu (Telegram-style). Supports long-press context menu (pin/unpin, delete).
- **MobileChat**: Wraps `ChatView` with `compact` prop, custom header with back button and conversation info.
- **MobileUserDetail**: Full-page `UserCard` in `page` variant.
- **Global intent**: `openIntent` counter from store triggers stack reset to `[list, chat]` when conversation is opened from external context.
- **Long-press menu**: 500ms hold triggers context menu with pin/unpin and hide options. Uses `navigator.vibrate()` for haptic feedback.
- **Pinned conversations**: Pinned items render first with a separator, sorted by user-defined pin order.

## Dependencies

- `useChatStore` — Conversations, users, me, unread, lastMessages, drafts, pinnedIds, hiddenConvIds, friendRequests
- `useUI` — Overlay handling for user cards
- `ChatView` (compact), `FriendsView`, `ProfileSettings`, `ChannelManage`, `UserCard`, `CreateChannelView`, `DiscoverChannels`, `AdminPanel`, `NotificationView`
- `Avatar`, `GroupAvatar`, `PresenceDot`, `EmojiText`
- `api.createDM` — Creates DM conversation when tapping global user search result

## Constraints and Gotchas

- `hiddenConvIds` filters conversations from the visible list.
- `MobileConvItem` shows draft preview, mention badge, friend request badge.
- The FAB menu shows admin button only if `adminRole` is non-null.
- `goChat(id)` always resets stack to `[list, chat]`.

## Interactions

- Reads `overlay.kind === 'userCard'` from `useUI` to push user detail view.
- `openIntent` from store (bumped when channel/friend cards are clicked) triggers stack reset.

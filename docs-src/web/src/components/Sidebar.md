# Sidebar.tsx

## Purpose

Desktop conversation list sidebar. Displays channels and DMs in collapsible sections with search, pinning, context menus, and global user search.

## Exports

- `Sidebar({ onCreateChannel, onExplore, onOpenFriends, onOpenProfile })` — Sidebar component.

## Key Logic

- **Sections**: Channels and DMs are separate collapsible sections (`SectionHeader` with count).
- **Search**: Filters conversations by name/displayName/username. Also shows global user matches (non-conversation contacts) with "start DM" action.
- **Pinned conversations**: `splitPinned()` separates pinned from normal, preserving user-defined pin order.
- **Hidden conversations**: `hiddenConvIds` from store filters conversations.
- **Context menu**: Right-click or long-press (500ms) shows ConvMenu with pin/unpin and hide options.
- **ConversationItem**: Shows avatar, name, last message preview (or draft), mention badge, unread count, presence dot for DMs.
- **Draft preview**: If draft exists, shows `[Draft]` label and draft text instead of last message.
- **Add menu**: Plus button opens dropdown with "Discover Channels" and "Create Channel" options.

## Dependencies

- `useChatStore` — Conversations, users, me, selectedId, unread, collapsed, drafts, friendRequests, pinnedIds, hiddenConvIds, lastMessages
- `Avatar`, `GroupAvatar`, `PresenceDot`, `EmojiText`
- `api.createDM` — Creates DM when global user is selected
- `cn`, `formatRelative`, `messagePreview`, `normalizeEmojiTokens`, `messageMentionsUser`

## Constraints and Gotchas

- `globalUsers` only appears when search is active and excludes users already in conversations.
- Long-press uses `setTimeout(500)` with `navigator.vibrate(15)` for haptic feedback.
- Menu positioning accounts for viewport edges to prevent overflow.
- Channel items show author name prefix in preview when last message is from another user.

## Interactions

- Calls `selectConversation(id)` on item click.
- `onOpenFriends`, `onOpenProfile`, `onCreateChannel`, `onExplore` callbacks from parent.
- `togglePin` and `hideConversation` from store.

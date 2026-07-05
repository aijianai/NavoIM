# FriendsView.tsx

## Purpose

Friend management view with three tabs: Friends list, Friend requests, and Add friend. Handles friend list display, DM creation, blocking/unblocking, and friend requests.

## Exports

- `FriendsView({ onClose, onOpenDM, onOpenUser, embedded })` — Friends view component.

## Key Logic

- **Tabs**: "Friends" (accepted), "Requests" (incoming), "Add" (search and add).
- **FriendsList**: Searchable list of accepted friends. Shows presence, last seen. Actions: Open DM, Block/Unblock.
- **RequestsInbox**: Lists incoming friend requests with Accept/Decline buttons.
- **AddFriend**: Search by username, send friend request.
- **Blocking**: `api.blockUser()` / `api.unblockUser()`. Blocked users shown separately with unblock option.
- **Mark seen**: When "Requests" tab is active, calls `markFriendRequestsSeen()`.
- **DM creation**: `api.createDM({ userId })` creates conversation and navigates to it.

## Dependencies

- `useChatStore` — friends, friendRequests, users, upsertConversation, selectConversation
- `api.createDM`, `api.blockUser`, `api.unblockUser`, `api.getFriendship`
- `Avatar`, `PresenceDot`
- `cn`, `formatRelative`

## Constraints and Gotchas

- `embedded` prop changes layout (used in AppShell main view vs mobile full-page).
- `pendingOut` tracks outgoing friend requests.
- `blockedOnly` filters to only blocked-by-me relationships.
- Empty states shown when no friends exist.

## Interactions

- `onOpenDM` callback navigates to conversation.
- `onOpenUser` callback opens user card.
- `onClose` callback closes the view (mobile back button).

# UserCard.tsx

## Purpose

User profile card displaying avatar, display name, username, bio, status, gender, organization, and friendship actions (add friend, block, message, report).

## Exports

- `UserCard({ user, onClose, onOpenDM, variant })` — User card component.

## Key Logic

- **Friendship state**: Fetches fresh friendship via `api.getFriendship()` on mount. Updates store.
- **Actions**: Open DM, Add friend, Accept/Decline request, Block/Unblock, Report.
- **DM creation**: `api.createDM({ userId })` → navigate to conversation.
- **Organization badge**: Shows org name via `getOrgDisplayPath()`.
- **Variants**: `popover` (card with border/shadow) or `page` (full height).
- **Report**: Opens `ReportModal` for user reporting.

## Dependencies

- `useChatStore` — me, friends, upsertFriend, removeFriend, upsertConversation, selectConversation
- `api.createDM`, `api.getFriendship`, `api.sendFriendRequest`, `api.acceptFriendRequest`, `api.declineFriendRequest`, `api.blockUser`, `api.unblockUser`
- `Avatar`, `PresenceDot`, `ReportModal`
- `getOrgDisplayPath`
- `cn`, `formatRelative`

## Constraints and Gotchas

- Friendship is refreshed on mount to avoid stale state.
- `isSelf` check prevents actions on own profile.
- `isAI` check shows AI badge and hides friendship actions.
- `coverNoise` is a decorative gradient overlay.

## Interactions

- `onClose` closes the card.
- `onOpenDM` navigates to conversation.
- Friendship changes propagate via store updates.

# UserCardPopover.tsx

## Purpose

Modal wrapper for `UserCard`. Renders user card centered on screen with backdrop blur.

## Exports

- `UserCardPopover({ userId, onClose })` — User card popover.

## Key Logic

- Fetches user from store by `userId`.
- Renders `UserCard` in `popover` variant.
- Backdrop click dismisses.

## Dependencies

- `useChatStore` — users
- `UserCard`

## Constraints and Gotchas

- Returns null if user not found in store.
- Simple wrapper — no additional logic.

## Interactions

- `onClose` callback dismisses the popover.

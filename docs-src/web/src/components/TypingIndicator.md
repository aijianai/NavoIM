# TypingIndicator.tsx

## Purpose

Animated typing indicator showing which users are currently typing in a conversation.

## Exports

- `TypingIndicator({ users })` — Typing indicator component.

## Key Logic

- **User display**: Shows up to 3 user avatars stacked with overlap.
- **Label**: Single user: "X is typing...". Multiple: "X, Y are typing...".
- **Animation**: Three bouncing dots with staggered delay.
- **Empty state**: Returns null if no users.

## Dependencies

- `Avatar`
- `framer-motion` — motion (bouncing dots)
- `useT` — i18n

## Constraints and Gotchas

- Maximum 3 avatars displayed.
- `ring` prop on avatars for stacking effect.

## Interactions

- Used by ChatView to show typing users from `useChatStore.typing` state.

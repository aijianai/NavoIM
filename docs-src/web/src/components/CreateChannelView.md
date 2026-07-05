# CreateChannelView.tsx

## Purpose

Full-page channel creation form. Allows setting name, topic, icon, privacy, and selecting initial members from friends list.

## Exports

- `CreateChannelView({ onClose })` — Channel creation view.

## Key Logic

- **Form fields**: Name (required), topic (optional), icon (12 emoji options), private toggle.
- **Member selection**: Grid of friends with checkboxes. Selected IDs sent to API.
- **Submit**: `api.createChannel()` → `upsertConversation()` → `selectConversation()` → `onClose()`.
- **Validation**: Name is required. Error displayed if empty.

## Dependencies

- `useChatStore` — users, me, friends, upsertConversation, selectConversation
- `api.createChannel`
- `Avatar`, `cn`

## Constraints and Gotchas

- `ICON_OPTIONS` is a hardcoded array of 12 emojis.
- Candidates are friends only (not all users).
- After creation, automatically navigates to the new channel.

## Interactions

- `onClose` callback navigates back.
- New channel appears in sidebar immediately via `upsertConversation()`.

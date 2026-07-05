# DiscoverChannels.tsx

## Purpose

Channel discovery/browser view. Lists public channels with search, join functionality, and channel info preview.

## Exports

- `DiscoverChannels({ onClose })` — Channel discovery component.

## Key Logic

- **Channel list**: Fetches from `api.getPublicChannels()`. Shows icon, name, topic, member count, owner.
- **Search**: Debounced (400ms) search by channel name.
- **Join**: `api.addMember(channelId, myId)` → `upsertConversation()`. Updates local `joined` state.
- **Channel info**: Clicking a channel shows detail card with full info and join button.
- **Close**: Uses `onClose` callback or `useUI.close()`.

## Dependencies

- `useChatStore` — upsertConversation
- `api.getPublicChannels`, `api.addMember`
- `useUI` — close

## Constraints and Gotchas

- Only public channels are shown.
- `joined` state tracks whether user is already a member.
- Search is debounced to avoid excessive API calls.

## Interactions

- `onClose` or `useUI.close()` for navigation.
- Joined channel appears in sidebar via `upsertConversation()`.

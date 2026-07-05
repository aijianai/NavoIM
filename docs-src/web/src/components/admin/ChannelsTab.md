# ChannelsTab.tsx — Channel Management

## Purpose

Provides a paginated, searchable channel list with channel detail modal supporting member management, ownership transfer, channel banning, and invite permission toggle.

## Exports

- `ChannelsTab` — React component with props for `hasPermission` and `openConfirm`.

## Key Logic

- **Channel list**: Fetches paginated channels via `api.admin.getChannels()` with page/limit/search. Page size is 20.
- **Channel row**: Displays avatar/icon, name, topic, public/private status, member count, creation date. Delete button requires `channels.delete` permission.
- **ChannelDetailModal** (internal): Full-screen modal with four sections:
  - **Ban status**: Shows ban state with optional reason; supports ban with reason input and unban.
  - **Member invite permission**: Toggle switch for `membersCanInvite` via `api.updateChannel()`.
  - **Member list**: Displays members with avatar, name, username. Owner is labeled. Each non-owner has a crown button for ownership transfer.
  - **Add member**: Search users and add them to the channel via `api.admin.addChannelMember()`.

## Dependencies

- `api` from `../../lib/api` — `getChannels`, `getChannel`, `deleteChannel`, `banChannel`, `unbanChannel`, `getChannelBanStatus`, `transferChannelOwner`, `addChannelMember`, `updateChannel`.
- `useChatStore` from `../../lib/store` — reads `users` map for member resolution fallback.
- `Avatar` from `../Avatar`.
- `toast`, `Sec` from `./shared`.
- Types: `AdminPermission`, `PublicUser` from `@navo/shared`.

## Constraints and Gotchas

- Channel and detail modal use `any` types extensively (not strongly typed).
- Member list falls back to resolving from the Zustand store if `channelDetail.memberUsers` is empty.
- `transferChannelOwner` triggers a confirmation dialog via `openConfirm` with "warning" variant.
- `membersCanInvite` is toggled optimistically and persisted via `api.updateChannel()`.

## Interactions

- Parent provides `hasPermission` and `openConfirm`.
- Detail modal fetches full channel data via `api.admin.getChannel(channel.id)` on mount.
- Channel ban status is fetched separately via `api.admin.getChannelBanStatus()`.

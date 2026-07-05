# Avatar.tsx

## Purpose

User and group avatar components with presence indicators. Renders initials, images, or AI sparkle icon with gradient backgrounds.

## Exports

- `Avatar({ user, size, showPresence, className, ring, onClick })` — User avatar.
- `PresenceDot({ status, className, pulse })` — Online/away/busy/offline indicator.
- `GroupAvatar({ name, conversationId, avatarUrl, icon, size, className })` — Channel/group avatar.

## Key Logic

- **Avatar sizes**: `xs` (24px), `sm` (32px), `md` (40px), `lg` (48px), `xl` (64px).
- **Group avatar sizes**: Slightly smaller than user avatars for same size key.
- **Background**: User avatars use `linear-gradient(135deg, avatarColor, #2F7DFF)`. AI user uses `conic-gradient` with brand colors.
- **AI detection**: `user.username === 'navo_ai'` renders star SVG instead of initials.
- **Presence dot**: Color-coded — green (online), yellow (away), red (busy), gray (offline). Online pulses.
- **Image fallback**: If `avatarUrl` exists, renders `<img>` with `object-cover`.
- **Initials**: Extracted via `initials()` utility from `displayName`.

## Dependencies

- `../lib/utils` — `cn`, `initials`, `channelColor`, `resolveAttachmentUrl`
- `@navo/shared` — `PresenceStatus`, `PublicUser`
- `../lib/i18n` — `useT`

## Constraints and Gotchas

- `ring` prop adds `ring-2 ring-surface` for stacking effect.
- `onClick` makes avatar a button with `cursor-pointer` and hover scale.
- `GROUP_SIZE_CLASSES` are intentionally smaller than `SIZE_CLASSES` to fit channel list items.
- Presence dot is absolutely positioned at bottom-right.

## Interactions

- Used extensively across all components (Sidebar, ChatView, MemberPanel, UserCard, etc.).
- `PresenceDot` is exported separately for use in status indicators.

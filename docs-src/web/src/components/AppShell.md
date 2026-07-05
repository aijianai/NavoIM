# AppShell.tsx

## Purpose

Desktop layout shell. Renders the left rail (navigation icons), sidebar (conversation list), main content area, and overlay panels (channel manage, user card, admin, image viewer).

## Exports

- `AppShell()` — Main desktop shell component.

## Key Logic

- **Grid layout**: 4-column CSS grid — rail (64px), sidebar (300px), main (flex), auto (member panel).
- **Rail buttons**: Search (Cmd+K), Friends, Notifications, Admin (if role exists), Theme toggle, Profile avatar.
- **Main view routing**: `useUI` store controls `mainView` — renders ChatView, FriendsView, ProfileSettings, NotificationView, CreateChannelView, DiscoverChannels based on state.
- **Overlays**: `useUI.overlay` renders ChannelManage, UserCardPopover as modals.
- **Command palette**: Cmd+K opens a search modal that filters conversations and users; selecting navigates.
- **Admin check**: Fetches admin role on mount via `api.admin.getMyRole()`; shows shield icon only if role exists.
- **Auto-switch to chat**: When `selectedId` changes and mainView is not "chat", switches to chat view.

## Dependencies

- `useChatStore` — Theme, me, memberPanelOpen, selectedId, friendRequests, unread
- `useUI` — Main view routing, overlay management
- `Sidebar`, `ChatView`, `MemberPanel`, `ProfileSettings`, `FriendsView`, `NotificationView`, `CreateChannelView`, `DiscoverChannels`, `ChannelManage`, `AdminPanel`, `ImageViewer`, `UserCardPopover`, `Avatar`
- `lucide-react` — Rail icons

## Constraints and Gotchas

- Escape key closes command palette and any overlay.
- `CommandPalette` is defined inline — not a separate file.
- `NavoMark` SVG is duplicated across AppShell, MobileShell, Login.

## Interactions

- Sidebar callbacks: `onCreateChannel`, `onExplore`, `onOpenFriends`, `onOpenProfile`.
- ChatView receives `onOpenUser` and `onManageChannel` callbacks.
- `ImageViewer` is rendered unconditionally — it self-manages visibility via `useViewer` store.

# NotificationBell.tsx

## Purpose

Notification bell icon with unread count badge, and notification list view. Shows system notifications with read/unread state.

## Exports

- `NotificationBell({ className, size })` — Bell icon with badge (opens modal on click).
- `NotificationView({ onClose, embedded })` — Full notification list view.

## Key Logic

- **Unread count**: From `useChatStore.unreadNotificationCount()`.
- **Modal**: `MobileNotificationModal` renders notification list in centered overlay.
- **NotificationCard**: Displays notification with Markdown content, image, and timestamp.
- **Mark as read**: Clicking notification calls `markNotificationRead(id)`.
- **Refresh**: `api.getMyNotifications()` fetches notifications on mount.

## Dependencies

- `useChatStore` — unreadNotificationCount, notifications, markNotificationRead, setNotifications
- `api.getMyNotifications`
- `Markdown`
- `cn`

## Constraints and Gotchas

- `NotificationBell` renders a modal portal on click.
- `NotificationView` is used in AppShell/MobileShell as a full view.
- `embedded` prop changes layout for mobile.
- Max badge shows "99+".

## Interactions

- `onClose` callback for navigation.
- Notifications fetched from server and stored in `useChatStore`.

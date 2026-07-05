# PrivateNotificationsTab.tsx — Private Notification Log

## Purpose

Read-only view of private (targeted) notifications sent to individual users. Shows title, content, target user, and send time.

## Exports

- `PrivateNotificationsTab` — React component (no props).

## Key Logic

- Fetches paginated private notifications via `api.admin.getPrivateNotifications()` with page/limit(20).
- Displays a table with columns: title, content (truncated to 300px), target user ID (first 16 chars), send time.
- No create/edit/delete actions — this is purely an audit log.

## Dependencies

- `api` from `../../lib/api` — `getPrivateNotifications`.
- `toast` from `./shared`.
- `useT` from `../../lib/i18n`.
- `Notification` from `@navo/shared`.

## Constraints and Gotchas

- Target user ID is displayed as a truncated substring (`slice(0, 16)`) rather than a username, which may not be informative.
- No filtering or search capability.
- Page size is hardcoded to 20.

## Interactions

- Self-contained; no props required.
- Part of the admin notification system, complementing `NotificationsTab` (broadcast) with private message history.

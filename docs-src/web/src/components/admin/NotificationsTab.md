# NotificationsTab.tsx — Notification Management

## Purpose

Manages platform-wide notifications: create, edit, publish, and delete. Supports markdown content and optional image URLs.

## Exports

- `NotificationsTab` — React component with `openConfirm` prop.

## Key Logic

- **Notification list**: Fetches paginated notifications via `api.admin.getNotifications()` with page/limit(10).
- **Create/Edit form**: Toggled by `creating` state. Fields: title (required), content (required, markdown supported), image URL (optional with live preview).
- **Save**: Calls `api.admin.createNotification()` or `api.admin.updateNotification()` depending on `editItem` state. Validates title and content are non-empty.
- **Publish**: Calls `api.admin.publishNotification(id)` to send to all users.
- **Delete**: Confirms via `openConfirm` then calls `api.admin.deleteNotification()`.
- **Notification card**: Displays title, content (2-line clamp), image, creation time, and action buttons (publish, edit, delete).

## Dependencies

- `api` from `../../lib/api` — `getNotifications`, `createNotification`, `updateNotification`, `publishNotification`, `deleteNotification`.
- `toast` from `./shared`.
- `useT` from `../../lib/i18n`.

## Constraints and Gotchas

- Form validation only checks for non-empty trimmed strings; no length limits enforced client-side.
- When `creating` or `editItem` is truthy, the entire view switches to the form (list is hidden).
- Page size is hardcoded to 10.
- Notification content supports markdown but no rendering is shown in the list (plain text truncated).

## Interactions

- Parent passes `openConfirm` for delete confirmation dialog.
- After save, the list is reloaded and form is closed.

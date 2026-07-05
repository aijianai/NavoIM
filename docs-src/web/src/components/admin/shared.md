# shared.tsx — Admin Shared Types, Constants, and Helpers

## Purpose

Provides shared types, constants, UI helper components, and a module-level toast system used across all admin tab modules. Acts as the common foundation for the admin panel UI.

## Exports

### Types

- `AdminTab` — Union type: `"dashboard" | "users" | "channels" | "settings" | "audit" | "notifications" | "reports"`.

### Constants

- `ROLE_LABELS` — `Record<SystemRole, string>` mapping roles to i18n labels (`super_admin`, `admin`, `moderator`, `user`).
- `ALL_ROLES` — `SystemRole[]` array in ascending privilege order: `["user", "moderator", "admin", "super_admin"]`.
- `ACTION_LABELS` — `Record<string, string>` mapping audit action keys (e.g., `"admin.grant"`, `"user.ban"`) to localized strings.

### Toast System

- `toast(message, type?)` — Fires a toast notification (default `type: "success"`).
- `setToastHandler(handler)` — Registers a toast callback; must be called by a parent component (e.g., `AdminPanel`) to wire up actual toast display.
- `clearToastHandler()` — Unregisters the toast handler.

### Helper Components

- `NavItem` — Sidebar navigation button with icon, label, active state, collapsed mode, and optional expand icon.
- `SC` — Stat card displaying an icon, label, and numeric value with a color badge.
- `InfoRow` — Label/value row with a bottom border, used in detail modals.
- `Sec` — Section wrapper with a title and card styling.
- `Field` — Label + children wrapper for form fields.
- `StatusBadge` — Colored dot + text for user status (`online`, `away`, `busy`, `offline`).

## Key Logic

- Toast uses module-level mutable state (`_addToast`). Only one handler can be registered at a time.
- `NavItem` conditionally renders label and expand icon when not collapsed. In collapsed mode, it sets `title` for tooltip.
- `SC` formats values with `toLocaleString()`.

## Dependencies

- `cn` from `../../lib/utils` (Tailwind class merging).
- `SystemRole` from `@navo/shared`.
- `getT` from `../../lib/i18n` (called at module level for constant initialization).

## Constraints and Gotchas

- Toast handler must be set before any admin tab calls `toast()`. If no handler is registered, `toast()` silently does nothing.
- `ROLE_LABELS` and `ACTION_LABELS` are initialized at module load time using `getT()`, not `useT()`. They use the i18n instance available at import time; language changes after import won't update these constants.
- `StatusBadge` only maps four statuses; any other status falls back to `offline` color.

## Interactions

- Consumed by every admin tab module (`UsersTab`, `ChannelsTab`, `AuditTab`, etc.) and `settings/index.tsx`.
- Toast handler is wired up in the parent `AdminPanel` component.

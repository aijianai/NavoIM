# UsersTab.tsx — User Management

## Purpose

Provides a paginated, searchable user list with actions: view details, ban/unban, set role, delete, assign organization, and send notification.

## Exports

- `UsersTab` — React component with props for permission checking, ban modal state, and confirm dialog.

## Key Logic

- **User list**: Fetches paginated users via `api.admin.getUsers()` with page/limit/search params. Page size is 20.
- **Search**: Text input filters users; resets to page 1 on change.
- **Actions row**: Each row has buttons for view detail (eye), ban (if `users.ban` permission), set admin role (if `users.manage`), delete (if `users.delete`).
- **UserDetailModal** (internal): Full-screen modal showing user info (ID, status, bio, last seen, organization path, ban status). Allows:
  - Role change via dropdown (only `super_admin` can assign `super_admin`).
  - Organization assignment with a dropdown of all orgs plus a position text field.
  - Ban/unban toggle.
  - Delete with confirmation.
  - Send notification via textarea.

## Dependencies

- `api` from `../../lib/api` — `getUsers`, `unbanUser`, `deleteUser`, `grantRole`, `getBanStatus`, `getUserRole`, `getOrganizations`, `getOrgPath`, `notifyUser`, `setUserOrganization`.
- `Avatar` from `../Avatar`.
- `toast`, `ROLE_LABELS`, `ALL_ROLES`, `StatusBadge`, `InfoRow` from `./shared`.
- Types: `AdminUser`, `SystemRole`, `AdminPermission`, `PublicUser` from `@navo/shared`.

## Constraints and Gotchas

- Ban modal is not rendered inside `UsersTab`; it opens externally via `setBanModalOpen`/`setBanUserId`/`setBanReason` props, meaning the ban modal lives in the parent component.
- `super_admin` role option is disabled for non-super-admin callers, but this is only a UI restriction — the server enforces the actual permission.
- Organization path is fetched separately via `api.admin.getOrgPath(orgId)` for breadcrumb display.

## Interactions

- Parent passes `hasPermission`, `myRole`, `openConfirm`, and ban state setters.
- `loadUsers` is wrapped in `useCallback` with `[page, search]` dependencies.
- `UserDetailModal` fetches ban status, role, and organizations in a single `Promise.all` on mount.

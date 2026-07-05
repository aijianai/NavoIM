# OrgsTab.tsx — Organization Management

## Purpose

Manages hierarchical organizations (tree structure). Supports creating orgs with optional parent, deleting orgs, and viewing members per org.

## Exports

- `OrgsTab` — React component (no props).

## Key Logic

- **Create org**: Name (required), parent org (optional dropdown), description (optional). Calls `api.admin.createOrganization()`.
- **Org tree**: Renders root orgs, then recursively renders children via `OrgNode`. Tree is indented by depth.
- **OrgNode** (internal): Each node shows expand/collapse toggle (if has children), building icon, name, description, member count icon, and delete button (visible on hover).
- **Expand members**: On first expand, fetches members via `api.admin.getOrgMembers(id)` and caches in state. Shows member list with name, username, and org title badge.
- **Delete**: Native `confirm()` dialog, then `api.admin.deleteOrganization()`.

## Dependencies

- `api` from `../../lib/api` — `getOrganizations`, `createOrganization`, `deleteOrganization`, `getOrgMembers`.
- `toast` from `./shared`.
- `useT` from `../../lib/i18n`.
- `Organization` from `@navo/shared`.

## Constraints and Gotchas

- Delete uses native `confirm()` not the shared confirm dialog.
- Member data is cached per org ID in a `Record<string, any[]>` state; re-expanding does not refetch.
- Tree rendering uses `depth * 20` px indentation; no virtualization for large trees.
- No edit/rename capability for existing orgs.

## Interactions

- Self-contained; no props required.
- `OrgNode` is a recursive component that receives the full org list and helper functions as props.

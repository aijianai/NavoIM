# AuditTab.tsx — Audit Log Viewer

## Purpose

Displays a paginated, filterable audit log of admin actions (role changes, bans, deletions, settings updates) with a detail modal for each entry.

## Exports

- `AuditTab` — React component (no props).

## Key Logic

- **Filters**: Action type dropdown (from `ACTION_LABELS`), start date, end date. Changing any filter resets to page 1.
- **Log list**: Fetches paginated logs via `api.admin.getAuditLogs()` with page/limit (30 per page) and filter params.
- **Log row**: Shows timestamp, operator name, action badge, and detail preview. Clicking opens the detail modal.
- **AuditDetailModal** (internal): Displays full log details: ID, timestamp, operator, action, target type, target ID, details text (pre-wrapped), and IP address.

## Dependencies

- `api` from `../../lib/api` — `getAuditLogs`.
- `ACTION_LABELS`, `InfoRow` from `./shared`.
- `useT` from `../../lib/i18n`.

## Constraints and Gotchas

- Log entries use `any` type (not strongly typed).
- The detail modal uses `InfoRow` with hardcoded `t("common.unknown")` as labels instead of meaningful labels (appears to be incomplete/placeholder).
- Page size is hardcoded to 30.

## Interactions

- Self-contained; no parent props needed beyond standard admin panel context.
- Data flows from `api.admin.getAuditLogs()` to local state.

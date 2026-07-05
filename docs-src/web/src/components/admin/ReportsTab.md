# ReportsTab.tsx — User Report Management

## Purpose

Manages user-reported content (users, channels, messages). Displays reports in a card list, supports filtering by status, and provides a detail modal for review and action.

## Exports

- `ReportsTab` — React component (no props).

## Key Logic

- **Status filter**: Four tabs — All, Pending, Actioned, Rejected.
- **Report list**: Fetches paginated reports via `api.admin.getReports()` with page/limit(20)/status params. Each card shows target type, status badge with icon, reporter info, reason, and optional screenshot.
- **Detail modal**: Full report detail including:
  - Report time, reporter info (avatar/name/username/ID).
  - Target info (user/channel/message) with avatar and name. Message targets show message text and timestamp.
  - Reason text, optional screenshot, existing result.
  - Action form (pending only): textarea for result, two buttons — reject and confirm (actioned).
- **Handle action**: Calls `api.admin.handleReport()` with status and result string.

## Dependencies

- `api` from `../../lib/api` — `getReports`, `handleReport`.
- `toast` from `./shared`.
- `useT`, `getT` from `../../lib/i18n`.
- `cn` from `../../lib/utils`.

## Constraints and Gotchas

- `ReportItem` interface is defined locally (not from `@navo/shared`), with snake_case fields (`reporter_id`, `created_at`).
- `TARGET_LABELS` and `STATUS_LABELS` use module-level `getT()` — won't update on language change.
- Action requires non-empty trimmed result text; both reject and actioned use the same textarea.
- Pagination uses `reports.length < 20` to detect last page.

## Interactions

- Self-contained; no props required.
- Uses shared `toast` for success/error feedback.

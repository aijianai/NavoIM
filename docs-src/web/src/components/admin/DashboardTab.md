# DashboardTab.tsx — Admin Dashboard Overview

## Purpose

Displays a visual dashboard of key platform statistics: user counts, message counts, channels, and trend data. Serves as the landing page of the admin panel.

## Exports

- `DashboardTab` — React component (no props).

## Key Logic

- Fetches `AdminDashboardStats` from `api.admin.getDashboard()` on mount.
- Shows a loading spinner while fetching; displays a failure message if the API call fails.
- Renders eight `MetricCard` components in a grid: total users, active users, channels, messages, new users today/this week, messages today/this week.
- Renders a horizontal bar chart visualization panel where each metric gets a proportional bar relative to the maximum value.
- Displays four static system indicator badges (security, connection, efficiency, sync).

## Dependencies

- `api` from `../../lib/api` — calls `api.admin.getDashboard()`.
- `useT` from `../../lib/i18n` — all labels are i18n keys.
- `cn` from `../../lib/utils`.
- `AdminDashboardStats` from `@navo/shared`.
- `lucide-react` icons (20+ icons imported).

## Constraints and Gotchas

- The `MetricCard` is a local component (not exported), defined inline in this file.
- System indicator values (e.g., "STABLE", "LIVE") are hardcoded static labels, not derived from actual system health checks.
- Chart bar width is calculated as `(value / maxVal) * 100` with a minimum of 10px for nonzero values.

## Interactions

- Fetches data from the server admin API endpoint `GET /api/admin/dashboard`.
- Rendered by the parent `AdminPanel` when the `dashboard` tab is active.

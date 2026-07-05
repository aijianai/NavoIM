# MessagesTab.tsx — Message Audit

## Purpose

Provides a searchable, filterable audit view of all messages across conversations. Supports filtering by content, message kind, author ID, and deleted status.

## Exports

- `MessagesTab` — React component (no props).

## Key Logic

- **Filters**: Text search, kind dropdown (11 kinds: text, image, file, video, system, poll, friendCard, channelCard, location, forwardedCard), author ID input, deleted toggle.
- **Message list**: Fetches paginated messages via `api.admin.getAuditMessages()` with page/pageSize(50)/search/kind/authorId/includeDeleted params.
- **Content rendering** (`renderContent`): Dispatches on `msg.kind`:
  - Deleted messages shown with strikethrough.
  - Location: parses JSON, shows name/address/coords with `MapPin` icon.
  - Poll: parses JSON, shows question with `Vote` icon.
  - Friend/channel cards: shown with `User` icon.
  - Attachments: shows image thumbnail, video poster, or file name with appropriate icons.
  - Default: plain text truncated.
- **Row styling**: Deleted messages get a red-tinted background.

## Dependencies

- `api` from `../../lib/api` — `getAuditMessages`.
- `cn`, `isImage`, `isVideo`, `formatTime`, `resolveAttachmentUrl` from `../../lib/utils`.
- `toast` from `./shared`.
- `useT`, `getT` from `../../lib/i18n` (module-level `getT` for `KINDS` constant).
- `AuditMessage` from `@navo/shared`.

## Constraints and Gotchas

- `KINDS` array is initialized at module load via `getT()`, not `useT()`. Labels won't update on language change.
- Filter changes trigger `fetch(1)` and `setPage(1)` via `useEffect`, which re-fetches immediately.
- Pagination calls `fetch(p)` directly (not via effect) to avoid double-fetch.

## Interactions

- Self-contained; no props required.
- Uses shared `toast` for error notifications.

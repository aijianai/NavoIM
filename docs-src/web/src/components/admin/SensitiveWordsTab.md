# SensitiveWordsTab.tsx — Sensitive Word Management

## Purpose

Manages a list of sensitive/banned words with batch add, search, and delete. Supports two policies: block (reject message) and mask (replace with asterisks).

## Exports

- `SensitiveWordsTab` — React component (no props).

## Key Logic

- **Batch add**: Textarea for newline-separated words, policy selector (block/mask), word count display, and submit button. Calls `api.admin.addSensitiveWords(words, policy)`.
- **Search**: Filters the word list; resets to page 1 on change.
- **Word table**: Paginated (50 per page) with columns: checkbox, word, policy badge (red for block, yellow for mask), creation time, delete button.
- **Batch delete**: Select multiple via checkboxes (including select-all toggle), delete selected with browser `confirm()` dialog.
- **Single delete**: Delete individual word with same confirm dialog.

## Dependencies

- `api` from `../../lib/api` — `getSensitiveWords`, `addSensitiveWords`, `deleteSensitiveWords`.
- `toast` from `./shared`.
- `useT` from `../../lib/i18n`.
- `SensitiveWord` from `@navo/shared`.

## Constraints and Gotchas

- Delete confirmation uses native `confirm()` instead of the shared `openConfirm` dialog.
- Batch input splits on newlines; empty lines are filtered out.
- Policy is a per-batch setting — all words added in one batch share the same policy.
- Page size is 50.

## Interactions

- Self-contained; no props required.
- Data refreshed after every add/delete operation.

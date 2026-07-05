# StickerPicker.tsx

## Purpose

Sticker picker with pack tabs, search, and grid display. Loads sticker packs from API.

## Exports

- `StickerPicker({ onSelect })` — Sticker picker component.

## Key Logic

- **Pack loading**: `api.getStickerPacks()` fetches all packs on mount.
- **Tab bar**: Horizontal scrollable tabs for each pack.
- **Search**: Filters stickers across all packs by name.
- **Grid**: 4-column grid with sticker thumbnails and names.
- **Selection**: `onSelect(stickerId, fileUrl)` sends sticker.

## Dependencies

- `api.getStickerPacks`
- `cn`

## Constraints and Gotchas

- Empty state shown when no packs exist.
- Loading state with spinner.
- Search is client-side filtering.

## Interactions

- Used by Composer's PickerPanel (emoji/sticker tabbed view).
- `onSelect` triggers `sendSticker()` in Composer.

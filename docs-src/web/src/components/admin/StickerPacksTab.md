# StickerPacksTab.tsx — Sticker Pack Management

## Purpose

Manages sticker packs and individual stickers. Supports creating/deleting packs, uploading stickers (images/videos), renaming packs and stickers, and deleting stickers.

## Exports

- `StickerPacksTab` — React component (no props).

## Key Logic

- **Pack list**: Fetches all packs via `api.getStickerPacks()`. Displayed in a 2-column grid.
- **Create pack**: Inline input with submit button. Calls `api.admin.createStickerPack()`.
- **Pack operations**: Edit name (inline input with save/cancel), delete pack.
- **Sticker grid**: 4-column grid per pack. Each sticker shows image, hover overlay with edit name and delete buttons.
- **Upload sticker**: File input (accepts `image/*,video/*`), uploads via `api.upload()` then adds to pack via `api.admin.addSticker()`. Strips file extension for sticker name.
- **Sticker rename**: Inline input with Enter/Escape key support.

## Dependencies

- `api` from `../../lib/api` — `getStickerPacks`, `admin.createStickerPack`, `admin.deleteStickerPack`, `admin.updateStickerPack`, `admin.addSticker`, `admin.deleteSticker`, `admin.updateSticker`, `upload`.
- `cn` from `../../lib/utils`.
- `toast` from `./shared`.
- `useT` from `../../lib/i18n`.

## Constraints and Gotchas

- No pagination — all packs loaded at once.
- Upload uses a single file input per pack; no multi-select or drag-and-drop.
- Sticker name is derived from filename without extension.
- Edit name inputs use `autoFocus` and handle Enter/Escape keys.
- Error handling uses generic `toast(t("common.unknown"))` without specific messages.

## Interactions

- Self-contained; no props required.
- Uses both `api.getStickerPacks()` (non-admin) and `api.admin.*` (admin) endpoints.

# web/src/lib/nsfw.ts — Client NSFW Helpers (Legacy / Optional)

## Purpose

Legacy client-side NSFW helpers. **Upload flow no longer calls these** — moderation runs only on the server during `POST /api/upload` to avoid double inference and slow uploads.

## Exports

- `configureNsfw(...)` — no-op compatibility stub.
- `checkImageNsfw(src)` — POST to `/api/nsfw/check` (still available if needed).
- `checkVideoNsfw(file)` — extracts frames and POSTs to `/api/nsfw/check`.

## Key Logic

- `Composer.tsx` does not import this module for normal uploads.
- Server respects `nsfwEnabled` from admin settings; when off, uploads skip classification.

## Interactions

- Server `nsfw.ts` performs classification with admin-configured threshold.

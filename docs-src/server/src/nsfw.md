# server/src/nsfw.ts — Server-side NSFW Moderation (Built-in nsfwjs)

## Purpose

Performs server-side NSFW image moderation using a built-in `nsfwjs` model. Admin can enable/disable and set rejection threshold via `system_settings`. Upload and optional pre-check endpoints call this module.

## Exports

- `checkBufferNsfw(buf, mimeType)` — classifies an in-memory image buffer. Returns `{ ok, reason?, score?, skipped? }`.
- `checkFileNsfw(filePath, mimeType)` — reads a disk file and delegates to `checkBufferNsfw` for images.
- `warmupNsfw()` — preloads model and runs one dummy inference at startup when enabled.
- `reloadNsfwConfig()` — clears the in-memory config cache (threshold/enabled). Does **not** unload the model.
- `benchNsfw(buf, mimeType)` — benchmark helper: forces enabled for one call, returns `{ elapsedMs, result }` without writing DB.

## Key Logic

- Reads `nsfwEnabled` and `nsfwThreshold` from `system_settings` (cached in `configCache`).
- When disabled, returns `{ ok: true, skipped: true }` without loading or running the model.
- Rejection when Porn + Hentai probability sum >= `nsfwThreshold` (default 0.6).
- Model loads lazily once per process via `modelLoad` promise; `warmupNsfw()` runs after server listen when NSFW is enabled.
- Uses `@tensorflow/tfjs-node` when available (native CPU acceleration), falls back to `@tensorflow/tfjs`.
- `tf.enableProdMode()`; image preprocess via `sharp` 224×224 nearest-neighbor `fastShrinkOnLoad`.
- Upload path reads file once into memory and calls `checkBufferNsfw` (no duplicate sync read in classify).
- Videos pass through on the server (client may extract frames elsewhere; upload path only checks images).

## Dependencies

- `@tensorflow/tfjs`, `nsfwjs`, `sharp`, `node:fs`
- `server/src/db.js` — `queryOne` for settings

## Constraints and Gotchas

- First check after server start may be slower while the model loads; `warmupNsfw` reduces first-upload latency when NSFW is enabled.
- Admin config updates call `reloadNsfwConfig()` — only refreshes threshold/enabled, not the model weights.
- Client-side duplicate pre-check in `Composer` was removed; only the server runs inference on upload to avoid double latency.

## Interactions

- `http.ts` `POST /api/nsfw/check` — optional authenticated pre-check using `checkBufferNsfw`.
- `http.ts` `POST /api/upload` — reads upload into buffer and calls `checkBufferNsfw` when enabled.

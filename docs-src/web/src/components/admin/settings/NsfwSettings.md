# settings/NsfwSettings.tsx — NSFW Moderation Settings

## Purpose

Admin UI for built-in server-side NSFW image moderation. Controls enable/disable and rejection threshold. No external API URL field — detection uses the embedded `nsfwjs` model on the server.

## Exports

- `NsfwSettings` — React component with `nsfwConfig` and `setNsfwConfig` props.
- `NsfwConfig` — type `{ nsfwEnabled: boolean; nsfwThreshold: number }`.

## Key Logic

- Toggle binds to `nsfwEnabled`.
- Range slider 0–100% maps to `nsfwThreshold` (0–1 float).
- Saved via `api.admin.updateNsfwConfig` from `SettingsTab` (message sub-tab).

## Dependencies

- `Sec`, `Field` from `../shared`.
- `useT` from `../../../lib/i18n`.

## Interactions

- Server `nsfw.ts` reads `nsfwEnabled` / `nsfwThreshold` from `system_settings` with in-memory cache.
- `reloadNsfwConfig()` clears config cache only; the TensorFlow model stays loaded in process memory.

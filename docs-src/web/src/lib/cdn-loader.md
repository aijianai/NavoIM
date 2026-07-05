# cdn-loader.ts — CDN Resource Loader

## Purpose

Dynamically injects Google Fonts stylesheets and optional VConsole debug tool based on server-side configuration.

## Exports

| Export | Kind | Description |
|--------|------|-------------|
| `loadCdnResources()` | Async function | Fetches CDN config and injects resources into `<head>` |

## Key Logic

1. Fetches `/api/system/cdn-config` which returns `{ fontsGoogleCssUrl, vconsoleEnabled }`.
2. If `fontsGoogleCssUrl` is set, injects two `<link rel="preconnect">` tags (fonts.googleapis.com, fonts.gstatic.com) and one `<link rel="stylesheet">` for the Google Fonts CSS.
3. If `vconsoleEnabled` is true, injects a `<script>` loading VConsole from unpkg and instantiates it on load.
4. Uses a `loaded` flag to prevent double-execution.

## Dependencies

| Import | Purpose |
|--------|---------|
| `./utils` | `apiFetch` for config retrieval |

## Constraints and Gotchas

- Must be called before first paint to avoid FOUC on fonts.
- Silent failure: if the config fetch fails, no resources are injected and no error is thrown.
- VConsole is loaded from `unpkg.com` which requires network access.
- The `loaded` flag is module-level; calling `loadCdnResources` a second time is a no-op.

## Interactions

- **Entry point (`main.tsx`):** Calls `loadCdnResources()` synchronously before React render.

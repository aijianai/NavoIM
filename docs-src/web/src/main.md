# main.tsx — Web Entry Point

## Purpose

Bootstrap the React application. Mounts the root `<App />` component into the DOM, loads global CDN resources, and applies global styles.

## Exports

None. This is a side-effect-only module.

## Key Logic

1. Calls `loadCdnResources()` synchronously before render to inject Google Fonts and debug tools (VConsole on mobile).
2. Imports `styles.css` for global Tailwind/utility styles.
3. Creates a React root on `#root` and renders `<App />` wrapped in `<React.StrictMode>`.

## Dependencies

| Import | Purpose |
|--------|---------|
| `react` | JSX runtime |
| `react-dom/client` | React 18 `createRoot` API |
| `./App` | Root application component |
| `./lib/cdn-loader` | Dynamic `<link>` / `<script>` injection for CDN assets |
| `./styles.css` | Global CSS (Tailwind directives) |

**Imported by:** HTML entry (`index.html`) via Vite's module script.

## Constraints and Gotchas

- `loadCdnResources()` must run before first paint; placing it after render would cause a FOUC on fonts.
- `#root` element must exist in `index.html`. The non-null assertion (`!`) will throw at runtime if missing.

## Interactions

- The module is the sole consumer of `App`. All downstream module loading (store init, WS connection, route rendering) is triggered by `App`.
- Vite handles tree-shaking and HMR for this file. Editing `main.tsx` triggers a full page reload, not HMR.

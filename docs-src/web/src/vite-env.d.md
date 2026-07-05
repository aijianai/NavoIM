# vite-env.d.ts -- Vite Client Type Reference

## Purpose

Ambient type declaration file that integrates Vite's client-side type definitions into the TypeScript compilation context.

## Exports

None (ambient declaration file).

## Key Logic

Contains a single triple-slash directive:

```ts
/// <reference types="vite/client" />
```

This pulls in Vite's built-in type declarations which provide:
- `import.meta.env` typing (`VITE_API_BASE`, `VITE_API_SECRET`, etc.)
- `import.meta.hot` for HMR API
- Asset import types (`.png`, `.svg`, `.css`, etc.)
- `ClientManifest` and other Vite-specific types

## Dependencies

| Import | Purpose |
|--------|---------|
| `vite/client` | Vite's ambient type definitions (resolved via `/// <reference types>`) |

## Constraints and Gotchas

- This file must exist at the `web/src/` root for Vite to pick it up automatically.
- Removing this file will cause TypeScript errors for any code using `import.meta.env` or asset imports.
- Only relevant in the `web` package; the `server` package does not use Vite.

## Interactions

- Enables typed access to `import.meta.env.VITE_API_BASE` used throughout `web/src/lib/utils.ts` and `web/src/lib/api.ts`.

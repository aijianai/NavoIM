# useIsMobile.ts — Mobile Detection Hook

## Purpose

React hook that returns `true` when the viewport width is at or below 820px. Updates reactively on window resize.

## Exports

| Export | Kind | Description |
|--------|------|-------------|
| `useIsMobile()` | Hook | Returns `boolean` |

## Key Logic

Uses `window.matchMedia("(max-width: 820px)")` with a `change` event listener. Initial value is computed synchronously from the current viewport width. Cleans up the listener on unmount.

## Dependencies

None (React + browser API only).

## Constraints and Gotchas

- The 820px breakpoint is hardcoded and shared across the app.
- Server-side rendering: `typeof window !== "undefined"` guard returns `false` on SSR.
- The hook does not debounce resize events; `matchMedia` already batches them efficiently.

## Interactions

- **Components:** `MobileShell`, sidebar, and chat layout components use this to switch between mobile and desktop rendering modes.

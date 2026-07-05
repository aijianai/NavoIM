# useViewportHeight.ts — Viewport Height Hook

## Purpose

React hook that sets a CSS custom property `--vh` on `<html>` to the actual visual viewport height. Solves the mobile browser address bar resize problem where `100vh` includes the URL bar.

## Exports

| Export | Kind | Description |
|--------|------|-------------|
| `useViewportHeight()` | Hook | Side-effect only (no return value) |

## Key Logic

Reads `window.visualViewport.height` and sets `document.documentElement.style.setProperty("--vh", "${height}px")`. Listens to the `resize` event on `visualViewport` to update dynamically. Cleans up the listener on unmount.

## Dependencies

None (browser API only).

## Constraints and Gotchas

- If `visualViewport` is not available (older browsers), the hook is a no-op.
- The `--vh` CSS variable must be consumed by components using `var(--vh)` instead of `100vh`.
- This is a side-effect-only hook; it returns `undefined`.

## Interactions

- **App root or layout component:** Calls `useViewportHeight()` once to set the variable globally. CSS utilities like `h-full` using `var(--vh)` benefit from this.

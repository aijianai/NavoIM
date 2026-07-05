# DmMoreMenu.tsx

## Purpose

Portal-based dropdown for the DM "three dots" menu in `ChatView`. Renders at `document.body` with `z-[9999]` so it is never clipped or covered by chat layout stacking contexts.

## Exports

- `DmMoreMenu({ open, anchorRef, onClose, children })` — positions below the anchor button, closes on outside `pointerdown` (deferred one frame to avoid open-click race) or Escape.

## Key Logic

- `useLayoutEffect` reads `getBoundingClientRect()` from `anchorRef` and sets fixed `top`/`left`.
- Outside-click uses capture-phase `pointerdown` with `requestAnimationFrame` arm guard.
- Menu panel stops propagation on `pointerDown` so item clicks register reliably.

## Dependencies

- `react-dom` `createPortal`
- Used by `ChatView.tsx` for both desktop header and mobile floating trigger (shared `dmMenuBtnRef`).

## Constraints and Gotchas

- Only one anchor is mounted at a time (`compact` vs desktop header).
- Width is fixed at 224px (`w-56`).

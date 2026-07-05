# LocationViewer.tsx

## Purpose

Full-screen location viewer. Displays a static AMap thumbnail with location name, address, coordinates, and "Open in AMap" link.

## Exports

- `LocationViewer()` — Location viewer component (renders via portal).

## Key Logic

- **Static map**: Uses AMap REST API static map endpoint with hardcoded API key.
- **AMap link**: Opens `uri.amap.com/marker` in new tab for navigation.
- **Keyboard**: Escape closes.
- **Info**: Shows location name, address, and coordinates (5 decimal places).

## Dependencies

- `useViewer` — locationOpen, location, closeLocation
- `framer-motion` — AnimatePresence, motion

## Constraints and Gotchas

- AMap API key `ee95e52bf08006f63fd29bcfbcf21df0` is hardcoded.
- Static map is an image (no interactive map SDK).
- Renders via `createPortal` to `document.body`.
- z-index 100.

## Interactions

- Opened by MessageBubble when location message is clicked via `useViewer` store.

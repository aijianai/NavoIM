# LocationPickerHost.tsx

## Purpose

Mount point for location picker. Renders as centered modal on desktop or full-screen overlay on mobile.

## Exports

- `LocationPickerHost()` — Location picker host component.

## Key Logic

- **Desktop**: Centered modal with backdrop blur.
- **Mobile**: Full-screen overlay with header and close button.
- **Keyboard**: Escape closes.
- **Responsive**: Uses `useIsMobile()` hook.

## Dependencies

- `useLocationPicker` — open, closePicker
- `useIsMobile`
- `LocationPickerBody`
- `framer-motion` — AnimatePresence, motion

## Constraints and Gotchas

- Renders via `createPortal` to `document.body`.
- z-index 120.
- Returns null on server (SSR safety).

## Interactions

- Wraps `LocationPickerBody` for both desktop and mobile layouts.

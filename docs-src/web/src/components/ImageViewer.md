# ImageViewer.tsx

## Purpose

Full-screen image viewer with gallery navigation. Supports keyboard navigation, download, and multi-image browsing.

## Exports

- `ImageViewer()` — Image viewer component (renders via portal).

## Key Logic

- **Gallery**: Navigates through `images` array from `useViewer` store.
- **Keyboard**: Escape closes, ArrowRight/ArrowLeft navigate.
- **Download**: Downloads current image via `downloadAttachment()`.
- **Animation**: Framer Motion fade/scale transitions.
- **Counter**: Shows "name (index/total)" at bottom.

## Dependencies

- `useViewer` — open, images, index, close, next, prev
- `downloadAttachment`, `resolveAttachmentUrl`
- `framer-motion` — AnimatePresence, motion

## Constraints and Gotchas

- Renders via `createPortal` to `document.body`.
- z-index 100.
- Click backdrop to close.

## Interactions

- Opened by MessageBubble, MediaBrowser, and other components via `useViewer` store.

# VideoViewer.tsx

## Purpose

Full-screen video player with gallery navigation. Similar to ImageViewer but for video content.

## Exports

- `VideoViewer()` — Video viewer component (renders via portal).

## Key Logic

- **Gallery**: Navigates through `videos` array from `useViewer` store.
- **Keyboard**: Escape closes, ArrowRight/ArrowLeft navigate.
- **Download**: Downloads current video.
- **Autoplay**: Plays from start on open or index change.
- **Controls**: Native video controls enabled.

## Dependencies

- `useViewer` — videoOpen, videos, videoIndex, closeVideo, nextVideo, prevVideo
- `downloadAttachment`, `resolveAttachmentUrl`
- `framer-motion` — AnimatePresence, motion

## Constraints and Gotchas

- Renders via `createPortal` to `document.body`.
- z-index 100.
- Video `playsInline` for iOS compatibility.
- Autoplay may be blocked until user interaction.

## Interactions

- Opened by MessageBubble and MediaBrowser via `useViewer` store.

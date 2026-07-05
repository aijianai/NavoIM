# web/src/components/BottomSheet.tsx — Reusable Bottom Sheet

## Purpose

Generic mobile-first bottom sheet with spring animation, backdrop blur, scrollable body, and drag-to-dismiss on the header/handle area. Used for group read-receipt lists and reusable elsewhere.

## Exports

- `BottomSheet` — controlled component with `open`, `onClose`, `title`, and `children`.

## Key Logic

- Renders via `createPortal` to `document.body`.
- `AnimatePresence` + `framer-motion` spring: slides from `y: 100%` on mobile; centered card on `md+`.
- Drag is attached only to the header/handle strip so the content area scrolls freely.
- Dismiss when drag offset > 96px or velocity > 720px/s, or backdrop/Escape click.
- Locks `document.body.overflow` while open.

## Dependencies

- `framer-motion`, `lucide-react`, `../lib/utils` (`cn`).

## Interactions

- `MessageBubble.tsx` `ReadUserListPopup` uses `BottomSheet` for channel read/unread member lists.

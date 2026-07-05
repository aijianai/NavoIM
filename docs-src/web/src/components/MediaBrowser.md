# MediaBrowser.tsx

## Purpose

Media browser for conversations. Searches and displays images, files, videos, locations, polls, text, and AI messages with type filtering and pagination.

## Exports

- `MediaBrowser({ conversationId, isMobile, onClose, onJumpToMessage })` — Media browser component.

## Key Logic

- **Filters**: All, Image, File, Video, Location, Poll, Text, AI.
- **Search**: Text search within filtered type.
- **Results grid**: Displays matching messages with thumbnails/previews.
- **Jump to message**: Clicking result navigates to message in chat.
- **Load more**: Pagination via offset.
- **Selected message**: Clicking shows detail view.

## Dependencies

- `useChatStore`
- `useViewer` — Opens images/videos
- `cn`, `formatTime`, `downloadAttachment`, `resolveAttachmentUrl`

## Constraints and Gotchas

- `LIMIT = 30` per page.
- Search is currently returning empty results (API removed).
- `FILTERS` array maps to message kinds.
- Mobile layout uses full height.

## Interactions

- `onJumpToMessage` navigates to message in chat.
- `onClose` dismisses the browser.

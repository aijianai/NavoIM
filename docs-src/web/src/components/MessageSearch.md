# MessageSearch.tsx

## Purpose

In-conversation message search panel. Searches messages by text and type (text, image, file, location, video, audio) with pagination and jump-to-message.

## Exports

- `MessageSearch({ conversationId, conversationName, onClose, onJumpToMessage })` — Message search component.

## Key Logic

- **Search**: Debounced (300ms) text search via `api.searchMessages()`.
- **Type filters**: Filter by message kind (text, image, file, location, video, audio).
- **Pagination**: "Load more" button appends results.
- **Jump to message**: Clicking a result calls `onJumpToMessage(messageId)` and closes.
- **Context menu**: Right-click on result for additional actions.
- **Result display**: Shows author avatar, name, message preview, timestamp.

## Dependencies

- `api.searchMessages`
- `Avatar`
- `cn`, `formatTime`, `isImage`, `resolveAttachmentUrl`

## Constraints and Gotchas

- `LIMIT = 20` per page.
- `TYPE_FILTERS` array defines available filter options.
- Context menu state managed separately from search results.

## Interactions

- `onJumpToMessage` triggers `jumpToMessage()` in ChatView.
- `onClose` dismisses the search panel.

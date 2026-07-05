# MessageBubble.tsx

## Purpose

Renders a single message with rich content (text/markdown, images, files, voice, location, polls, forwarded cards, friend/channel cards, stickers, AI responses). Handles context menu, editing, reactions, read receipts, translation, and reply thread.

## Exports

- `MessageBubble({ message, author, isMine, grouped, conversation, isMyLastMessage, onOpenUser, onReply, onForward, selected, onToggleSelect, multiSelectMode })` — Message bubble component.
- `jumpToMessage(messageId)` — Scrolls to and flashes a message element by `data-message-id`.

## Key Logic

- **Content rendering**: Different display for text, image, file, voice, location, poll, sticker, forwarded card, friend card, channel card, AI, and system messages. Text messages use `PlainText` by default (Markdown characters escaped). Markdown rendering is opt-in via `message.format === "markdown"` or `message.kind === "ai"`.
- **Context menu**: Right-click or long-press (500ms) shows actions — reply, copy, edit (own text only), forward, pin/unpin, translate, report, delete (within recall window).
- **Edit mode**: Only for own text messages not pending/failed. Sends `message:edit` via WebSocket.
- **Reactions**: Quick reactions bar (thumbs up, fire, heart, party, eyes, sparkle). Toggle via `message:react`.
- **Read receipts**: DM shows "Read"/"Unread" on last own message. Channel shows "X/Y Read" count.
- **Translation**: On-demand translation via API, cached per message.
- **Swipe to reply**: Touch horizontal swipe (>60px, more horizontal than vertical) triggers reply.
- **Forward**: Triggers `onForward` callback to enter multi-select mode.
- **Report**: Opens `ReportModal` for user/channel/message reporting.
- **Pin**: Toggle pin via `message:pin/unpin`.
- **Recall**: Own messages within `MESSAGE_RECALL_WINDOW_MS` can be recalled via `message:recall`.
- **Location**: Renders static map thumbnail, opens `LocationViewer` on click.
- **Poll**: Renders question, options with radio buttons, vote counts, anonymous toggle.

## Dependencies

- `useChatStore` — me, readMarkers, channelReadStates
- `useViewer` — Opens image/video/location viewers
- `wsClient` — message:edit, message:react, message:pin/unpin, message:recall
- `api.translate`, `api.getPinnedMessages`
- `Avatar`, `Markdown`, `ReportModal`
- `framer-motion` — Animations
- `@navo/shared` — MESSAGE_RECALL_WINDOW_MS

## Constraints and Gotchas

- `grouped` prop suppresses avatar/name display for consecutive messages from same author within 5 minutes.
- `isMyLastMessage` determines DM read receipt visibility.
- `canEdit` is restricted to own non-recalled text messages that are not pending/failed.
- `jumpToMessage` uses `document.querySelector` with `data-message-id` attribute.
- Menu is positioned at click/touch coordinates, clamped to viewport.
- `QUICK_REACTIONS` is a fixed array of 6 emojis.

## Interactions

- `onReply` sets reply-to in parent ChatView.
- `onForward` enters multi-select mode in ChatView.
- `onOpenUser` opens UserCardPopover/UserCard.
- Uses `useViewer` store to open images, videos, and locations.

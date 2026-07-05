# Composer.tsx

## Purpose

Message composition area. Handles text input with emoji/mention support, file uploads, voice recording, sticker sending, card sharing, polls, scheduled messages, and location sharing.

## Exports

- `Composer({ conversationId, replyTo, onClearReply, compact, onCallInvite })` — Composer component.

## Key Logic

- **Text input**: Auto-growing textarea with transparent color overlaid on `InlineTextPreview` for emoji rendering. Max 100K chars.
- **Draft persistence**: Text is saved to store via `setDraft()` and restored on conversation switch.
- **Typing indicators**: Sends `typing:start` on first keystroke, `typing:stop` after 1.5s idle.
- **@ mentions**: Detects `@` at word boundary, shows dropdown with conversation members + @all option.
- **Emoji picker**: Lazy-loaded from `/public/emoji/manifest.json`, infinite scroll (32 per page). Also includes sticker tab.
- **File upload**: Drag-and-drop, paste (document-level and textarea), file input. Files upload immediately and send as image/voice/file messages.
- **Voice recording**: `MediaRecorder` API with `audio/webm;codecs=opus`. 60s max. Sends immediately on stop.
- **Tool menu** (Plus button): Image/video, camera (Capacitor), file, location, emoji, friend card, channel card, audio call, video call, poll (channels only).
- **Card sharing**: Friend cards validate friendship status via `api.getFriendship()` before sending. Channel cards share public channels.
- **Scheduled messages**: Long-press send opens schedule menu. Datetime picker, sends with `scheduledAt` field.
- **Markdown send**: Sends message with `kind: "ai"` and `format: "markdown"` for rendered markdown display.
- **Ban status**: Checks `api.getConversationBanStatus()` on mount; disables input if banned.
- **Poll creation**: Modal with question, 2-12 options, anonymous toggle. Poll drafts persist in store per conversation.
- **Auto-read timer**: All send operations (text, sticker, file, location, poll, card, markdown, scheduled) call `startAutoReadTimer` after sending. This starts a 300ms timer that marks the conversation as read from the sender's perspective.

## Dependencies

- `useChatStore` — drafts, pollDrafts, users, me, conversations, conversationsById, appendMessage, setDraft, clearDraft
- `wsClient` — message:send, typing:start, typing:stop
- `api.upload`, `api.getConversationBanStatus`, `api.getFriendship`
- `useLocationPicker` — Opens location picker
- `StickerPicker`, `Avatar`
- `../lib/utils` — normalizeEmojiTokens, emojiUrl, formatBytes, isImage, messagePreview, resolveAttachmentUrl
- `../lib/auto-read` — startAutoReadTimer for auto-read after message send

## Constraints and Gotchas

- Emoji tokens use format `[emoji:name.webp]` or `webp:name.webp`.
- `EMOJI_TOKEN_RE` is used for parsing emoji tokens in text.
- Paste handler is registered at document level — auto-uploads files even when textarea is not focused.
- `sendMenuOpen` is triggered by long-press (500ms) on send button.
- Camera import is dynamic (`import("../platform")`) for Capacitor compatibility.
- `InlineTextPreview` renders emoji as inline images above the transparent textarea.

## Interactions

- `replyTo` shows reply preview bar with dismiss button.
- `onCallInvite` callback triggers audio/video call from tool menu.
- `PickerPanel` wraps `EmojiPicker` and `StickerPicker` in a tabbed container.

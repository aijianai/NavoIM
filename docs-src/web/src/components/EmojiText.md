# EmojiText.tsx

## Purpose

Inline text renderer that converts emoji tokens (`[emoji:name.webp]` or `webp:name.webp`) to inline images while preserving surrounding text.

## Exports

- `EmojiText({ text })` — Emoji text renderer.

## Key Logic

- **Token parsing**: Uses `EMOJI_TOKEN_RE` to find emoji tokens in text.
- **Rendering**: Text segments as `<span>`, emoji tokens as `<img>` with `emojiUrl()`.
- **Lazy loading**: Images use `loading="lazy"`.
- **Size**: 16x16px inline images with vertical alignment.

## Dependencies

- `../lib/utils` — EMOJI_TOKEN_RE, emojiUrl
- `useT`

## Constraints and Gotchas

- Simple regex-based parsing (not a full parser).
- Handles two token formats: `[emoji:name.webp]` and `webp:name.webp`.

## Interactions

- Used by Sidebar, MobileShell, and ConversationItem for message previews.

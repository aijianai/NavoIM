# Markdown.tsx

## Purpose

Custom markdown renderer for chat messages. Supports headings, blockquotes, code fences, bold, italic, inline code, links, mentions, and emoji tokens. Also provides a `PlainText` renderer that displays text verbatim with Markdown special characters escaped.

## Exports

- `Markdown({ text, className, mine })` — Full markdown renderer.
- `PlainText({ text, className, mine })` — Plain text renderer with Markdown character escaping. Supports emoji tokens and @mentions but not Markdown formatting.
- `RichInline({ text, className, mine })` — Lightweight renderer for mentions and URLs only.

## Key Logic

- **Block parsing**: `parseBlocks()` splits text by double newlines, detects headings (`#`), blockquotes (`>`), lists (`-`/`*`/`+`), code fences (```).
- **Inline parsing**: `renderInline()` handles bold (`**`), italic (`*`), inline code (`` ` ``), links (`[text](url)`), mentions (`@user`), bare URLs, and emoji tokens.
- **Mention chips**: `MentionChip` resolves `@username` or `@displayName` to user objects, renders clickable chip that opens user card.
- **Code blocks**: Rendered with monospace font and surface background.
- **URL safety**: `javascript:` protocol blocked, `href` kept for accessibility.
- **URL links**: Uses `openUrl()` from `lib/browser` to open links in a new browser tab.
- **Memoization**: `InlineBlock` is memoized for performance.
- **PlainText escaping**: `escapeMarkdownChars()` escapes `*`, `_`, `#`, `` ` ``, `[`, `]`, `>`, `-`, `+`, `~`, `|`, `\` with backslash prefix. Emoji tokens and @mentions are still processed as rich content.

## Dependencies

- `useChatStore` — users (for mention resolution)
- `useUI` — openUserCard (for mention clicks)
- `emojiUrl`
- `cn`
- `platform` — browser.openUrl (for link handling)

## Constraints and Gotchas

- `RichInline` is a lighter version that only processes mentions, URLs, and emoji (no headings, code, etc.).
- `PlainText` escapes Markdown characters but still renders emoji tokens and @mentions as rich elements.
- `MentionChip` falls back to plain `@text` if user not found.
- Block parsing is line-based (double newline split).
- `INLINE_RE` is a complex regex handling multiple inline formats.

## Interactions

- Used by MessageBubble for AI messages and forwarded cards.
- `PlainText` used for regular text message rendering (default).
- `RichInline` used for message preview text in notification and search contexts.
- Mention clicks open UserCard via `useUI.openUserCard()`.

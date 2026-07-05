# utils.ts — Utility Functions

## Purpose

Shared pure utility functions for formatting, URL resolution, file handling, and message preview generation.

## Exports

| Export | Kind | Description |
|--------|------|-------------|
| `cn(...inputs)` | Function | Class name combiner using `clsx` |
| `initials(name)` | Function | Extracts up to 2-character initials from a display name |
| `channelColor(id)` | Function | Deterministic color from a predefined palette based on channel ID hash |
| `formatTime(iso, lang?)` | Function | Formats ISO timestamp to `HH:MM` (12h for English, 24h otherwise) |
| `formatRelative(iso, lang?)` | Function | Relative time: "just now", "X minutes ago", "yesterday", weekday, or date |
| `dayLabel(iso, lang?)` | Function | Day divider label: "today", "yesterday", or full date |
| `formatBytes(n)` | Function | Human-readable byte size (B/KB/MB/GB) |
| `isImage(mime)` | Function | Checks if MIME starts with `image/` |
| `isVideo(mime)` | Function | Checks if MIME starts with `video/` |
| `isAudio(mime)` | Function | Checks if MIME starts with `audio/` |
| `messageMentionsUser(text, user)` | Function | Detects `@displayName`, `@username`, or `@@all` mentions |
| `extractVideoPoster(file, maxWidth?)` | Async function | Extracts first frame from video file as JPEG data URL |
| `resolveDownloadFileName(displayName)` | Function | Strips `.navofile` extension for user-facing download name |
| `downloadAttachment(url, name)` | Async function | Downloads file with correct filename via blob fetch |
| `safeDateMs(dateStr)` | Function | Safe date parsing returning 0 for invalid dates |
| `EMOJI_TOKEN_RE` | Regex | Matches `[emoji:name.webp]` and `webp:name.webp` tokens |
| `normalizeEmojiTokens(text)` | Function | Converts `webp:` prefix to `[emoji:]` bracket format |
| `emojiPreviewText(text)` | Function | Replaces emoji tokens with localized "[emoji]" text |
| `messagePreview(msg, users?)` | Function | Generates a plain-text preview for conversation list rendering |
| `resolveBase()` | Function | Returns `VITE_API_BASE` with trailing slashes stripped |
| `emojiUrl(name)` | Function | Resolves full URL for an emoji asset |
| `resolveAttachmentUrl(url)` | Function | Prepends `VITE_API_BASE` to relative attachment URLs |
| `apiFetch(path, init?)` | Function | `fetch` wrapper that prefixes `VITE_API_BASE` |

## Key Logic

**Language detection.** `detectCurrentLang()` reads from `localStorage` first, falls back to `detectBrowserLanguage()` from `@navo/shared`. All formatting functions accept an optional `lang` parameter.

**`messagePreview`** generates a preview string based on message `kind`: system messages show text, friend/channel cards show localized labels, location messages parse JSON coordinates, polls parse JSON question, forwarded cards show a label, and text/attachment messages show truncated content.

**`extractVideoPoster`** creates an off-screen `<video>` element with `preload="metadata"`, draws the first frame to a canvas at 320px width, and returns a JPEG data URL. A 2.5-second safety timeout prevents hanging on slow decoders.

**`downloadAttachment`** fetches the file as a blob (with auth header), then uses the platform `download.saveBlob` for native save. Falls back to `window.open` on failure.

## Dependencies

| Import | Purpose |
|--------|---------|
| `@navo/shared` | `t` function, `Language`, `detectBrowserLanguage`, `Message` type |
| `clsx` | Class name merging |
| `./api` | `getToken` for auth headers in downloads |

## Constraints and Gotchas

- `channelColor` uses a simple hash; the same channel ID always produces the same color.
- `formatRelative` uses `toLocaleDateString` for weekday formatting, which varies by browser locale.
- `safeDateMs` returns 0 for null/undefined/invalid dates, preventing NaN propagation in comparisons.
- `resolveAttachmentUrl` handles absolute URLs, data URLs, and relative paths. It does not validate the URL.
- `apiFetch` does NOT inject auth headers (unlike `api.request`). Auth must be added by the caller.

## Interactions

- **Store (`store.ts`):** Uses `safeDateMs` for friend request timestamp comparison.
- **Call controller (`call.ts`):** Uses `apiFetch` for ICE server config.
- **CDN loader, captcha config, org cache:** All use `apiFetch` for non-API requests.
- **Components:** Consumed by message bubbles, conversation lists, file attachments, and composer.

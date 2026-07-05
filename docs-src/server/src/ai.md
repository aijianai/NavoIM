# ai.ts — AI Chat Completion

## Purpose

Provides AI-generated assistant replies for conversations. Supports multimodal (text + image) inputs via a configurable upstream LLM API (Qwen Plus compatible). Includes conversation summary management and user profile injection.

## Exports

- `isAiConfigured()` — returns `true` if an AI API key exists (from config or admin settings).
- `generateAiReply(conversationId, userId)` — builds a context window from conversation history, injects user profile info, and returns the assistant's reply string.

## Key Logic

### Context Assembly
1. Resolves API credentials from admin `system_settings` first, falling back to env-based `config.ai`.
2. Loads all messages for the conversation. If total messages exceed `SUMMARY_THRESHOLD` (40) and a stored summary exists, uses the summary + last 15 messages. Otherwise uses all recent messages.
3. If no summary exists but messages exceed 40, automatically generates a summary via the LLM before constructing the reply.
4. Injects the human user's profile (displayName, username, bio, gender) into the system prompt so the AI knows who it's talking to.
5. System prompt is assembled from: admin's custom prompt (if set) -> default prompt -> user info -> conversation summary (if any).
6. Skips system messages. Messages authored by `config.ai.userId` are mapped to `assistant` role; all others to `user`.
7. For each message, image attachments (local `/uploads/` files) are inlined as base64 data URLs up to 8MB. Larger or external images are passed as remote URLs.
8. Sends a POST to `{baseUrl}/chat/completions` with temperature 0.7, max_tokens 1500, and a 30-second abort timeout.
9. On error or timeout, returns a friendly Chinese fallback string (never throws).

### Summary Generation
- Uses a dedicated summarization prompt that extracts: user info, key topics, preferences, Q&A records, to-dos, emotional state, and conversation style.
- Summary must be at least 800 characters and is stored in the `ai_conversation_summaries` table.
- After generating a reply, if total messages exceed the last summarized count by 20, triggers a summary regeneration.

## Dependencies

- `@navo/shared` (Attachment, Message types)
- `server/src/config.js` — `uploadsDir`, `publicBaseUrl`, `ai.*`
- `server/src/store.js` — `messagesFor()`, `findUserById()`
- `server/src/admin.js` — `getSystemSettings()` (dynamic import to avoid circular deps)
- `server/src/db.js` — `queryOne()`, `execute()` for summary persistence

## Constraints and Gotchas

- Path traversal in `/uploads/` filenames is explicitly blocked.
- Local images > 8MB are sent as absolute URLs rather than base64.
- The system prompt is assembled dynamically from admin settings with fallback defaults.
- The dynamic import of `admin.js` can fail silently if admin module is not yet loaded.
- Summary generation adds latency on the first query after crossing 40 messages.
- If the LLM fails to generate a summary (empty string), the system degrades gracefully by using all recent messages.

## Interactions

Called by WebSocket message handlers when a message is sent to an AI conversation. The conversation ID and user ID are used to retrieve history and user profile. The returned string is broadcast to the conversation as the AI assistant's reply. Summary updates occur asynchronously after the reply is sent.

# server/src/e2ee-files.ts — E2EE Upload File Registry

## Purpose

Tracks files uploaded during an active E2EE session so they can be deleted from disk when the session ends. E2EE message bodies are not persisted in `messages`, but attachments still land on disk via `/api/upload`.

## Exports

- `registerE2eeFile(conversationId, userId, attachmentId, url)` — inserts a row into `e2ee_files`.
- `deleteE2eeConversationFiles(conversationId)` — unlinks local `/uploads/` files and deletes DB rows for that conversation.

## Key Logic

- Upload handler registers a file when `e2eeConversationId` is present in multipart form data.
- Manual `DELETE /api/me/e2ee/sessions/:conversationId` and scheduler timeout sweep both call `deleteE2eeConversationFiles`.

## Dependencies

- `server/src/db.js`, `server/src/config.js`, `nanoid`

## Interactions

- `http.ts` upload and E2EE session end endpoints.
- `scheduler.ts` E2EE offline timeout sweep.

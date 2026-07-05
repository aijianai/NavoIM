# CaptchaDialog.tsx

## Purpose

Modal captcha verification dialog. Appears when server requires captcha for message sending. Loads cap-pow widget and auto-sends message on solve.

## Exports

- `CaptchaDialog()` — Captcha dialog component.

## Key Logic

- **Trigger**: `captchaPending` in store holds pending message payload.
- **Widget loading**: Loads captcha config, injects `cap-widget` script, waits for element to appear.
- **Auto-solve**: On widget `solve` event, extracts token and sends pending message via WebSocket.
- **Cleanup**: Removes widget element on unmount.

## Dependencies

- `useChatStore` — captchaPending, setCaptchaPending
- `loadCaptchaConfig`, `loadCaptchaScript`, `getCaptchaConfig`, `getCaptchaApiEndpoint`
- `wsClient` — message:send

## Constraints and Gotchas

- Widget polling via `setInterval(200)` to detect when `cap-widget` element appears.
- Pending message payload includes: conversationId, text, attachments, replyToId, forwardMessageIds, sourceConvId, cardId.
- z-index 200.

## Interactions

- Triggered when server returns captcha-required error for message send.
- `setCaptchaPending(null)` clears pending state after send.

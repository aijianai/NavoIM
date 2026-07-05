# ReportModal.tsx

## Purpose

Report submission modal for users, channels, and messages. Collects reason, optional screenshot, and captcha verification.

## Exports

- `ReportModal({ targetType, targetId, targetName, onClose })` — Report modal.

## Key Logic

- **Report types**: user, channel, message.
- **Fields**: Reason (required, 500 char max), screenshot (optional image upload).
- **Captcha**: Loads cap-pow widget if enabled.
- **Submit**: `api.submitReport()` → success state → auto-close after 1.5s.
- **Screenshot upload**: `api.upload()` → sets URL.

## Dependencies

- `api.submitReport`, `api.upload`
- `loadCaptchaScript`, `getCaptchaApiEndpoint`
- `useChatStore` — showToast
- `apiFetch`

## Constraints and Gotchas

- Captcha token stored in `window.__reportCaptchaToken`.
- Success state shows checkmark and auto-closes.
- z-index 60.

## Interactions

- Opened by MessageBubble, UserCard, ChannelManage for reporting.
- `onClose` dismisses the modal.

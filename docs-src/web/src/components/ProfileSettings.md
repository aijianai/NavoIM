# ProfileSettings.tsx

## Purpose

User profile editing page. Handles display name, bio, gender, avatar, avatar color, status, language, password change, second password management, and account deletion.

## Exports

- `ProfileSettings({ onClose })` — Profile settings component.

## Key Logic

- **Profile fields**: displayName, bio, gender, avatarUrl, avatarColor, requireFriendApproval, language, status.
- **Avatar upload**: File input → `api.upload()` → sets `avatarUrl`.
- **Avatar color**: 8 predefined gradient colors selectable via swatch grid.
- **Status picker**: `StatusPicker` component for online/away/busy/offline.
- **Password change**: Current + new + confirm. Requires captcha if enabled. Calls `api.changePassword()`.
- **Second password**: Set/remove with pattern lock or number pad. Shows hint. Captcha-gated.
- **Account deletion**: Requires password + captcha. Calls `api.deleteAccount()`.
- **Sound toggle**: `notificationSound.isEnabled()` / `notificationSound.setEnabled()`.
- **Captcha integration**: Loads cap-pow widget for password change, account deletion, and second password operations.
- **Save**: Calls `api.updateProfile()` then `upsertUser()` in store.

## Dependencies

- `useChatStore` — me, upsertUser, reset, language
- `api.updateProfile`, `api.changePassword`, `api.deleteAccount`, `api.upload`, `api.getSecondPasswordStatus`
- `wsClient` — presence:set
- `Avatar`, `StatusPicker`
- `notificationSound`, `loadCaptchaScript`
- `@navo/shared` — Gender, Language, LANGUAGES

## Constraints and Gotchas

- Password change and account deletion require captcha when enabled.
- Second password can be pattern lock (6+ points) or number pad (4-6 digits).
- `AVATAR_COLORS` are hardcoded gradient start colors.
- Status change is sent via WebSocket immediately for real-time presence.
- Language change is stored in `useChatStore.language`.

## Interactions

- `onClose` callback for navigation.
- Profile updates propagate via `upsertUser()` to all components reading `me`.
- Presence changes sent via `wsClient.send({ type: 'presence:set' })`.

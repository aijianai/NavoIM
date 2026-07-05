# AdminPanel.tsx

## Purpose

Full admin dashboard with tabbed navigation. Manages users, channels, settings, audit logs, notifications, reports, sensitive words, messages, organizations, OSS bindings, rate limits, and sticker packs.

## Exports

- `AdminPanel({ onClose })` — Admin panel component.

## Key Logic

- **Tabs**: Dashboard, Users, Channels, Settings (with sub-tabs: basic, registration, message, captcha, AI, translation, CDN, ICE, maintenance, getui), Audit, Notifications (public/private), Reports, Sensitive Words, Messages, Organizations, OSS Bindings, Rate Limits, Sticker Packs.
- **Role-based**: Fetches `api.admin.getMyRole()` on mount. Different tabs visible based on role (super_admin, admin, moderator).
- **Sidebar navigation**: Collapsible sections with nested items.
- **Toast system**: `addToast(message, type)` for success/error feedback.
- **Confirm modal**: `openConfirm()` for dangerous actions.
- **Ban modal**: User ban with reason input.

## Dependencies

- `useChatStore` — me
- `api.admin.*` — Various admin API calls
- Tab components: `DashboardTab`, `UsersTab`, `ChannelsTab`, `AuditTab`, `NotificationsTab`, `ReportsTab`, `SensitiveWordsTab`, `MessagesTab`, `OrgsTab`, `OssTab`, `PrivateNotificationsTab`, `RateLimitSettings`, `SettingsTab`, `StickerPacksTab`
- `ConfirmModal`
- `./admin/shared` — NavItem, toast helpers

## Constraints and Gotchas

- Tab components are in `./admin/` subdirectory.
- `setToastHandler` / `clearToastHandler` manage global toast callback.
- Settings sub-tabs are nested within the Settings main tab.
- Mobile responsive with sidebar toggle.

## Interactions

- `onClose` callback closes the panel.
- Admin actions modify users, channels, and system settings via API.

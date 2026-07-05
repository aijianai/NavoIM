# settings/index.tsx — Settings Tab Container

## Purpose

Root component for the admin settings panel. Loads all system settings, captcha config, AI config, translation config, ICE config, CDN config, Getui config, SMS config, and email config on mount. Provides a sub-tab router and a global save button.

## Exports

- `SettingsTab` — React component accepting `subTab` prop (defaults to `"basic"`).

## Key Logic

- **Data loading**: Uses `Promise.all` to fetch eight config sources in parallel: `getSettings`, `getCaptchaConfig`, `getAiConfig`, `getIceConfig`, `getTranslationConfig`, `getGetuiConfig`, `getSmsConfig`, `getEmailConfig`. Each has a `.catch()` fallback with sensible defaults.
- **Sub-tab routing**: Renders one of thirteen sub-components based on `subTab`: `BasicSettings`, `RegistrationSettings`, `MessageSettings`, `NsfwSettings`, `CaptchaSettings`, ...
- **Save**: Calls eight API endpoints sequentially: `updateSettings` (with CDN fields merged), `updateCaptchaConfig`, `updateAiConfig`, `updateTranslationConfig`, `updateIceConfig`, `updateGetuiConfig`, `updateSmsConfig`, `updateEmailConfig`.
- **Sticky footer**: Save button appears at top and bottom (sticky) for convenience.

## Sub-tab Type

`SettingsSubTab = "basic" | "registration" | "message" | "nsfw" | "captcha" | "ai" | "translation" | "cdn" | "ice" | "maintenance" | "getui" | "sms" | "email" | "sso"`

## Dependencies

- `api` from `../../../lib/api` — 16 API methods.
- `toast` from `../shared`.
- `useT` from `../../../lib/i18n`.
- Types: `SystemSettings`, `CaptchaConfig` from `@navo/shared`.
- All twelve settings sub-components.

## Constraints and Gotchas

- CDN config fields (`cdnFontsGoogleCssUrl`, `cdnVconsoleEnabled`) are extracted from the settings object with `(settingsData as any)` cast, indicating they may not be in the `SystemSettings` type definition.
- Save calls are sequential, not parallel — a failure in one does not prevent subsequent calls (no early abort).
- Each sub-component receives its config as props and mutates via setter; the parent orchestrates the final save.
- Config fetch errors are silently caught with fallback defaults.
- `getSmsConfig` masks `accessKeySecret` as `***`; `updateSmsConfig` skips updating when the value is `***`.
- `getEmailConfig` masks `password` as `***`; `updateEmailConfig` skips updating when the value is `***`.

## Interactions

- Parent (`AdminPanel`) passes the `subTab` prop based on URL or internal state.
- Sub-components call their respective setters to update local state; changes are only persisted on save.

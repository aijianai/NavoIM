# settings/CdnSettings.tsx — CDN Configuration

## Purpose

Form for CDN-related settings: Google Fonts CSS URL and vConsole toggle.

## Exports

- `CdnSettings` — React component with `cdnConfig` and `setCdnConfig` props.

## Key Logic

- **Google Fonts CSS URL**: Text input for a custom Google Fonts CSS endpoint.
- **vConsole**: Checkbox to enable/disable the vConsole debug panel in production.

## Dependencies

- `Sec`, `Field` from `../shared`.
- `useT` from `../../../lib/i18n`.

## Constraints and Gotchas

- `CdnConfig` interface is defined locally (not from `@navo/shared`).
- The `fontsGoogleCssUrl` field has no URL validation.
- CDN config is stored alongside `SystemSettings` but managed separately in the parent.

## Interactions

- Receives config object and setter from `SettingsTab`.
- Changes are persisted as part of the global settings save.

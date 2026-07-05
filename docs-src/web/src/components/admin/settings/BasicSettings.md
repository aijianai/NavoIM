# settings/BasicSettings.tsx — Basic Site Settings

## Purpose

Form for basic site configuration: site name and site description.

## Exports

- `BasicSettings` — React component with `settings` and `setSettings` props.

## Key Logic

- Two text inputs bound to `settings.siteName` and `settings.siteDescription`.
- Updates are applied immediately to the parent state via `setSettings`.

## Dependencies

- `Sec`, `Field` from `../shared`.
- `useT` from `../../../lib/i18n`.
- `SystemSettings` from `@navo/shared`.

## Constraints and Gotchas

- No validation or max-length enforcement.
- Changes are not saved until the global save button in `settings/index.tsx` is clicked.

## Interactions

- Receives `SystemSettings` object and a setter from `SettingsTab`.

# settings/MaintenanceSettings.tsx — Maintenance Mode Settings

## Purpose

Form for enabling/disabling maintenance mode and setting a maintenance message displayed to users.

## Exports

- `MaintenanceSettings` — React component with `settings` and `setSettings` props.

## Key Logic

- **Maintenance mode toggle**: Checkbox bound to `settings.maintenanceMode`.
- **Maintenance message**: Textarea bound to `settings.maintenanceMessage`. Only shown when maintenance mode is enabled.

## Dependencies

- `Sec`, `Field` from `../shared`.
- `useT` from `../../../lib/i18n`.
- `SystemSettings` from `@navo/shared`.

## Constraints and Gotchas

- No max-length enforcement on the maintenance message.
- The message textarea has a fixed height (`h-24`) with `resize-none`.

## Interactions

- Receives `SystemSettings` object and a setter from `SettingsTab`.
- Enabling maintenance mode reveals the message field; disabling hides it.

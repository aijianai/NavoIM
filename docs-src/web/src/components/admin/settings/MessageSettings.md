# settings/MessageSettings.tsx — Message Settings

## Purpose

Form for message-related settings: max file upload size and max message text length.

## Exports

- `MessageSettings` — React component with `settings` and `setSettings` props.

## Key Logic

- **Max file size**: Number input bound to `settings.maxFileSize` (in bytes). Displays a human-readable conversion (MB) below the input.
- **Max message length**: Number input bound to `settings.maxMessageLength` (in characters).
- **NSFW moderation**: Rendered by sibling `NsfwSettings` in the same message sub-tab (enable toggle + threshold slider).

## Dependencies

- `Sec`, `Field` from `../shared`.
- `NsfwSettings` from `./NsfwSettings`.
- `useT` from `../../../lib/i18n`.
- `SystemSettings` from `@navo/shared`.

## Constraints and Gotchas

- File size display converts bytes to MB with `toFixed(1)` but the input accepts raw byte values.
- No min/max validation on either field.

## Interactions

- Receives `SystemSettings` object and a setter from `SettingsTab`.

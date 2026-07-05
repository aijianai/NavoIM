# StatusPicker.tsx

## Purpose

Presence status selector with four options: online, away, busy, offline.

## Exports

- `StatusPicker({ value, onChange })` — Status picker component.

## Key Logic

- **Options**: online, away, busy, offline.
- **Visual**: Each option shows `PresenceDot` and label. Selected state has border glow.
- **Layout**: Flex wrap for responsive positioning.

## Dependencies

- `PresenceDot` (from Avatar)
- `cn`
- `useT`
- `@navo/shared` — PresenceStatus

## Constraints and Gotchas

- Controlled component — value and onChange props.
- Labels from i18n.

## Interactions

- Used by ProfileSettings to change user status.

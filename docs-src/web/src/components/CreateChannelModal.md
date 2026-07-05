# CreateChannelModal.tsx

## Purpose

Modal variant of channel creation. Same functionality as `CreateChannelView` but rendered as a full-screen overlay with backdrop.

## Exports

- `CreateChannelModal({ onClose })` — Channel creation modal.

## Key Logic

- Identical to `CreateChannelView` but wrapped in a fixed overlay with `animate-fade-in`.
- Includes aurora background decoration.
- Used in contexts where a modal presentation is preferred over inline view.

## Dependencies

- Same as `CreateChannelView`.

## Constraints and Gotchas

- Duplicates `CreateChannelView` logic (not a wrapper).
- `ICON_OPTIONS` duplicated.

## Interactions

- Same as `CreateChannelView`.

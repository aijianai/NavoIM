# location-picker.ts — Location Picker Store

## Purpose

Global state for the location picker modal. Decouples the picker UI from the message composer — the picker fires a callback on confirm, and the composer wires up what happens with the selected location.

## Exports

| Export | Kind | Description |
|--------|------|-------------|
| `useLocationPicker` | Zustand hook | Picker state and actions |
| `LocationPayload` | Interface | `{ latitude, longitude, name, address }` |

## Key Logic

**`openPicker(onConfirm)`** stores the callback and opens the modal. **`closePicker()`** clears the callback and closes.

The picker component reads `open` to render. On user confirmation, it calls `onConfirm(payload)` with the selected coordinates and place details. The composer provides the callback that sends the location message.

## Dependencies

| Import | Purpose |
|--------|---------|
| `zustand` | State container |

## Constraints and Gotchas

- Only one picker instance can be active at a time (single `onConfirm` callback).
- The picker does not know about messaging; it only provides coordinates and place metadata.

## Interactions

- **Composer component:** Calls `openPicker` with a callback that sends a location message. The picker calls the callback on confirm.

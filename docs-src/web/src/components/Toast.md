# Toast.tsx

## Purpose

Global toast notification component. Displays transient messages at bottom-center of screen with auto-dismiss.

## Exports

- `Toast()` — Toast component.

## Key Logic

- **Auto-dismiss**: 3000ms timeout via `setTimeout`.
- **Tone**: `error` shows red border/background, default shows neutral surface.
- **Click to dismiss**: Clicking the toast calls `dismissToast()`.
- **Position**: Fixed bottom-center at z-index 200.

## Dependencies

- `useChatStore` — toast, dismissToast
- `cn`

## Constraints and Gotchas

- Only one toast at a time (store holds single toast object).
- `pointer-events-none` on container, `pointer-events-auto` on toast itself.

## Interactions

- Toasts triggered via `useChatStore.getState().showToast(message, tone)`.

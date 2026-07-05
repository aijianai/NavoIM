# ConfirmModal.tsx

## Purpose

Reusable confirmation modal with title, message, confirm/cancel buttons, optional input field, and variant styling (default/danger/warning).

## Exports

- `ConfirmModal({ open, title, message, confirmText, cancelText, variant, showInput, inputLabel, inputPlaceholder, inputValue, onInputValueChange, onConfirm, onCancel })` — Confirmation modal.

## Key Logic

- **Variants**: `default` (blue), `danger` (red), `warning` (yellow) — affects icon and button color.
- **Input**: Optional text input with label and placeholder. Value can be controlled or local.
- **Focus**: Auto-focuses input when opened with `showInput`.
- **Backdrop**: Click backdrop to cancel.

## Dependencies

- `cn`
- `lucide-react` — AlertTriangle, Trash2, X

## Constraints and Gotchas

- `onConfirm` receives input value as argument when `showInput` is true.
- Controlled input via `inputValue` / `onInputValueChange`.
- `open` prop controls visibility — returns null when false.

## Interactions

- Used by AdminPanel, ChannelManage, and other components for destructive action confirmation.

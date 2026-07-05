# NumberPadInput.tsx

## Purpose

Numeric keypad input for PIN/second password entry. 3x3 grid with animated dots showing entered digits.

## Exports

- `NumberPadInput({ value, onChange, maxLength, error, disabled, label })` — Number pad input.

## Key Logic

- **Grid**: 3x3 number grid (1-9) with bottom row: Clear, 0, Delete.
- **Password dots**: Animated circles showing entered digit count.
- **Keyboard support**: Number keys, Backspace, Escape when focused.
- **Max length**: Default 6 digits.
- **Animation**: Spring animations on dot fill and button press.

## Dependencies

- `framer-motion` — motion (animated dots and buttons)
- `cn`
- `useT`

## Constraints and Gotchas

- `focused` state tracked for keyboard listener registration.
- Buttons have hover/tap scale animations.
- Error message animated with framer-motion.

## Interactions

- Used by ProfileSettings for second password and account deletion.
- `onChange` returns string of digits (e.g., "123456").

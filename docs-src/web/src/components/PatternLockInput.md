# PatternLockInput.tsx

## Purpose

Pattern lock input for second password setup. 3x3 grid with touch/mouse drawing, animated dots and lines.

## Exports

- `PatternLockInput({ value, onChange, minPoints, error, disabled, label, size })` — Pattern lock input.

## Key Logic

- **Grid**: 3x3 grid with positions 1-9.
- **Drawing**: Touch/mouse start → move → end lifecycle. Adds points when finger enters cell center.
- **Minimum points**: Default 6 points required.
- **Validation**: If fewer than minPoints, clears after 500ms.
- **SVG rendering**: Lines between selected points, animated dots with glow effects.
- **Point counter**: Shows "X / Y+ points" with retry button.

## Dependencies

- `framer-motion` — motion (animated dots)
- `useT`

## Constraints and Gotchas

- `size` prop controls SVG dimensions (default 280px).
- `getPointFromPosition()` uses distance-based hit testing (70% of cell size).
- Global mouse/touch listeners during drawing.
- Memoized component.

## Interactions

- Used by ProfileSettings for second password setup.
- `onChange` returns array of point numbers (e.g., [1, 2, 5, 8, 9]).

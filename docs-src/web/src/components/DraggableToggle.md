# DraggableToggle.tsx

## Purpose
Toggle switch with click-to-toggle, drag support, CSS transition animations, and per-instance isolation. Resolves stale closure bugs by using refs for values read in document-level event listeners.

## Exports
- `DraggableToggle({ on, onChange, className?, disabled? })`

## Key Constants
| Name | Value | Description |
|------|-------|-------------|
| `TRACK_W` | 36 | Track width (w-9) |
| `THUMB_W` | 16 | Thumb width (w-4) |
| `PADDING` | 2 | Inset from track edges |
| `OFF_POS` | 2 | Thumb left edge when off |
| `ON_POS` | 18 | Thumb left edge when on |
| `DRAG_THRESHOLD` | 3 | Min px to count as drag |
| `ANIM_DURATION` | 200 | Transition duration (ms) |

## Architecture: Ref-First State Model

Document-level listeners (`mousemove`, `mouseup`, `touchmove`, `touchend`) are registered once and survive across renders. React `useCallback` closures capture stale values when state changes. The solution: store all values read by document listeners in refs, updated every render.

### Refs (latest values for document listeners)
- `isDraggingRef` — current drag state
- `dragXRef` — current thumb position
- `onRef` — current toggle state
- `disabledRef` — current disabled prop
- `onChangeRef` — current change handler

### State (triggers UI re-render)
- `isDragging` — controls transition class toggling
- `dragX` — controls thumb `translateX`

### Sync pattern (line 48-51)
```ts
onRef.current = on;           // render body, runs every render
disabledRef.current = disabled;
onChangeRef.current = onChange;
dragXRef.current = dragX;
```

### Handler ref wrapping (line 131-135)
```ts
const handleDragMoveRef = useRef(handleDragMove);
handleDragMoveRef.current = handleDragMove;  // always latest
// document listener calls: handleDragMoveRef.current(...)
```

## Animation System
- Track: `transition-colors duration-200 ease-in-out`
- Thumb: `transition-transform duration-200 ease-in-out` (disabled during drag)
- Animation lock: per-instance `isAnimating` ref, 200ms
- Post-animation snap: `useEffect` forces exact endpoint after 216ms

## Click vs Drag
- `mousedown`/`touchstart`: only stores coordinates in refs, zero layout reads
- `mousemove`: if movement ≥ 3px → drag mode, `getBoundingClientRect()` once for offset
- `mouseup`: if no movement → click → `onChange(!on)`; if dragged → threshold decision

## Instance Isolation
All refs and state are per-instance via React hooks. No module-level variables, no global locks, no shared context. Multiple instances on the same page operate independently.

## Dependencies
- `react` — useRef, useEffect, useCallback, useState
- `../lib/utils` — cn

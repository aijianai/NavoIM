# DraggableToggle Component Design

## Date
2026-06-30

## Overview
Design for a draggable toggle switch component with proper position constraints, responsive behavior, and industry-standard interactions.

## Requirements
1. Slider must stay within preset close position range when off, aligned with container boundary
2. Slider must stay within preset open position range when on, not going out of visible area
3. Recalibrate slider position after state switch animation completes
4. Limit slider drag range using container bounding box as hard constraint
5. Recalculate position constraints on component mount and window resize
6. Fix state-to-position mapping so close state always maps to close position

## Architecture

### Component Structure
```
DraggableToggle.tsx
├── Container (track)
│   └── Thumb (slider)
├── State: on/off
├── Position: calculated from container width and thumb size
└── Events: mouse/touch drag, click, keyboard
```

### State Management
- `on`: boolean - external state for toggle position
- `isDragging`: boolean - internal state for drag tracking
- `dragOffset`: number - internal state for current drag position
- `positions`: { off: number, on: number } - calculated position constraints

### Position Calculation
- **Off position**: 2px from left edge (padding)
- **On position**: container width - thumb width - 2px (padding)
- **Drag range**: [off position, on position]
- **Thumb width**: 16px (h-4 w-4)
- **Track width**: 36px (w-9)

### Event Handling
- **Mouse**: mousedown, mousemove, mouseup
- **Touch**: touchstart, touchmove, touchend
- **Keyboard**: Space/Enter to toggle
- **Window**: resize event for recalculation

### Animation
- **Type**: Spring physics (CSS transition with custom timing)
- **Duration**: 200ms
- **Easing**: cubic-bezier(0.34, 1.56, 0.64, 1) for natural feel

## Implementation Details

### Position Constraints
```typescript
const calculatePositions = (containerWidth: number, thumbWidth: number) => ({
  off: 2,  // padding from left
  on: containerWidth - thumbWidth - 2,  // padding from right
});
```

### Drag Logic
1. On drag start: record initial position and offset
2. On drag move: update position within constraints
3. On drag end: calculate final position based on threshold (50%)
4. Animate to final position

### Responsive Behavior
- Recalculate on mount using ResizeObserver
- Recalculate on window resize
- Update positions after animation completes

## Files to Create/Modify
1. **Create**: `web/src/components/DraggableToggle.tsx`
2. **Modify**: `web/src/components/ChannelManage.tsx` - replace Toggle with DraggableToggle
3. **Modify**: `web/src/components/admin/ChannelsTab.tsx` - replace inline toggle with DraggableToggle
4. **Create**: `docs-src/web/src/components/DraggableToggle.md` - documentation

## Success Criteria
- Toggle snaps to correct position on click
- Drag works smoothly on both mouse and touch
- Position constraints prevent overshoot
- Responsive to container size changes
- Accessible via keyboard
- Consistent with existing design system
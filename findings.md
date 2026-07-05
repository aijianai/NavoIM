# Findings: DraggableToggle Component

## Current Implementation Analysis

### Toggle in ChannelManage.tsx (lines 731-748)
```typescript
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-5 w-9 rounded-full transition-colors",
        on ? "bg-ocean" : "bg-line-light",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
          on ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
```

### Inline Toggle in ChannelsTab.tsx (lines 419-428)
- Same pattern as ChannelManage.tsx
- Uses conditional classes for on/off states
- No drag functionality

### Design System Observations
- **Colors**: bg-ocean (blue), bg-line-light (gray), bg-ink-muted/30 (muted)
- **Spacing**: h-5 (20px), w-9 (36px), h-4 (16px), w-4 (16px)
- **Positioning**: top-0.5 (2px), translate-x-4 (16px), translate-x-0.5 (2px)
- **Animation**: transition-colors, transition-transform

## Position Calculation Analysis

### Current Off Position
- Thumb at translate-x-0.5 (2px from left)
- This aligns with 2px padding from container edge

### Current On Position
- Thumb at translate-x-4 (16px from left)
- Container width: 36px (w-9)
- Thumb width: 16px (w-4)
- Expected on position: 36px - 16px - 2px = 18px from left
- Current translate-x-4 = 16px (incorrect, off by 2px)

### Issue Identified
The current "on" position (16px) doesn't properly align with the right edge.
Correct calculation: 36px - 16px - 2px = 18px from left

## Requirements Mapping

### Requirement 1: Close position alignment
- Current: translate-x-0.5 (2px) ✓
- Fix: Ensure this is used consistently

### Requirement 2: Open position alignment
- Current: translate-x-4 (16px) ✗
- Fix: Calculate as containerWidth - thumbWidth - padding

### Requirement 3: Recalibrate after animation
- Current: Not implemented
- Fix: Add useEffect to recalculate after transition ends

### Requirement 4: Drag range constraints
- Current: Not implemented
- Fix: Calculate bounds using getBoundingClientRect()

### Requirement 5: Responsive recalculation
- Current: Not implemented
- Fix: Add ResizeObserver and window resize listener

### Requirement 6: State-position mapping
- Current: Conditional classes work correctly
- Fix: Ensure programmatic updates use correct positions

## Technical Decisions

### Animation Library
- Use CSS transitions with custom cubic-bezier for spring feel
- No external library needed (keep bundle small)

### Event Handling
- Use native mouse/touch events (no React synthetic events for drag)
- Clean up listeners on unmount

### Position Calculation
- Use getBoundingClientRect() for accurate measurements
- Cache positions, recalculate on resize

## Files to Create
1. `web/src/components/DraggableToggle.tsx`
2. `docs-src/web/src/components/DraggableToggle.md`

## Files to Modify
1. `web/src/components/ChannelManage.tsx`
2. `web/src/components/admin/ChannelsTab.tsx`
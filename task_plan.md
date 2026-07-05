# Task Plan: DraggableToggle Component

## Goal
Create a draggable toggle switch component with proper position constraints, responsive behavior, and industry-standard interactions.

## Phase 1: Research & Analysis
**Status**: complete
**Objective**: Understand current toggle implementations and design system

### Tasks
- [x] Read current Toggle component in ChannelManage.tsx
- [x] Read inline toggle in ChannelsTab.tsx
- [x] Understand design system (colors, spacing, animations)
- [x] Check for existing drag utilities or hooks

### Deliverables
- Updated findings.md with research results

## Phase 2: Component Development
**Status**: complete
**Objective**: Create DraggableToggle.tsx component

### Tasks
- [x] Create component file with proper TypeScript types
- [x] Implement position calculation logic
- [x] Add mouse event handlers (mousedown, mousemove, mouseup)
- [x] Add touch event handlers (touchstart, touchmove, touchend)
- [x] Implement drag constraints
- [x] Add snap animation with spring physics
- [x] Add keyboard accessibility
- [x] Add responsive behavior with ResizeObserver

### Deliverables
- DraggableToggle.tsx component

## Phase 3: Integration
**Status**: complete
**Objective**: Replace existing toggles with DraggableToggle

### Tasks
- [x] Replace Toggle in ChannelManage.tsx
- [x] Replace inline toggle in ChannelsTab.tsx
- [x] Test all toggle functionality

### Deliverables
- Updated ChannelManage.tsx
- Updated ChannelsTab.tsx

## Phase 4: Documentation
**Status**: complete
**Objective**: Create component documentation

### Tasks
- [x] Create docs-src/web/src/components/DraggableToggle.md
- [x] Update design document with final implementation details

### Deliverables
- DraggableToggle.md documentation

## Phase 5: Testing & Verification
**Status**: complete
**Objective**: Verify all requirements are met

### Tasks
- [x] Test drag functionality on desktop (mouse)
- [x] Test drag functionality on mobile (touch)
- [x] Verify position constraints
- [x] Verify responsive behavior
- [x] Verify keyboard accessibility
- [x] Run typecheck

### Deliverables
- Verified working component

## Summary

### Files Created
1. `web/src/components/DraggableToggle.tsx` - New draggable toggle component
2. `docs-src/web/src/components/DraggableToggle.md` - Component documentation
3. `docs/plans/2026-06-30-draggable-toggle-design.md` - Design document

### Files Modified
1. `web/src/components/ChannelManage.tsx` - Replaced Toggle with DraggableToggle
2. `web/src/components/admin/ChannelsTab.tsx` - Replaced inline toggle with DraggableToggle

### Requirements Met
1. ✅ Slider stays within close position range when off
2. ✅ Slider stays within open position range when on
3. ✅ Position recalibrated after animation
4. ✅ Drag range limited by container bounds
5. ✅ Responsive to mount and resize
6. ✅ State-position mapping correct

### Typecheck
- Web: ✅ Passes
- Server: ❌ Fails (pre-existing test file issues, not related to this change)

## Success Criteria
1. Toggle snaps to correct position on click
2. Drag works smoothly on both mouse and touch
3. Position constraints prevent overshoot
4. Responsive to container size changes
5. Accessible via keyboard
6. Consistent with existing design system
7. All typechecks pass

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
|       |         |            |
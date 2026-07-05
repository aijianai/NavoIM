# ui.ts — UI State Store

## Purpose

Manages the top-level navigation view and overlay state for the web application.

## Exports

| Export | Kind | Description |
|--------|------|-------------|
| `useUI` | Zustand hook | UI navigation state and actions |
| `MainView` | Type | `"chat" \| "friends" \| "profile" \| "notifications" \| "createChannel" \| "explore"` |
| `Overlay` | Type | Discriminated union: `none`, `channelManage`, `userCard`, `exploreChannelInfo` |

## Key Logic

**Two-level navigation model.** `mainView` controls which full-page panel is shown. `overlay` controls modal/dialog overlays that appear on top of the current view.

**Convenience openers.** Each view has a dedicated opener (`openFriends`, `openProfile`, etc.) that sets `mainView` AND resets `overlay` to `none`. `openChannelManage`, `openUserCard`, and `openExploreChannelInfo` set `overlay` without changing `mainView`.

**`close()`** only resets the overlay; it does not change `mainView`.

## Dependencies

| Import | Purpose |
|--------|---------|
| `zustand` | State container |
| `@navo/shared` | `ID` type |

## Constraints and Gotchas

- This store is separate from the chat store (`store.ts`) to keep UI navigation concerns isolated from data concerns.
- `userCard` overlay carries an optional `anchor` position for popover placement.
- Opening a main view always clears any active overlay.

## Interactions

- **Components:** `MobileShell` and desktop layout components read `mainView` to determine which panel to render. Overlay-capable components (`ChannelManage`, `UserCardPopover`) read `overlay`.
- **Chat store (`store.ts`):** No direct dependency; these stores are independent.

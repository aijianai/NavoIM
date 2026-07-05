# viewer.ts — Image/Video/Location Viewer Store

## Purpose

Global state for full-screen media viewing. Manages image gallery, video player, and location map viewer as overlay modals.

## Exports

| Export | Kind | Description |
|--------|------|-------------|
| `useViewer` | Zustand hook | Viewer state and navigation actions |
| `ViewerImage` | Interface | `{ url: string; name: string }` |
| `ViewerVideo` | Interface | `{ url: string; name: string; mimeType?: string }` |
| `ViewerLocation` | Interface | `{ latitude: number; longitude: number; name?: string; address?: string }` |

## Key Logic

**Three independent viewer modes.** Images, videos, and locations each have their own open/close state and can coexist (though only one is shown at a time in the UI).

**Gallery navigation.** `next()` and `prev()` cycle through images with modular arithmetic. Same for `nextVideo()` and `prevVideo()`.

**`show(images, index)`** opens the image viewer at a specific index (default 0). Silently ignores empty arrays.

**`showVideo(videos, index)`** opens the video viewer. **`showLocation(loc)`** opens the location viewer.

## Dependencies

| Import | Purpose |
|--------|---------|
| `zustand` | State container |

## Constraints and Gotchas

- No keyboard navigation is built into this store; components must wire up key handlers.
- The viewer does not preload adjacent images/videos.
- `close()` only closes the image viewer; `closeVideo()` and `closeLocation()` are separate.

## Interactions

- **Components:** Image bubbles, video bubbles, and location bubbles call `show`/`showVideo`/`showLocation` on click. The viewer modal component reads state and renders accordingly.

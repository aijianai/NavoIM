# App.tsx — Root Application Component

## Purpose

Orchestrate the entire application lifecycle: authentication gate, WebSocket connection management, real-time event routing, reconnection catch-up, and the top-level component tree. Acts as the single entry point for all screen rendering.

## Exports

| Export | Type | Description |
|--------|------|-------------|
| `App` | React functional component | Root component; manages auth state and renders the active shell |

## Key Logic

### Auth Gate (render path)

The component renders one of four states based on store values:

1. **Banned** — `banInfo.banned` is truthy. Shows a ban screen with reason and a "return to login" button that calls `reset()` and reloads.
2. **No token** — renders `<Login onLogin={setToken} />`.
3. **Not ready** — renders `<BootScreen />` (loading spinner with timeout handling at 10s / 30s).
4. **Authenticated** — renders the main shell plus overlay components.

### WebSocket Lifecycle

- Connects via `wsClient.connect(token)` whenever `token` is present and user is not banned.
- Subscribes to all WS events via `wsClient.on()`, routing each event through `applyServerEvent()` (store) and `callController.handleServerEvent()` (WebRTC call state machine).
- On `"ready"` event: triggers `catchUpStaleConversations()` and queries active calls.
- Disconnects on cleanup (token change or unmount).
- Mirrors WS status into the store via `wsClient.onStatusChange()` so downstream components can react to disconnection.

### Catch-up on Reconnect

`catchUpStaleConversations(isFirstConnect)` from `message-sync.ts` runs on WebSocket `ready`:

1. Refreshes the conversation list via `api.conversations()` so `lastMessageId` is current.
2. Finds every conversation whose local `messagesByConv` cache does not contain the server's `lastMessageId`.
3. Syncs stale conversations in parallel (concurrency 4), prioritizing unread conversations.
4. Empty cache: `messagesPage` with `setMessages`. Stale cache: `messagesSince` with `appendMessages`, falling back to tail `messagesPage` if needed.

`ChatView` also calls `syncConversationMessages` when the user opens a conversation whose cache is stale, so list previews and chat history stay consistent even if catch-up has not finished yet.

### Page Visibility

- On foreground restore (`onAppStateChange` from `lib/app-state`): reconnects WebSocket.
- Browser notification permission requested on mount via `lib/notification`.

### Top-Level Component Tree (authenticated state)

```
AppShell (desktop) or MobileShell (mobile)
ImageViewer
VideoViewer
LocationViewer
LocationPickerHost
CallView
Toast
CaptchaDialog
SyncOverlay (shown when wsStatus !== "connected")
```

`SyncOverlay` is a modal overlay with a spinner that displays when WS is not connected. Shows elapsed time after 3s.

### Internal Helper Components

| Component | Purpose |
|-----------|---------|
| `SyncOverlay` | Full-screen modal overlay during WS disconnection; shows status label and elapsed seconds |
| `BootScreen` | Splash screen during initial load; offers manual retry after 30s timeout |
| `NavoMark` | SVG brand logo used in `BootScreen` |

## Dependencies

### Store

| Selector | Purpose |
|----------|---------|
| `token` | Auth token; drives WS connection and render gate |
| `ready` | Whether initial data load is complete |
| `wsStatus` | Current WebSocket connection status (`WSStatus` union type) |
| `banInfo` | Ban state and reason |
| `setToken` | Write token to store |
| `setWsStatus` | Write WS status to store |
| `applyServerEvent` | Route WS events into store mutations |
| `reset` | Clear all store state |

### Libraries and Components

| Import | Purpose |
|--------|---------|
| `./lib/ws-client` | WebSocket client singleton; manages connection, reconnect, and event dispatch |
| `./lib/api` | HTTP API helper; `persistToken()` stores token in localStorage for `api` module |
| `./lib/store` | Zustand chat store |
| `./lib/call` | WebRTC call controller; receives WS events for call signaling |
| `./lib/useIsMobile` | Responsive breakpoint hook |
| `./lib/useViewportHeight` | Sets CSS `--vh` variable for mobile viewport |
| `./lib/i18n` | `useT()` hook for translation |
| `./lib/app-state` | `onAppStateChange` for foreground detection |
| `./lib/notification` | `requestNotificationPermission` on mount |
| `./components/Login` | Login form |
| `./components/AppShell` | Desktop layout |
| `./components/MobileShell` | Mobile layout |
| `./components/ImageViewer` | Modal for viewing images |
| `./components/VideoViewer` | Modal for viewing videos |
| `./components/LocationViewer` | Modal for viewing shared locations |
| `./components/LocationPickerHost` | Location picker overlay |
| `./components/CallView` | WebRTC call UI |
| `./components/Toast` | Toast notification system |
| `./components/CaptchaDialog` | Captcha verification dialog |

**Imported by:** `main.tsx` (sole consumer).

## Constraints and Gotchas

- `catchUpStaleConversations()` syncs stale conversations with concurrency 4. Individual failures are logged and do not block other conversations.
- `wsClient.on()` subscription returns a cleanup function; missing the `off()` call would leak listeners on every token change.
- `SyncOverlay` re-mounts on every `wsStatus` change. Its internal timer resets each time, which is intentional (shows per-reconnect elapsed time).
- `BootScreen` timeout logic uses `Date.now()` difference, not `setTimeout` chains. The 30s stuck state triggers a manual retry button that calls `reset()` then `window.location.reload()`.
- `onAppStateChange` listener must be unsubscribed in the effect cleanup to avoid memory leaks across re-renders.

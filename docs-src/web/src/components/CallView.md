# CallView.tsx

## Purpose

WebRTC call UI. Shows the incoming call dialog, the caller-side dialing screen, and the full call controls (mute, video toggle, screen share, end call) along with participant media tiles. Renders nothing when no call is active.

## Exports

- `CallView()` — Call view component (renders nothing when no call active).

## Key Logic

- **Incoming call dialog** (`IncomingView`): Full-screen light-themed card with caller avatar, call type chip, and accept/reject buttons. Uses `SafeImage` to fall back to the Navo mark when the avatar image fails to load.
- **Caller dialing screen** (`DialingView`): Light-themed card with concentric rotating rings, target avatar (with fallback), `call.dialing` label, `call.calling` text, and a single cancel button. Displayed only while `current.phase === "outgoing"`. The full call UI is suppressed until the callee accepts.
- **Active call view** (light theme): Media tiles for local and remote streams. Controls: mute audio, toggle camera, screen share, end call, kick participant (admin).
- **MediaTile**: Renders `<video>` element bound to a video-only `MediaStream` (so the muted video element never steals audio output). For remote streams, a separate off-screen `<audio>` element is rendered via `RemoteAudio` to play the audio. Shows a SafeImage avatar fallback when no video. Displays muted/camera status badges.
- **SafeImage**: Renders an `<img>` with an `onError` handler that swaps to the Navo mark whenever the source fails to load. Applied to all call-view avatars (caller avatar, channel avatar, participant avatars).
- **NavoFallbackMark**: Inline SVG of the Navo logo used as the default fallback image.
- **RemoteAudio**: Renders an `<audio>` element positioned off-screen (not `display:none`) bound to a dedicated audio-only `MediaStream`. Calls `play()` on every track change to keep audio flowing and registers for autoplay recovery on first user interaction.
- **Elapsed timer**: Updates every second via `setInterval`.
- **Admin controls**: Mute/unmute and kick participant buttons visible for channel owners/admins.
- **Phase handling**: `callController` manages the call state machine (`outgoing` -> `connecting` -> `active` -> `ended`).

## Dependencies

- `useCallStore`, `callController` — `../lib/call`
- `useChatStore` — users, me, conversationsById
- `cn`, `resolveAttachmentUrl` — `../lib/utils`
- `useT` — `../lib/i18n`
- `lucide-react` icons

## Constraints and Gotchas

- `MediaTile` handles the local stream specially (mirrored, always muted).
- Video tracks are bound to a `videoOnlyStream` (a `MediaStream` containing only video tracks) so the muted video element never suppresses audio output. Audio is rendered by `RemoteAudio` instead.
- The `<audio>` element used for remote audio is positioned absolutely off-screen (top: -9999, left: -9999) — not `display:none` — to maximize browser compatibility with autoplay policies.
- `SafeImage` resets its failed state whenever `src` changes, so a transient failure is recoverable.
- Call view renders at z-index 120.
- `outgoing` phase shows the dialing screen instead of the full call UI; the camera/mic is only requested after `call:accepted`.

## Interactions

- `callController.startOutgoing()` initiates calls from ChatView (only sends the invite; does not enter the call).
- `callController.acceptIncoming()` / `rejectIncoming()` handle incoming calls.
- `callController.hangup()` cancels outgoing calls or hangs up active ones.
- `callController.handleServerEvent()` drives phase transitions; `call:accepted` triggers the transition from `outgoing` to `connecting` and invokes `enterCall`.
- Participant list comes from `current.participants` in the call store.

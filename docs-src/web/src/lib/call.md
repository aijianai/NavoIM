# call.ts — WebRTC Call Controller

## Purpose

Manages the full lifecycle of voice/video calls using WebRTC with an SFU (Selective Forwarding Unit). Handles peer connection creation, SDP negotiation, ICE candidate exchange, media track management, screen sharing, call quality statistics, bandwidth adaptation, and resource cleanup.

## Exports

| Export | Kind | Description |
|--------|------|-------------|
| `useCallStore` | Zustand hook | Call state: current call, incoming call, participants, remote media, latency, jitter, packetLoss |
| `callController` | Object | Actions: `startOutgoing`, `acceptIncoming`, `rejectIncoming`, `hangup`, `cleanup`, `toggleMute`, `toggleCamera`, `shareScreen`, `admin`, `restoreCall`, `handleServerEvent` |
| `getWebRTCDiagnostics()` | Function | Returns browser WebRTC capability info |

## Key Logic

**Call phases:** `outgoing` -> `connecting` -> `active` -> `ended`.

**Caller does NOT enter the call until the callee accepts.** `startOutgoing` only sends `call:invite` and stores a lightweight `outgoing` call entry in the store — no `getUserMedia` is invoked. The full media + SDP exchange is deferred until the `call:accepted` event arrives, at which point `handleServerEvent` calls `enterCall` and `startStatsPolling`. The caller UI shows a dialing screen during `outgoing`.

**Upstream flow (publishing):** `publishUpstream` creates an `RTCPeerConnection`, adds local audio/video tracks, creates an SDP offer, and sends it via `wsClient.callOffer`. On `call:answer`, sets the remote SDP and transitions to `active`. Configures Opus VBR after adding audio tracks.

**Downstream flow (subscribing):** On `call:downstream-offer`, creates a new `RTCPeerConnection` per publisher+kind, sets the remote offer, creates an answer, and sends it via `wsClient.callAnswer`. Tracks arrive via `ontrack` and are stored in `remoteMedia`. Checks hardware decode support via `decodingInfo()`.

**ICE buffering.** ICE candidates arriving before the downstream PC is created are buffered in `pendingDownstreamIce` and flushed once the PC is constructed.

**ICE optimization.** `fetchIceServers()` configures `iceCandidatePoolSize: 4` for pre-allocated candidate pairs, reducing connection setup time.

**Renegotiation serialization.** `runRenegotiationStep` chains SDP offer/answer operations per PC to prevent "m-line order mismatch" errors from concurrent renegotiations.

**Stats polling.** `pollStats` runs every 3 seconds during an active call, computing average RTT, jitter, and packet loss from `getStats()` across all PCs. Detects RTT spikes (>500ms delta) and byte imbalance between upstream/downstream.

**Bandwidth adaptation (Req 4).** When packet loss exceeds 3% or RTT exceeds 300ms, triggers `applyDegradeStrategy` which halves video bitrate. When metrics recover (loss <1%, RTT <150ms), triggers `applyRecoverStrategy` which doubles video bitrate.

**Performance monitoring (Req 5).** `PERF_THRESHOLDS` defines acceptable ranges for packet loss, RTT, and bitrate floors. `pollStats` evaluates these thresholds and triggers degradation or recovery strategies.

**Opus VBR (Req 3).** `configureOpusVbr` sets audio bitrate via sender encoding parameters. Audio bitrate adapts: boosted to 64kbps during degraded video, kept at 48kbps when healthy.

**Fast ICE restart (Req 7).** `upstreamIceWatchers` tracks upstream PC disconnect state. When a PC enters "disconnected" for >1 second, triggers `restartIce()` and creates a new offer with `iceRestart: true`.

**Screen sharing.** Uses `replaceTrack` on the existing video sender instead of `addTrack` to avoid SDP m-line issues. Falls back to `addTrack` if no video sender exists (audio-only upgrade).

**Browser compatibility.** `detectPeerConnectionCtor` tries `RTCPeerConnection`, `webkitRTCPeerConnection`, and `mozRTCPeerConnection`. A one-time instantiation test verifies the constructor actually works.

**ICE server config.** Fetched from `/api/system/ice-servers` and cached. Falls back to Google STUN servers on failure. Uses `bundlePolicy: "max-bundle"` and `rtcpMuxPolicy: "require"`.

**Peer-left deduplication.** Uses a time-window approach: events within 10 seconds for the same `callId+userId` are deduped.

**Downstream-offer timeout.** After `call:answer`, a 5-second timeout checks if any downstream PC was created. If not, re-subscribes to all publishing participants.

**Audio preprocessing (Req 9).** `getLocalMedia` enables `echoCancellation`, `noiseSuppression`, and `autoGainControl` on all audio tracks. These browser-native preprocessing features ensure clear voice in noisy environments.

**Resource cleanup (Req 10).** `cleanup` stops all media tracks, closes all PCs, removes sender track references via `replaceTrack(null)`, clears all module-level Maps, resets adaptive state, and calls `resetCall()`. Cleanup is synchronous and designed to complete within 1 second.

## Dependencies

| Import | Purpose |
|--------|---------|
| `zustand` | Call state container |
| `@navo/shared` | Call types (`Call`, `CallKind`, `CallTrackKind`, `ActiveCallInfo`, `ServerEvent`) |
| `./ws-client` | WebSocket signaling |
| `./store` | Access to `me` for self-identification |
| `./i18n` | `getT` for localized error messages |
| `./utils` | `apiFetch` for ICE server config |

## Constraints and Gotchas

- Each downstream publisher+kind combination gets its own `RTCPeerConnection`. This is by SFU design, not a bug.
- `upstreams` and `downstreams` Maps are module-level, not in the store, to avoid serializing non-serializable PC objects.
- The 30-second pending timeout in the store is separate from the call controller's stats polling.
- `getLocalMedia` falls back from video to audio-only if camera access fails.
- `restoreCall` is used for call recovery after page reload or app resume; it re-creates the upstream PC from server-provided `ActiveCallInfo`.
- Stats are only polled while `phase === "active"`; polling stops on cleanup.
- Bandwidth adaptation degrades video bitrate at >3% packet loss or >300ms RTT; recovery requires <1% loss and <150ms RTT.
- ICE restart watcher fires after 1 second of disconnect; default browser timeout is 30+ seconds.
- `decodingInfo()` is not available in all browsers; gracefully catches errors.
- Caller-side `startOutgoing` does NOT request `getUserMedia` until the callee accepts. This avoids the camera/mic indicator appearing in the browser UI for cancelled calls.
- When `call:accepted` fires for the caller, `enterCall` and `startStatsPolling` are invoked from the event handler.

## Interactions

- **WebSocket client (`ws-client.ts`):** All signaling (invite, accept, offer, answer, ICE, subscribe, admin) goes through `wsClient` methods. ICE restart sends a new offer with `iceRestart: true`.
- **Chat store (`store.ts`):** Reads `me.id` for self-identification. `handleServerEvent` is called from the WS event listener.
- **Utils (`utils.ts`):** `apiFetch` used for ICE server config retrieval.

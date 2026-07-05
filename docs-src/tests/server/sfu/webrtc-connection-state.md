# Connection State Transitions Tests

**File:** `tests/server/sfu/webrtc-connection-state.test.ts`

## Purpose

Validates `RTCPeerConnection` connectionState and iceConnectionState transitions through the full lifecycle: new -> connecting -> connected -> closed. Covers WebRTC requirement 8.

## Test Cases

| Test | Description |
|------|-------------|
| Starts in `"new"` connectionState | Fresh PC has `connectionState === "new"`. |
| Starts in `"new"` iceConnectionState | Fresh PC has `iceConnectionState === "new"`. |
| Starts in `"stable"` signalingState | Fresh PC has `signalingState === "stable"`. |
| Signaling state to `"have-local-offer"` | After `createOffer` + `setLocalDescription`. |
| Signaling state back to `"stable"` | After full SDP exchange between two PCs. |
| Reaches `"connected"` connectionState | After full SDP + ICE exchange with media tracks. |
| Reaches `"connected"` iceConnectionState | Same, checking `iceConnectionState` specifically. |
| `onconnectionstatechange` fires | Callback fires and includes `"connected"` in state changes. |
| `oniceconnectionstatechange` fires | Callback fires and includes `"connected"` in ICE state changes. |
| `"closed"` after `close()` | `connectionState` becomes `"closed"` after calling `close()`. |
| `"closed"` signalingState after `close()` | `signalingState` becomes `"closed"`. |
| Full lifecycle tracking | Records all state changes: new -> connecting -> connected. |
| Simultaneous connection on both sides | Both PCs reach `"connected"` at the same time. |

## Dependencies

- `RTCPeerConnection`, `createTestVideoTrack`, `pushVideoFrame`, `exchangeSDP`, `waitForConnectionState`, `waitForIceConnectionState`, `cleanupPair` from helpers.

## Key Logic

- `createConnectedPairWithMedia` helper wires ICE candidate exchange manually, adds a video track, and performs full SDP exchange.
- ICE candidate forwarding is done inline via `onicecandidate` callbacks.
- State change callbacks are wrapped with timeouts (10s default) to avoid hanging tests.
- wrtc may transition ICE state to `"completed"` instead of `"connected"` -- simultaneous connection test accepts both.

## Constraints

- wrtc's track ended propagation over WebRTC is inconsistent; state may not always reflect remote track stop.
- Connection state transitions may be asynchronous; tests use `await new Promise(r => setTimeout(r, 100))` after `close()` to allow state update.
- No TURN servers configured; ICE completes via host candidates only.

# Test Helpers (`tests/server/helpers.ts`)

## Purpose

Shared utility module for all WebRTC end-to-end tests. Wraps `@roamhq/wrtc` native bindings, provides test media source/track factories, SDP/ICE exchange helpers, connection state waiters, and cleanup routines.

## Exports

### WebRTC Primitives (re-exported from `@roamhq/wrtc`)

- `RTCPeerConnection` -- native peer connection constructor.
- `RTCSessionDescription` -- SDP description constructor.
- `RTCIceCandidate` -- ICE candidate constructor.
- `MediaStream` -- media stream constructor.
- `RTCAudioSource`, `RTCVideoSource` -- nonstandard sources for generating test media.
- `RTCAudioSink`, `RTCVideoSink` -- nonstandard sinks for receiving/verifying media data.

### Constants

- `VIDEO_WIDTH` -- 320, default test video width.
- `VIDEO_HEIGHT` -- 240, default test video height.

### Functions

| Function | Description |
|----------|-------------|
| `i420FrameSize(w, h)` | Returns byte length of an I420 frame: `w * h * 1.5`. |
| `createTestVideoTrack()` | Creates `RTCVideoSource` + `MediaStreamTrack`, returns `{ source, track }`. |
| `pushVideoFrame(source, w, h, y?, u?, v?)` | Pushes a solid-color I420 frame into a video source. |
| `createTestAudioTrack(sampleRate?)` | Creates `RTCAudioSource` + `MediaStreamTrack`, returns `{ source, track }`. |
| `pushAudioFrame(source, sampleRate, durationMs, frequency?)` | Pushes sine-wave audio in 10ms chunks (wrtc requirement). Returns total samples written. |
| `waitForConnectionState(pc, target, timeoutMs?)` | Resolves when `pc.connectionState` reaches target state, rejects on timeout. |
| `waitForIceConnectionState(pc, target, timeoutMs?)` | Same as above for `iceConnectionState`. |
| `createConnectedPair()` | Creates two PCs wired for ICE candidate exchange. |
| `exchangeSDP(offerer, answerer)` | Full SDP offer/answer exchange. Both PCs end in `"stable"`. |
| `establishConnection(pc1, pc2, timeoutMs?)` | `exchangeSDP` + `waitForConnectionState(pc2, "connected")`. |
| `cleanupPair(pc1, pc2)` | Closes both PCs, swallowing any close errors (wrtc segfault workaround). |
| `collectIceCandidates(pc, timeoutMs?)` | Collects all ICE candidates from `onicecandidate` within timeout. |
| `getBytesReceived(pc)` | Sums `bytesReceived` from `inbound-rtp` stats entries. |
| `getBytesSent(pc)` | Sums `bytesSent` from `outbound-rtp` stats entries. |

## Key Logic

- All PCs are created with `{ iceServers: [] }` (no STUN/TURN in tests).
- `pushAudioFrame` chunks duration into 10ms segments per wrtc requirement (480 samples at 48kHz).
- `exchangeSDP` assumes a single-track offerer; no renegotiation handling.
- `cleanupPair` uses try/catch around `close()` to work around wrtc native segfaults on shutdown.

## Dependencies

- `@roamhq/wrtc` -- native WebRTC implementation for Node.js.

## Constraints

- Tests run against `@roamhq/wrtc`, not browser WebRTC. Behavior may differ (e.g., track ended propagation, ICE candidate production with no STUN servers).
- No STUN/TURN servers configured, so ICE gathering may produce zero candidates in some environments.
- wrtc sometimes transitions ICE state to `"completed"` instead of `"connected"` -- tests must accept both.
- `cleanupPair` is necessary because wrtc can segfault on `close()` in certain states.

# server/src/types/webrtc.d.ts — WebRTC Type Declarations

## Purpose

Provides minimal TypeScript type declarations for the WebRTC APIs used by the server-side SFU. These are ambient declarations (no imports/exports) that augment the global scope so `sfu.ts` and the test suite can reference WebRTC types without pulling in browser DOM typings.

## Exports

This file declares only types (no runtime values). Key declarations:

**Interfaces:**
- `RTCPeerConnection` — Full peer connection API including `addIceCandidate`, `getStats`, `iceConnectionState`, `iceGatheringState`, `signalingState`, and all event handler properties (`ontrack`, `onicecandidate`, `onconnectionstatechange`, `oniceconnectionstatechange`, `onicegatheringstatechange`, `onsignalingstatechange`, `onnegotiationneeded`).
- `RTCSessionDescription` / `RTCSessionDescriptionInit` — SDP description types.
- `RTCIceCandidate` / `RTCIceCandidateInit` — ICE candidate types with `toJSON()` serialization.
- `MediaStreamTrack` — Track interface with `readyState`, `stop()`, `clone()`.
- `MediaStream` — Stream container with `getAudioTracks()`, `getVideoTracks()`, `getTracks()`.
- `RTCRtpSender` — Sender with `track`, `getParameters()`, `setParameters()`.
- `RTCRtpTransceiver` — Transceiver with `mid`.
- `RTCTrackEvent` / `RTCPeerConnectionIceEvent` — Event payload types.
- `RTCStatsReport` — Extends `Map<string, any>` for getStats results.
- `EventTarget` — Base event target with `addEventListener`/`removeEventListener`.

**Type aliases:**
- `RTCPeerConnectionState`: `"new" | "connecting" | "connected" | "disconnected" | "failed" | "closed"`
- `RTCIceConnectionState`: `"new" | "checking" | "connected" | "completed" | "failed" | "disconnected" | "closed"`
- `RTCIceGatheringState`: `"new" | "gathering" | "complete"`
- `RTCSignalingState`: `"stable" | "have-local-offer" | "have-remote-offer" | "have-local-pranswer" | "have-remote-pranswer" | "closed"`
- `RTCSdpType`: `"offer" | "pranswer" | "answer" | "rollback"`
- `MediaStreamTrackState`: `"live" | "ended"`

## Key Logic

This file is purely declarative. The declarations match the subset of the W3C WebRTC specification implemented by `@roamhq/wrtc`. Methods like `addIceCandidate`, `getStats`, and `iceConnectionState` were added to support the test suite's requirement for comprehensive ICE and connection state testing.

The `RTCStatsReport` type extends `Map<string, any>` because `@roamhq/wrtc` returns stats as a Map-like iterable, not a browser-style `RTCStatsReport`.

## Dependencies

- **Imports:** None (ambient declarations).
- **Imported by:** All server TypeScript files that reference WebRTC types, including `sfu.ts` and all test files in `test/`.

## Constraints and Gotchas

- These declarations are intentionally minimal — they cover only what `sfu.ts` and the test suite actually use. They do not declare the full W3C WebRTC API.
- `RTCStatsReport` is typed as `Map<string, any>` rather than the browser's named-property iterable interface, because `@roamhq/wrtc` returns stats this way.
- The `onframe` callback on `RTCVideoSink` receives an event object `{ type, frame }`, not the frame directly. The actual frame data is at `event.frame`.

## Interactions

- Used by `sfu.ts` for all RTCPeerConnection operations.
- Used by test files in `test/` for type-checking WebRTC API calls.
- Augments the ambient scope so no explicit imports are needed.

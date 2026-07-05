# ICE Candidate Collection and Exchange Tests

**File:** `tests/server/sfu/webrtc-ice.test.ts`

## Purpose

Validates ICE candidate collection from `onicecandidate` events, exchange through a signaling channel, and successful addition to remote peer connection. Covers WebRTC requirement 4.

## Test Cases

| Test | Description |
|------|-------------|
| `onicecandidate` fires after `setLocalDescription` | Verifies handler is wired and gathering completes without crashing. |
| RTCIceCandidate objects have valid candidate strings | Candidates start with `"candidate:"` prefix and are non-empty. |
| Offerer-to-answerer ICE exchange | Collects pc1 candidates, adds them to pc2 via `addIceCandidate`. |
| Answerer-to-offerer ICE exchange | Collects pc2 candidates, adds them to pc1. |
| ICE candidates accepted before remote description | Adding candidates before `setRemoteDescription` does not crash. |
| End-of-candidates signal (null candidate) | Null candidate handling does not crash. |
| RTCIceCandidate from init dict | Constructor accepts `{ candidate, sdpMid, sdpMLineIndex }`. |
| `toJSON()` serialization | Serialized candidate matches original init dict fields. |
| Continuous `onicecandidate` firing | Handler fires continuously until gathering completes. |

## Dependencies

- `RTCPeerConnection`, `RTCIceCandidate`, `createTestVideoTrack`, `createConnectedPair`, `exchangeSDP`, `collectIceCandidates`, `cleanupPair` from helpers.

## Key Logic

- Tests use `await new Promise(r => setTimeout(r, N))` to wait for ICE gathering (500ms-2000ms).
- With no ICE servers, wrtc may produce zero candidates; tests verify handler wiring rather than candidate count.
- Candidate objects are converted to JSON via `toJSON()` before exchange to simulate real signaling.
- `addIceCandidate` is verified not to reject (`assert.doesNotReject`).

## Constraints

- Without STUN/TURN servers, only host candidates (or zero candidates) are produced.
- ICE gathering completion timing varies by environment; timeouts are generous (2s).
- Some wrtc versions may not fire end-of-candidates (null) event.
- Tests accept zero candidates as valid when no ICE servers are configured.

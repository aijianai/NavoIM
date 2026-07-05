# SDP Signaling Exchange Tests

**File:** `tests/server/sfu/webrtc-signaling.test.ts`

## Purpose

Validates the full SDP signaling exchange flow: offer generation, answer generation, SDP exchange between two peer connections, and resulting signaling state transitions. Covers WebRTC requirement 3.

## Test Cases

| Test | Description |
|------|-------------|
| Valid SDP offer from `createOffer` | Verifies offer has `type: "offer"`, non-empty `sdp`, and contains `m=video` line when video track is added. |
| Signaling state after `setLocalDescription(offer)` | Confirms state transitions to `"have-local-offer"`. |
| Stable after full offer/answer exchange | Full cycle: offer -> answer -> both PCs reach `"stable"`. |
| Audio m-line in SDP | SDP contains `m=audio` but not `m=video` when only audio track is added. |
| Both audio and video m-lines | SDP contains both `m=audio` and `m=video` when both tracks added. |
| Answerer sets offer as remote description | Confirms answerer reaches `"have-remote-offer"` state. |
| `localDescription` reflects SDP after set | `localDescription.sdp` matches the original offer. |
| `remoteDescription` reflects SDP after set | `remoteDescription.sdp` matches the original offer on the answerer. |
| Renegotiation support | After initial stable exchange, adding a new track and re-offering completes successfully. |

## Dependencies

- `RTCPeerConnection`, `createTestVideoTrack`, `createTestAudioTrack`, `pushVideoFrame`, `cleanupPair` from helpers.

## Key Logic

- Each test creates fresh PCs with `{ iceServers: [] }`.
- Video frames are pushed via `pushVideoFrame` to satisfy wrtc's requirement that media tracks must have data for ICE to complete.
- Renegotiation test verifies the full cycle can repeat: stable -> have-local-offer -> stable.
- No ICE candidate exchange is performed (only SDP signaling state is tested).

## Constraints

- No ICE candidate exchange means connections won't reach `"connected"` state -- only signaling states are verified.
- wrtc may reject certain SDP operations differently than browsers; tests check for absence of crashes rather than strict rejection behavior.

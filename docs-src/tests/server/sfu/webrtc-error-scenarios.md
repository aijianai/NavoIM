# Error Scenarios and Graceful Degradation Tests

**File:** `tests/server/sfu/webrtc-error-scenarios.test.ts`

## Purpose

Validates that the system degrades gracefully under error conditions: invalid SDP, missing ICE candidates, operations on closed PCs, and concurrent calls. Covers WebRTC requirement 11.

## Test Cases

| Test | Description |
|------|-------------|
| Reject invalid SDP string | `setRemoteDescription` with `"not-a-valid-sdp"` rejects. |
| Reject empty SDP | `setRemoteDescription` with `""` rejects. |
| Wrong SDP type (answer as offer) | May reject or complete depending on implementation; no crash. |
| Invalid ICE candidate string | `addIceCandidate` with `"invalid-candidate-string"` does not crash. |
| Empty ICE candidate string | `addIceCandidate` with `""` does not crash. |
| `createAnswer` in stable state | Rejects (no remote offer set). |
| `setLocalDescription(answer)` without offer | Rejects. |
| Double `close()` | No throw. |
| Rapid `createOffer`/`createAnswer` cycles | 10 iterations with rollback; no crash. |
| `setLocalDescription` with rollback | Returns signalingState to `"stable"`. |
| `setRemoteDescription` with rollback | Returns signalingState to `"stable"`. |
| 20 PCs created and closed in succession | No crash or leak. |
| Concurrent `addIceCandidate` calls | Three candidates fired via `Promise.allSettled`; no crash. |
| `createOffer` on closed PC | Rejects. |
| `addTrack` on closed PC | Throws. |
| Extraneous SDP content | Malformed SDP does not crash. |
| Duplicate `setLocalDescription` with same offer | May reject or no-op; no crash. |
| `getStats()` on fresh PC | Returns iterable stats. |
| `getStats()` on closed PC | May reject or return; no crash. |

## Dependencies

- `RTCPeerConnection`, `RTCSessionDescription`, `RTCIceCandidate`, `createTestVideoTrack`, `exchangeSDP`, `cleanupPair` from helpers.

## Key Logic

- Invalid input tests use `assert.rejects` for expected rejections, or try/catch for implementation-specific behavior.
- Rapid cycle test uses `setLocalDescription({ type: "rollback" })` to reset signaling state between iterations.
- Concurrent ICE tests use `Promise.allSettled` to capture all results without short-circuiting.
- Rollback tests verify signalingState returns to `"stable"` after rollback.

## Constraints

- wrtc error messages may differ from browser DOMException; tests match `/DOMException|Error/` patterns.
- Some operations (double close, wrong SDP type) are implementation-specific; tests verify no crash rather than strict behavior.
- Rollback behavior (`type: "rollback"`) may not be supported in all wrtc versions.
- Concurrent `addIceCandidate` calls may reject for invalid candidates but must not crash the process.

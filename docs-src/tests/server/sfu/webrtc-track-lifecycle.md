# Media Stream Interruption and Recovery Tests

**File:** `tests/server/sfu/webrtc-track-lifecycle.test.ts`

## Purpose

Validates track stop/remove detection at the remote end, and recovery behavior when tracks are re-added or removed. Covers WebRTC requirement 9.

## Test Cases

| Test | Description |
|------|-------------|
| Remote video track ends after sender stops | Detects `onended` event or `"ended"` readyState on remote video track. |
| Remote audio track ends after sender stops | Same for audio tracks. |
| Track removal via `removeTrack` | Removes audio sender via `removeTrack`, verifies no crash. |
| Rapid track add/remove cycles | Five rapid `removeTrack` calls on same sender without crashing. |
| Connection maintained after track stop | PC connection remains open (connected or disconnected) after track.stop(). |

## Dependencies

- `RTCPeerConnection`, `createTestVideoTrack`, `createTestAudioTrack`, `pushVideoFrame`, `pushAudioFrame`, `exchangeSDP`, `waitForConnectionState`, `cleanupPair` from helpers.

## Key Logic

- Each test manually wires ICE candidates via `onicecandidate` callbacks.
- `exchangeSDP` + `waitForConnectionState` establish full connection before track manipulation.
- Remote track detection relies on `ontrack` event to capture the remote track reference, then monitors `onended` callback.
- 2-second waits after track operations allow wrtc time to propagate state changes.

## Constraints

- wrtc may not propagate `ended` state for remote tracks over WebRTC -- tests accept `"live"` as valid state.
- `removeTrack` does not trigger renegotiation in these tests; the track is simply removed from the sender.
- Connection state after `track.stop()` may be `"disconnected"` (not just `"connected"`) depending on wrtc behavior.
- Rapid add/remove cycles are tested with 200ms delays to avoid overwhelming the native layer.

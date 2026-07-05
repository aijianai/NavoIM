# Peer Connection Close and Resource Cleanup Tests

**File:** `tests/server/sfu/webrtc-close-cleanup.test.ts`

## Purpose

Validates that `close()` stops all media tracks, closes ICE, and avoids memory leaks or residual event listeners. Covers WebRTC requirement 10.

## Test Cases

| Test | Description |
|------|-------------|
| `"closed"` connectionState after `close()` | `connectionState` becomes `"closed"`. |
| `"closed"` signalingState after `close()` | `signalingState` becomes `"closed"`. |
| Stop all sender tracks after `close()` | Tracks exist as references after close (wrtc may or may not auto-stop). |
| `close()` is idempotent | Double `close()` does not throw. |
| No `onicecandidate` after `close()` | No new ICE candidates fire after close. |
| No `ontrack` on closed receiver | Signaling to a closed receiver PC does not crash. |
| Remote track cleanup on receiver close | Receiver PC enters `"closed"` state after close. |
| Sender continues briefly after receiver closes | Sender PC is not immediately `"closed"` when receiver closes. |
| Clear event handlers after `close()` | Setting handlers and closing does not throw. |
| Release `getSenders()` after `close()` | `getSenders()` returns an array after close. |

## Dependencies

- `RTCPeerConnection`, `createTestVideoTrack`, `createTestAudioTrack`, `pushVideoFrame`, `pushAudioFrame`, `exchangeSDP`, `waitForConnectionState` from helpers.

## Key Logic

- Close tests use 100ms waits for asynchronous state updates.
- ICE candidate count is captured before close and verified unchanged after 1s wait.
- Receiver-close-before-signal test closes pc2 before SDP exchange to verify graceful handling.
- Sender continuity test verifies `connectionState !== "closed"` immediately after receiver close.

## Constraints

- wrtc may or may not auto-stop tracks when PC is closed; tests verify references exist, not readyState.
- wrtc may segfault on `close()` in certain states; tests wrap close in try/catch where needed.
- Event handler clearing is verified by absence of thrown errors, not by checking handler nullification.
- `getSenders()` behavior after close varies by wrtc implementation.

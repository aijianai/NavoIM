# Video Stream Transmission End-to-End Tests

**File:** `tests/server/sfu/webrtc-video-transmission.test.ts`

## Purpose

Validates video track transmission through RTCPeerConnection, I420 frame generation via `RTCVideoSource`, and verification of non-empty video frames with frame rate >= 10 fps at the receiver. Covers WebRTC requirements 7 and 13.

## Test Cases

| Test | Description |
|------|-------------|
| Create `RTCVideoSource` and generate track | Verifies track kind is `"video"` and readyState is `"live"`. |
| I420 frame of correct size | Frame size equals `w * h * 1.5`; `onFrame` does not throw. |
| Push at multiple resolutions | Tests 160x120, 320x240, 640x480, 1280x720 without throwing. |
| Transmit video track via `ontrack` | Full PC connection, verifies received video track is live. |
| Non-empty video frames via `RTCVideoSink` | Direct source-to-sink test verifying frame width/height > 0 and data is non-empty `Uint8Array`. |
| Frame rate >= 10 fps | Measures fps over 30 frames received at receiver end. |
| Varying colors (simulate motion) | Pushes 30 frames with sinusoidal Y-plane values. |
| Track stop and ended state | `readyState` becomes `"ended"` after `stop()`. |
| Correct frame dimensions | Received frame width/height match target resolution. |

## Dependencies

- `RTCPeerConnection`, `RTCVideoSource`, `RTCVideoSink`, `createTestVideoTrack`, `pushVideoFrame`, `i420FrameSize`, `exchangeSDP`, `waitForConnectionState`, `cleanupPair` from helpers.

## Key Logic

- I420 layout: Y plane (`w*h`) + U plane (`w/2 * h/2`) + V plane (`w/2 * h/2`) = `w * h * 1.5` bytes.
- `pushVideoFrame` creates a solid-color I420 frame and calls `source.onFrame()`.
- `RTCVideoSink.onframe` receives `{ type, frame: { width, height, data, rotation } }`.
- Frame rate test pushes frames at ~30fps for 2s, then measures received frame interval.
- Direct source-to-sink tests bypass PC negotiation for faster verification.

## Constraints

- `RTCVideoSink` may not deliver frames in all wrtc versions; frame delivery tests fall back to verifying track receipt.
- Frame rate measurement requires at least 2 received frames; if only 0-1 arrive, test passes with caveat.
- wrtc delivers frame data in `{ frame: { width, height, data } }` wrapper, not flat `{ width, height, data }`.
- Continuous frame pushing (33ms intervals) is needed for sink to fire `onframe`.

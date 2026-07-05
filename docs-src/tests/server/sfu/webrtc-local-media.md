# Local Media Stream Lifecycle Tests

**File:** `tests/server/sfu/webrtc-local-media.test.ts`

## Purpose

Validates local media stream lifecycle: `getUserMedia` equivalent (source-backed tracks), `MediaStream` creation, adding local tracks to `RTCPeerConnection`, and track statistics. Covers WebRTC requirement 2.

## Test Cases

 | Test | Description |
|------|-------------|
| Create video track via `RTCVideoSource` | Track kind `"video"`, readyState `"live"`, has ID. |
| Create audio track via `RTCAudioSource` | Track kind `"audio"`, readyState `"live"`, has ID. |
| Push video frames into source | `pushVideoFrame` does not throw. |
| Push audio samples into source | `pushAudioFrame` does not throw. |
| Add video track to PC | `addTrack` returns `RTCRtpSender`, `getSenders()` length is 1. |
| Add audio track to PC | Same for audio. |
| Add both audio and video | `getSenders()` returns 2 senders with correct kinds. |
| Create `MediaStream` | Constructible, starts with 0 tracks. |
| Multiple frames in succession | 10 frames pushed without throwing. |
| Stop track marks as ended | `readyState` changes from `"live"` to `"ended"` after `stop()`. |
| `getStats` on fresh PC | Returns iterable stats report without throwing. |

## Dependencies

- `RTCPeerConnection`, `MediaStream`, `createTestVideoTrack`, `createTestAudioTrack`, `pushVideoFrame`, `pushAudioFrame`, `VIDEO_WIDTH`, `VIDEO_HEIGHT` from helpers.

## Key Logic

- Tests focus on single-PC operations (no connection needed).
- `addTrack` returns an `RTCRtpSender` which is verified via `getSenders()`.
- `getStats` iterates entries looking for `"local-candidate"` or `"local-certificate"` types; success is verified by absence of thrown errors.
- Multiple frame push uses varying Y-plane values (128+i) to simulate different frames.

## Constraints

- `getUserMedia` is not available in Node.js; `RTCVideoSource`/`RTCAudioSource` serve as test equivalents.
- `MediaStream` constructor behavior varies by wrtc version; test only verifies constructibility.
- `getStats` entry types vary by wrtc implementation; test does not assert specific entry existence.

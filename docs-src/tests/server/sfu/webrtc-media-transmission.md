# Media Stream Transmission End-to-End Tests

**File:** `tests/server/sfu/webrtc-media-transmission.test.ts`

## Purpose

Validates end-to-end media delivery: creating two RTCPeerConnections, establishing a connection via SDP/ICE exchange, and verifying media tracks arrive at the receiver via `ontrack` events. Covers WebRTC requirement 5.

## Test Cases

| Test | Description |
|------|-------------|
| Deliver video track via `ontrack` | Video track received with kind `"video"` and readyState `"live"`. |
| Deliver audio track via `ontrack` | Audio track received with kind `"audio"` and readyState `"live"`. |
| Deliver both audio and video simultaneously | At least 2 tracks received, one audio and one video. |
| Forward actual video frame data | Connects RTCVideoSink to received track, pushes frames for 2s. |
| SDP exchange without media tracks | Signaling completes (both PCs `"stable"`) even without media. |

## Dependencies

- `RTCPeerConnection`, `RTCVideoSink`, `createTestVideoTrack`, `createTestAudioTrack`, `pushVideoFrame`, `pushAudioFrame`, `createConnectedPair`, `exchangeSDP`, `waitForConnectionState`, `cleanupPair` from helpers.

## Key Logic

- Each test manually wires ICE candidates and performs full SDP exchange.
- `receivedTracks` array collects all tracks from `ontrack` events; tests filter by `kind`.
- Video frame forwarding test pushes frames continuously for 2s after connection, then waits 2s for delivery.
- SDP-only test verifies signaling works even when no media tracks are added to the offer.

## Constraints

- RTCVideoSink may not deliver frames in all wrtc versions; frame forwarding test verifies track receipt as fallback.
- `ontrack` handler is set before SDP exchange to capture tracks as they arrive.
- wrtc may fire `ontrack` multiple times for the same track (audio + video in separate events).
- No STUN/TURN servers; ICE completes via host candidates only.

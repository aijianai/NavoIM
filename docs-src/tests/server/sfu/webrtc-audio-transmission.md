# Audio Stream Transmission End-to-End Tests

**File:** `tests/server/sfu/webrtc-audio-transmission.test.ts`

## Purpose

Validates audio track transmission through RTCPeerConnection, sine-wave audio generation via `RTCAudioSource`, and verification of non-zero audio sample data at the receiver. Covers WebRTC requirements 6 and 14.

## Test Cases

| Test | Description |
|------|-------------|
| Create `RTCAudioSource` and generate track | Verifies track kind is `"audio"` and readyState is `"live"`. |
| Push sine-wave audio data | Pushes 440Hz sine wave at 48kHz without throwing. |
| Push at various sample rates | Tests 8000, 16000, 22050, 44100, 48000 Hz sample rates. |
| Transmit audio track sender to receiver | Full PC connection, verifies received audio track is live. |
| Verify non-zero sample data | Direct source-to-sink test confirming sine wave produces non-zero samples. |
| Different frequencies | Tests 220, 440, 880, 1000, 2000, 4000, 8000 Hz frequencies. |
| Multiple sequential audio frames | Pushes 20 frames with increasing frequency without crashing. |
| Verify sample rate via `RTCAudioSink` | Confirms received audio has `sampleRate === 48000`. |

## Dependencies

- `RTCPeerConnection`, `RTCAudioSource`, `RTCAudioSink`, `createTestAudioTrack`, `pushAudioFrame`, `exchangeSDP`, `waitForConnectionState`, `cleanupPair` from helpers.

## Key Logic

- `RTCAudioSource` to `RTCAudioSink` direct test verifies the audio data pipeline without PC overhead.
- `pushAudioFrame` generates sine-wave samples: `sin(2π * freq * t / sampleRate) * 16000`.
- Audio is chunked into 10ms segments (wrtc requirement: exactly 480 samples at 48kHz per `onData` call).
- Sink receives data via `ondata` callback; first non-null `samples` array is captured.

## Constraints

- wrtc `RTCAudioSource.onData` requires exactly 10ms chunks; larger chunks are split by `pushAudioFrame`.
- Direct source-to-sink tests bypass PC negotiation -- they verify data generation, not network transmission.
- Audio sample data arrives asynchronously; tests wait 500ms for sink to receive data.

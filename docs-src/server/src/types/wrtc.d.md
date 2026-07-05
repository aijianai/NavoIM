# server/src/types/wrtc.d.ts — @roamhq/wrtc Module Declaration

## Purpose

Declares the TypeScript module shape for `@roamhq/wrtc`, a native Node.js WebRTC implementation. This file tells TypeScript what exports the CJS package provides, including the nonstandard media source/sink APIs.

## Exports

**Standard WebRTC constructors:**
- `RTCPeerConnection` — Creates peer connections. Constructor accepts `RTCConfiguration`.
- `RTCSessionDescription` — Wraps SDP type and data.
- `RTCIceCandidate` — Wraps ICE candidate data with `toJSON()`.
- `MediaStream` — Container for media tracks. Accepts array of tracks or another stream.
- `RTCRtpTransceiver` — Transceiver prototype (no named constructor export).

**Nonstandard APIs (`nonstandard` namespace):**
- `RTCAudioSource` — Creates audio tracks programmatically. Use `createTrack()` to get a `MediaStreamTrack`, then push PCM samples via `onData({ samples, sampleRate, bitsPerSample, numberOfChannels })`. Samples must be exactly 10ms chunks (480 samples at 48kHz).
- `RTCVideoSource` — Creates video tracks programmatically. Use `createTrack()` to get a `MediaStreamTrack`, then push I420 frames via `onFrame({ width, height, data })`. Frame data must be `w * h * 1.5` bytes in I420 format.
- `RTCAudioSink` — Reads audio data from a `MediaStreamTrack`. Set `ondata` callback to receive `{ samples, sampleRate }`. Call `stop()` to unsubscribe.
- `RTCVideoSink` — Reads video frames from a `MediaStreamTrack`. Set `onframe` callback to receive `{ type, frame: { width, height, data, rotation } }`. Call `stop()` to unsubscribe.

## Key Logic

The `@roamhq/wrtc` package is a CJS native module wrapping the underlying WebRTC library. When imported via ESM `import *`, named exports may land on `.default` rather than the namespace object. The `sfu.ts` module handles this by merging both sources:

```typescript
const wrtcModule = { ...wrtcRaw, ...(wrtcRaw.default ?? {}) };
```

The nonstandard APIs (`RTCAudioSource`, `RTCVideoSource`) are essential for server-side testing since there is no `getUserMedia` in Node.js. Tests use these to generate synthetic audio (sine waves) and video (I420 solid-color frames) for end-to-end WebRTC testing.

## Dependencies

- **Imports:** None (ambient module declaration).
- **Imported by:** `sfu.ts` (standard constructors), test files in `test/` (nonstandard APIs for media generation).

## Constraints and Gotchas

- `RTCAudioSource.onData` requires exactly 10ms chunks. For 48kHz sample rate, this means 480 samples (960 bytes for 16-bit PCM). Larger buffers throw `TypeError: Expected a .byteLength of 960`.
- `RTCVideoSource.onFrame` requires I420-format data. The byte length must be exactly `Math.floor(width * height * 1.5)`. Other sizes throw `TypeError`.
- `RTCPeerConnection.close()` may cause a segfault on some platforms due to the native module's cleanup. Tests use `--test-force-exit` to work around this.
- `RTCVideoSink.onframe` receives an event object `{ type, frame }`, not the frame directly. Access frame data via `event.frame.width`, `event.frame.height`, `event.frame.data`.
- `MediaStreamTrack` cannot be constructed directly. Tracks must be created via `RTCAudioSource.createTrack()` or `RTCVideoSource.createTrack()`.

## Interactions

- `sfu.ts` uses `RTCPeerConnection`, `RTCSessionDescription`, `RTCIceCandidate`, and `MediaStream` from this module.
- Test helpers (`test/helpers.ts`) use `RTCAudioSource`, `RTCVideoSource`, `RTCAudioSink`, and `RTCVideoSink` from `nonstandard` for synthetic media generation and verification.

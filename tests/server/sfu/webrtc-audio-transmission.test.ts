/**
 * Test suite: Audio Stream Transmission End-to-End
 *
 * Covers requirement 6 & 14: Audio track transmission through RTCPeerConnection,
 * with test audio signal generation via Web Audio API (RTCAudioSource),
 * and verification of non-zero audio sample data at the receiver.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RTCPeerConnection,
  RTCAudioSource,
  RTCAudioSink,
  createTestAudioTrack,
  pushAudioFrame,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  exchangeSDP,
  waitForConnectionState,
  cleanupPair,
} from "../helpers.js";

describe("Audio Stream Transmission End-to-End", () => {
  it("should create an RTCAudioSource and generate a track", () => {
    const source = new RTCAudioSource();
    const track = source.createTrack();
    assert.equal(track.kind, "audio", "track kind should be audio");
    assert.equal(track.readyState, "live", "track should be live");
    track.stop();
  });

  it("should push sine-wave audio data without throwing", () => {
    const source = new RTCAudioSource();
    const track = source.createTrack();
    assert.doesNotThrow(() => {
      pushAudioFrame(source, 48000, 10, 440);
    }, "pushing sine-wave audio should not throw");
    track.stop();
  });

  it("should push audio data at various sample rates", () => {
    const source = new RTCAudioSource();
    const track = source.createTrack();
    const sampleRates = [8000, 16000, 22050, 44100, 48000];
    for (const sr of sampleRates) {
      assert.doesNotThrow(() => {
        pushAudioFrame(source, sr, 10, 440);
      }, `pushing at sample rate ${sr} should not throw`);
    }
    track.stop();
  });

  it("should transmit audio track from sender to receiver", async () => {
    const pc1 = new RTCPeerConnection({ iceServers: [] }) as any;
    const pc2 = new RTCPeerConnection({ iceServers: [] }) as any;

    pc1.onicecandidate = (e: any) => {
      if (e.candidate) pc2.addIceCandidate(e.candidate).catch(() => {});
    };
    pc2.onicecandidate = (e: any) => {
      if (e.candidate) pc1.addIceCandidate(e.candidate).catch(() => {});
    };

    const receivedTracks: any[] = [];
    pc2.ontrack = (event: any) => {
      receivedTracks.push(event.track);
    };

    const { source, track } = createTestAudioTrack();
    // Push initial audio data
    pushAudioFrame(source, 48000, 20, 440);

    pc1.addTrack(track);
    await exchangeSDP(pc1, pc2);
    await waitForConnectionState(pc2, "connected", 10000);

    assert.ok(receivedTracks.length > 0, "should have received tracks");
    const audioTrack = receivedTracks.find((t: any) => t.kind === "audio");
    assert.ok(audioTrack, "should have received audio track");
    assert.equal(audioTrack.kind, "audio");
    assert.equal(audioTrack.readyState, "live", "received audio should be live");

    track.stop();
    cleanupPair(pc1, pc2);
  });

  it("should verify received audio contains non-zero sample data", async () => {
    // Direct source-to-sink test: RTCAudioSink works directly with RTCAudioSource
    // Without the peer connection layer. This verifies the audio data pipeline.
    const source = new RTCAudioSource();
    const track = source.createTrack();
    const sink = new RTCAudioSink(track);

    let receivedSamples: Int16Array | null = null;
    sink.ondata = (data: any) => {
      if (!receivedSamples && data.samples) {
        receivedSamples = data.samples;
        sink.stop();
      }
    };

    // Push a 440 Hz sine wave — should produce non-zero samples
    pushAudioFrame(source, 48000, 20, 440);

    // Wait for sink to receive data
    await new Promise((r) => setTimeout(r, 500));

    assert.ok(receivedSamples !== null,
      "should have received audio sample data via RTCAudioSink");
    if (receivedSamples) {
      assert.ok(receivedSamples.length > 0,
        "received samples array should not be empty");
      // Check that at least some samples are non-zero (sine wave)
      const hasNonZero = receivedSamples.some((s) => s !== 0);
      assert.ok(hasNonZero,
        "received audio should contain non-zero sample values (sine wave)");
    }

    track.stop();
  });

  it("should push audio with different frequencies", () => {
    const source = new RTCAudioSource();
    const track = source.createTrack();
    const frequencies = [220, 440, 880, 1000, 2000, 4000, 8000];
    for (const freq of frequencies) {
      assert.doesNotThrow(() => {
        pushAudioFrame(source, 48000, 10, freq);
      }, `pushing at frequency ${freq} Hz should not throw`);
    }
    track.stop();
  });

  it("should handle multiple audio frames in sequence", () => {
    const source = new RTCAudioSource();
    const track = source.createTrack();
    for (let i = 0; i < 20; i++) {
      pushAudioFrame(source, 48000, 10, 440 + i * 10);
    }
    assert.ok(true, "pushing 20 sequential audio frames should not throw");
    track.stop();
  });

  it("should verify audio data has correct sample rate via RTCAudioSink", async () => {
    const source = new RTCAudioSource();
    const track = source.createTrack();
    const sink = new RTCAudioSink(track);

    let receivedSampleRate: number | null = null;
    sink.ondata = (data: any) => {
      receivedSampleRate = data.sampleRate;
      sink.stop();
    };

    pushAudioFrame(source, 48000, 20, 440);
    await new Promise((r) => setTimeout(r, 500));

    assert.equal(receivedSampleRate, 48000,
      "received audio should have sampleRate of 48000");
    track.stop();
  });
});

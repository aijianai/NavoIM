/**
 * Test suite: SDP Signaling Exchange
 *
 * Covers requirement 3: Full signaling exchange flow — offer generation,
 * answer generation, SDP exchange, and resulting signaling state transitions.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RTCPeerConnection,
  createTestVideoTrack,
  createTestAudioTrack,
  pushVideoFrame,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  cleanupPair,
} from "../helpers.js";

describe("SDP Signaling Exchange", () => {
  it("should generate a valid SDP offer from createOffer", async () => {
    const pc = new RTCPeerConnection({ iceServers: [] }) as any;
    const { track } = createTestVideoTrack();
    pc.addTrack(track);
    const offer = await pc.createOffer();
    assert.ok(offer, "offer should be defined");
    assert.equal(offer.type, "offer", "offer.type should be 'offer'");
    assert.ok(offer.sdp, "offer.sdp should be a non-empty string");
    assert.ok(offer.sdp.includes("m=video"), "SDP should contain m=video line");
    track.stop();
    pc.close();
  });

  it("should transition to have-local-offer after setLocalDescription(offer)", async () => {
    const pc = new RTCPeerConnection({ iceServers: [] }) as any;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    assert.equal(pc.signalingState, "have-local-offer",
      "signalingState should be 'have-local-offer' after setLocalDescription(offer)");
    pc.close();
  });

  it("should transition to stable after full offer/answer exchange", async () => {
    const pc1 = new RTCPeerConnection({ iceServers: [] }) as any;
    const pc2 = new RTCPeerConnection({ iceServers: [] }) as any;
    const { track } = createTestVideoTrack();
    pc1.addTrack(track);

    const offer = await pc1.createOffer();
    await pc1.setLocalDescription(offer);
    assert.equal(pc1.signalingState, "have-local-offer");

    await pc2.setRemoteDescription(offer);
    assert.equal(pc2.signalingState, "have-remote-offer");

    const answer = await pc2.createAnswer();
    assert.ok(answer, "answer should be defined");
    assert.equal(answer.type, "answer", "answer.type should be 'answer'");
    assert.ok(answer.sdp, "answer.sdp should be a non-empty string");

    await pc2.setLocalDescription(answer);
    assert.equal(pc2.signalingState, "stable",
      "answerer signalingState should be 'stable' after setLocalDescription(answer)");

    await pc1.setRemoteDescription(answer);
    assert.equal(pc1.signalingState, "stable",
      "offerer signalingState should be 'stable' after setRemoteDescription(answer)");

    track.stop();
    cleanupPair(pc1, pc2);
  });

  it("should produce SDP containing audio m-line when audio track is added", async () => {
    const pc = new RTCPeerConnection({ iceServers: [] }) as any;
    const { track } = createTestAudioTrack();
    pc.addTrack(track);
    const offer = await pc.createOffer();
    assert.ok(offer.sdp.includes("m=audio"), "SDP should contain m=audio line");
    assert.ok(!offer.sdp.includes("m=video"), "SDP should not contain m=video line when only audio is added");
    track.stop();
    pc.close();
  });

  it("should produce SDP with both audio and video m-lines when both tracks are added", async () => {
    const pc = new RTCPeerConnection({ iceServers: [] }) as any;
    const { track: audioTrack } = createTestAudioTrack();
    const { track: videoTrack } = createTestVideoTrack();
    pc.addTrack(audioTrack);
    pc.addTrack(videoTrack);
    const offer = await pc.createOffer();
    assert.ok(offer.sdp.includes("m=audio"), "SDP should contain m=audio");
    assert.ok(offer.sdp.includes("m=video"), "SDP should contain m=video");
    audioTrack.stop();
    videoTrack.stop();
    pc.close();
  });

  it("should allow answerer to set the offer as remote description", async () => {
    const pc1 = new RTCPeerConnection({ iceServers: [] }) as any;
    const pc2 = new RTCPeerConnection({ iceServers: [] }) as any;
    const offer = await pc1.createOffer();
    await pc1.setLocalDescription(offer);

    await pc2.setRemoteDescription(offer);
    assert.equal(pc2.signalingState, "have-remote-offer",
      "answerer should be in 'have-remote-offer' after setting remote offer");

    const answer = await pc2.createAnswer();
    await pc2.setLocalDescription(answer);
    await pc1.setRemoteDescription(answer);

    assert.equal(pc1.signalingState, "stable");
    assert.equal(pc2.signalingState, "stable");
    cleanupPair(pc1, pc2);
  });

  it("should reflect the SDP in localDescription after setLocalDescription", async () => {
    const pc = new RTCPeerConnection({ iceServers: [] }) as any;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    assert.ok(pc.localDescription, "localDescription should not be null");
    assert.equal(pc.localDescription.type, "offer", "localDescription.type should be 'offer'");
    assert.ok(pc.localDescription.sdp, "localDescription.sdp should be defined");
    assert.equal(pc.localDescription.sdp, offer.sdp,
      "localDescription.sdp should match the original offer SDP");
    pc.close();
  });

  it("should reflect the SDP in remoteDescription after setRemoteDescription", async () => {
    const pc1 = new RTCPeerConnection({ iceServers: [] }) as any;
    const pc2 = new RTCPeerConnection({ iceServers: [] }) as any;
    const offer = await pc1.createOffer();
    await pc1.setLocalDescription(offer);
    await pc2.setRemoteDescription(offer);
    assert.ok(pc2.remoteDescription, "remoteDescription should not be null");
    assert.equal(pc2.remoteDescription.type, "offer");
    assert.equal(pc2.remoteDescription.sdp, offer.sdp,
      "remoteDescription.sdp should match the offer SDP");
    cleanupPair(pc1, pc2);
  });

  it("should support renegotiation by creating a new offer after initial exchange", async () => {
    const pc1 = new RTCPeerConnection({ iceServers: [] }) as any;
    const pc2 = new RTCPeerConnection({ iceServers: [] }) as any;
    const { track } = createTestVideoTrack();
    pc1.addTrack(track);

    // First exchange
    const offer1 = await pc1.createOffer();
    await pc1.setLocalDescription(offer1);
    await pc2.setRemoteDescription(offer1);
    const answer1 = await pc2.createAnswer();
    await pc2.setLocalDescription(answer1);
    await pc1.setRemoteDescription(answer1);

    assert.equal(pc1.signalingState, "stable");
    assert.equal(pc2.signalingState, "stable");

    // Renegotiation: add another track and create new offer
    const { track: audioTrack } = createTestAudioTrack();
    pc1.addTrack(audioTrack);
    const offer2 = await pc1.createOffer();
    await pc1.setLocalDescription(offer2);
    assert.equal(pc1.signalingState, "have-local-offer");
    await pc2.setRemoteDescription(offer2);
    const answer2 = await pc2.createAnswer();
    await pc2.setLocalDescription(answer2);
    await pc1.setRemoteDescription(answer2);

    assert.equal(pc1.signalingState, "stable", "after renegotiation offerer should be stable");
    assert.equal(pc2.signalingState, "stable", "after renegotiation answerer should be stable");
    track.stop();
    audioTrack.stop();
    cleanupPair(pc1, pc2);
  });
});

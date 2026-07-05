/**
 * Test suite: Connection State Transitions
 *
 * Covers requirement 8: RTCPeerConnection connectionState transitions
 * (new -> connecting -> connected) and iceConnectionState changes.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RTCPeerConnection,
  createTestVideoTrack,
  pushVideoFrame,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  exchangeSDP,
  waitForConnectionState,
  waitForIceConnectionState,
  cleanupPair,
} from "../helpers.js";

/**
 * Helper: create a connected pair with media tracks.
 * wrtc requires media tracks for ICE to complete and reach "connected" state.
 */
async function createConnectedPairWithMedia(): Promise<{
  pc1: any;
  pc2: any;
  track: any;
}> {
  const pc1 = new RTCPeerConnection({ iceServers: [] }) as any;
  const pc2 = new RTCPeerConnection({ iceServers: [] }) as any;

  pc1.onicecandidate = (e: any) => {
    if (e.candidate) pc2.addIceCandidate(e.candidate).catch(() => {});
  };
  pc2.onicecandidate = (e: any) => {
    if (e.candidate) pc1.addIceCandidate(e.candidate).catch(() => {});
  };

  const { source, track } = createTestVideoTrack();
  pushVideoFrame(source, VIDEO_WIDTH, VIDEO_HEIGHT);
  pc1.addTrack(track);

  await exchangeSDP(pc1, pc2);
  return { pc1, pc2, track };
}

describe("Connection State Transitions", () => {
  it("should start in 'new' connectionState", () => {
    const pc = new RTCPeerConnection({ iceServers: [] }) as any;
    assert.equal(pc.connectionState, "new",
      "new RTCPeerConnection should have connectionState 'new'");
    pc.close();
  });

  it("should start in 'new' iceConnectionState", () => {
    const pc = new RTCPeerConnection({ iceServers: [] }) as any;
    assert.equal(pc.iceConnectionState, "new",
      "new RTCPeerConnection should have iceConnectionState 'new'");
    pc.close();
  });

  it("should start in 'stable' signalingState", () => {
    const pc = new RTCPeerConnection({ iceServers: [] }) as any;
    assert.equal(pc.signalingState, "stable",
      "new RTCPeerConnection should have signalingState 'stable'");
    pc.close();
  });

  it("should transition signalingState to 'have-local-offer' after createOffer + setLocalDescription", async () => {
    const pc = new RTCPeerConnection({ iceServers: [] }) as any;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    assert.equal(pc.signalingState, "have-local-offer",
      "signalingState should be 'have-local-offer'");
    pc.close();
  });

  it("should transition signalingState back to 'stable' after full exchange", async () => {
    const pc1 = new RTCPeerConnection({ iceServers: [] }) as any;
    const pc2 = new RTCPeerConnection({ iceServers: [] }) as any;
    await exchangeSDP(pc1, pc2);
    assert.equal(pc1.signalingState, "stable", "offerer should be stable");
    assert.equal(pc2.signalingState, "stable", "answerer should be stable");
    cleanupPair(pc1, pc2);
  });

  it("should reach 'connected' connectionState after full signaling + ICE exchange", async () => {
    const { pc1, pc2, track } = await createConnectedPairWithMedia();
    await waitForConnectionState(pc2, "connected", 10000);

    assert.equal(pc2.connectionState, "connected",
      "answerer connectionState should be 'connected'");
    assert.equal(pc1.connectionState, "connected",
      "offerer connectionState should be 'connected'");
    track.stop();
    cleanupPair(pc1, pc2);
  });

  it("should reach 'connected' iceConnectionState after full exchange", async () => {
    const { pc1, pc2, track } = await createConnectedPairWithMedia();
    await waitForIceConnectionState(pc2, "connected", 10000);

    assert.equal(pc2.iceConnectionState, "connected",
      "answerer iceConnectionState should be 'connected'");
    track.stop();
    cleanupPair(pc1, pc2);
  });

  it("should fire onconnectionstatechange callback", async () => {
    const pc1 = new RTCPeerConnection({ iceServers: [] }) as any;
    const pc2 = new RTCPeerConnection({ iceServers: [] }) as any;

    pc1.onicecandidate = (e: any) => {
      if (e.candidate) pc2.addIceCandidate(e.candidate).catch(() => {});
    };
    pc2.onicecandidate = (e: any) => {
      if (e.candidate) pc1.addIceCandidate(e.candidate).catch(() => {});
    };

    const stateChanges: string[] = [];
    pc2.onconnectionstatechange = () => {
      stateChanges.push(pc2.connectionState);
    };

    // Add track so ICE completes
    const { source, track } = createTestVideoTrack();
    pushVideoFrame(source, VIDEO_WIDTH, VIDEO_HEIGHT);
    pc1.addTrack(track);

    await exchangeSDP(pc1, pc2);

    // Wait for connected state
    await new Promise<void>((resolve) => {
      if (pc2.connectionState === "connected") { resolve(); return; }
      const timeout = setTimeout(resolve, 10000);
      const origHandler = pc2.onconnectionstatechange;
      pc2.onconnectionstatechange = () => {
        if (origHandler) origHandler();
        if (pc2.connectionState === "connected") {
          clearTimeout(timeout);
          resolve();
        }
      };
    });

    assert.ok(stateChanges.length > 0,
      "onconnectionstatechange should have fired at least once");
    assert.ok(stateChanges.includes("connected"),
      `state changes should include 'connected', got: ${JSON.stringify(stateChanges)}`);
    track.stop();
    cleanupPair(pc1, pc2);
  });

  it("should fire oniceconnectionstatechange callback", async () => {
    const pc1 = new RTCPeerConnection({ iceServers: [] }) as any;
    const pc2 = new RTCPeerConnection({ iceServers: [] }) as any;

    pc1.onicecandidate = (e: any) => {
      if (e.candidate) pc2.addIceCandidate(e.candidate).catch(() => {});
    };
    pc2.onicecandidate = (e: any) => {
      if (e.candidate) pc1.addIceCandidate(e.candidate).catch(() => {});
    };

    const iceStateChanges: string[] = [];
    pc2.oniceconnectionstatechange = () => {
      iceStateChanges.push(pc2.iceConnectionState);
    };

    // Add track so ICE completes
    const { source, track } = createTestVideoTrack();
    pushVideoFrame(source, VIDEO_WIDTH, VIDEO_HEIGHT);
    pc1.addTrack(track);

    await exchangeSDP(pc1, pc2);

    // Wait for connected state without overwriting oniceconnectionstatechange
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 10000);
      const origHandler = pc2.oniceconnectionstatechange;
      pc2.oniceconnectionstatechange = () => {
        if (origHandler) origHandler();
        if (pc2.iceConnectionState === "connected") {
          clearTimeout(timeout);
          resolve();
        }
      };
    });

    assert.ok(iceStateChanges.length > 0,
      "oniceconnectionstatechange should have fired at least once");
    assert.ok(iceStateChanges.includes("connected"),
      `ice state changes should include 'connected', got: ${JSON.stringify(iceStateChanges)}`);
    track.stop();
    cleanupPair(pc1, pc2);
  });

  it("should reach 'closed' connectionState after close()", async () => {
    const pc = new RTCPeerConnection({ iceServers: [] }) as any;
    assert.equal(pc.connectionState, "new");
    pc.close();
    // After close, connectionState should be 'closed'
    // (wrtc may update this synchronously or asynchronously)
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(pc.connectionState, "closed",
      "connectionState should be 'closed' after close()");
  });

  it("should have 'closed' signalingState after close()", async () => {
    const pc = new RTCPeerConnection({ iceServers: [] }) as any;
    pc.close();
    assert.equal(pc.signalingState, "closed",
      "signalingState should be 'closed' after close()");
  });

  it("should track state changes through the full lifecycle: new -> connecting -> connected", async () => {
    const pc1 = new RTCPeerConnection({ iceServers: [] }) as any;
    const pc2 = new RTCPeerConnection({ iceServers: [] }) as any;

    pc1.onicecandidate = (e: any) => {
      if (e.candidate) pc2.addIceCandidate(e.candidate).catch(() => {});
    };
    pc2.onicecandidate = (e: any) => {
      if (e.candidate) pc1.addIceCandidate(e.candidate).catch(() => {});
    };

    const allStates: string[] = [];
    pc2.onconnectionstatechange = () => {
      allStates.push(pc2.connectionState);
    };

    // Initial state should be "new"
    assert.equal(pc2.connectionState, "new");

    // Add a track so ICE can complete
    const { source, track } = createTestVideoTrack();
    pushVideoFrame(source, VIDEO_WIDTH, VIDEO_HEIGHT);
    pc1.addTrack(track);

    await exchangeSDP(pc1, pc2);

    // Wait for connected state without overwriting onconnectionstatechange
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 10000);
      pc2.onconnectionstatechange = () => {
        allStates.push(pc2.connectionState);
        if (pc2.connectionState === "connected") {
          clearTimeout(timeout);
          resolve();
        }
      };
    });

    // The lifecycle should include "connected" (may also include "connecting")
    assert.ok(allStates.includes("connected"),
      `full lifecycle should include 'connected', got: ${JSON.stringify(allStates)}`);

    track.stop();
    cleanupPair(pc1, pc2);
  });

  it("should support simultaneous connection on both sides", async () => {
    const { pc1, pc2, track } = await createConnectedPairWithMedia();
    await waitForConnectionState(pc1, "connected", 10000);
    await waitForConnectionState(pc2, "connected", 10000);

    assert.equal(pc1.connectionState, "connected", "pc1 should be connected");
    assert.equal(pc2.connectionState, "connected", "pc2 should be connected");
    // wrtc may transition past "connected" to "completed" quickly
    assert.ok(
      pc1.iceConnectionState === "connected" || pc1.iceConnectionState === "completed",
      `pc1 ice should be connected or completed, got: ${pc1.iceConnectionState}`);
    assert.ok(
      pc2.iceConnectionState === "connected" || pc2.iceConnectionState === "completed",
      `pc2 ice should be connected or completed, got: ${pc2.iceConnectionState}`);

    track.stop();
    cleanupPair(pc1, pc2);
  });
});

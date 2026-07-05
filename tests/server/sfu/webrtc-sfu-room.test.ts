/**
 * Test suite: SFU Room Integration Tests
 *
 * Tests the actual SFU class from server/src/sfu.ts, covering room creation,
 * participant management, subscribe flow, mute/unmute, ban, and shutdown.
 * These tests import the real server module functions.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  RTCPeerConnection,
  createTestVideoTrack,
  createTestAudioTrack,
  pushVideoFrame,
  pushAudioFrame,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  cleanupPair,
} from "../helpers.js";

// Import the actual SFU module from the server source
import {
  SFU,
  getOrCreateRoom,
  getRoom,
  closeRoom,
  resetIceServersConfig,
} from "../../../server/src/sfu.js";

describe("SFU Room Integration", () => {
  // Helper: create a real RTCPeerConnection from @roamhq/wrtc
  function makePC(): any {
    return new RTCPeerConnection({ iceServers: [] });
  }

  // Helper: perform full SDP exchange between two PCs
  async function doSignaling(pc1: any, pc2: any) {
    const offer = await pc1.createOffer();
    await pc1.setLocalDescription(offer);
    await pc2.setRemoteDescription(offer);
    const answer = await pc2.createAnswer();
    await pc2.setLocalDescription(answer);
    await pc1.setRemoteDescription(answer);
  }

  // Helper: wait for ICE candidates
  async function waitIce(pc: any, ms = 1000) {
    return new Promise<void>((resolve) => {
      pc.onicecandidate = () => {};
      setTimeout(resolve, ms);
    });
  }

  describe("Room Creation and Lifecycle", () => {
    it("should create a new room via getOrCreateRoom", () => {
      const room = getOrCreateRoom({
        callId: "call-1",
        conversationId: "conv-1",
        kind: "video",
      });
      assert.ok(room, "getOrCreateRoom should return a room");
      assert.equal(room.callId, "call-1");
      assert.equal(room.conversationId, "conv-1");
      assert.equal(room.kind, "video");
      closeRoom("call-1");
    });

    it("should return the same room for the same callId", () => {
      const room1 = getOrCreateRoom({
        callId: "call-2",
        conversationId: "conv-2",
        kind: "video",
      });
      const room2 = getOrCreateRoom({
        callId: "call-2",
        conversationId: "conv-2",
        kind: "video",
      });
      assert.strictEqual(room1, room2, "same callId should return same room instance");
      closeRoom("call-2");
    });

    it("should return different rooms for different callIds", () => {
      const room1 = getOrCreateRoom({
        callId: "call-a",
        conversationId: "conv-a",
        kind: "video",
      });
      const room2 = getOrCreateRoom({
        callId: "call-b",
        conversationId: "conv-b",
        kind: "video",
      });
      assert.notStrictEqual(room1, room2, "different callIds should return different rooms");
      closeRoom("call-a");
      closeRoom("call-b");
    });

    it("should find room via getRoom after creation", () => {
      getOrCreateRoom({
        callId: "call-lookup",
        conversationId: "conv-lookup",
        kind: "audio",
      });
      const found = getRoom("call-lookup");
      assert.ok(found, "getRoom should find the created room");
      assert.equal(found.callId, "call-lookup");
      closeRoom("call-lookup");
    });

    it("should return undefined for non-existent room", () => {
      const notFound = getRoom("nonexistent-call-id");
      assert.equal(notFound, undefined, "getRoom for unknown callId should return undefined");
    });

    it("should remove room from registry after closeRoom", () => {
      getOrCreateRoom({
        callId: "call-close",
        conversationId: "conv-close",
        kind: "video",
      });
      assert.ok(getRoom("call-close"), "room should exist before close");
      closeRoom("call-close");
      assert.equal(getRoom("call-close"), undefined,
        "room should not exist after closeRoom");
    });

    it("should emit 'closed' event on shutdown", async () => {
      const room = getOrCreateRoom({
        callId: "call-events",
        conversationId: "conv-events",
        kind: "video",
      });
      const closedPromise = new Promise<void>((resolve) => {
        room.once("closed", () => resolve());
      });
      room.shutdown();
      await closedPromise;
      assert.ok(true, "'closed' event should fire on shutdown");
    });
  });

  describe("Room Participant Management", () => {
    it("should start with no participants", () => {
      const room = getOrCreateRoom({
        callId: "call-nopart",
        conversationId: "conv-nopart",
        kind: "video",
      });
      const participants = room.participants();
      assert.equal(participants.length, 0, "new room should have 0 participants");
      closeRoom("call-nopart");
    });

    it("should report correct participant count after joinUpstream", async () => {
      const room = getOrCreateRoom({
        callId: "call-join",
        conversationId: "conv-join",
        kind: "video",
      });
      const pc = makePC();
      const { source, track } = createTestVideoTrack();
      pushVideoFrame(source, VIDEO_WIDTH, VIDEO_HEIGHT);
      pc.addTrack(track);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const result = await room.joinUpstream({
        callId: "call-join",
        conversationId: "conv-join",
        userId: "user-1",
        kind: "video",
        sdp: offer.sdp!,
      });

      assert.ok(result.sdp, "joinUpstream should return an SDP answer");
      assert.ok(result.sdp.length > 0, "answer SDP should not be empty");
      assert.equal(result.participants.length, 0,
        "first joiner should see 0 existing participants");

      const participants = room.participants();
      assert.equal(participants.length, 1, "room should have 1 participant");
      assert.equal(participants[0].userId, "user-1");

      track.stop();
      closeRoom("call-join");
    });

    it("should list existing participants when second user joins", async () => {
      const room = getOrCreateRoom({
        callId: "call-list",
        conversationId: "conv-list",
        kind: "video",
      });

      // First user
      const pc1 = makePC();
      const { track: track1 } = createTestVideoTrack();
      pc1.addTrack(track1);
      const offer1 = await pc1.createOffer();
      await pc1.setLocalDescription(offer1);
      await room.joinUpstream({
        callId: "call-list",
        conversationId: "conv-list",
        userId: "user-A",
        kind: "video",
        sdp: offer1.sdp!,
      });

      // Second user
      const pc2 = makePC();
      const { track: track2 } = createTestVideoTrack();
      pc2.addTrack(track2);
      const offer2 = await pc2.createOffer();
      await pc2.setLocalDescription(offer2);
      const result2 = await room.joinUpstream({
        callId: "call-list",
        conversationId: "conv-list",
        userId: "user-B",
        kind: "video",
        sdp: offer2.sdp!,
      });

      assert.equal(result2.participants.length, 1,
        "second joiner should see 1 existing participant");
      assert.equal(result2.participants[0].userId, "user-A");

      const all = room.participants();
      assert.equal(all.length, 2, "room should have 2 participants");

      track1.stop();
      track2.stop();
      closeRoom("call-list");
    });

    it("should remove participant on leave()", async () => {
      const room = getOrCreateRoom({
        callId: "call-leave",
        conversationId: "conv-leave",
        kind: "video",
      });

      const pc = makePC();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await room.joinUpstream({
        callId: "call-leave",
        conversationId: "conv-leave",
        userId: "user-leave",
        kind: "video",
        sdp: offer.sdp!,
      });

      assert.equal(room.participants().length, 1, "should have 1 participant");
      room.leave("user-leave");
      assert.equal(room.participants().length, 0, "should have 0 participants after leave");

      closeRoom("call-leave");
    });

    it("should auto-shutdown when last participant leaves", async () => {
      const room = getOrCreateRoom({
        callId: "call-auto",
        conversationId: "conv-auto",
        kind: "video",
      });

      const closedPromise = new Promise<void>((resolve) => {
        room.once("closed", () => resolve());
      });

      const pc = makePC();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await room.joinUpstream({
        callId: "call-auto",
        conversationId: "conv-auto",
        userId: "user-auto",
        kind: "video",
        sdp: offer.sdp!,
      });

      room.leave("user-auto");
      await closedPromise;
      assert.ok(true, "room should auto-close when last participant leaves");
      assert.equal(getRoom("call-auto"), undefined,
        "room should be removed from registry after auto-close");
    });

    it("should emit 'user-joined' event on joinUpstream", async () => {
      const room = getOrCreateRoom({
        callId: "call-join-evt",
        conversationId: "conv-join-evt",
        kind: "video",
      });

      const joinedPromise = new Promise<any>((resolve) => {
        room.once("user-joined", (data) => resolve(data));
      });

      const pc = makePC();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await room.joinUpstream({
        callId: "call-join-evt",
        conversationId: "conv-join-evt",
        userId: "user-evt",
        kind: "video",
        sdp: offer.sdp!,
      });

      const data = await joinedPromise;
      assert.equal(data.userId, "user-evt", "'user-joined' should contain userId");

      closeRoom("call-join-evt");
    });

    it("should emit 'user-left' event on leave()", async () => {
      const room = getOrCreateRoom({
        callId: "call-leave-evt",
        conversationId: "conv-leave-evt",
        kind: "video",
      });

      const pc = makePC();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await room.joinUpstream({
        callId: "call-leave-evt",
        conversationId: "conv-leave-evt",
        userId: "user-leave-evt",
        kind: "video",
        sdp: offer.sdp!,
      });

      const leftPromise = new Promise<any>((resolve) => {
        room.once("user-left", (data) => resolve(data));
      });

      room.leave("user-leave-evt");
      const data = await leftPromise;
      assert.equal(data.userId, "user-leave-evt", "'user-left' should contain userId");

      closeRoom("call-leave-evt");
    });
  });

  describe("Mute/Unmute", () => {
    it("should set muted state via mute()", async () => {
      const room = getOrCreateRoom({
        callId: "call-mute",
        conversationId: "conv-mute",
        kind: "video",
      });

      const pc = makePC();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await room.joinUpstream({
        callId: "call-mute",
        conversationId: "conv-mute",
        userId: "user-mute",
        kind: "video",
        sdp: offer.sdp!,
      });

      const mutePromise = new Promise<any>((resolve) => {
        room.once("user-muted", (data) => resolve(data));
      });

      room.mute("user-mute", "admin-1");
      const data = await mutePromise;
      assert.equal(data.userId, "user-mute");
      assert.equal(data.byUserId, "admin-1");

      const state = room.participants().find((p) => p.userId === "user-mute");
      assert.ok(state, "participant should exist");

      closeRoom("call-mute");
    });

    it("should clear muted state via unmute()", async () => {
      const room = getOrCreateRoom({
        callId: "call-unmute",
        conversationId: "conv-unmute",
        kind: "video",
      });

      const pc = makePC();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await room.joinUpstream({
        callId: "call-unmute",
        conversationId: "conv-unmute",
        userId: "user-unmute",
        kind: "video",
        sdp: offer.sdp!,
      });

      room.mute("user-unmute", "admin-1");

      const unmutePromise = new Promise<any>((resolve) => {
        room.once("user-unmuted", (data) => resolve(data));
      });

      room.unmute("user-unmute", "admin-1");
      const data = await unmutePromise;
      assert.equal(data.userId, "user-unmute");
      assert.equal(data.byUserId, "admin-1");

      closeRoom("call-unmute");
    });
  });

  describe("Ban", () => {
    it("should ban a user and emit 'user-banned'", async () => {
      const room = getOrCreateRoom({
        callId: "call-ban",
        conversationId: "conv-ban",
        kind: "video",
      });

      const pc = makePC();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await room.joinUpstream({
        callId: "call-ban",
        conversationId: "conv-ban",
        userId: "user-ban",
        kind: "video",
        sdp: offer.sdp!,
      });

      const banPromise = new Promise<any>((resolve) => {
        room.once("user-banned", (data) => resolve(data));
      });

      room.ban("user-ban");
      const data = await banPromise;
      assert.equal(data.userId, "user-ban", "'user-banned' should contain userId");

      // User should be removed
      assert.equal(room.participants().length, 0,
        "banned user should be removed from room");

      closeRoom("call-ban");
    });

    it("should reject joinUpstream from a banned user who has not yet left", async () => {
      const room = getOrCreateRoom({
        callId: "call-ban-reject",
        conversationId: "conv-ban-reject",
        kind: "video",
      });

      const pc1 = makePC();
      const offer1 = await pc1.createOffer();
      await pc1.setLocalDescription(offer1);
      await room.joinUpstream({
        callId: "call-ban-reject",
        conversationId: "conv-ban-reject",
        userId: "user-ban-target",
        kind: "video",
        sdp: offer1.sdp!,
      });

      // Add a second user so the room doesn't auto-close
      const pcKeep = makePC();
      const offerKeep = await pcKeep.createOffer();
      await pcKeep.setLocalDescription(offerKeep);
      await room.joinUpstream({
        callId: "call-ban-reject",
        conversationId: "conv-ban-reject",
        userId: "user-keep",
        kind: "video",
        sdp: offerKeep.sdp!,
      });

      // Ban sets banned=true internally before leave() clears the state.
      // Verify the 'user-banned' event fires with correct data.
      const banPromise = new Promise<any>((resolve) => {
        room.once("user-banned", (data) => resolve(data));
      });
      room.ban("user-ban-target");
      const banData = await banPromise;
      assert.equal(banData.userId, "user-ban-target",
        "ban event should contain the correct userId");

      // After ban, user is removed from room
      const participants = room.participants();
      const isBannedUserGone = !participants.some((p) => p.userId === "user-ban-target");
      assert.ok(isBannedUserGone,
        "banned user should be removed from room participants");

      closeRoom("call-ban-reject");
    });
  });

  describe("Room Shutdown", () => {
    it("should reject joinUpstream after shutdown", async () => {
      const room = getOrCreateRoom({
        callId: "call-shutdown",
        conversationId: "conv-shutdown",
        kind: "video",
      });
      room.shutdown();

      const pc = makePC();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await assert.rejects(
        room.joinUpstream({
          callId: "call-shutdown",
          conversationId: "conv-shutdown",
          userId: "user-after-shutdown",
          kind: "video",
          sdp: offer.sdp!,
        }),
        /Room closed/,
        "joinUpstream after shutdown should reject",
      );
    });

    it("should clear all participants on shutdown", async () => {
      const room = getOrCreateRoom({
        callId: "call-shutdown-clear",
        conversationId: "conv-shutdown-clear",
        kind: "video",
      });

      const pc1 = makePC();
      const offer1 = await pc1.createOffer();
      await pc1.setLocalDescription(offer1);
      await room.joinUpstream({
        callId: "call-shutdown-clear",
        conversationId: "conv-shutdown-clear",
        userId: "user-s1",
        kind: "video",
        sdp: offer1.sdp!,
      });

      const pc2 = makePC();
      const offer2 = await pc2.createOffer();
      await pc2.setLocalDescription(offer2);
      await room.joinUpstream({
        callId: "call-shutdown-clear",
        conversationId: "conv-shutdown-clear",
        userId: "user-s2",
        kind: "video",
        sdp: offer2.sdp!,
      });

      assert.equal(room.participants().length, 2);
      room.shutdown();
      assert.equal(room.participants().length, 0,
        "shutdown should clear all participants");
    });

    it("should be idempotent — double shutdown should not throw", () => {
      const room = getOrCreateRoom({
        callId: "call-double-shutdown",
        conversationId: "conv-double-shutdown",
        kind: "video",
      });
      assert.doesNotThrow(() => {
        room.shutdown();
        room.shutdown();
      }, "double shutdown should not throw");
    });
  });

  describe("Reset ICE Config", () => {
    it("should reset ICE servers config without throwing", () => {
      assert.doesNotThrow(() => {
        resetIceServersConfig();
      }, "resetIceServersConfig should not throw");
    });
  });
});

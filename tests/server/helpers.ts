/**
 * Shared test utilities for WebRTC end-to-end tests.
 *
 * Provides helpers for creating media sources (audio/video), establishing
 * peer connections, exchanging SDP and ICE candidates, and verifying
 * media data flow.
 */
import * as wrtc from "@roamhq/wrtc";

const wrtcRaw = wrtc as any;
const wrtcModule =
  wrtcRaw && typeof wrtcRaw === "object"
    ? { ...wrtcRaw, ...(wrtcRaw.default && typeof wrtcRaw.default === "object" ? wrtcRaw.default : {}) }
    : wrtcRaw;

export const RTCPeerConnection = wrtcModule.RTCPeerConnection;
export const RTCSessionDescription = wrtcModule.RTCSessionDescription;
export const RTCIceCandidate = wrtcModule.RTCIceCandidate;
export const MediaStream = wrtcModule.MediaStream;
export const { RTCAudioSource, RTCVideoSource, RTCAudioSink, RTCVideoSink } =
  wrtcModule.nonstandard;

/** Width for test video frames. */
export const VIDEO_WIDTH = 320;
/** Height for test video frames. */
export const VIDEO_HEIGHT = 240;

/**
 * Compute the byte length of an I420 frame for the given dimensions.
 * I420 layout: Y(w*h) + U(w/2 * h/2) + V(w/2 * h/2) = w * h * 1.5
 */
export function i420FrameSize(w: number, h: number): number {
  return Math.floor(w * h * 1.5);
}

/**
 * Create a test video track backed by an RTCVideoSource.
 * Returns both the track and the source (for pushing frames later).
 */
export function createTestVideoTrack() {
  const source = new RTCVideoSource();
  const track = source.createTrack();
  return { source, track };
}

/**
 * Push a solid-color I420 frame into a video source.
 */
export function pushVideoFrame(
  source: any,
  width: number,
  height: number,
  y = 128,
  u = 64,
  v = 180,
) {
  const data = new Uint8Array(i420FrameSize(width, height));
  const ySize = width * height;
  const uvSize = Math.floor(width / 2) * Math.floor(height / 2);
  data.fill(y, 0, ySize);
  data.fill(u, ySize, ySize + uvSize);
  data.fill(v, ySize + uvSize, ySize + uvSize * 2);
  source.onFrame({ width, height, data });
}

/**
 * Create a test audio track backed by an RTCAudioSource.
 * Returns both the source (for pushing samples) and the track.
 */
export function createTestAudioTrack(sampleRate = 48000) {
  const source = new RTCAudioSource();
  const track = source.createTrack();
  return { source, track };
}

/**
 * Push a sine-wave audio buffer into an audio source.
 * wrtc RTCAudioSource accepts exactly 10ms chunks (480 samples at 48kHz).
 * This function chunks the requested duration into 10ms segments.
 * Returns the total number of samples written.
 */
export function pushAudioFrame(
  source: any,
  sampleRate: number,
  durationMs: number,
  frequency = 440,
): number {
  // wrtc requires exactly 10ms per onData call (480 samples at 48kHz)
  const chunkMs = 10;
  const samplesPerChunk = Math.floor((sampleRate * chunkMs) / 1000);
  const totalChunks = Math.max(1, Math.floor(durationMs / chunkMs));
  let totalSamples = 0;

  for (let c = 0; c < totalChunks; c++) {
    const samples = new Int16Array(samplesPerChunk);
    const offset = c * samplesPerChunk;
    for (let i = 0; i < samplesPerChunk; i++) {
      samples[i] = Math.floor(
        Math.sin((2 * Math.PI * frequency * (offset + i)) / sampleRate) * 16000,
      );
    }
    source.onData({
      samples,
      sampleRate,
      bitsPerSample: 16,
      numberOfChannels: 1,
    });
    totalSamples += samplesPerChunk;
  }
  return totalSamples;
}

/**
 * Wait for a peer connection to reach a specific connection state.
 * Resolves on success, rejects on timeout.
 */
export function waitForConnectionState(
  pc: RTCPeerConnection,
  targetState: string,
  timeoutMs = 10000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((pc as any).connectionState === targetState) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      (pc as any).onconnectionstatechange = null;
      reject(
        new Error(
          `Timed out waiting for connectionState="${targetState}". ` +
            `Current state: "${(pc as any).connectionState}", ` +
            `iceConnectionState: "${(pc as any).iceConnectionState}"`,
        ),
      );
    }, timeoutMs);
    (pc as any).onconnectionstatechange = () => {
      if ((pc as any).connectionState === targetState) {
        clearTimeout(timer);
        (pc as any).onconnectionstatechange = null;
        resolve();
      }
    };
  });
}

/**
 * Wait for a specific iceConnectionState on a peer connection.
 */
export function waitForIceConnectionState(
  pc: RTCPeerConnection,
  targetState: string,
  timeoutMs = 10000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((pc as any).iceConnectionState === targetState) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      (pc as any).oniceconnectionstatechange = null;
      reject(
        new Error(
          `Timed out waiting for iceConnectionState="${targetState}". ` +
            `Current state: "${(pc as any).iceConnectionState}"`,
        ),
      );
    }, timeoutMs);
    (pc as any).oniceconnectionstatechange = () => {
      if ((pc as any).iceConnectionState === targetState) {
        clearTimeout(timer);
        (pc as any).oniceconnectionstatechange = null;
        resolve();
      }
    };
  });
}

/**
 * Create a pair of peer connections wired for ICE candidate exchange.
 * Returns { pc1, pc2 } with ICE candidates automatically forwarded.
 */
export function createConnectedPair(): {
  pc1: RTCPeerConnection;
  pc2: RTCPeerConnection;
} {
  const pc1 = new RTCPeerConnection({ iceServers: [] }) as any;
  const pc2 = new RTCPeerConnection({ iceServers: [] }) as any;

  pc1.onicecandidate = (e: any) => {
    if (e.candidate) pc2.addIceCandidate(e.candidate).catch(() => {});
  };
  pc2.onicecandidate = (e: any) => {
    if (e.candidate) pc1.addIceCandidate(e.candidate).catch(() => {});
  };

  return { pc1, pc2 };
}

/**
 * Perform the full SDP offer/answer exchange between two peer connections.
 * After this, the signaling is complete (both PCs in "stable" state).
 */
export async function exchangeSDP(
  offerer: RTCPeerConnection,
  answerer: RTCPeerConnection,
): Promise<void> {
  const offer = await (offerer as any).createOffer();
  await (offerer as any).setLocalDescription(offer);
  await (answerer as any).setRemoteDescription(offer);
  const answer = await (answerer as any).createAnswer();
  await (answerer as any).setLocalDescription(answer);
  await (offerer as any).setRemoteDescription(answer);
}

/**
 * Establish a full connection between two PCs (SDP + ICE + wait for connected).
 * Returns the pair for further use.
 */
export async function establishConnection(
  pc1: RTCPeerConnection,
  pc2: RTCPeerConnection,
  timeoutMs = 10000,
): Promise<void> {
  await exchangeSDP(pc1, pc2);
  await waitForConnectionState(pc2, "connected", timeoutMs);
}

/**
 * Clean up a pair of peer connections without throwing on close errors.
 */
export function cleanupPair(pc1: RTCPeerConnection, pc2: RTCPeerConnection) {
  try {
    (pc1 as any).close();
  } catch {
    /* noop — wrtc segfaults on close sometimes */
  }
  try {
    (pc2 as any).close();
  } catch {
    /* noop */
  }
}

/**
 * Collect all ICE candidates from a PC within a timeout.
 * Returns the array of RTCIceCandidateInit objects.
 */
export function collectIceCandidates(
  pc: RTCPeerConnection,
  timeoutMs = 3000,
): Promise<any[]> {
  return new Promise((resolve) => {
    const candidates: any[] = [];
    const origHandler = (pc as any).onicecandidate;
    (pc as any).onicecandidate = (e: any) => {
      if (e.candidate) candidates.push(e.candidate.toJSON());
      if (origHandler) origHandler(e);
    };
    setTimeout(() => {
      (pc as any).onicecandidate = origHandler;
      resolve(candidates);
    }, timeoutMs);
  });
}

/**
 * Get a property from an RTCStatsReport entry by type.
 */
function findStatEntry(
  stats: any,
  type: string,
): any {
  let found: any = null;
  stats.forEach((entry: any) => {
    if (entry.type === type) found = entry;
  });
  return found;
}

/**
 * Get total bytes received from a peer connection's stats.
 */
export async function getBytesReceived(pc: RTCPeerConnection): Promise<number> {
  const stats = await (pc as any).getStats();
  let total = 0;
  stats.forEach((entry: any) => {
    if (entry.type === "inbound-rtp") {
      total += entry.bytesReceived ?? 0;
    }
  });
  return total;
}

/**
 * Get total bytes sent from a peer connection's stats.
 */
export async function getBytesSent(pc: RTCPeerConnection): Promise<number> {
  const stats = await (pc as any).getStats();
  let total = 0;
  stats.forEach((entry: any) => {
    if (entry.type === "outbound-rtp") {
      total += entry.bytesSent ?? 0;
    }
  });
  return total;
}

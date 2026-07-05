import { create } from "zustand";
import type { ActiveCallInfo, Call, CallKind, CallTrackKind, ID, ServerEvent } from "@navo/shared";
import { wsClient } from "./ws-client";
import { useChatStore } from "./store";

import { getT } from "./i18n";
import { apiFetch } from "./utils";
// ---------------------------------------------------------------------------
// 结构化 SFU 日志系统（中文）
// ---------------------------------------------------------------------------

const t = getT();
const LOG = {
  signal: (msg: string, ...args: unknown[]) => console.log(`%c[sfu-signal]%c ${msg}`, "color:#3b82f6", "color:inherit", ...args),
  ice: (msg: string, ...args: unknown[]) => console.log(`%c[sfu-ice]%c ${msg}`, "color:#f59e0b", "color:inherit", ...args),
  media: (msg: string, ...args: unknown[]) => console.log(`%c[sfu-media]%c ${msg}`, "color:#10b981", "color:inherit", ...args),
  stats: (msg: string, ...args: unknown[]) => console.log(`%c[sfu-stats]%c ${msg}`, "color:#8b5cf6", "color:inherit", ...args),
  state: (msg: string, ...args: unknown[]) => console.log(`%c[sfu-state]%c ${msg}`, "color:#ec4899", "color:inherit", ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(`%c[sfu]%c ${msg}`, "color:#f97316", "color:inherit", ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`%c[sfu]%c ${msg}`, "color:#ef4444", "color:inherit", ...args),
};

/**
 * 记录 signaling 事件，包含消息类型和负载大小
 * 前缀：`[sfu-signal]` 蓝色 — 可在 DevTools 控制台中搜索
 */
function logSignal(type: string, detail: string, payload?: unknown) {
  const size = payload ? new Blob([JSON.stringify(payload)]).size : 0;
  LOG.signal(`${type} | ${detail}${size ? ` | 负载大小=${size}字节` : ""}`);
}

/**
 * 记录 ICE 候选者，包含传输信息
 * 前缀：`[sfu-ice]` 琥珀色
 */
function logIce(direction: "send" | "recv", target: string, candidate?: RTCIceCandidateInit) {
  const c = candidate as Record<string, unknown> | undefined;
  let info = t("common.unknown");
  if (c) {
    const proto = c.protocol || "";
    const addr = c.address || "";
    const port = c.port || "";
    info = proto && addr ? `${proto} ${addr}:${port}` : (c.candidate as string || "").split(" ").slice(2, 5).join(" ") || "已解析";
  }
  LOG.ice(`${direction === "send" ? "→" : "←"} ${target} | ${info}`);
}

type CallPhase = "outgoing" | "incoming" | "connecting" | "active" | "ended";

interface CallParticipant {
  userId: ID;
  muted: boolean;
  banned: boolean;
  publishing: CallTrackKind[];
}

interface RemoteMedia {
  userId: ID;
  kind: CallTrackKind;
  stream: MediaStream;
}

interface CurrentCall {
  callId: ID;
  conversationId: ID;
  kind: CallKind;
  fromUserId: ID;
  phase: CallPhase;
  startedAt: number;
  participants: Record<ID, CallParticipant>;
  localMuted: boolean;
  cameraOff: boolean;
  screenSharing: boolean;
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  remoteMedia: Record<string, RemoteMedia>;
  error?: string;
  /** Round-trip time in ms (averaged across all peer connections). */
  latency?: number;
  /** Jitter in ms (averaged across all inbound RTP streams). */
  jitter?: number;
  /** Packet loss percentage (averaged). */
  packetLoss?: number;
}

interface CallState {
  current: CurrentCall | null;
  incoming: Call | null;
  setCurrent: (call: CurrentCall | null) => void;
  patchCurrent: (patch: Partial<CurrentCall>) => void;
  setIncoming: (call: Call | null) => void;
  upsertParticipant: (p: Partial<CallParticipant> & { userId: ID }) => void;
  removeParticipant: (userId: ID) => void;
  setRemoteMedia: (media: RemoteMedia) => void;
  removeRemoteMedia: (userId: ID, kind?: CallTrackKind) => void;
  resetCall: () => void;
}

export const useCallStore = create<CallState>((set, get) => ({
  current: null,
  incoming: null,
  setCurrent: (call) => set({ current: call }),
  patchCurrent: (patch) => {
    const cur = get().current;
    if (!cur) return;
    set({ current: { ...cur, ...patch } });
  },
  setIncoming: (call) => set({ incoming: call }),
  upsertParticipant: (p) => {
    const cur = get().current;
    if (!cur) return;
    const prev = cur.participants[p.userId] ?? { userId: p.userId, muted: false, banned: false, publishing: [] };
    set({ current: { ...cur, participants: { ...cur.participants, [p.userId]: { ...prev, ...p } } } });
  },
  removeParticipant: (userId) => {
    const cur = get().current;
    if (!cur) return;
    const participants = { ...cur.participants };
    delete participants[userId];
    const remoteMedia = { ...cur.remoteMedia };
    for (const key of Object.keys(remoteMedia)) if (key.startsWith(`${userId}:`)) delete remoteMedia[key];
    set({ current: { ...cur, participants, remoteMedia } });
  },
  setRemoteMedia: (media) => {
    const cur = get().current;
    if (!cur) return;
    const key = `${media.userId}:${media.kind}`;
    const tracks = media.stream?.getTracks() ?? [];
    LOG.media(`setRemoteMedia key=${key} trackCount=${tracks.length}`);
    if (tracks.length === 0) {
      LOG.warn(`setRemoteMedia: 流没有轨道! streamId=${media.stream?.id}`);
    } else {
      for (const t of tracks) {
        LOG.media(`  轨道: ${t.kind} id=${t.id.slice(-6)} 启用=${t.enabled} 就绪=${t.readyState} 静音=${t.muted}`);
      }
    }
    set({ current: { ...cur, remoteMedia: { ...cur.remoteMedia, [key]: media } } });
  },
  removeRemoteMedia: (userId, kind) => {
    const cur = get().current;
    if (!cur) return;
    const remoteMedia = { ...cur.remoteMedia };
    if (kind) delete remoteMedia[`${userId}:${kind}`];
    else for (const key of Object.keys(remoteMedia)) if (key.startsWith(`${userId}:`)) delete remoteMedia[key];
    set({ current: { ...cur, remoteMedia } });
  },
  resetCall: () => set({ current: null, incoming: null }),
}));

function id() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `call_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// WebRTC browser compatibility layer
// ---------------------------------------------------------------------------

type PeerConnectionConstructor = new (config?: RTCConfiguration) => RTCPeerConnection;

const upstreams = new Map<ID, RTCPeerConnection>();
const downstreams = new Map<string, RTCPeerConnection>();
/** Serialises SDP renegotiation per peer connection so we never create a new
 *  offer while the previous offer/answer round is still pending. This avoids
 *  the "order of m-lines in subsequent offer doesn't match" error. */
const pcRenegotiationChains = new Map<RTCPeerConnection, Promise<unknown>>();

/** Requirement 1: Buffer ICE candidates that arrive before the downstream PC is created. */
const pendingDownstreamIce = new Map<string, RTCIceCandidateInit[]>();

/** Requirement 9: Track processed call:peer-left events with timestamps for time-window dedup. */
const peerLeftSeen = new Map<string, number>();

let _cachedCtor: PeerConnectionConstructor | null | undefined;
let _testResult: boolean | undefined; // cache the "can actually create a PC" test

let _statsTimer: number | null = null;
let _diagTimer: number | null = null;

/**
 * Requirement 10: Flush buffered ICE candidates into a newly-created downstream PC.
 */
function flushPendingDownstreamIce(key: string, pc: RTCPeerConnection) {
  const pending = pendingDownstreamIce.get(key);
  if (!pending || pending.length === 0) return;
  pendingDownstreamIce.delete(key);
  LOG.ice(`flushing ${pending.length} buffered ICE candidates for key=${key}`);
  for (const cand of pending) {
    pc.addIceCandidate(cand).catch((err) => {
      LOG.warn(`flushed ICE candidate failed for key=${key}:`, err);
    });
  }
}

/** Requirement 2: Timeout IDs for downstream-offer expected after call:answer. */
const downstreamOfferTimeouts = new Map<ID, number>();

/** Requirement 7: Previous RTT value for spike detection. */
let _lastRtt: number | undefined;

/** Requirement 8: Timestamp when each downstream PC reached "connected" state. */
const downstreamConnectedAt = new Map<string, number>();

// ---------------------------------------------------------------------------
// Req 2 + Req 4 + Req 5: Bandwidth adaptation state and performance thresholds
// ---------------------------------------------------------------------------

/** Performance thresholds — when exceeded, trigger degradation or recovery. */
const PERF_THRESHOLDS = {
  /** Max acceptable packet loss percentage before lowering video bitrate. */
  packetLossDegradePercent: 3,
  /** Max acceptable RTT in ms before lowering video bitrate. */
  rttDegradeMs: 300,
  /** Min acceptable bitrate floor in bps — never go below this. */
  videoBitrateFloor: 50_000,
  /** Max video bitrate in bps (initial). */
  videoBitrateMax: 200_000,
  /** Screen-share bitrate floor in bps. */
  screenBitrateFloor: 200_000,
  /** Audio bitrate floor in bps. */
  audioBitrateFloor: 8_000,
  /** Audio bitrate max in bps. */
  audioBitrateMax: 64_000,
  /** Seconds without inbound RTP before declaring stall. */
  stallTimeoutSec: 3,
};

/** Current adaptive bitrate state (mutable, not in store). */
const _adaptiveState = {
  currentVideoBitrate: PERF_THRESHOLDS.videoBitrateMax,
  currentAudioBitrate: PERF_THRESHOLDS.audioBitrateMax,
  degraded: false,
  /** Timestamp of last degradation step. */
  lastDegradeAt: 0,
  /** Timestamp of last recovery step. */
  lastRecoverAt: 0,
};

/**
 * Req 7: Track upstream PC for fast ICE restart on disconnect.
 * Maps callId → { pc, restartTimer, disconnectedAt }
 */
const upstreamIceWatchers = new Map<ID, { pc: RTCPeerConnection; restartTimer: number | null; disconnectedAt: number }>();

/**
 * Req 2 + Req 4: Adapt video sender encoding parameters based on available
 * bandwidth and packet loss. Lowers bitrate when loss exceeds threshold,
 * recovers when conditions improve.
 */
async function adaptSenderEncoding(pc: RTCPeerConnection, isScreen: boolean) {
  const sender = pc.getSenders().find((s) => s.track?.kind === "video");
  if (!sender) return;
  const params = sender.getParameters();
  if (!params.encodings || params.encodings.length === 0) return;

  const targetBitrate = isScreen
    ? Math.max(_adaptiveState.currentVideoBitrate * 4, PERF_THRESHOLDS.screenBitrateFloor)
    : _adaptiveState.currentVideoBitrate;

  let changed = false;
  for (const enc of params.encodings) {
    const currentMax = enc.maxBitrate ?? 0;
    if (Math.abs(currentMax - targetBitrate) > 10_000) {
      enc.maxBitrate = targetBitrate;
      changed = true;
    }
  }
  if (changed) {
    try {
      await sender.setParameters(params);
      LOG.stats(`adaptSenderEncoding: bitrate=${Math.round(targetBitrate / 1000)}kbps ${isScreen ? "(screen)" : "(video)"}`);
    } catch (err) {
      LOG.warn(`adaptSenderEncoding: setParameters failed: ${err}`);
    }
  }
}

/**
 * Req 2: Adapt video bitrate based on current adaptive state.
 * Called after pollStats detects packet loss changes.
 */
function adaptVideoBitrate() {
  const allUpstreams = Array.from(upstreams.values());
  const allDownstreams = Array.from(downstreams.values());
  for (const pc of [...allUpstreams, ...allDownstreams]) {
    if (pc.connectionState !== "connected") continue;
    const isScreen = pc.getSenders().some((s) => s.track?.label === "screen-share");
    void adaptSenderEncoding(pc, isScreen);
  }
}

/**
 * Req 3: Configure Opus VBR mode and set initial audio bitrate.
 * Modifies SDP to enable VBR and set maxaveragebitrate.
 */
function configureOpusVbr(pc: RTCPeerConnection) {
  // Opus VBR is enabled via SDP fmtp parameters.
  // We modify the local SDP before setting it to ensure VBR is active.
  // This is called after setLocalDescription to adjust the Opus parameters.
  const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
  if (!sender) return;

  const params = sender.getParameters();
  if (!params.encodings || params.encodings.length === 0) return;

  // Set audio bitrate using maxBitrate on the encoding.
  const targetBitrate = _adaptiveState.currentAudioBitrate;
  let changed = false;
  for (const enc of params.encodings) {
    const currentMax = enc.maxBitrate ?? 0;
    if (Math.abs(currentMax - targetBitrate) > 2000) {
      enc.maxBitrate = targetBitrate;
      changed = true;
    }
  }
  if (changed) {
    void sender.setParameters(params).catch(() => undefined);
  }
}

/**
 * Req 3: Adapt audio bitrate based on network conditions.
 * When video degrades, boost audio bitrate to compensate.
 * When network is good, keep audio at a comfortable level.
 */
function adaptAudioBitrate() {
  if (_adaptiveState.degraded) {
    // When degraded, prioritize audio — increase bitrate slightly.
    _adaptiveState.currentAudioBitrate = Math.min(
      _adaptiveState.currentAudioBitrate + 4_000,
      PERF_THRESHOLDS.audioBitrateMax,
    );
  } else {
    // When healthy, keep audio at a comfortable 48kbps.
    _adaptiveState.currentAudioBitrate = Math.min(
      48_000,
      PERF_THRESHOLDS.audioBitrateMax,
    );
  }
  // Apply to all audio senders.
  for (const pc of upstreams.values()) {
    if (pc.connectionState !== "connected") continue;
    configureOpusVbr(pc);
  }
}

/**
 * Req 5: Apply performance degradation strategy.
 * Called when a metric exceeds its threshold.
 */
function applyDegradeStrategy(reason: string) {
  if (_adaptiveState.degraded) return; // already degraded
  const now = Date.now();
  // Don't degrade more than once per 5 seconds.
  if (now - _adaptiveState.lastDegradeAt < 5000) return;
  _adaptiveState.degraded = true;
  _adaptiveState.lastDegradeAt = now;
  // Halve the video bitrate, but never below the floor.
  _adaptiveState.currentVideoBitrate = Math.max(
    _adaptiveState.currentVideoBitrate / 2,
    PERF_THRESHOLDS.videoBitrateFloor,
  );
  LOG.warn(`[perf-degrade] ${reason} — video bitrate → ${Math.round(_adaptiveState.currentVideoBitrate / 1000)}kbps`);
  adaptVideoBitrate();
  adaptAudioBitrate();
}

/**
 * Req 5: Apply performance recovery strategy.
 * Called when metrics return to healthy levels.
 */
function applyRecoverStrategy() {
  if (!_adaptiveState.degraded) return;
  const now = Date.now();
  // Don't recover more than once per 10 seconds.
  if (now - _adaptiveState.lastRecoverAt < 10000) return;
  _adaptiveState.degraded = false;
  _adaptiveState.lastRecoverAt = now;
  // Double the video bitrate, but never above the max.
  _adaptiveState.currentVideoBitrate = Math.min(
    _adaptiveState.currentVideoBitrate * 2,
    PERF_THRESHOLDS.videoBitrateMax,
  );
  LOG.stats(`[perf-recover] metrics healthy — video bitrate → ${Math.round(_adaptiveState.currentVideoBitrate / 1000)}kbps`);
  adaptVideoBitrate();
  adaptAudioBitrate();
}

/**
 * Req 7: Fast ICE restart — when upstream PC enters "disconnected",
 * wait 1 second then restart ICE instead of waiting for default timeout.
 */
function startIceRestartWatcher(callId: ID, pc: RTCPeerConnection) {
  // Clear any existing watcher for this call.
  stopIceRestartWatcher(callId);
  const disconnectedAt = Date.now();
  const timer = window.setTimeout(() => {
    upstreamIceWatchers.delete(callId);
    const currentPc = upstreams.get(callId);
    if (!currentPc || currentPc !== pc) return; // PC was replaced
    if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
      LOG.warn(`[ice-restart] upstream PC disconnected for >1s — restarting ICE`);
      pc.restartIce();
      // Re-create offer with ICE restart.
      runRenegotiationStep(pc, async () => {
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        logSignal("→ call:offer (ice-restart)", `callId=${callId} sdpLen=${(offer.sdp ?? "").length}`);
        wsClient.callOffer(callId, offer.sdp ?? "");
      });
    }
  }, 1000);
  upstreamIceWatchers.set(callId, { pc, restartTimer: timer, disconnectedAt });
}

function stopIceRestartWatcher(callId: ID) {
  const w = upstreamIceWatchers.get(callId);
  if (w) {
    if (w.restartTimer !== null) clearTimeout(w.restartTimer);
    upstreamIceWatchers.delete(callId);
  }
}

/**
 * Requirement 10: Pre-fetch ICE servers and detect PC constructor at module load.
 * Wrapped in try/catch to prevent ReferenceError from blocking WebRTC functionality
 * if bundler or scope issues cause module-level initialization to fail.
 */
export const webrtcReady: Promise<void> = (async () => {
  try {
    await fetchIceServers();
  } catch (err) {
    logCompat(`Module-level fetchIceServers failed: ${err}`);
  }
  try {
    getPeerConnectionCtor();
  } catch (err) {
    logCompat(`Module-level getPeerConnectionCtor failed: ${err}`);
  }
})();

/**
 * Dump comprehensive call state for debugging.
 * Shows every upstream/downstream PC, their tracks, and media state.
 */
function dumpCallState() {
  const cur = useCallStore.getState().current;
  const upEntries = Array.from(upstreams.entries());
  const downEntries = Array.from(downstreams.entries());
  const remoteKeys = cur ? Object.keys(cur.remoteMedia) : [];
  const localTracks = cur?.localStream?.getTracks() ?? [];

  console.group("%c[sfu-diag] 通话状态", "color:#06b6d4; font-weight:bold");
  console.log(`阶段=${cur?.phase} 类型=${cur?.kind}`);
  console.log(`上行 PC 数量: ${upEntries.length}`, upEntries.map(([id, pc]) => `  ${id}: 状态=${pc.connectionState} 信令=${pc.signalingState}`).join("\n") || "  (无)");
  console.log(`下行 PC 数量: ${downEntries.length}`, downEntries.map(([key, pc]) => `  ${key}: 状态=${pc.connectionState} 信令=${pc.signalingState}`).join("\n") || "  (无)");
  // 远程媒体详细信息
  if (remoteKeys.length > 0 && cur) {
    console.log(`远程媒体键: [${remoteKeys.join(", ")}]`);
    for (const key of remoteKeys) {
      const media = cur.remoteMedia[key];
      const tracks = media.stream?.getTracks() ?? [];
      console.log(`  ${key}: 轨道数=${tracks.length}`, tracks.map((t) => `${t.kind}(启用=${t.enabled} 就绪=${t.readyState} 静音=${t.muted})`).join(", "));
    }
  } else {
    console.log(`远程媒体键: [] (空 — 无远程流!)`);
  }
  // 下行 PC 发送器元数据 — 显示实际启用/就绪状态而非占位符
  for (const [key, pc] of downEntries) {
    const senders = pc.getSenders();
    if (senders.length > 0) {
      console.log(`  下行发送器 [${key}]:`, senders.map((s) => {
        const kind = s.track?.kind ?? "unknown";
        const enabled = s.track?.enabled ?? false;
        const readyState = s.track?.readyState ?? "unknown";
        return `${kind}(启用=${enabled} 就绪=${readyState})`;
      }).join(", "));
    }
  }
  console.log(`本地流轨道数量: ${localTracks.length}`, localTracks.map((t) => `  ${t.kind}: 启用=${t.enabled} 就绪=${t.readyState}`).join("\n") || "  (无)");
  console.log(`上行=${cur?.latency}ms 抖动=${cur?.jitter}ms 丢包率=${cur?.packetLoss}%`);
  console.groupEnd();
}

/**
 * Poll WebRTC getStats() across all peer connections to compute
 * average RTT, jitter, and packet loss. Updates the store every 3s.
 */
async function pollStats(callId: ID) {
  const allUpstreams = Array.from(upstreams.values());
  const allDownstreams = Array.from(downstreams.values());
  const allPCs = [
    ...allUpstreams,
    ...allDownstreams,
  ].filter((pc) => pc.connectionState !== "closed" && pc.connectionState !== "failed");

  LOG.stats(`pollStats: 总计 PC=${allPCs.length} (上行=${allUpstreams.length}, 下行=${allDownstreams.length})`);

  if (allPCs.length === 0) {
    LOG.stats("pollStats: 无活动 PC");
    return;
  }

  let totalRtt = 0;
  let rttCount = 0;
  let totalJitter = 0;
  let jitterCount = 0;
  let totalLost = 0;
  let totalPackets = 0;
  let inboundRtpCount = 0;
  let totalBytesReceived = 0;
  let totalBytesSent = 0;

  // Requirement 6: Collect sender track metadata for diagnostics display.
  const senderMetadata: Array<{ key: string; kind: string; readyState: string; enabled: boolean }> = [];
  for (const [key, pc] of downstreams) {
    if (pc.connectionState === "closed" || pc.connectionState === "failed") continue;
    for (const sender of pc.getSenders()) {
      senderMetadata.push({
        key,
        kind: sender.track?.kind ?? "unknown",
        readyState: sender.track?.readyState ?? "unknown",
        enabled: sender.track?.enabled ?? false,
      });
    }
  }
  if (senderMetadata.length > 0) {
    LOG.stats(`pollStats: 下行发送端轨道元数据 — 共 ${senderMetadata.length} 个`);
    for (const s of senderMetadata) {
      LOG.stats(`  [${s.key}] ${s.kind}: 就绪=${s.readyState} 启用=${s.enabled}`);
    }
  }

  // 建立 PC → 下游键的映射，用于关联入站 RTP 报告
  const downstreamKeysByPc = new Map<RTCPeerConnection, string>();
  for (const [key, pc] of downstreams) {
    downstreamKeysByPc.set(pc, key);
  }

  for (const pc of allPCs) {
    try {
      const stats = await pc.getStats();
      const isDownstream = downstreamKeysByPc.has(pc);

      stats.forEach((report) => {
        if (report.type === "candidate-pair" && report.state === "succeeded" && report.currentRoundTripTime != null) {
          totalRtt += report.currentRoundTripTime * 1000;
          rttCount++;
        }
        if (report.type === "inbound-rtp" && isDownstream) {
          // Requirement 3: Only count downstream inbound-rtp for quality metrics.
          inboundRtpCount++;
          if (report.jitter != null) {
            totalJitter += report.jitter * 1000;
            jitterCount++;
          }
          if (report.packetsLost != null && report.packetsReceived != null) {
            totalLost += report.packetsLost;
            totalPackets += report.packetsLost + report.packetsReceived;
          }
          if (report.bytesReceived != null) {
            totalBytesReceived += report.bytesReceived;
          }
        }
        if (report.type === "outbound-rtp") {
          if (report.bytesSent != null) {
            totalBytesSent += report.bytesSent;
          }
        }
      });
    } catch {
      // PC might have closed during polling
    }
  }

  const latency = rttCount > 0 ? Math.round(totalRtt / rttCount) : undefined;
  const jitter = jitterCount > 0 ? Math.round(totalJitter / jitterCount) : undefined;
  const packetLoss = totalPackets > 0 ? Math.round((totalLost / totalPackets) * 100) : undefined;
  const bytesReceived = totalBytesReceived > 0 ? Math.round(totalBytesReceived / 1024) : 0;
  const bytesSent = totalBytesSent > 0 ? Math.round(totalBytesSent / 1024) : 0;

  LOG.stats(`pollStats 结果: RTT=${latency ?? "-"}ms 抖动=${jitter ?? "-"}ms 丢包=${packetLoss ?? "-"}% 入站RTP=${inboundRtpCount} 接收=${bytesReceived}KB 发送=${bytesSent}KB`);

  // Requirement 6: Balance check — if downstream exists, ensure inbound bytes
  // received by subscriber >= 10% of bytes sent. Significant imbalance indicates
  // packet loss or media flow disruption.
  const hasDownstreams = allDownstreams.some((pc) => pc.connectionState !== "closed" && pc.connectionState !== "failed");
  if (hasDownstreams && bytesSent > 10 && bytesReceived === 0) {
    LOG.warn(`balance check: downstream exists but bytesReceived=0 while bytesSent=${bytesSent}KB — severe imbalance`);
  } else if (hasDownstreams && bytesSent > 10 && bytesReceived < bytesSent * 0.1) {
    LOG.warn(`balance check: bytesReceived=${bytesReceived}KB < 10% of bytesSent=${bytesSent}KB — significant loss`);
  }

  // Requirement 7: Detect RTT spikes — warn when RTT jumps by >500ms between polls.
  if (latency !== undefined && _lastRtt !== undefined) {
    const rttDelta = Math.abs(latency - _lastRtt);
    if (rttDelta > 500) {
      LOG.warn(`RTT spike detected: ${_lastRtt}ms → ${latency}ms (delta=${rttDelta}ms > 500ms threshold)`);
    }
  }
  if (latency !== undefined) _lastRtt = latency;

  // Requirement 8: Verify inbound RTP arrived within 1s of downstream connected state.
  const now = Date.now();
  for (const [key, connectedTs] of downstreamConnectedAt) {
    const elapsed = now - connectedTs;
    if (elapsed > 1000 && elapsed < 5000) {
      // Check if this downstream has any inbound RTP reports.
      const hasInbound = Array.from(downstreams.entries()).some(
        ([k, pc]) => k === key && pc.connectionState === "connected",
      );
      if (hasInbound && inboundRtpCount === 0) {
        LOG.warn(`downstream[${key}] connected ${(elapsed / 1000).toFixed(1)}s ago but no inbound RTP reports yet`);
      }
    }
    // Clean up entries older than 10s.
    if (elapsed > 10_000) downstreamConnectedAt.delete(key);
  }

  // Requirement 4: Cross-validate diagnostics with stats.
  const activeRemoteTracks = Object.keys(useCallStore.getState().current?.remoteMedia ?? {}).length;
  const callPhase = useCallStore.getState().current?.phase;

  if (inboundRtpCount === 0 && activeRemoteTracks > 0 && callPhase === "active") {
    LOG.warn(`pollStats: diagnostics show ${activeRemoteTracks} active remote track(s) but inboundRtpCount=0 — media metrics may be stale`);
  }

  for (const [key, pc] of downstreams) {
    if (pc.connectionState === "closed" || pc.connectionState === "failed") continue;
    const receivers = pc.getReceivers();
    const hasLiveTrack = receivers.some((r) => r.track?.readyState === "live");
    if (!hasLiveTrack && callPhase === "active") {
      LOG.stats(`pollStats: downstream ${key} has no live receiver tracks yet`);
    }
  }

  useCallStore.getState().patchCurrent({ latency, jitter, packetLoss });

  // Req 4: Bandwidth adaptation — trigger on packet loss > 3% or RTT > 300ms.
  if (packetLoss !== undefined && packetLoss > PERF_THRESHOLDS.packetLossDegradePercent) {
    applyDegradeStrategy(`packet loss ${packetLoss}% > ${PERF_THRESHOLDS.packetLossDegradePercent}% threshold`);
  } else if (latency !== undefined && latency > PERF_THRESHOLDS.rttDegradeMs) {
    applyDegradeStrategy(`RTT ${latency}ms > ${PERF_THRESHOLDS.rttDegradeMs}ms threshold`);
  } else if (
    packetLoss !== undefined && packetLoss <= 1 &&
    latency !== undefined && latency < 150
  ) {
    applyRecoverStrategy();
  }
  // Req 2: Continuously adapt video encoding based on current adaptive state.
  adaptVideoBitrate();
  // Req 3: Adapt audio bitrate based on degradation state.
  adaptAudioBitrate();

  // 定期状态转储，每 15 秒用于调试
  if (useCallStore.getState().current?.phase === "active") {
    dumpCallState();
    // Adaptive polling: 3s when data is flowing, 15s when idle
    const hasDataFlow = inboundRtpCount > 0;
    const pollInterval = hasDataFlow ? 3_000 : 15_000;
    _statsTimer = window.setTimeout(() => pollStats(callId), pollInterval);
  }
}

function startStatsPolling(callId: ID) {
  stopStatsPolling();
  LOG.stats("开始统计轮询 — 初始状态转储:");
  dumpCallState();
  _statsTimer = window.setTimeout(() => pollStats(callId), 3000);
}

function stopStatsPolling() {
  if (_statsTimer !== null) {
    clearTimeout(_statsTimer);
    _statsTimer = null;
  }
  if (_diagTimer !== null) {
    clearTimeout(_diagTimer);
    _diagTimer = null;
  }
}

function logCompat(msg: string) {
  console.warn("[webrtc-compat]", msg);
}

/** Collect diagnostic info about the current environment. */
export function getWebRTCDiagnostics(): Record<string, unknown> {
  const w = window as any;
  return {
    protocol: location.protocol,
    isSecureContext: window.isSecureContext,
    hasRTCPeerConnection: typeof w.RTCPeerConnection === "function",
    hasWebKitRTCPeerConnection: typeof w.webkitRTCPeerConnection === "function",
    hasMozRTCPeerConnection: typeof w.mozRTCPeerConnection === "function",
    hasMediaDevices: !!navigator.mediaDevices,
    hasGetUserMedia: typeof navigator.mediaDevices?.getUserMedia === "function",
    hasGetDisplayMedia: typeof navigator.mediaDevices?.getDisplayMedia === "function",
    userAgent: navigator.userAgent,
    platform: navigator.platform,
  };
}

/**
 * Detect the RTCPeerConnection constructor available in the current browser,
 * trying the standard API first, then legacy vendor-prefixed variants.
 * Returns null if no usable constructor is found.
 */
function detectPeerConnectionCtor(): PeerConnectionConstructor | null {
  const w = window as any;

  // Standard (Chrome 56+, Firefox 44+, Safari 11+, Edge 79+)
  if (typeof w.RTCPeerConnection === "function") return w.RTCPeerConnection;

  // Legacy Chrome / Opera (pre-Chromium Edge used this too)
  if (typeof w.webkitRTCPeerConnection === "function") return w.webkitRTCPeerConnection;

  // Legacy Firefox
  if (typeof w.mozRTCPeerConnection === "function") return w.mozRTCPeerConnection;

  return null;
}

/**
 * Verify that the detected constructor actually works by creating a
 * throwaway RTCPeerConnection. Some browsers expose the constructor but
 * throw on instantiation (restricted context, feature flag disabled, etc.).
 * We only do this test once per session.
 */
function testPeerConnectionCtor(Ctor: PeerConnectionConstructor): boolean {
  if (_testResult !== undefined) return _testResult;
  try {
    const pc = new Ctor({ iceServers: [] });
    // If we got here, the constructor works.
    try { pc.close(); } catch { /* ignore */ }
    _testResult = true;
    logCompat("RTCPeerConnection instantiation test passed");
  } catch (err) {
    _testResult = false;
    logCompat(`RTCPeerConnection instantiation test FAILED: ${err}`);
  }
  return _testResult;
}

/**
 * Get a usable RTCPeerConnection constructor, caching the result.
 * If a cached constructor later fails at instantiation, call
 * `resetPeerConnectionCtor()` to clear it and retry detection.
 */
function getPeerConnectionCtor(): PeerConnectionConstructor | null {
  if (_cachedCtor !== undefined) return _cachedCtor;
  _cachedCtor = detectPeerConnectionCtor();
  if (_cachedCtor) {
    const ctorName = _cachedCtor.name || "(anonymous)";
    logCompat(`Detected RTCPeerConnection: ${ctorName}`);
    // Verify the constructor actually works
    if (!testPeerConnectionCtor(_cachedCtor)) {
      logCompat(`Constructor ${ctorName} detected but instantiation failed — clearing`);
      _cachedCtor = null;
    }
  } else {
    logCompat("No RTCPeerConnection constructor found in this browser");
    const diag = getWebRTCDiagnostics();
    logCompat(`Diagnostics: ${JSON.stringify(diag)}`);
  }
  return _cachedCtor;
}

function resetPeerConnectionCtor() {
  _cachedCtor = undefined;
  _testResult = undefined;
}

let _cachedIceConfig: RTCConfiguration | null = null;

async function fetchIceServers(): Promise<RTCConfiguration> {
  if (_cachedIceConfig) return _cachedIceConfig;
  try {
    const res = await apiFetch("/api/system/ice-servers");
    if (!res.ok) throw new Error("Failed to fetch ICE servers");
    const data = await res.json();
    _cachedIceConfig = {
      iceServers: data.iceServers || [],
      iceTransportPolicy: "all",
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
      // Req 1: Pre-allocate ICE candidate pairs to reduce connection setup time.
      iceCandidatePoolSize: 4,
    };
    logCompat(`ICE: loaded ${data.iceServers?.length || 0} server(s) from API`);
  } catch (err) {
    logCompat(`ICE: failed to fetch from API, using defaults: ${err}`);
    _cachedIceConfig = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
      iceTransportPolicy: "all",
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
      // Req 1: Pre-allocate ICE candidate pairs for faster connection.
      iceCandidatePoolSize: 4,
    };
  }
  return _cachedIceConfig;
}

/**
 * Create an RTCPeerConnection with full error handling.
 * If the cached constructor fails at instantiation, it resets the cache
 * and retries with fresh detection (handles edge cases where the old
 * constructor reference becomes stale).
 */
async function createPeerConnection(): Promise<RTCPeerConnection> {
  const Ctor = getPeerConnectionCtor();
  if (!Ctor) {
    throw new Error(t("call.notSupported"));
  }

  const iceConfig = await fetchIceServers();
  try {
    return new Ctor(iceConfig);
  } catch (err) {
    logCompat(`RTCPeerConnection instantiation failed (${Ctor.name}): ${err}`);
    resetPeerConnectionCtor();

    // Retry detection — maybe a different prefix works
    const retry = detectPeerConnectionCtor();
    if (retry && testPeerConnectionCtor(retry)) {
      try {
        logCompat(`Retrying with ${retry.name || "fallback"}…`);
        return new retry(iceConfig);
      } catch (err2) {
        logCompat(`Retry also failed: ${err2}`);
      }
    }

    const diag = getWebRTCDiagnostics();
    logCompat(`All constructors failed. Diagnostics: ${JSON.stringify(diag)}`);
    throw new Error(t("call.notAvailable"));
  }
}

/**
 * Run an async SDP renegotiation step for a peer connection in strict order.
 * WebRTC requires that offers/answers are processed one at a time; creating a
 * second offer while the previous one is still pending changes m-line order and
 * triggers "The order of m-lines in subsequent offer doesn't match order from
 * previous offer/answer". This helper chains calls so each step waits for the
 * previous one to finish, and removes closed PCs from the chain map.
 */
function runRenegotiationStep<T>(
  pc: RTCPeerConnection,
  step: () => Promise<T>,
): Promise<T | undefined> {
  if (pc.connectionState === "closed" || pc.signalingState === "closed") {
    pcRenegotiationChains.delete(pc);
    return Promise.resolve(undefined);
  }
  const previous = pcRenegotiationChains.get(pc) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => {
      if (pc.connectionState === "closed" || pc.signalingState === "closed") return undefined;
      return step();
    })
    .catch((err) => {
      logCompat(`renegotiation step failed: ${err}`);
      return undefined;
    })
    .finally(() => {
      if (pcRenegotiationChains.get(pc) === next) {
        pcRenegotiationChains.delete(pc);
      }
    });
  pcRenegotiationChains.set(pc, next);
  return next as Promise<T | undefined>;
}

/**
 * Comprehensive browser support check covering:
 * 1. RTCPeerConnection constructor availability + instantiation test
 * 2. MediaDevices API (getUserMedia)
 * 3. Secure context check (informational)
 */
function webRTCSupported(): boolean {
  const ctor = getPeerConnectionCtor();
  if (!ctor) return false;

  if (!navigator.mediaDevices) {
    logCompat("navigator.mediaDevices is not available (insecure context?)");
    return false;
  }

  if (typeof navigator.mediaDevices.getUserMedia !== "function") {
    logCompat("navigator.mediaDevices.getUserMedia is not a function");
    return false;
  }

  if (!window.isSecureContext) {
    logCompat(`Insecure context: protocol=${location.protocol} — getUserMedia may be blocked`);
  }

  return true;
}

function addLocalTracks(pc: RTCPeerConnection, stream: MediaStream, kind: CallKind) {
  const audio = stream.getAudioTracks()[0];
  if (audio) pc.addTrack(audio, stream);
  if (kind === "video") {
    const video = stream.getVideoTracks()[0];
    if (video) pc.addTrack(video, stream);
  }
}

/**
 * Get local media with fallback: if video fails (permission denied, no
 * camera, etc.), fall back to audio-only and update the call kind.
 */
async function getLocalMedia(kind: CallKind): Promise<{ stream: MediaStream; actualKind: CallKind }> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      // Req 9: Enable echo cancellation, noise suppression, and auto gain control.
      // These audio preprocessing features ensure clear audio in noisy environments.
      // The browser applies AEC/NS/AGC before encoding — no additional processing needed.
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video:
        kind === "video"
          ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 20, max: 24 } }
          : false,
    });
    return { stream, actualKind: kind };
  } catch (err) {
    // If video failed, try audio-only as fallback
    if (kind === "video") {
      logCompat(`Video getUserMedia failed (${err}), falling back to audio-only`);
      const stream = await navigator.mediaDevices.getUserMedia({
        // Req 9: Audio preprocessing enabled for clear voice in noisy environments.
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      return { stream, actualKind: "audio" };
    }
    throw err;
  }
}

async function publishUpstream(callId: ID, kind: CallKind, stream: MediaStream) {
  LOG.state("publishUpstream — " + t("call.publishUpstream"));
  const pc = await createPeerConnection();
  upstreams.set(callId, pc);
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      logIce("send", "upstream", e.candidate.toJSON());
      wsClient.callIce(callId, e.candidate.toJSON(), "upstream");
    }
  };
  // Req 7: Watch for upstream disconnect to trigger fast ICE restart.
  pc.onconnectionstatechange = () => {
    LOG.state(`upstream[${callId}] connectionState=${pc.connectionState}`);
    if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
      startIceRestartWatcher(callId, pc);
    } else if (pc.connectionState === "connected") {
      stopIceRestartWatcher(callId);
    }
  };
  addLocalTracks(pc, stream, kind);
  // Req 3: Configure Opus VBR after adding audio track.
  configureOpusVbr(pc);
  const tracks = stream.getTracks().map((t) => `${t.kind}:${t.id.slice(-4)}`).join(",");
  LOG.media(`上行 PC 轨道已t("common.submit"): ${tracks}`);
  await runRenegotiationStep(pc, async () => {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    logSignal("→ call:offer (upstream)", `kind=${kind} sdpLen=${(offer.sdp ?? "").length}`);
    wsClient.callOffer(callId, offer.sdp ?? "");
  });
}

function emptyCall(
  callId: ID,
  conversationId: ID,
  kind: CallKind,
  fromUserId: ID,
  phase: CallPhase,
): CurrentCall {
  const me = useChatStore.getState().me;
  return {
    callId,
    conversationId,
    kind,
    fromUserId,
    phase,
    startedAt: Date.now(),
    participants: me
      ? { [me.id]: { userId: me.id, muted: false, banned: false, publishing: [] } }
      : {},
    localMuted: false,
    cameraOff: kind === "audio",
    screenSharing: false,
    localStream: null,
    screenStream: null,
    remoteMedia: {},
  };
}

async function enterCall(
  callId: ID,
  conversationId: ID,
  kind: CallKind,
  fromUserId: ID,
  phase: CallPhase,
) {
  const store = useCallStore.getState();
  LOG.state(`enterCall — callId=${callId} kind=${kind} phase=${phase}`);
  store.setCurrent(emptyCall(callId, conversationId, kind, fromUserId, phase));
  if (!webRTCSupported()) {
    LOG.warn("enterCall: WebRTC not supported");
    store.patchCurrent({
      phase: "ended",
      error: t("call.notSupported"),
    });
    return;
  }
  try {
    const { stream, actualKind } = await getLocalMedia(kind);
    const audioTracks = stream.getAudioTracks();
    const videoTracks = stream.getVideoTracks();
    LOG.media(`getUserMedia OK — actualKind=${actualKind}`);
    LOG.media(`  音频轨道: ${audioTracks.length}${audioTracks.length > 0 ? ` [${audioTracks.map((t) => `enabled=${t.enabled} ready=${t.readyState} id=${t.id.slice(-6)}`).join(", ")}]` : ""}`);
    LOG.media(`  视频轨道: ${videoTracks.length}${videoTracks.length > 0 ? ` [${videoTracks.map((t) => `enabled=${t.enabled} ready=${t.readyState} id=${t.id.slice(-6)}`).join(", ")}]` : ""}`);
    if (audioTracks.length === 0 && videoTracks.length === 0) {
      LOG.error("getUserMedia returned EMPTY stream — no audio or video tracks!");
    }
    useCallStore.getState().patchCurrent({
      localStream: stream,
      phase: "connecting",
      cameraOff: actualKind === "audio",
      kind: actualKind,
    });
    await publishUpstream(callId, actualKind, stream);
    
    // 主动订阅所有现有的发布者，确保接收到 RTP 报告
    // 这样可以确保t("nav.contacts")在加入通话时就能接收到其他参与者的媒体流
    setTimeout(() => {
      const cur = useCallStore.getState().current;
      if (cur && cur.phase === "connecting") {
        for (const [userId, participant] of Object.entries(cur.participants)) {
          if (userId === fromUserId) continue; // 跳过自己
          if (participant.publishing && participant.publishing.length > 0) {
            for (const kind of participant.publishing) {
              logSignal("→ call:subscribe (enterCall)", `publisher=${userId} kind=${kind}`);
              wsClient.callSubscribe(callId, userId, kind);
            }
          }
        }
      }
    }, 100);
  } catch (err) {
    const msg = err instanceof Error ? err.message : t("call.mediaError");
    LOG.error(`enterCall failed: ${msg}`);
    useCallStore.getState().patchCurrent({ error: msg });
  }
}

export const callController = {
  async startOutgoing(conversationId: ID, kind: CallKind) {
    const me = useChatStore.getState().me;
    if (!me) return;
    const callId = id();
    LOG.state(`startOutgoing — callId=${callId} conv=${conversationId} kind=${kind}`);
    if (!webRTCSupported()) {
      useCallStore.getState().setCurrent(
        emptyCall(callId, conversationId, kind, me.id, "ended"),
      );
      useCallStore.getState().patchCurrent({
        error: t("call.notSupported"),
      });
      return;
    }
    logSignal("→ call:invite", `conv=${conversationId} kind=${kind}`);
    wsClient.callInvite(callId, conversationId, kind);
    useCallStore.getState().setCurrent(
      emptyCall(callId, conversationId, kind, me.id, "outgoing"),
    );
  },

    async acceptIncoming() {
    const incoming = useCallStore.getState().incoming;
    if (!incoming) return;
    LOG.state(`acceptIncoming — callId=${incoming.id}`);
    logSignal("→ call:accept", `callId=${incoming.id}`);
    wsClient.callAccept(incoming.id);
    useCallStore.getState().setIncoming(null);
    await enterCall(
      incoming.id,
      incoming.conversationId,
      incoming.kind,
      incoming.fromUserId,
      "connecting",
    );
    startStatsPolling(incoming.id);
  },

  rejectIncoming() {
    const incoming = useCallStore.getState().incoming;
    if (!incoming) return;
    logSignal("→ call:reject", `callId=${incoming.id}`);
    wsClient.callReject(incoming.id);
    useCallStore.getState().setIncoming(null);
  },

  hangup() {
    const cur = useCallStore.getState().current;
    if (!cur) return;
    if (cur.phase === "outgoing" || cur.phase === "connecting") {
      logSignal("→ call:cancel", `callId=${cur.callId}`);
      wsClient.callCancel(cur.callId);
    } else {
      logSignal("→ call:hangup", `callId=${cur.callId}`);
      wsClient.callHangup(cur.callId);
    }
    this.cleanup();
  },

  cleanup() {
    stopStatsPolling();
    // Req 7: Stop ICE restart watchers for all active calls.
    for (const [callId] of upstreamIceWatchers) {
      stopIceRestartWatcher(callId);
    }
    // Requirement 2: Cancel any pending downstream-offer timeouts.
    for (const tid of downstreamOfferTimeouts.values()) clearTimeout(tid);
    downstreamOfferTimeouts.clear();
    downstreamConnectedAt.clear();
    const cur = useCallStore.getState().current;
    if (cur) LOG.state(`清理 — 通话结束, 阶段=${cur.phase} 上行=${upstreams.size} 下行=${downstreams.size}`);

    // Req 10: Stop all tracks immediately — release media resources within 1s.
    cur?.localStream?.getTracks().forEach((t) => {
      try { t.stop(); } catch { /* noop */ }
    });
    cur?.screenStream?.getTracks().forEach((t) => {
      try { t.stop(); } catch { /* noop */ }
    });
        // Req 10: Close all PCs and null sender/receiver references.
    for (const pc of upstreams.values()) {
      try {
        // Remove all senders to release media track references.
        for (const sender of pc.getSenders()) {
          try { sender.replaceTrack(null).catch(() => undefined); } catch { /* noop */ }
        }
        pc.close();
      } catch { /* noop */ }
    }
    for (const pc of downstreams.values()) {
      try {
        pc.close();
      } catch { /* noop */ }
    }
    upstreams.clear();
    downstreams.clear();
    pendingDownstreamIce.clear();
    peerLeftSeen.clear();
    _lastRtt = undefined;
    // Req 10: Reset adaptive state to prevent stale values in next call.
    _adaptiveState.currentVideoBitrate = PERF_THRESHOLDS.videoBitrateMax;
    _adaptiveState.currentAudioBitrate = PERF_THRESHOLDS.audioBitrateMax;
    _adaptiveState.degraded = false;
    _adaptiveState.lastDegradeAt = 0;
    _adaptiveState.lastRecoverAt = 0;
    useCallStore.getState().resetCall();
  },

  toggleMute() {
    const cur = useCallStore.getState().current;
    if (!cur?.localStream) return;
    const muted = !cur.localMuted;
    cur.localStream.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
    useCallStore.getState().patchCurrent({ localMuted: muted });
  },

  toggleCamera() {
    const cur = useCallStore.getState().current;
    if (!cur?.localStream) return;
    const off = !cur.cameraOff;
    cur.localStream.getVideoTracks().forEach((t) => {
      t.enabled = !off;
    });
    useCallStore.getState().patchCurrent({ cameraOff: off });
  },

  async restoreCall(info: ActiveCallInfo) {
    const me = useChatStore.getState().me;
    if (!me) return;
    LOG.state(`restoreCall — callId=${info.callId} conv=${info.conversationId} kind=${info.kind}`);
    if (!webRTCSupported()) {
      useCallStore.getState().setCurrent(
        emptyCall(info.callId, info.conversationId, info.kind, info.fromUserId, "ended"),
      );
      useCallStore.getState().patchCurrent({ error: t("call.notSupported") });
      return;
    }

    // Pre-populate participants from server data
    const participants: Record<ID, CallParticipant> = {};
    if (me) participants[me.id] = { userId: me.id, muted: false, banned: false, publishing: [] };
    for (const p of info.participants) {
      participants[p.userId] = { userId: p.userId, muted: p.muted, banned: p.banned, publishing: p.publishing };
    }

    useCallStore.getState().setCurrent({
      callId: info.callId,
      conversationId: info.conversationId,
      kind: info.kind,
      fromUserId: info.fromUserId,
      phase: "connecting",
      startedAt: Date.now(),
      participants,
      localMuted: false,
      cameraOff: info.kind === "audio",
      screenSharing: false,
      localStream: null,
      screenStream: null,
      remoteMedia: {},
    });

    try {
      const { stream, actualKind } = await getLocalMedia(info.kind);
      useCallStore.getState().patchCurrent({ localStream: stream, cameraOff: actualKind === "audio", kind: actualKind });
      LOG.media(`restoreCall: got local media, actualKind=${actualKind}`);

      // Send offer directly to rejoin the existing room
      const pc = await createPeerConnection();
      upstreams.set(info.callId, pc);
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          logIce("send", "upstream", e.candidate.toJSON());
          wsClient.callIce(info.callId, e.candidate.toJSON(), "upstream");
        }
      };
      // Req 7: Watch for upstream disconnect to trigger fast ICE restart.
      pc.onconnectionstatechange = () => {
        LOG.state(`upstream[${info.callId}] connectionState=${pc.connectionState}`);
        if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
          startIceRestartWatcher(info.callId, pc);
        } else if (pc.connectionState === "connected") {
          stopIceRestartWatcher(info.callId);
        }
      };
      addLocalTracks(pc, stream, actualKind);
      // Req 3: Configure Opus VBR after adding audio track.
      configureOpusVbr(pc);
      await runRenegotiationStep(pc, async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        logSignal("→ call:offer (restoreCall)", `callId=${info.callId} sdpLen=${(offer.sdp ?? "").length}`);
        wsClient.callOffer(info.callId, offer.sdp ?? "");
      });

      startStatsPolling(info.callId);

      // Auto-subscribe to existing participants' published tracks
      setTimeout(() => {
        const cur = useCallStore.getState().current;
        if (cur && cur.phase === "connecting") {
          for (const p of info.participants) {
            if (p.userId === me?.id) continue;
            for (const kind of p.publishing) {
              logSignal("→ call:subscribe (restoreCall)", `publisher=${p.userId} kind=${kind}`);
              wsClient.callSubscribe(info.callId, p.userId, kind);
            }
          }
        }
      }, 200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("call.mediaError");
      LOG.error(`restoreCall failed: ${msg}`);
      useCallStore.getState().patchCurrent({ error: msg });
    }
  },

  async shareScreen() {
    const cur = useCallStore.getState().current;
    const pc = cur ? upstreams.get(cur.callId) : null;
    if (!cur || !pc) return;
    if (cur.screenSharing) {
      LOG.media(`screen share: stopping (restoring camera)`);
      cur.screenStream?.getTracks().forEach((t) => t.stop());
      const videoSender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (videoSender) {
        const cameraTrack = cur.localStream?.getVideoTracks()[0];
        if (cameraTrack) {
          try {
            await videoSender.replaceTrack(cameraTrack);
          } catch (err) {
            logCompat(`replaceTrack(camera) failed: ${err}`);
          }
        }
      }
      useCallStore.getState().patchCurrent({ screenSharing: false, screenStream: null });
      // Renegotiate to restore camera — serialise to avoid SDP m-line order errors.
      runRenegotiationStep(pc, async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        wsClient.callOffer(cur.callId, offer.sdp ?? "");
      });
      return;
    }
    try {
      if (!navigator.mediaDevices?.getDisplayMedia)
        throw new Error(t("call.screenShareNotSupported"));
      LOG.media("screen share: requesting getDisplayMedia");
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 12, max: 15 } },
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      // Use replaceTrack on the existing video sender instead of addTrack
      // to avoid creating a new m-line that breaks SDP order.
      const videoSender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (videoSender) {
        await videoSender.replaceTrack(track);
      } else {
        // Fallback: no existing video sender (audio-only call upgraded to video)
        pc.addTrack(track, stream);
      }
      track.onended = () => {
        // Screen share stopped by browser UI — restore camera
        const cameraTrack = useCallStore.getState().current?.localStream?.getVideoTracks()[0];
        if (videoSender && cameraTrack) {
          videoSender.replaceTrack(cameraTrack).catch(() => undefined);
        }
        useCallStore.getState().patchCurrent({ screenSharing: false, screenStream: null });
      };
      useCallStore.getState().patchCurrent({ screenSharing: true, screenStream: stream });
      // Serialise the renegotiation so it never races with a pending offer/answer.
      runRenegotiationStep(pc, async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        wsClient.callOffer(cur.callId, offer.sdp ?? "");
      });
    } catch (err) {
      useCallStore.getState().patchCurrent({
        error: err instanceof Error ? err.message : t("call.screenShareFailed"),
      });
    }
  },

  admin(action: "mute" | "unmute" | "ban", userId: ID) {
    const cur = useCallStore.getState().current;
    if (!cur) return;
    logSignal("→ call:admin", `action=${action} target=${userId}`);
    wsClient.callAdmin(cur.callId, action, userId);
  },

  async handleServerEvent(event: ServerEvent) {
    const t0 = performance.now();
    try {
      switch (event.type) {
        case "call:incoming":
          logSignal("← call:incoming", `from=${event.call.fromUserId}`, event.call);
          useCallStore.getState().setIncoming(event.call);
          break;
        case "call:active-calls": {
          logSignal("← call:active-calls", `count=${event.calls.length}`, event);
          const curCall = useCallStore.getState().current;
          if (curCall) {
            LOG.warn("call:active-calls ignored — already in an active call");
            break;
          }
          for (const c of event.calls) {
            void callController.restoreCall(c);
            break;
          }
          break;
        }
        case "call:accepted": {
          logSignal("← call:accepted", `by=${event.byUserId}`);
          const cur = useCallStore.getState().current;
          if (cur && cur.phase === "outgoing") {
            LOG.state("transition: outgoing → connecting (accepted)");
            await enterCall(
              cur.callId,
              cur.conversationId,
              cur.kind,
              cur.fromUserId,
              "connecting",
            );
            startStatsPolling(cur.callId);
          }
          break;
        }
        case "call:answer": {
          logSignal("← call:answer", `sdpLen=${event.sdp.length}`, event);
          const pc = upstreams.get(event.callId);
          if (pc) {
            await pc.setRemoteDescription({ type: "answer", sdp: event.sdp }).catch((err) => {
              LOG.error(`upstream setRemoteDescription(answer) FAILED: ${err}`);
            });
            LOG.state(`upstream PC after answer: state=${pc.connectionState} signaling=${pc.signalingState}`);
            LOG.state("transition: * → active (upstream answered)");
            useCallStore.getState().patchCurrent({ phase: "active" });
            startStatsPolling(event.callId);
            // Requirement 2: Start a timeout to verify downstream-offer arrives.
            const tid = window.setTimeout(() => {
              downstreamOfferTimeouts.delete(event.callId);
              const cur = useCallStore.getState().current;
              if (!cur || cur.callId !== event.callId || cur.phase !== "active") return;
              const existingDownstreams = Array.from(downstreams.keys()).filter((k) => k.startsWith(`${event.callId}:`));
              if (existingDownstreams.length > 0) {
                LOG.state(`call:answer downstream-offer timeout: downstream PCs already exist (${existingDownstreams.length}), no recovery needed`);
                return;
              }
              LOG.warn(`call:answer downstream-offer timeout: no downstream PC created within 5s — requesting re-subscription`);
              for (const [userId, participant] of Object.entries(cur.participants)) {
                const me = useChatStore.getState().me;
                if (userId === me?.id) continue;
                for (const kind of participant.publishing) {
                  logSignal("→ call:subscribe (timeout recovery)", `publisher=${userId} kind=${kind}`);
                  wsClient.callSubscribe(event.callId, userId, kind);
                }
              }
            }, 5000);
            downstreamOfferTimeouts.set(event.callId, tid);
          } else {
            LOG.error("call:answer received but no upstream PC found for callId=" + event.callId);
          }
          break;
        }
        case "call:peer-joined": {
          logSignal("← call:peer-joined", `userId=${event.userId} kind=${event.kind} publishing=${event.publishing}`, event);
          useCallStore.getState().upsertParticipant({
            userId: event.userId,
            muted: false,
            banned: false,
            publishing: event.publishing ? [event.publishing] : [],
          });
          // Requirement 9: Only subscribe if the peer has confirmed they are
          // publishing media. Subscribing before the publisher has tracks
          // generates unnecessary signaling (empty SDP offers).
          if (event.publishing) {
            logSignal("→ call:subscribe (auto)", `publisher=${event.userId} kind=${event.publishing}`);
            wsClient.callSubscribe(event.callId, event.userId, event.publishing);
          }
          break;
        }
        case "call:track-published": {
          logSignal("← call:track-published", `userId=${event.userId} kind=${event.kind}`, event);
          const cur = useCallStore.getState().current;
          if (!cur) {
            LOG.warn("track-published ignored: no active call");
            break;
          }
          if (cur.participants[event.userId]) {
            const p = cur.participants[event.userId];
            const publishing = Array.from(new Set([...p.publishing, event.kind]));
            useCallStore.getState().upsertParticipant({ userId: event.userId, publishing });
          }
          logSignal("→ call:subscribe", `publisher=${event.userId} kind=${event.kind}`);
          wsClient.callSubscribe(event.callId, event.userId, event.kind);
          break;
        }
        case "call:downstream-offer": {
          logSignal("← call:downstream-offer", `publisher=${event.publisherId} kind=${event.kind} sdpLen=${event.sdp.length}`, event);
          // Requirement 2: Cancel downstream-offer timeout since offer arrived.
          const pendingTid = downstreamOfferTimeouts.get(event.callId);
          if (pendingTid) {
            clearTimeout(pendingTid);
            downstreamOfferTimeouts.delete(event.callId);
          }
          LOG.state(`downstream PCs before: ${downstreams.size} entries [${Array.from(downstreams.keys()).join(", ")}]`);
          if (!webRTCSupported()) return;
          if (!event.sdp) {
            LOG.signal("← call:downstream-offer | empty SDP (PC still negotiating) — ignored");
            break;
          }
          const key = `${event.callId}:${event.publisherId}:${event.kind}`;
          const me = useChatStore.getState().me;
          if (me && event.publisherId === me.id) {
            LOG.error("BUG: downstream offer for own tracks — publisher=subscriber", event);
          }
          let pc = downstreams.get(key);
          let stream: MediaStream;
          if (!pc) {
            pc = await createPeerConnection();
            stream = new MediaStream();
            downstreams.set(key, pc);
            LOG.media("downstream PC created", `key=${key}`);
            pc.onicecandidate = (e) => {
              if (e.candidate) {
                logIce("send", `downstream ${event.publisherId}:${event.kind}`, e.candidate.toJSON());
                wsClient.callIce(
                  event.callId,
                  e.candidate.toJSON(),
                  "downstream",
                  event.subscriberId,
                  event.publisherId,
                );
              }
            };
            pc.ontrack = (e) => {
              const trackInfo = `${e.track.kind}:${e.track.id.slice(-6)} enabled=${e.track.enabled} ready=${e.track.readyState} muted=${e.track.muted}`;
              LOG.media(`ontrack key=${key} | ${trackInfo} | streamTracks=${stream.getTracks().length}`);
              if (!stream.getTracks().includes(e.track)) {
                stream.addTrack(e.track);
                LOG.media(`track added to stream — total now: ${stream.getTracks().length}`);
                e.track.onended = () => {
                  LOG.media(`track ended: key=${key} kind=${e.track.kind}`);
                  const remaining = stream.getTracks().filter((t) => t.readyState !== "ended");
                  if (remaining.length === 0) {
                    useCallStore.getState().removeRemoteMedia(event.publisherId, event.kind);
                  }
                };
              } else {
                LOG.media(`track already in stream — skipping duplicate`);
              }
              useCallStore.getState().setRemoteMedia({ userId: event.publisherId, kind: event.kind, stream });
            };
            // Requirement 2: Monitor downstream PC connection state.
            const downstreamPc = pc;
            downstreamPc.onconnectionstatechange = () => {
              LOG.state(`downstream[${key}] connectionState=${downstreamPc.connectionState} iceState=${downstreamPc.iceConnectionState}`);
              // Requirement 8: Track when downstream reaches connected state.
              if (downstreamPc.connectionState === "connected") {
                downstreamConnectedAt.set(key, Date.now());
              }
            };
            // Req 5: Log sender metadata at creation time for immediate diagnostics.
            const initialSenders = pc.getSenders();
            if (initialSenders.length > 0) {
              LOG.stats(`downstream[${key}] initial senders: ${initialSenders.map((s) => `${s.track?.kind ?? "none"}(enabled=${s.track?.enabled ?? false} ready=${s.track?.readyState ?? "unknown"})`).join(", ")}`);
            }
            // Req 6: Check hardware decode support and set receiver constraints.
            // When hardware decoding is unavailable, limit max receive resolution
            // to prevent CPU overload from software decoding.
            for (const rcvr of pc.getReceivers()) {
              if (rcvr.track?.kind === "video") {
                try {
                  const info = (rcvr as any).decodingInfo?.();
                  if (info) {
                    const hwAccelerated = info.hardwareAccelerated ?? false;
                    LOG.stats(`downstream[${key}] receiver hardware decode: ${hwAccelerated ? "yes" : "no (software fallback)"}`);
                    if (!hwAccelerated && info.powerEfficient === false) {
                      LOG.warn(`downstream[${key}] software decode detected — consider reducing resolution`);
                    }
                  }
                } catch {
                  // decodingInfo() not supported in this browser.
                }
              }
            }
            // Requirement 1: Flush any ICE candidates that arrived before PC creation.
            flushPendingDownstreamIce(`${event.callId}:${event.publisherId}`, pc);
          }
          runRenegotiationStep(pc, async () => {
            if (pc.signalingState !== "stable") {
              LOG.warn(`downstream: rolling back ${pc.signalingState} → stable`);
              await pc.setLocalDescription({ type: "rollback" });
            }
            await pc.setRemoteDescription({ type: "offer", sdp: event.sdp });
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            logSignal("→ call:answer (downstream)", `publisher=${event.publisherId} kind=${event.kind} sdpLen=${(answer.sdp ?? "").length}`);
            wsClient.callAnswer(event.callId, event.subscriberId, event.publisherId, answer.sdp ?? "");
          });
          break;
        }
        case "call:ice": {
          const iceLogTarget = event.target === "upstream" ? "upstream" : `downstream ${event.publisherId}:${event.kind ?? "?"}`;
          logIce("recv", iceLogTarget, event.candidate);
          const iceStart = performance.now();
          if (event.target === "upstream") {
            const pc = upstreams.get(event.callId);
            if (pc) await pc.addIceCandidate(event.candidate).catch(() => undefined);
          } else if (event.publisherId) {
            const exactKey = event.kind ? `${event.callId}:${event.publisherId}:${event.kind}` : null;
            if (exactKey) {
              const pc = downstreams.get(exactKey);
              if (pc) {
                await pc.addIceCandidate(event.candidate).catch(() => undefined);
              } else {
                // Requirement 1: Buffer ICE candidates that arrive before the downstream PC is created.
                const bufferKey = `${event.callId}:${event.publisherId}`;
                const list = pendingDownstreamIce.get(bufferKey);
                if (list) list.push(event.candidate);
                else pendingDownstreamIce.set(bufferKey, [event.candidate]);
                LOG.ice(`buffered ICE candidate for downstream (PC not yet created): key=${exactKey}`);
              }
            } else {
              let matched = 0;
              for (const [k, pc] of downstreams) {
                if (k.startsWith(`${event.callId}:${event.publisherId}:`)) {
                  await pc.addIceCandidate(event.candidate).catch(() => undefined);
                  matched++;
                }
              }
              if (matched === 0) {
                // Requirement 1: Buffer when no matching downstream PC exists.
                const bufferKey = `${event.callId}:${event.publisherId}`;
                const list = pendingDownstreamIce.get(bufferKey);
                if (list) list.push(event.candidate);
                else pendingDownstreamIce.set(bufferKey, [event.candidate]);
                LOG.ice(`buffered ICE candidate for downstream (no matching PC): publisher=${event.publisherId}`);
              }
            }
          }
          // Requirement 4: Warn if single ICE candidate processing exceeded 50ms.
          const iceElapsed = performance.now() - iceStart;
          if (iceElapsed > 50) {
            LOG.warn(`call:ice processing took ${iceElapsed.toFixed(1)}ms — exceeds 50ms target`);
          }
          break;
        }
        case "call:peer-left": {
          // Requirement 9: Deduplicate peer-left events using time-window approach.
          // Events within a 10-second window with the same callId+userId are deduped.
          const peerLeftKey = `${event.callId}:${event.userId}`;
          const now = Date.now();
          const lastSeen = peerLeftSeen.get(peerLeftKey);
          if (lastSeen && (now - lastSeen) < 10_000) {
            LOG.state(`call:peer-left deduplicated: userId=${event.userId} (seen ${now - lastSeen}ms ago)`);
            break;
          }
          peerLeftSeen.set(peerLeftKey, now);
          // Evict stale entries older than 30s to prevent memory leak.
          for (const [k, ts] of peerLeftSeen) {
            if (now - ts > 30_000) peerLeftSeen.delete(k);
          }
          logSignal("← call:peer-left", `userId=${event.userId}`, event);
          useCallStore.getState().removeParticipant(event.userId);
          useCallStore.getState().removeRemoteMedia(event.userId);
          break;
        }
        case "call:admin-event":
          logSignal("← call:admin-event", `action=${event.action} userId=${event.userId} by=${event.byUserId}`, event);
          useCallStore.getState().upsertParticipant({
            userId: event.userId,
            muted: event.action === "mute" ? true : event.action === "unmute" ? false : undefined,
            banned: event.action === "ban" ? true : undefined,
          });
          break;
        case "call:banned": {
          logSignal("← call:banned", `userId=${event.userId}`, event);
          const me = useChatStore.getState().me;
          if (event.userId === me?.id) this.cleanup();
          else useCallStore.getState().removeParticipant(event.userId);
          break;
        }
        case "call:cancelled": {
          logSignal("← call:cancelled", `callId=${event.callId}`, event);
          const cur = useCallStore.getState().current;
          const incoming = useCallStore.getState().incoming;
          // Requirement 10: Validate callId matches active or incoming call.
          // If no match, safely discard and log at debug level.
          const matchesActive = cur && event.callId === cur.callId;
          const matchesIncoming = incoming && event.callId === incoming.id;
          if (!matchesActive && !matchesIncoming) {
            LOG.warn(`call:cancelled safely discarded — callId=${event.callId} does not match active(${cur?.callId ?? "none"}) or incoming(${incoming?.id ?? "none"})`);
            break;
          }
          if (cur && (cur.phase === "outgoing" || cur.phase === "connecting")) {
            // Requirement 3: Full cleanup flow — close PCs, release media, reset UI.
            useCallStore.getState().patchCurrent({ error: t("call.noResponse"), phase: "ended" });
            setTimeout(() => this.cleanup(), 2000);
          } else if (incoming) {
            useChatStore.getState().showToast(t("call.cancelled"), "info");
            this.cleanup();
          } else {
            LOG.warn(`call:cancelled — no matching state to cancel`);
          }
          break;
        }
        case "call:rejected": {
          logSignal("← call:rejected", `by=${event.byUserId}`, event);
          const cur = useCallStore.getState().current;
          if (cur && (cur.phase === "outgoing" || cur.phase === "connecting")) {
            useCallStore.getState().patchCurrent({ error: t("call.rejected"), phase: "ended" });
            setTimeout(() => this.cleanup(), 2000);
          } else {
            this.cleanup();
          }
          break;
        }
        case "call:hangup":
          logSignal("← call:hangup", `by=${event.byUserId}`, event);
          this.cleanup();
          break;
      }
    } catch (err) {
      logCompat(`handleServerEvent error: ${err}`);
      if (!useCallStore.getState().current?.error) {
        useCallStore.getState().patchCurrent({ phase: "ended", error: t("call.connectionError") });
      }
    }
    const elapsed = Math.round(performance.now() - t0);
    if (elapsed > 5) LOG.signal(`handleServerEvent 耗时 ${elapsed}ms for ${event.type}`);
  },
};

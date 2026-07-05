/**
 * Minimal SFU (Selective Forwarding Unit) for voice/video/screen-share calls.
 *
 * Architecture
 * ------------
 * Each call has one SFU "Room". Every participant opens ONE upstream
 * RTCPeerConnection to the server (`upstream`), into which they pipe their
 * mic, camera and (optionally) screen-share tracks. The server receives the
 * tracks and acts as a relay:
 *
 *   client A ──upstream─▶ [server PC A] ── track ─┐
 *   client B ──upstream─▶ [server PC B] ── track ─┼─▶ [server PC A→X] ─▶ client X
 *   client C ──upstream─▶ [server PC C] ── track ─┘
 *
 * For each remote publisher P and each subscriber S, the server creates a
 * dedicated downstream RTCPeerConnection (S→client) and re-attaches P's
 * tracks as sendonly transceivers. RTP packets are forwarded without
 * re-encoding — lowest latency and CPU cost. The only server-side work per
 * frame is moving bytes between sockets.
 *
 * State management
 * ----------------
 *  - `kind`: audio-only or audio+video. Screen-share is always video, but
 *    each subscriber can subscribe independently.
 *  - `muted`: per-user mic-mute flag set by the call admin (owner/admin of
 *    a channel, or the other participant in a DM). When muted, the server
 *    tears down the subscriber's *audio* transceiver; subsequent subscribers
 *    don't hear the muted user.
 *  - `banned`: per-user hard-removal. The server drops the user's tracks and
 *    notifies remaining participants.
 *
 * Bandwidth control
 * -----------------
 * Each subscriber's downstream PC sets `encodings` with explicit
 * `maxBitrate` caps so a slow downlink doesn't get a 1080p stream. Audio
 * is always 32kbps Opus; video defaults to 200kbps (low-res camera) and
 * screen-share to 800kbps. Clients can renegotiate by resubscribing.
 *
 * Why a server-side SFU (vs P2P mesh)
 * -----------------------------------
 * Mesh P2P scales O(N²) in client uplinks; with 4 participants each browser
 * sends ~3 audio + 3 video streams. An SFU keeps every client at O(N)
 * uplinks (one upstream) and lets the server throttle/forward. This is the
 * same pattern Discord, Slack huddles and Zoom all use for group calls.
 */

import { EventEmitter } from "node:events";
import * as wrtc from "@roamhq/wrtc";
import type { CallKind, CallTrackKind, ID } from "@navo/shared";

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

const LOG_PREFIX = "[sfu]";

function logInfo(...args: unknown[]) {
  console.log(LOG_PREFIX, ...args);
}

function logWarn(...args: unknown[]) {
  console.warn(LOG_PREFIX, ...args);
}

function logError(...args: unknown[]) {
  console.error(LOG_PREFIX, ...args);
}

function logDebug(...args: unknown[]) {
  if (process.env.DEBUG_SFU) console.log(LOG_PREFIX, "[debug]", ...args);
}

// ---------------------------------------------------------------------------
// WebRTC primitives — validate imports
// ---------------------------------------------------------------------------

// @roamhq/wrtc is a CommonJS package. When imported via ESM `import *`,
// named exports may land on `.default` instead of the namespace object.
// We merge both to guarantee access.
const wrtcRaw = wrtc as any;
const wrtcModule =
  wrtcRaw && typeof wrtcRaw === "object"
    ? { ...wrtcRaw, ...(wrtcRaw.default && typeof wrtcRaw.default === "object" ? wrtcRaw.default : {}) }
    : wrtcRaw;

function resolveConstructor<T>(name: string, val: T | undefined, fallback?: T): T {
  if (typeof val === "function") return val;
  if (fallback !== undefined) return fallback;
  throw new Error(
    `${LOG_PREFIX} @roamhq/wrtc does not export "${name}" as a function — ` +
    `check that the native module is installed correctly (npm rebuild @roamhq/wrtc)`,
  );
}

const RTCPeerConnection = resolveConstructor(
  "RTCPeerConnection",
  (wrtcModule as any).RTCPeerConnection,
);
const RTCSessionDescription = resolveConstructor(
  "RTCSessionDescription",
  (wrtcModule as any).RTCSessionDescription,
);
const RTCIceCandidate = resolveConstructor(
  "RTCIceCandidate",
  (wrtcModule as any).RTCIceCandidate,
);
const MediaStreamCtor = wrtcModule.MediaStream;

logInfo(
  "WebRTC primitives loaded — RTCPeerConnection=%s, RTCSessionDescription=%s, RTCIceCandidate=%s",
  typeof RTCPeerConnection,
  typeof RTCSessionDescription,
  typeof RTCIceCandidate,
);

// ICE servers — configurable via system_settings (admin panel), with env var fallback.
const buildIceServers = async (): Promise<RTCIceServer[]> => {
  try {
    const { getSystemSettings } = await import("./admin.js");
    const settings = await getSystemSettings();
    const parseJsonArray = (s: string): any[] => {
      try { return JSON.parse(s); } catch { return []; }
    };
    const stunServers = parseJsonArray(settings.iceStunUrls);
    const turnServers = parseJsonArray(settings.iceTurnUrl);
    const servers: RTCIceServer[] = [
      ...stunServers.map((s: any) => ({ urls: s.url })),
      ...turnServers.map((s: any) => ({
        urls: s.url,
        username: s.username || undefined,
        credential: s.credential || undefined,
      })),
    ];
    logInfo("ICE: loaded %d server(s) from DB (%d STUN, %d TURN)",
      servers.length, stunServers.length, turnServers.length);
    return servers;
  } catch (err) {
    // Fallback to env vars
    const stunUrls = (process.env.STUN_URLS || "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302")
      .split(",")
      .map((u) => u.trim())
      .filter(Boolean);
    const servers: RTCIceServer[] = stunUrls.map((urls) => ({ urls }));
    const turnUrl = process.env.TURN_URL;
    if (turnUrl) {
      servers.push({
        urls: turnUrl.split(",").map((u) => u.trim()),
        username: process.env.TURN_USERNAME || undefined,
        credential: process.env.TURN_CREDENTIAL || undefined,
      });
      logInfo("ICE: using TURN server(s) from env: %s", turnUrl);
    } else {
      logInfo("ICE: using default STUN server(s) from env");
    }
    return servers;
  }
};

let _iceServers: RTCConfiguration | null = null;
async function getIceServers(): Promise<RTCIceServer[]> {
  if (!_iceServers) {
    _iceServers = {
      iceServers: await buildIceServers(),
      portRange: { min: 3_660, max: 4_660 },
    };
  }
  return _iceServers.iceServers ?? [];
}

// Refresh ICE servers config (call after admin settings change)
export function resetIceServersConfig() {
  _iceServers = null;
}

// Bandwidth caps (bps) per track kind. Keep these conservative — mobile users
// matter more than desktop users for a chat app.
const AUDIO_MAX_BITRATE = 32_000;
const VIDEO_CAMERA_MAX_BITRATE = 200_000;
const VIDEO_SCREEN_MAX_BITRATE = 1_200_000;

// Req 8: Simulcast encoding layers for video camera tracks.
// The server forwards these as-is (no re-encoding) — the browser negotiates
// which layers to subscribe based on available bandwidth.
const SIMULCAST_VIDEO_ENCODINGS = [
  { maxBitrate: 200_000, maxFramerate: 24, scaleResolutionDownBy: 1 },   // High
  { maxBitrate: 100_000, maxFramerate: 15, scaleResolutionDownBy: 2 },   // Medium
  { maxBitrate: 50_000, maxFramerate: 10, scaleResolutionDownBy: 4 },    // Low
];

// ---------------------------------------------------------------------------
// ICE candidate sanitization
// ---------------------------------------------------------------------------
//
// wrtc enumerates every NIC on the host and emits a candidate for each —
// Docker bridges (172.x), private LAN (10.x/192.168.x), loopback and
// link-local. Only the public IP is reachable by remote clients. We strip
// everything except the public-IP UDP candidate before relaying to clients.
//
// This also hides participants' real IPs from each other: in an SFU every
// client only ever connects to the server, never peer-to-peer, and the only
// candidate we ever advertise is the server's public IP. So the most a remote
// peer can learn is PUBLIC_IP — never another user's address.
//
// PUBLIC_IP must be set in the environment (the server's reachable public IP).
const PUBLIC_IP = process.env.PUBLIC_IP?.trim() || "";

// HOST_LAN_IP is the private address wrtc binds host candidates to (e.g.
// 10.0.12.11 on eth0). On a 1:1-NAT elastic-IP host, sanitizeCandidate
// rewrites host candidates on this IP to PUBLIC_IP while keeping the port,
// so the bound portRange is reachable externally. If unset, any private IP
// is treated as the LAN IP (best effort).
const HOST_LAN_IP = process.env.HOST_LAN_IP?.trim() || "";

const PRIVATE_PREFIXES = [
  "10.",
  "172.",
  "192.168.",
  "169.254.",
  "127.",
  "::1",
  "fe80:",
  "fc",
  "fd",
];

function isPrivateIp(ip: string): boolean {
  return PRIVATE_PREFIXES.some((p) => ip.startsWith(p));
}

function isMdnsAddress(ip: string): boolean {
  return ip.endsWith(".local");
}

/**
 * Filter/normalize an ICE candidate before relaying it to clients.
 *
 * Rules (pure-filter strategy):
 *  - Drop TCP candidates (the public path here is UDP; wrtc TCP rarely pairs).
 *  - Drop end-of-candidates / malformed lines (caller handles null separately).
 *  - If PUBLIC_IP is configured: keep ONLY candidates whose IP equals PUBLIC_IP,
 *    drop every private/loopback/link-local candidate outright.
 *    EXCEPTION: mDNS .local addresses are kept for LAN discovery.
 *  - If PUBLIC_IP is NOT configured: fall back to dropping obvious private IPs
 *    and keep anything that looks public or mDNS, so the feature degrades safely.
 *
 * Returns null = drop this candidate.
 */
function sanitizeCandidate(c: RTCIceCandidateInit): RTCIceCandidateInit | null {
  const s = c.candidate;
  if (!s) return null;
  if (/ tcp /i.test(s)) return null;

  const parts = s.split(" ");
  const ip = parts[4];
  if (!ip) return null;

  // Always keep mDNS .local candidates for LAN discovery (sfu+mDNS mode)
  if (isMdnsAddress(ip)) {
    return c;
  }

  if (PUBLIC_IP) {
    // Already the public IP (e.g. a srflx whose mapped address is PUBLIC_IP):
    // keep it untouched.
    if (ip === PUBLIC_IP) return c;

    // Host candidate on our LAN IP: rewrite IP -> PUBLIC_IP, keep the port.
    // The elastic IP is a 1:1 NAT to this host, so the same UDP port that
    // wrtc bound (inside portRange) is reachable externally as
    // PUBLIC_IP:<port>. This is what makes a fixed portRange work behind NAT,
    // since @roamhq/wrtc exposes no NAT-1to1 / host-IP override of its own.
    const isHost = / typ host /.test(s);
    const matchesLan = HOST_LAN_IP ? ip === HOST_LAN_IP : isPrivateIp(ip);
    if (isHost && matchesLan) {
      parts[4] = PUBLIC_IP;
      return { ...c, candidate: parts.join(" ") };
    }

    // Any other private/loopback/link-local candidate: drop.
    return null;
  }

  // No PUBLIC_IP configured — best effort: drop private, keep public-looking.
  return isPrivateIp(ip) ? null : c;
}

interface PublisherTrack {
  kind: CallTrackKind;
  track: MediaStreamTrack;
  /** Whether audio is included (only meaningful for kind=camera). */
  audioTrack?: MediaStreamTrack;
}

// ---------------------------------------------------------------------------
// Peer helpers with logging
// ---------------------------------------------------------------------------

/**
 * One upstream PC from a participant → SFU. The participant pipes their mic,
 * camera and screen-share tracks through this.
 */
class UpstreamPeer {
  readonly userId: ID;
  readonly pc: RTCPeerConnection;
  /** Tracks the user has published, keyed by CallTrackKind. */
  tracks = new Map<CallTrackKind, PublisherTrack>();
  /** Mid -> transceiver, used to route incoming `ontrack` events. */
  transceivers = new Map<string, RTCRtpTransceiver>();
  closed = false;
  /** Periodic inbound-rtp stats poll handle (debug). */
  statsTimer: ReturnType<typeof setInterval> | null = null;

  private constructor(userId: ID, pc: RTCPeerConnection) {
    this.userId = userId;
    this.pc = pc;
  }

  static async create(userId: ID): Promise<UpstreamPeer> {
    const iceConfig = { iceServers: await getIceServers(), portRange: { min: 3_660, max: 4_660 } } as RTCConfiguration;
    logInfo("[upstream:%s] Creating RTCPeerConnection", userId);
    try {
      const pc = new (RTCPeerConnection as any)(iceConfig);
      logInfo("[upstream:%s] RTCPeerConnection created — iceConnectionState=%s, signalingState=%s",
        userId, pc.iceConnectionState, pc.signalingState);
      return new UpstreamPeer(userId, pc);
    } catch (err) {
      logError("[upstream:%s] Failed to create RTCPeerConnection:", userId, err);
      throw err;
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
    logInfo("[upstream:%s] Closing — tracks=%d, transceivers=%d",
      this.userId, this.tracks.size, this.transceivers.size);
    try {
      this.pc.close();
    } catch {
      /* noop */
    }
    this.tracks.clear();
    this.transceivers.clear();
  }
}

/**
 * One downstream PC from SFU → a single subscriber, for ONE remote
 * publisher. Each (subscriber, publisher) pair gets its own PC, which lets
 * us attach P's tracks as `sendonly` without mixing with anyone else.
 */
class DownstreamPeer {
  readonly subscriberId: ID;
  readonly publisherId: ID;
  readonly pc: RTCPeerConnection;
  /** Track kind this downstream is currently subscribed to. */
  currentKind: CallTrackKind | null = null;
  closed = false;
  /** SDP from the last successful answer — used to enforce m-line order on renegotiation. */
  lastAnswerSdp: string | null = null;
  /** Cached sender references — survives replaceTrack(null) for mute. */
  audioSender: RTCRtpSender | null = null;
  videoSender: RTCRtpSender | null = null;
  /** Periodic outbound-rtp stats poll handle (debug). */
  statsTimer: ReturnType<typeof setInterval> | null = null;

  private constructor(subscriberId: ID, publisherId: ID, pc: RTCPeerConnection) {
    this.subscriberId = subscriberId;
    this.publisherId = publisherId;
    this.pc = pc;
  }

  static async create(subscriberId: ID, publisherId: ID): Promise<DownstreamPeer> {
    const iceConfig = { iceServers: await getIceServers(), portRange: { min: 3_660, max: 4_660 } } as RTCConfiguration;
    logInfo("[downstream:%s→%s] Creating RTCPeerConnection", subscriberId, publisherId);
    try {
      const pc = new (RTCPeerConnection as any)(iceConfig);
      logInfo("[downstream:%s→%s] RTCPeerConnection created — iceConnectionState=%s",
        subscriberId, publisherId, pc.iceConnectionState);
      return new DownstreamPeer(subscriberId, publisherId, pc);
    } catch (err) {
      logError("[downstream:%s→%s] Failed to create RTCPeerConnection:", subscriberId, publisherId, err);
      throw err;
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
    logInfo("[downstream:%s→%s] Closing", this.subscriberId, this.publisherId);
    try {
      this.pc.close();
    } catch {
      /* noop */
    }
  }
}

export interface RoomJoinRequest {
  callId: ID;
  conversationId: ID;
  userId: ID;
  kind: CallKind;
  /** SDP offer from the client's upstream peer connection. */
  sdp: string;
}

export interface RoomJoinResult {
  /** SDP answer to feed back into the client's upstream PC. */
  sdp: string;
  /** Participants already in the room (excluding the joiner). */
  participants: Array<{ userId: ID; kind: CallTrackKind | null }>;
}

export interface RoomDownstreamAnswer {
  publisherId: ID;
  kind: CallTrackKind;
  sdp: string;
}

export interface RoomIce {
  publisherId: ID;
  candidate: RTCIceCandidateInit;
}

export interface ParticipantState {
  userId: ID;
  /** Whether this participant is currently muted by an admin. */
  muted: boolean;
  /** Whether the participant has been kicked/banned by an admin. */
  banned: boolean;
  /** Track kinds the participant is currently publishing. */
  publishing: CallTrackKind[];
}

// ---------------------------------------------------------------------------
// SFU Room
// ---------------------------------------------------------------------------

export class SFU extends EventEmitter {
  readonly callId: ID;
  readonly conversationId: ID;
  readonly kind: CallKind;

  /** userId -> upstream PC (the participant publishing media). */
  readonly upstreams = new Map<ID, UpstreamPeer>();
  /** subscriberId -> Map<publisherId, DownstreamPeer>. */
  readonly downstreams = new Map<ID, Map<ID, DownstreamPeer>>();
  /** Per-user admin state. */
  readonly state = new Map<ID, ParticipantState>();

  /** Whether the room has been permanently closed (last participant left). */
  private closed = false;

  /** ICE candidates that arrived before the downstream PC was created. */
  private pendingDownstreamIce = new Map<string, RTCIceCandidateInit[]>();

  constructor(opts: { callId: ID; conversationId: ID; kind: CallKind }) {
    super();
    this.callId = opts.callId;
    this.conversationId = opts.conversationId;
    this.kind = opts.kind;
    logInfo("[room:%s] Created — conversation=%s, kind=%s", opts.callId, opts.conversationId, opts.kind);
  }

  /** Returns a list of currently-present participants. */
  participants(): ParticipantState[] {
    return Array.from(this.state.values());
  }

  hasUser(userId: ID): boolean {
    return this.upstreams.has(userId);
  }

  /**
   * A participant joins (or upgrades) their upstream. We accept whatever
   * tracks the offer advertised and answer with the negotiated SDP. The
   * caller feeds the answer back to the client.
   */
  async joinUpstream(req: RoomJoinRequest): Promise<RoomJoinResult> {
    if (this.closed) throw new Error("Room closed");
    if (this.state.get(req.userId)?.banned) throw new Error("已被踢出通话");

    logInfo("[room:%s] joinUpstream — userId=%s, kind=%s, sdpLen=%d",
      this.callId, req.userId, req.kind, req.sdp.length);

    let upstream = this.upstreams.get(req.userId);
    if (!upstream || upstream.closed || upstream.pc.connectionState === "failed" || upstream.pc.connectionState === "closed" || upstream.pc.connectionState === "disconnected") {
      if (upstream) {
        logInfo("[room:%s] replacing stale upstream — userId=%s, oldState=%s", this.callId, req.userId, upstream.pc.connectionState);
        upstream.close();
      }
      upstream = await UpstreamPeer.create(req.userId);
      this.upstreams.set(req.userId, upstream);
      if (!this.state.has(req.userId)) {
        this.state.set(req.userId, {
          userId: req.userId,
          muted: false,
          banned: false,
          publishing: [],
        });
      }
      this.wireUpstream(upstream);
      this.emit("user-joined", { userId: req.userId, kind: this.kind });
      logInfo("[room:%s] user-joined emitted — userId=%s, totalUpstreams=%d",
        this.callId, req.userId, this.upstreams.size);
    } else {
      logInfo("[room:%s] upstream upgrade — userId=%s", this.callId, req.userId);
    }

    try {
      await upstream.pc.setRemoteDescription(
        new (RTCSessionDescription as any)({ type: "offer", sdp: req.sdp }),
      );
      logDebug("[room:%s] setRemoteDescription(offer) OK — userId=%s, signalingState=%s",
        this.callId, req.userId, upstream.pc.signalingState);
    } catch (err) {
      logError("[room:%s] setRemoteDescription(offer) FAILED — userId=%s:", this.callId, req.userId, err);
      throw err;
    }

    try {
      const answer = await upstream.pc.createAnswer();
      await upstream.pc.setLocalDescription(answer);
      logDebug("[room:%s] createAnswer + setLocalDescription OK — userId=%s, signalingState=%s",
        this.callId, req.userId, upstream.pc.signalingState);

      // Surface the existing publishers so the client can request subscribes.
      const participants: Array<{ userId: ID; kind: CallTrackKind | null }> = [];
      for (const [uid, up] of this.upstreams.entries()) {
        if (uid === req.userId) continue;
        // 如果 tracks 还没有准备好，至少返回用户ID，让客户端知道有参与者
        const kind = this.firstKind(up);
        participants.push({ userId: uid, kind });
        logInfo("[room:%s] joinUpstream participant list — uid=%s, kind=%s, tracks=%d",
          this.callId, uid, kind, up.tracks.size);
      }

      return { sdp: upstream.pc.localDescription?.sdp ?? "", participants };
    } catch (err) {
      logError("[room:%s] createAnswer/setLocalDescription FAILED — userId=%s:", this.callId, req.userId, err);
      throw err;
    }
  }

  /**
   * Client requests a subscription to one publisher's track. The server
   * builds a downstream PC, attaches the publisher's track, and returns
   * the resulting SDP offer for the client to answer.
   */
  async subscribe(opts: {
    subscriberId: ID;
    publisherId: ID;
    kind: CallTrackKind;
    sdp?: string;
  }): Promise<RoomDownstreamAnswer> {
    if (this.closed) throw new Error("Room closed");

    logInfo("[room:%s] subscribe — subscriber=%s, publisher=%s, kind=%s",
      this.callId, opts.subscriberId, opts.publisherId, opts.kind);

    const upstream = this.upstreams.get(opts.publisherId);
    if (!upstream) {
      logError("[room:%s] subscribe FAILED — publisher %s not found (upstreams: %s)",
        this.callId, opts.publisherId, Array.from(this.upstreams.keys()).join(",") || "none");
      throw new Error("Publisher not found");
    }

    logInfo("[room:%s] subscribe — publisher %s tracks: %s (mapSize=%d)",
      this.callId, opts.publisherId,
      Array.from(upstream.tracks.entries()).map(([k, v]) =>
        `${k}={trackKind=${v.track?.kind} ready=${v.track?.readyState} audioTrack=${v.audioTrack?.kind}:${v.audioTrack?.readyState}}`
      ).join(", ") || "EMPTY",
      upstream.tracks.size);

    const pubTrack = upstream.tracks.get(opts.kind);
    if (!pubTrack) {
      // Requirement 9: Publisher has not published this track kind yet.
      // Do NOT create a DownstreamPeer — wait for track-published to trigger
      // a new subscribe request. This avoids unnecessary PC creation and
      // signaling overhead.
      logInfo("[room:%s] subscribe — publisher %s has no %s track yet, deferring (available: %s)",
        this.callId, opts.subscriberId, opts.kind, Array.from(upstream.tracks.keys()).join(",") || "none");
      return { publisherId: opts.publisherId, kind: opts.kind, sdp: "" };
    }

    // Honor per-user mic-mute: muted publishers should not be heard.
    const muteState = this.state.get(opts.publisherId);
    const audioMuted = !!muteState?.muted && opts.kind === "camera" && !!pubTrack.audioTrack;

    let subs = this.downstreams.get(opts.subscriberId);
    if (!subs) {
      subs = new Map();
      this.downstreams.set(opts.subscriberId, subs);
    }
    let down = subs.get(opts.publisherId);
    if (!down) {
      down = await DownstreamPeer.create(opts.subscriberId, opts.publisherId);
      subs.set(opts.publisherId, down);
      this.wireDownstream(down);
      // 刷新在此 PC 创建之前到达的缓存 ICE 候选
      await this.flushPendingDownstreamIce(opts.subscriberId, opts.publisherId, down);
    }

    down.currentKind = opts.kind;

    // SDP m-line order: if a previous offer/answer is pending, we must not
    // create a new offer with different m-line ordering. Skip track addition
    // if the PC is not in stable state — tracks will be added on next
    // renegotiation.
    if (down.pc.signalingState !== "stable") {
      logDebug("[room:%s] subscribe — skipping (signalingState=%s) for %s→%s — previous offer still pending",
        this.callId, down.pc.signalingState, opts.subscriberId, opts.publisherId);
      // Do NOT create a new offer here — it would overwrite the pending
      // local offer and reorder m-lines, causing the browser error:
      // "The order of m-lines in subsequent offer doesn't match order from
      // previous offer/answer". Return empty SDP so the client keeps using
      // existing tracks until the current negotiation completes.
      return { publisherId: opts.publisherId, kind: opts.kind, sdp: "" };
    }

    logDebug("[room:%s] subscribe — downstream=%s→%s, audioMuted=%s, haveAudio=%s, haveVideo=%s",
      this.callId, opts.subscriberId, opts.publisherId, audioMuted, !!down.audioSender, !!down.videoSender);

    let trackChanged = false;

    if (opts.kind === "camera") {
      // Audio: use cached sender or find by track kind (first subscribe only)
      if (!audioMuted && pubTrack.audioTrack) {
        if (down.audioSender) {
          if (down.audioSender.track !== pubTrack.audioTrack) {
            logDebug("[room:%s] replacing audio track on downstream %s→%s",
              this.callId, opts.subscriberId, opts.publisherId);
            await down.audioSender.replaceTrack(pubTrack.audioTrack);
            this.applyBitrateCap(down.pc, pubTrack.audioTrack, AUDIO_MAX_BITRATE);
            trackChanged = true;
          }
        } else {
          logDebug("[room:%s] adding audio track to downstream %s→%s",
            this.callId, opts.subscriberId, opts.publisherId);
          const sender = down.pc.addTrack(pubTrack.audioTrack, new MediaStreamCtor([pubTrack.audioTrack]));
          down.audioSender = sender;
          this.applyBitrateCap(down.pc, pubTrack.audioTrack, AUDIO_MAX_BITRATE);
          trackChanged = true;
        }
      } else if (audioMuted && down.audioSender) {
        // Muted: replace with null to stop sending (preserves m-line)
        logDebug("[room:%s] muting audio on downstream %s→%s (replaceTrack null)",
          this.callId, opts.subscriberId, opts.publisherId);
        await down.audioSender.replaceTrack(null);
        trackChanged = true;
      }
      // Video
      if (this.kind === "video" && pubTrack.track) {
        if (down.videoSender) {
          if (down.videoSender.track !== pubTrack.track) {
            logDebug("[room:%s] replacing video track (camera) on downstream %s→%s",
              this.callId, opts.subscriberId, opts.publisherId);
            await down.videoSender.replaceTrack(pubTrack.track);
            this.applyBitrateCap(down.pc, pubTrack.track, VIDEO_CAMERA_MAX_BITRATE);
            trackChanged = true;
          }
        } else {
          logDebug("[room:%s] adding video track (camera) to downstream %s→%s",
            this.callId, opts.subscriberId, opts.publisherId);
          const sender = down.pc.addTrack(pubTrack.track, new MediaStreamCtor([pubTrack.track]));
          down.videoSender = sender;
          this.applyBitrateCap(down.pc, pubTrack.track, VIDEO_CAMERA_MAX_BITRATE);
          trackChanged = true;
        }
      }
    } else if (opts.kind === "screen") {
      if (pubTrack.track) {
        if (down.videoSender) {
          if (down.videoSender.track !== pubTrack.track) {
            logDebug("[room:%s] replacing video track (screen) on downstream %s→%s",
              this.callId, opts.subscriberId, opts.publisherId);
            await down.videoSender.replaceTrack(pubTrack.track);
            this.applyBitrateCap(down.pc, pubTrack.track, VIDEO_SCREEN_MAX_BITRATE);
            trackChanged = true;
          }
        } else {
          logDebug("[room:%s] adding video track (screen) to downstream %s→%s",
            this.callId, opts.subscriberId, opts.publisherId);
          const sender = down.pc.addTrack(pubTrack.track, new MediaStreamCtor([pubTrack.track]));
          down.videoSender = sender;
          this.applyBitrateCap(down.pc, pubTrack.track, VIDEO_SCREEN_MAX_BITRATE);
          trackChanged = true;
        }
      }
    }

    // Only renegotiate if tracks actually changed
    if (!trackChanged) {
      logDebug("[room:%s] subscribe — no track changes for %s→%s, skipping offer",
        this.callId, opts.subscriberId, opts.publisherId);
      return { publisherId: opts.publisherId, kind: opts.kind, sdp: "" };
    }

    try {
      const offer = await down.pc.createOffer();
      await down.pc.setLocalDescription(offer);
      logDebug("[room:%s] downstream offer created — %s→%s, signalingState=%s",
        this.callId, opts.subscriberId, opts.publisherId, down.pc.signalingState);
      const sdp = offer.sdp ?? "";
      logDebug("[room:%s] subscribe result — subscriber=%s publisher=%s kind=%s sdpLen=%d hasVideo=%s hasAudio=%s",
        this.callId, opts.subscriberId, opts.publisherId, opts.kind, sdp.length,
        sdp.includes("m=video"), sdp.includes("m=audio"));
      return { publisherId: opts.publisherId, kind: opts.kind, sdp };
    } catch (err) {
      logError("[room:%s] downstream offer FAILED — %s→%s:", this.callId, opts.subscriberId, opts.publisherId, err);
      throw err;
    }
  }

  /**
   * The client answers the downstream offer. Wire it up so RTP starts
   * flowing server → client.
   */
  async answerDownstream(opts: { subscriberId: ID; publisherId: ID; sdp: string }) {
    logInfo("[room:%s] answerDownstream — subscriber=%s, publisher=%s, sdpLen=%d",
      this.callId, opts.subscriberId, opts.publisherId, opts.sdp.length);
    const down = this.downstreams.get(opts.subscriberId)?.get(opts.publisherId);
    if (!down) {
      logError("[room:%s] answerDownstream FAILED — downstream %s→%s not found",
        this.callId, opts.subscriberId, opts.publisherId);
      throw new Error("Downstream not found");
    }
    try {
      await down.pc.setRemoteDescription(
        new (RTCSessionDescription as any)({ type: "answer", sdp: opts.sdp }),
      );
      logDebug("[room:%s] answerDownstream OK — %s→%s, signalingState=%s",
        this.callId, opts.subscriberId, opts.publisherId, down.pc.signalingState);
    } catch (err) {
      logError("[room:%s] setRemoteDescription(answer) FAILED — %s→%s:", this.callId, opts.subscriberId, opts.publisherId, err);
      throw err;
    }
  }

  /** Either side forwards an ICE candidate. */
  async addIce(opts: {
    fromUserId: ID;
    target: "upstream" | { subscriberId: ID; publisherId: ID };
    candidate: RTCIceCandidateInit;
  }) {
    logDebug("[room:%s] addIce — from=%s, target=%s",
      this.callId, opts.fromUserId,
      opts.target === "upstream" ? "upstream" : `${opts.target.subscriberId}→${opts.target.publisherId}`);

    const c = new (RTCIceCandidate as any)(opts.candidate);
    if (opts.target === "upstream") {
      const up = this.upstreams.get(opts.fromUserId);
      if (!up || up.closed) {
        logDebug("[room:%s] addIce(upstream) — peer %s not found or closed, ignoring", this.callId, opts.fromUserId);
        return;
      }
      try {
        await up.pc.addIceCandidate(c);
      } catch (err) {
        logWarn("[room:%s] addIce(upstream) candidate failed — userId=%s (benign late-candidate):", this.callId, opts.fromUserId, err);
      }
    } else {
      const down = this.downstreams.get(opts.target.subscriberId)?.get(opts.target.publisherId);
      if (!down || down.closed) {
        // 缓存候选，等待下行 PC 创建完成后注入
        const key = `${opts.target.subscriberId}:${opts.target.publisherId}`;
        const list = this.pendingDownstreamIce.get(key);
        if (list) list.push(opts.candidate);
        else this.pendingDownstreamIce.set(key, [opts.candidate]);
        logDebug("[room:%s] addIce(downstream) — 缓存候选等待 PC 创建: %s→%s (缓存数=%d)",
          this.callId, opts.target.subscriberId, opts.target.publisherId,
          (list?.length ?? 0) + 1);
        return;
      }
      try {
        await down.pc.addIceCandidate(c);
      } catch (err) {
        logWarn("[room:%s] addIce(downstream) candidate failed — %s→%s (benign late-candidate):",
          this.callId, opts.target.subscriberId, opts.target.publisherId, err);
      }
    }
  }

  /**
   * Remove a participant and free their resources. If they were the last
   * participant, the room auto-closes.
   */
  leave(userId: ID) {
    logInfo("[room:%s] leave — userId=%s, totalUpstreams=%d",
      this.callId, userId, this.upstreams.size);

    const up = this.upstreams.get(userId);
    if (up) {
      up.close();
      this.upstreams.delete(userId);
    }
    const subs = this.downstreams.get(userId);
    if (subs) {
      for (const d of subs.values()) d.close();
      this.downstreams.delete(userId);
    }
    // Tear down downstreams that were *receiving* from this user.
    for (const [subId, map] of this.downstreams) {
      const d = map.get(userId);
      if (d) {
        d.close();
        map.delete(userId);
      }
      if (map.size === 0) this.downstreams.delete(subId);
    }
    this.state.delete(userId);

    // 清理与此用户相关的缓存 ICE 候选
    for (const key of this.pendingDownstreamIce.keys()) {
      if (key.startsWith(`${userId}:`) || key.endsWith(`:${userId}`)) {
        this.pendingDownstreamIce.delete(key);
      }
    }

    this.emit("user-left", { userId });

    if (this.upstreams.size === 0) {
      logInfo("[room:%s] last participant left — shutting down", this.callId);
      this.shutdown();
    }
  }

  /** Admin mutes a participant. We tear down their audio downstream senders. */
  mute(userId: ID, byUserId: ID) {
    const s = this.state.get(userId);
    if (!s) return;
    logInfo("[room:%s] mute — userId=%s, byUserId=%s", this.callId, userId, byUserId);
    s.muted = true;
    this.refreshAudioSenders(userId, false).catch((err) => {
      logWarn("[room:%s] mute refreshAudioSenders failed — userId=%s:", this.callId, userId, err);
    });
    this.emit("user-muted", { userId, byUserId });
  }

  unmute(userId: ID, byUserId: ID) {
    const s = this.state.get(userId);
    if (!s) return;
    logInfo("[room:%s] unmute — userId=%s, byUserId=%s", this.callId, userId, byUserId);
    s.muted = false;
    this.refreshAudioSenders(userId, true).catch((err) => {
      logWarn("[room:%s] unmute refreshAudioSenders failed — userId=%s:", this.callId, userId, err);
    });
    this.emit("user-unmuted", { userId, byUserId });
  }

  ban(userId: ID) {
    const s = this.state.get(userId);
    logInfo("[room:%s] ban — userId=%s", this.callId, userId);
    if (s) s.banned = true;
    this.emit("user-banned", { userId });
    this.leave(userId);
  }

  /** Tear down everything. */
  shutdown() {
    if (this.closed) return;
    logInfo("[room:%s] shutdown — upstreams=%d, downstreams=%d",
      this.callId, this.upstreams.size, this.downstreams.size);
    this.closed = true;
    for (const up of this.upstreams.values()) up.close();
    for (const subs of this.downstreams.values()) {
      for (const d of subs.values()) d.close();
    }
    this.upstreams.clear();
    this.downstreams.clear();
    this.state.clear();
    this.pendingDownstreamIce.clear();
    this.emit("closed");
  }

  // --------------------------------------------------------------------------
  // Internals
  // --------------------------------------------------------------------------

  /**
   * 将缓存的 ICE 候选注入指定的下行对等连接。
   * 在 DownstreamPeer 创建并完成 wireDownstream 后调用。
   */
  private async flushPendingDownstreamIce(subscriberId: ID, publisherId: ID, down: DownstreamPeer) {
    const key = `${subscriberId}:${publisherId}`;
    const pending = this.pendingDownstreamIce.get(key);
    if (!pending || pending.length === 0) return;
    this.pendingDownstreamIce.delete(key);
    logInfo("[room:%s] 刷新 %d 个缓存 ICE 候选: %s→%s",
      this.callId, pending.length, subscriberId, publisherId);
    for (const cand of pending) {
      try {
        await down.pc.addIceCandidate(new (RTCIceCandidate as any)(cand));
      } catch (err) {
        logWarn("[room:%s] 缓存 ICE 候选注入失败 %s→%s:", this.callId, subscriberId, publisherId, err);
      }
    }
  }

  private firstKind(up: UpstreamPeer): CallTrackKind | null {
    return up.tracks.has("camera") ? "camera" : up.tracks.has("screen") ? "screen" : null;
  }

  /**
   * Wire `ontrack` / `onicecandidate` for an upstream peer. When the
   * participant publishes a track, we (a) record it so subscribers can
   * pick it up, (b) notify existing participants so they can subscribe.
   */
  private wireUpstream(up: UpstreamPeer) {
    logInfo("[upstream:%s] wireUpstream called — registering ontrack handler", up.userId);
    up.pc.ontrack = ({ track, transceiver }: RTCTrackEvent) => {
      const mid = transceiver.mid ?? "";
      let kind: CallTrackKind = mid === "2" ? "screen" : "camera";

      logInfo("[upstream:%s] ★ ontrack FIRED — kind=%s, trackKind=%s, mid=%s, readyState=%s, enabled=%s, id=%s",
        up.userId, kind, track.kind, mid, track.readyState, track.enabled, track.id);

      let existing = up.tracks.get(kind);
      if (!existing) {
        existing = { kind, track: track as MediaStreamTrack };
        up.tracks.set(kind, existing);
      }
      if (track.kind === "audio") {
        existing.audioTrack = track;
      } else {
        existing.track = track;
      }

      const st = this.state.get(up.userId);
      if (st) {
        const set = new Set(st.publishing);
        set.add(kind);
        st.publishing = Array.from(set);
      }

      this.emit("track-published", { userId: up.userId, kind, track });
      logInfo("[upstream:%s] track-published emitted — kind=%s, publishing=%s",
        up.userId, kind, st?.publishing.join(",") || "none");
    };

    up.pc.onicecandidate = ({ candidate }: RTCPeerConnectionIceEvent) => {
      if (!candidate) return;
      const safe = sanitizeCandidate(candidate.toJSON());
      if (!safe) {
        logDebug("[upstream:%s] ICE candidate dropped — %s:%s",
          up.userId, candidate.protocol, candidate.address);
        return;
      }
      logDebug("[upstream:%s] ICE candidate (sanitized) — %s", up.userId, safe.candidate);
      this.emit("ice-upstream", { userId: up.userId, candidate: safe });
    };

    up.pc.onconnectionstatechange = () => {
      logInfo("[upstream:%s] connectionState=%s, iceConnectionState=%s",
        up.userId, up.pc.connectionState, up.pc.iceConnectionState);
      if (up.pc.connectionState === "connected" && !up.statsTimer) {
        // Periodically confirm the SFU is actually receiving RTP from this
        // publisher. If bytesReceived stays flat, the upstream is wired but
        // no media is arriving (e.g. a candidate-pair port that never
        // carries SRTP inbound).
        let lastBytes = 0;
        up.statsTimer = setInterval(() => {
          void (up.pc as any).getStats().then((stats: any) => {
            let bytesReceived = 0;
            let packetsReceived = 0;
            let packetsLost = 0;
            let pairBytesRecv = 0;
            let selectedPair = "";
            stats.forEach((r: any) => {
              if (r.type === "inbound-rtp") {
                bytesReceived += r.bytesReceived ?? 0;
                packetsReceived += r.packetsReceived ?? 0;
                packetsLost += r.packetsLost ?? 0;
              }
              if (r.type === "candidate-pair" && (r.nominated || r.state === "succeeded")) {
                pairBytesRecv += r.bytesReceived ?? 0;
                selectedPair = `${r.localCandidateId ?? "?"}→${r.remoteCandidateId ?? "?"}`;
              }
            });
            const delta = bytesReceived - lastBytes;
            lastBytes = bytesReceived;
            const totalPackets = packetsLost + packetsReceived;
            const lossRate = totalPackets > 0 ? (packetsLost / totalPackets) * 100 : 0;
            logInfo("[upstream:%s] ▲ recv stats — bytesReceived=%d (+%d/3s) packetsReceived=%d packetsLost=%d loss=%.1f%% pairBytes=%d pair=%s",
              up.userId, bytesReceived, delta, packetsReceived, packetsLost, lossRate, pairBytesRecv, selectedPair || "none");
            if (lossRate > 5) {
              logWarn("[upstream:%s] ▲ RTP 入站丢包率 %.1f%% 超过 5%% 目标阈值 (lost=%d, total=%d)",
                up.userId, lossRate, packetsLost, totalPackets);
            }
            if (delta === 0) {
              logWarn("[upstream:%s] ▲ NO RTP ingress in last 3s — upstream wired but not flowing",
                up.userId);
            }
          }).catch(() => undefined);
        }, 3000);
      }
      if (up.pc.connectionState === "failed" || up.pc.connectionState === "closed") {
        if (up.pc.connectionState === "closed") {
          this.leave(up.userId);
        }
      }
    };

    up.pc.oniceconnectionstatechange = () => {
      logDebug("[upstream:%s] iceConnectionState=%s", up.userId, up.pc.iceConnectionState);
    };
  }

  private wireDownstream(down: DownstreamPeer) {
    down.pc.onicecandidate = ({ candidate }: RTCPeerConnectionIceEvent) => {
      if (!candidate) return;
      const safe = sanitizeCandidate(candidate.toJSON());
      if (!safe) {
        logDebug("[downstream:%s→%s] ICE candidate dropped — %s:%s",
          down.subscriberId, down.publisherId, candidate.protocol, candidate.address);
        return;
      }
      logDebug("[downstream:%s→%s] ICE candidate (sanitized) — %s",
        down.subscriberId, down.publisherId, safe.candidate);
      this.emit("ice-downstream", {
        subscriberId: down.subscriberId,
        publisherId: down.publisherId,
        candidate: safe,
        kind: down.currentKind,
      });
    };

    down.pc.onconnectionstatechange = () => {
      logInfo("[downstream:%s→%s] connectionState=%s, iceConnectionState=%s",
        down.subscriberId, down.publisherId, down.pc.connectionState, down.pc.iceConnectionState);
      if (down.pc.connectionState === "connected" && !down.statsTimer) {
        // Periodically confirm the SFU is actually sending RTP to this
        // subscriber. If bytesSent stays flat, media is wired but not
        // flowing (e.g. a candidate-pair port that never carries SRTP).
        let lastBytes = 0;
        down.statsTimer = setInterval(() => {
          void (down.pc as any).getStats().then((stats: any) => {
            let bytesSent = 0;
            let packetsSent = 0;
            let nackCount = 0;
            let pliCount = 0;
            let pairBytesSent = 0;
            let selectedPair = "";
            stats.forEach((r: any) => {
              if (r.type === "outbound-rtp") {
                bytesSent += r.bytesSent ?? 0;
                packetsSent += r.packetsSent ?? 0;
                nackCount += r.nackCount ?? 0;
                pliCount += r.pliCount ?? 0;
              }
              if (r.type === "candidate-pair" && (r.nominated || r.state === "succeeded")) {
                pairBytesSent += r.bytesSent ?? 0;
                selectedPair = `${r.localCandidateId ?? "?"}→${r.remoteCandidateId ?? "?"}`;
              }
            });
            const delta = bytesSent - lastBytes;
            lastBytes = bytesSent;
            logInfo("[downstream:%s→%s] ▼ send stats — bytesSent=%d (+%d/3s) packetsSent=%d nack=%d pli=%d pairBytes=%d pair=%s",
              down.subscriberId, down.publisherId, bytesSent, delta, packetsSent, nackCount, pliCount, pairBytesSent, selectedPair || "none");
            if (nackCount > 0 || pliCount > 0) {
              logWarn("[downstream:%s→%s] ▼ 检测到 NACK=%d PLI=%d — 下游可能存在丢包",
                down.subscriberId, down.publisherId, nackCount, pliCount);
            }
            if (delta === 0) {
              logWarn("[downstream:%s→%s] ▼ NO RTP egress in last 3s — media wired but not flowing",
                down.subscriberId, down.publisherId);
            }
          }).catch(() => undefined);
        }, 3000);
      }
      if (down.pc.connectionState === "closed") {
        down.close();
        const subs = this.downstreams.get(down.subscriberId);
        subs?.delete(down.publisherId);
        if (subs && subs.size === 0) this.downstreams.delete(down.subscriberId);
      }
    };

    down.pc.oniceconnectionstatechange = () => {
      logDebug("[downstream:%s→%s] iceConnectionState=%s",
        down.subscriberId, down.publisherId, down.pc.iceConnectionState);
    };
  }

  /** Apply a max bitrate to the sender for a specific track. */
  private async applyBitrateCap(pc: RTCPeerConnection, track: MediaStreamTrack, maxBitrate: number) {
    const sender = pc.getSenders().find((s: RTCRtpSender) => s.track === track);
    if (!sender) {
      logWarn("applyBitrateCap — sender not found for track %s (kind=%s)", track.id, track.kind);
      return;
    }
    const params = sender.getParameters();

    // WebRTC spec (and wrtc, more strictly): setParameters CANNOT change the
    // number of encodings vs. what getParameters returned. wrtc throws
    // InvalidModificationError if we hand it a freshly-built encodings array.
    // When encodings isn't ready yet, skip the cap — it'll be applied on a
    // later pass once the sender has its encoding(s).
    if (!params.encodings || params.encodings.length === 0) {
      logDebug("applyBitrateCap — no encodings on sender yet, skipping cap for track %s", track.id);
      return;
    }
    // Req 8: For video camera tracks with simulcast, use multi-layer encodings
    // if the sender supports it. Otherwise fall back to single-layer cap.
    if (track.kind === "video" && params.encodings.length === 1 && maxBitrate === VIDEO_CAMERA_MAX_BITRATE) {
      // Check if we can upgrade to simulcast — only if browser/wrtc supports it.
      try {
        const simulcastParams = { ...params, encodings: SIMULCAST_VIDEO_ENCODINGS.map((e) => ({ ...e })) } as any;
        await sender.setParameters(simulcastParams);
        logDebug("applyBitrateCap — simulcast encodings applied for track %s (layers=%d)",
          track.id, SIMULCAST_VIDEO_ENCODINGS.length);
        return;
      } catch {
        // Simulcast not supported — fall back to single-layer cap.
        logDebug("applyBitrateCap — simulcast not supported for track %s, using single layer", track.id);
      }
    }
    for (const enc of params.encodings) {
      enc.maxBitrate = maxBitrate;
    }

    try {
      await sender.setParameters(params);
      logDebug("applyBitrateCap — track=%s, kind=%s, bitrate=%d bps, encodings=%d",
        track.id, track.kind, maxBitrate, params.encodings.length);
    } catch (err) {
      logWarn("applyBitrateCap — setParameters failed for track %s (encodings=%d):",
        track.id, params.encodings.length, err);
    }
  }

  /**
   * After a mute/unmute, walk every downstream that's subscribed to this
   * user's audio and toggle the sender accordingly.
   */
  private async refreshAudioSenders(userId: ID, audible: boolean) {
    const up = this.upstreams.get(userId);
    const audio = up?.tracks.get("camera")?.audioTrack;
    logInfo("[room:%s] refreshAudioSenders — userId=%s, audible=%s, hasAudio=%s",
      this.callId, userId, audible, !!audio);

    for (const [, map] of this.downstreams) {
      const down = map.get(userId);
      if (!down || down.currentKind !== "camera") continue;

      if (down.pc.signalingState !== "stable") {
        logDebug("[room:%s] refreshAudioSenders — skipping %s→%s (signalingState=%s)",
          this.callId, down.subscriberId, userId, down.pc.signalingState);
        continue;
      }

      const sender = down.audioSender;

      if (audible && audio) {
        if (sender) {
          // Replace existing audio track (preserves m-line order)
          if (sender.track !== audio) {
            await sender.replaceTrack(audio);
            this.applyBitrateCap(down.pc, audio, AUDIO_MAX_BITRATE);
          }
        } else {
          // No audio sender — add track
          const newSender = down.pc.addTrack(audio, new MediaStreamCtor([audio]));
          down.audioSender = newSender;
          this.applyBitrateCap(down.pc, audio, AUDIO_MAX_BITRATE);
        }
        // Renegotiate to send the new track to client
        down.pc
          .createOffer()
          .then((offer: RTCSessionDescriptionInit) => down.pc.setLocalDescription(offer))
          .then(() => {
            this.emit("downstream-offer", {
              subscriberId: down.subscriberId,
              publisherId: down.publisherId,
              sdp: down.pc.localDescription?.sdp ?? "",
            });
            logDebug("[room:%s] downstream-offer emitted (mute→unmute) — %s→%s",
              this.callId, down.subscriberId, down.publisherId);
          })
          .catch((err: unknown) => {
            logWarn("[room:%s] renegotiate after unmute FAILED — %s→%s:", this.callId, down.subscriberId, down.publisherId, err);
          });
      } else {
        if (sender && sender.track) {
          // Muted: replace with null to stop sending (preserves m-line order)
          await sender.replaceTrack(null);
          down.pc
            .createOffer()
            .then((offer: RTCSessionDescriptionInit) => down.pc.setLocalDescription(offer))
            .then(() => {
              this.emit("downstream-offer", {
                subscriberId: down.subscriberId,
                publisherId: down.publisherId,
                sdp: down.pc.localDescription?.sdp ?? "",
              });
              logDebug("[room:%s] downstream-offer emitted (mute) — %s→%s",
                this.callId, down.subscriberId, down.publisherId);
            })
            .catch((err: unknown) => {
              logWarn("[room:%s] renegotiate after mute FAILED — %s→%s:", this.callId, down.subscriberId, down.publisherId, err);
            });
        }
      }
    }
  }
}

// ----------------------------------------------------------------------------
// Room registry
// ----------------------------------------------------------------------------

const rooms = new Map<ID, SFU>();
export const sfuEvents = new EventEmitter();

export function getOrCreateRoom(opts: { callId: ID; conversationId: ID; kind: CallKind }): SFU {
  let room = rooms.get(opts.callId);
  if (!room) {
    room = new SFU(opts);
    rooms.set(opts.callId, room);
    room.once("closed", () => {
      logInfo("[room:%s] removed from registry", opts.callId);
      rooms.delete(opts.callId);
    });
  }
  return room;
}

export function getRoom(callId: ID): SFU | undefined {
  return rooms.get(callId);
}

export function closeRoom(callId: ID) {
  const room = rooms.get(callId);
  if (room) {
    logInfo("[room:%s] closeRoom called", callId);
    room.shutdown();
  }
  rooms.delete(callId);
}

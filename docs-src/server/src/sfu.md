# server/src/sfu.ts — WebRTC Selective Forwarding Unit

## Purpose

Implements a server-side SFU for voice/video/screen-share calls. Each participant opens one upstream RTCPeerConnection to the server. For each (subscriber, publisher) pair, the server creates a dedicated downstream RTCPeerConnection and re-attaches the publisher's tracks as sendonly. RTP is forwarded without re-encoding — lowest latency and CPU cost.

## Exports

- `class SFU extends EventEmitter` — A call room. Manages upstream/downstream peer connections, participant state, and track routing.
- `getOrCreateRoom(opts)` — Returns existing room for `callId` or creates a new one. Registers auto-cleanup on `closed` event.
- `getRoom(callId)` — Returns existing room or undefined.
- `closeRoom(callId)` — Shuts down and removes a room.
- `resetIceServersConfig()` — Clears the cached ICE server config so it is re-read from DB on next room creation.
- `sfuEvents` — Global EventEmitter for SFU-level events (currently unused externally).
- Types: `RoomJoinRequest`, `RoomJoinResult`, `RoomDownstreamAnswer`, `RoomIce`, `ParticipantState`.

## Key Logic

**Architecture:**

```
client A ──upstream─▶ [server PC A] ── track ─┐
client B ──upstream─▶ [server PC B] ── track ─┼─▶ [server PC A→X] ─▶ client X
client C ──upstream─▶ [server PC C] ── track ─┘
```

Each client sends all their tracks (mic, camera, screen) through a single upstream PC. The server receives tracks via `ontrack` and stores them in `UpstreamPeer.tracks` (keyed by `CallTrackKind`: "camera" or "screen"). For each subscriber wanting to view a publisher, a dedicated `DownstreamPeer` PC is created with the publisher's tracks attached as sendonly transceivers.

**Peer classes:**

- `UpstreamPeer` — One per participant. Holds the RTCPeerConnection, published tracks map, and transceiver map. Wired with `ontrack` (records tracks, emits `track-published`), `onicecandidate` (sanitizes and emits `ice-upstream`), and `onconnectionstatechange` (periodic stats logging, cleanup on failure/close).
- `DownstreamPeer` — One per (subscriber, publisher) pair. Holds the RTCPeerConnection, cached sender references (`audioSender`, `videoSender`) for mute/unmute via `replaceTrack(null)`, and `lastAnswerSdp` for m-line order enforcement.

**Room state:**

- `upstreams`: Map<userId, UpstreamPeer> — who is publishing.
- `downstreams`: Map<subscriberId, Map<publisherId, DownstreamPeer>> — subscription graph.
- `state`: Map<userId, ParticipantState> — per-user mute/banned/publishing status.
- `pendingDownstreamIce`: Map<"subId:pubId", RTCIceCandidateInit[]> — ICE candidates that arrived before the downstream PC was created.

**Core flows:**

1. **joinUpstream:** Accepts client's SDP offer. Creates or replaces stale UpstreamPeer. Sets remote description, creates answer. Returns answer SDP + list of existing participants. Emits `user-joined`.

2. **subscribe:** Client requests to receive a publisher's track. Creates DownstreamPeer if not exists. Attaches audio/video tracks from the publisher's upstream. Applies bitrate caps and simulcast encodings. Only renegotiates if tracks actually changed. Returns downstream offer SDP. Skips if signaling state is not stable (avoids m-line reorder errors).

3. **answerDownstream:** Client answers the downstream offer. Sets remote description on the DownstreamPeer's PC. RTP starts flowing.

4. **addIce:** Forwards ICE candidates to the correct PC (upstream or downstream). If downstream PC doesn't exist yet, caches the candidate in `pendingDownstreamIce` and flushes after PC creation.

5. **leave:** Closes upstream and all related downstreams. Cleans up cached ICE candidates. Emits `user-left`. If last participant left, calls `shutdown`.

6. **mute/unmute:** Sets `ParticipantState.muted`. Calls `refreshAudioSenders` which walks all downstreams subscribed to this user's camera track and replaces the audio track with the real track (unmute) or null (mute). Triggers renegotiation.

7. **ban:** Sets `ParticipantState.banned`, calls `leave`, emits `user-banned`.

8. **shutdown:** Closes all PCs, clears all maps, emits `closed`.

**ICE candidate sanitization (`sanitizeCandidate`):**

- Drops TCP candidates (UDP only for public path).
- If `PUBLIC_IP` is configured: keeps only candidates whose IP matches `PUBLIC_IP`, or mDNS `.local` addresses for LAN discovery. Rewrites host candidates on `HOST_LAN_IP` to `PUBLIC_IP` (for 1:1 NAT with elastic IP).
- If `PUBLIC_IP` is not configured: drops private IPs (10.x, 172.x, 192.168.x, etc.), keeps public-looking ones.
- This also hides participants' real IPs from each other — only the server's public IP is ever advertised.

**Bandwidth control:**

Applied via `applyBitrateCap` on each sender's `encodings` parameter:
- Audio: 32 kbps (Opus)
- Video (camera): 200 kbps (default), with simulcast fallback
- Video (screen): 1.2 Mbps

Simulcast (`SIMULCAST_VIDEO_ENCODINGS`): When `applyBitrateCap` is called for a video camera track, it attempts to set 3 encoding layers (200kbps/100kbps/50kbps) with different `scaleResolutionDownBy` and `maxFramerate` values. If simulcast is not supported by the wrtc library, falls back to single-layer cap.

Skipped if `encodings` array is empty (wrtc throws `InvalidModificationError` if you try to set parameters before encodings are ready).

**ICE servers:**

Loaded from `system_settings` DB table (admin panel). Falls back to `STUN_URLS` / `TURN_URL` env vars. Cached until `resetIceServersConfig()` is called. Port range: 3660-4660.

**Debug stats:**

When `onconnectionstatechange` fires with `"connected"`, a 3-second interval is started that polls `pc.getStats()` and logs inbound/outbound RTP bytes, packets, loss rate, NACK/PLI counts, and selected candidate pair.

## Dependencies

- **Imports:** `EventEmitter` from `node:events`, `@roamhq/wrtc` (RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, MediaStream), `@navo/shared` (types: `CallKind`, `CallTrackKind`, `ID`).
- **Imported by:** `ws.ts` (creates/manages rooms, wires room events to WebSocket fanout).

## Constraints and Gotchas

- `@roamhq/wrtc` is a CJS package imported via ESM `import *`. Named exports may land on `.default` — the module merges both to guarantee access. If the native module is not installed, `resolveConstructor` throws with a clear error message.
- The `subscribe` method refuses to create a new offer if `signalingState !== "stable"` — this prevents the browser error "The order of m-lines in subsequent offer doesn't match order from previous offer/answer". The client keeps using existing tracks until the current negotiation completes.
- Self-subscription (`subscriberId === publisherId`) is rejected in `ws.ts` before calling `subscribe`.
- The `pendingDownstreamIce` map handles the race condition where ICE candidates arrive before the downstream PC is created. Candidates are flushed after `wireDownstream` in `flushPendingDownstreamIce`.
- `UpstreamPeer.close()` and `DownstreamPeer.close()` are idempotent — guarded by `closed` flag.
- `applyBitrateCap` silently skips if no encodings are present yet (wrtc limitation). Simulcast attempt is wrapped in try/catch — falls back to single-layer on failure.
- `refreshAudioSenders` triggers renegotiation (creates new offer) after muting/unmuting. If the offer creation fails, the error is caught and logged but the mute state is already set.
- Room auto-closes when the last upstream is removed (`this.upstreams.size === 0`). The `closed` event triggers cleanup in the room registry.
- The `wireUpstream` `ontrack` handler determines track kind by `transceiver.mid`: mid "2" is screen, everything else is camera. This is a convention established by the client's SDP m-line order.
- `SIMULCAST_VIDEO_ENCODINGS` defines 3 layers: high (200kbps, 24fps, 1x), medium (100kbps, 15fps, 2x downscale), low (50kbps, 10fps, 4x downscale). These are used only for camera video tracks, not screen-share.

## Interactions

- **ws.ts:** The hub creates rooms via `getOrCreateRoom`, calls room methods for join/subscribe/answer/ice/leave/mute/unmute/ban. Room events (`user-left`, `track-published`, `ice-upstream`, `ice-downstream`, `downstream-offer`, `user-muted`, `user-unmuted`, `closed`) are wired to WebSocket fanout in `Hub.wireRoom`.
- **admin.js:** `getSystemSettings()` is called lazily to load ICE server configuration.
- **No dependency on store.js or db.js** — the SFU is purely a media relay layer. All authorization and conversation logic is handled by `ws.ts` before calling SFU methods.

import type { CallKind, CallTrackKind, ClientEvent, ID, ServerEvent } from "@navo/shared";

type Listener = (event: ServerEvent) => void;
export type WSStatus = "connecting" | "connected" | "reconnecting" | "disconnected";
type StatusListener = (status: WSStatus) => void;

const LOG_PREFIX = "[ws-client]";

/** Client-side JWT expiry check — decodes payload and compares exp against now. */
function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return true;
    // JWT uses base64url encoding; atob only handles standard base64
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    if (typeof payload.exp !== "number") return false;
    // Expire 30 seconds early to avoid race with server clock skew
    return payload.exp * 1000 < Date.now() + 30_000;
  } catch {
    return false; // unparseable — let server decide
  }
}

export class WSClient {
  private url: string;
  private socket: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<StatusListener>();
  private outbox: ClientEvent[] = [];
  private token: string | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;
  private intentionallyClosed = false;
  private _status: WSStatus = "disconnected";
  private everConnected = false;
  private heartbeatTimer: number | null = null;
  private readonly HEARTBEAT_MS = 25_000;

  private setStatus(s: WSStatus) {
    if (this._status === s) return;
    this._status = s;
    for (const l of this.statusListeners) l(s);
  }

  get status() {
    return this._status;
  }

  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  constructor() {
    this.url = this.resolveUrl();
    console.log(`${LOG_PREFIX} initialized, target: ${this.url}`);
  }

  private resolveUrl(): string {
    const apiBase = import.meta.env.VITE_API_BASE;
    if (apiBase) {
      const wsProto = apiBase.startsWith("https") ? "wss" : "ws";
      return `${wsProto}://${new URL(apiBase).host}/ws`;
    }
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws`;
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  connect(token: string) {
    console.log(`${LOG_PREFIX} connect() called, token present: ${!!token}`);
    if (isTokenExpired(token)) {
      console.warn(`${LOG_PREFIX} token expired — clearing and signaling disconnection`);
      this.token = null;
      this.setStatus("disconnected");
      return;
    }
    this.token = token;
    this.intentionallyClosed = false;
    this.everConnected = false;
    this.setStatus("connecting");
    this.openSocket();
  }

  disconnect() {
    console.log(`${LOG_PREFIX} disconnect() — closing intentionally`);
    this.intentionallyClosed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.token = null;
    this.outbox = [];
    this.setStatus("disconnected");
  }

  send(event: ClientEvent) {
    const json = JSON.stringify(event);
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.log(
        `%c[ws-send]%c ${event.type} | size=${new Blob([json]).size}B`,
        "color:#22c55e", "color:inherit",
      );
      this.socket.send(json);
    } else {
      console.log(
        `%c[ws-send]%c ${event.type} | QUEUED (readyState=${this.socket?.readyState ?? "null"}) | size=${new Blob([json]).size}B`,
        "color:#22c55e", "color:inherit",
      );
      this.outbox.push(event);
    }
  }

  // -------------------------------------------------------------------------
  // Voice / video call signaling
  // -------------------------------------------------------------------------

  callInvite(callId: ID, conversationId: ID, kind: CallKind) {
    this.send({ type: "call:invite", callId, conversationId, kind });
  }

  callAccept(callId: ID) {
    this.send({ type: "call:accept", callId });
  }

  callReject(callId: ID) {
    this.send({ type: "call:reject", callId });
  }

  callCancel(callId: ID) {
    this.send({ type: "call:cancel", callId });
  }

  callHangup(callId: ID) {
    this.send({ type: "call:hangup", callId });
  }

  /**
   * Caller sends their SDP offer (from RTCPeerConnection.createOffer()).
   * The server responds with `call:answer`.
   */
  callOffer(callId: ID, sdp: string) {
    this.send({ type: "call:offer", callId, sdp });
  }

  /**
   * Client answers a downstream offer from the SFU (subscribe flow).
   * `subscriberId` = client userId, `publisherId` = who they're subscribing to.
   */
  callAnswer(callId: ID, subscriberId: ID, publisherId: ID, sdp: string) {
    this.send({ type: "call:answer", callId, subscriberId, publisherId, sdp });
  }

  /**
   * Forward an ICE candidate to the server.
   * `target`: "upstream" for the client's own publish PC, "downstream" for
   * a subscriber PC (requires subscriberId + publisherId).
   */
  callIce(callId: ID, candidate: RTCIceCandidateInit, target: "upstream" | "downstream", subscriberId?: ID, publisherId?: ID) {
    this.send({ type: "call:ice", callId, candidate, target, subscriberId, publisherId });
  }

  /** Subscribe to a remote publisher's track (camera | screen). */
  callSubscribe(callId: ID, publisherId: ID, kind: CallTrackKind) {
    this.send({ type: "call:subscribe", callId, publisherId, kind });
  }

  /**
   * Admin action on a call participant: mute / unmute / ban.
   * Requires the actor to be owner/admin of the channel (enforced server-side).
   */
  callAdmin(callId: ID, action: "mute" | "unmute" | "ban", userId: ID) {
    this.send({ type: "call:admin", callId, action, userId });
  }

  private openSocket() {
    if (!this.token) {
      console.warn(`${LOG_PREFIX} openSocket() aborted — no token`);
      return;
    }
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      console.log(`${LOG_PREFIX} openSocket() skipped — socket already connecting/open, readyState: ${this.socket.readyState}`);
      return;
    }

    console.log(`${LOG_PREFIX} openSocket() → connecting to ${this.url} (attempt #${this.reconnectAttempt + 1})`);
    const sock = new WebSocket(this.url);
    this.socket = sock;

    sock.addEventListener("open", () => {
      console.log(`${LOG_PREFIX} socket OPEN, sending auth...`);
      this.reconnectAttempt = 0;
      this.setStatus(this.everConnected ? "reconnecting" : "connecting");
      const token = this.token;
      if (!token) {
        console.warn(`${LOG_PREFIX} token disappeared before auth send`);
        return;
      }
      sock.send(JSON.stringify({ type: "auth", token } satisfies ClientEvent));
      console.log(`${LOG_PREFIX} auth sent, waiting for ready before flushing outbox`);
      // Don't flush outbox here — wait for "ready" event to confirm auth succeeded.
      // Messages queued during reconnection will be flushed after the ready event.
    });

    sock.addEventListener("message", (e) => {
      let parsed: ServerEvent;
      try {
        parsed = JSON.parse(e.data) as ServerEvent;
      } catch {
        console.warn(`${LOG_PREFIX} failed to parse server message:`, e.data);
        return;
      }
      if (parsed.type === "ready") {
        this.everConnected = true;
        this.setStatus("connected");
        this.startHeartbeat();
        // Auth succeeded — flush queued outbox messages now
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          while (this.outbox.length > 0) {
            const next = this.outbox.shift()!;
            this.socket.send(JSON.stringify(next));
          }
        }
      }
      console.log(
        `%c[ws-recv]%c ${parsed.type} | size=${new Blob([e.data]).size}B`,
        "color:#3b82f6", "color:inherit",
        parsed.type === "error" ? parsed : "",
      );
      for (const l of this.listeners) l(parsed);
    });

    sock.addEventListener("close", (ev) => {
      console.log(`${LOG_PREFIX} socket CLOSED — code: ${ev.code}, reason: "${ev.reason}", wasClean: ${ev.wasClean}, intentional: ${this.intentionallyClosed}`);
      this.stopHeartbeat();
      this.socket = null;
      if (this.intentionallyClosed) {
        this.setStatus("disconnected");
        return;
      }
      this.setStatus("reconnecting");
      this.scheduleReconnect();
    });

    sock.addEventListener("error", (ev) => {
      console.error(`${LOG_PREFIX} socket ERROR`, ev);
      sock.close();
    });
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: "ping" }));
      }
    }, this.HEARTBEAT_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    this.reconnectAttempt += 1;
    const delay = Math.min(15_000, 500 * Math.pow(1.6, this.reconnectAttempt));
    console.log(`${LOG_PREFIX} scheduling reconnect in ${Math.round(delay)}ms (attempt #${this.reconnectAttempt})`);
    this.reconnectTimer = window.setTimeout(() => this.openSocket(), delay);
  }

  /** Query the server for any active calls the current user is participating in. */
  callQueryActive() {
    this.send({ type: "call:query-active" });
  }

  /** Force immediate reconnect (used by platform keepalive on app resume). */
  reconnectNow() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.intentionallyClosed = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.openSocket();
  }
}

export const wsClient = new WSClient();

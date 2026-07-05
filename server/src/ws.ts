import type { Server } from "node:http";
import { nanoid } from "nanoid";
import { t } from "@navo/shared";
import { WebSocketServer, WebSocket } from "ws";
import type {
  ActiveCallInfo,
  ActiveCallParticipant,
  BootstrapData,
  CallKind,
  CallTrackKind,
  ClientEvent,
  Conversation,
  FriendRequest,
  ID,
  Message,
  PresenceStatus,
  PublicUser,
  SendMessageRequest,
  ServerEvent,
} from "@navo/shared";
import { WS_AUTH_TIMEOUT_MS, AI_USER_ID } from "@navo/shared";
import { store } from "./store.js";
import { queryOne } from "./db.js";
import { verifyToken } from "./auth.js";
import { publishBus, setPresence, clearPresence, subscribeBus } from "./redis.js";
import { generateAiReply, isAiConfigured } from "./ai.js";
import { getOrCreateRoom, getRoom, type SFU } from "./sfu.js";
import { getNotificationsForUser, isUserBanned, isChannelBanned, checkSensitiveWords, getSystemSettings, validateCaptcha } from "./admin.js";
import { checkRateLimit, resetRateLimit, setCaptchaLock, isCaptchaLocked } from "./rate-limit.js";
import type { ScheduledDelivery } from "./scheduler.js";

interface LocalClient {
  socket: WebSocket;
  socketId: string;
  userId: ID;
}

const ORIGIN_ID = nanoid(16);

const MAX_WS_MESSAGE_BYTES = 256 * 1024;
const MAX_JSON_DEPTH = 32;

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}小时${minutes}分${seconds}秒`;
  if (minutes > 0) return `${minutes}分${seconds}秒`;
  return `${seconds}秒`;
}

export class Hub {
  private wss: WebSocketServer;
  private byUser = new Map<ID, Set<LocalClient>>();
  private callConv = new Map<ID, ID>();
  private callKindMap = new Map<ID, CallKind>();
  private callMeta = new Map<ID, { fromUserId: ID; startedAt: number; kind: CallKind }>();
  private callTimeouts = new Map<ID, ReturnType<typeof setTimeout>>();
  private wiredRooms = new Set<ID>();
  private scheduler: ScheduledDelivery | null = null;

  setScheduler(s: ScheduledDelivery) {
    this.scheduler = s;
  }

  isUserOnline(userId: ID): boolean {
    return this.byUser.has(userId);
  }

  constructor(server: Server) {
    this.wss = new WebSocketServer({
      server,
      path: "/ws",
      maxPayload: MAX_WS_MESSAGE_BYTES,
      pingInterval: 30_000,
      pingTimeout: 10_000,
    } as any);
    this.wss.on("connection", (socket) => this.onConnection(socket));
    void this.attachBus();
  }

  private async attachBus() {
    await subscribeBus((msg) => {
      if (msg.originId === ORIGIN_ID) return;
      this.deliverLocally(msg.toUserIds, msg.event);
    });
  }

  private send(socket: WebSocket, event: ServerEvent) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(event));
    }
  }

  private register(client: LocalClient) {
    let set = this.byUser.get(client.userId);
    if (!set) {
      set = new Set();
      this.byUser.set(client.userId, set);
    }
    set.add(client);
  }

  private unregister(client: LocalClient): boolean {
    const set = this.byUser.get(client.userId);
    if (!set) return true;
    set.delete(client);
    if (set.size === 0) {
      this.byUser.delete(client.userId);
      return true;
    }
    return false;
  }

  private deliverLocally(userIds: ID[], event: ServerEvent, exceptSocketId?: string) {
    for (const uid of userIds) {
      const set = this.byUser.get(uid);
      if (!set) continue;
      for (const c of set) {
        if (c.socketId === exceptSocketId) continue;
        this.send(c.socket, event);
      }
    }
  }

  async fanout(toUserIds: ID[], event: ServerEvent, exceptSocketId?: string) {
    this.deliverLocally(toUserIds, event, exceptSocketId);
    void publishBus({ toUserIds, event, excludeSocketId: exceptSocketId, originId: ORIGIN_ID }).catch((err) => {
      console.error("[ws] publishBus failed:", err);
    });
  }

  async fanoutToConversation(conversationId: ID, event: ServerEvent, exceptSocketId?: string) {
    const conv = await store.findConversation(conversationId);
    if (!conv) return;
    await this.fanout(conv.memberIds, event, exceptSocketId);
  }

  private onConnection(socket: WebSocket) {
    const socketId = nanoid(12);
    let client: LocalClient | null = null;

    const authTimer = setTimeout(() => {
      if (!client) {
        this.send(socket, { type: "error", message: t("zh-CN", "server.authTimeout") });
        socket.close();
        this.unregister({ socket, socketId, userId: "" as ID });
      }
    }, WS_AUTH_TIMEOUT_MS);

    socket.on("message", async (raw) => {
      const rawBuf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
      if (rawBuf.length > MAX_WS_MESSAGE_BYTES) {
        this.send(socket, { type: "error", message: t("zh-CN", "server.messageTooLarge") });
        socket.close();
        return;
      }
      let event: ClientEvent;
      try {
        const text = rawBuf.toString("utf8");
        let depth = 0;
        let maxDepth = 0;
        for (const ch of text) {
          if (ch === "{" || ch === "[") { depth++; maxDepth = Math.max(maxDepth, depth); }
          else if (ch === "}" || ch === "]") { depth--; }
        }
        if (maxDepth > MAX_JSON_DEPTH) {
          throw new Error("JSON depth exceeded");
        }
        event = JSON.parse(text) as ClientEvent;
      } catch {
        this.send(socket, { type: "error", message: t("zh-CN", "server.invalidMessageFormat") });
        return;
      }

      if (!client) {
        if (event.type !== "auth") {
          this.send(socket, { type: "error", message: t("zh-CN", "server.authRequired") });
          return;
        }
        const payload = verifyToken(event.token);
        if (!payload) {
          this.send(socket, { type: "error", message: t("zh-CN", "server.authFailed") });
          socket.close();
          return;
        }
        const banStatus = await isUserBanned(payload.sub);
        if (banStatus.banned) {
          this.send(socket, { type: "user:banned", reason: banStatus.reason });
          socket.close(4001, "account_banned");
          return;
        }
        clearTimeout(authTimer);
        client = { socket, socketId, userId: payload.sub };
        this.register(client);
        void this.markOnlineAndBroadcast(client.userId);

        const me = await store.findUserById(client.userId);
        if (me) {
          const conversations = await store.conversationsForUser(me.id);
          const convMembers = new Set<string>();
          for (const c of conversations) { for (const m of c.memberIds) convMembers.add(m); }
          const friendships = await store.friendshipsFor(me.id);
          const friendIds = new Set(friendships.filter((f) => f.status === "accepted").map((f) => f.userId));
          const incomingReqs = await store.incomingFriendRequests(me.id);
          const requesterIds = new Set(incomingReqs.map((r) => r.fromUserId));
          const allowed = new Set([me.id, AI_USER_ID, ...convMembers, ...friendIds, ...requesterIds]);
          const allUsers = await store.allUsers();
          const bootstrap: BootstrapData = {
            me: await store.publicUser(me),
            users: allUsers.filter((u) => allowed.has(u.id)),
            conversations,
            friends: friendships,
            friendRequests: incomingReqs,
            readMarkers: await store.readMarkersForUser(me.id),
            channelReadStates: await store.channelReadStatesForUser(me.id),
            lastMessages: await store.lastMessagesForUser(me.id),
            notifications: await getNotificationsForUser(me.id),
          };
          this.send(socket, { type: "ready", data: bootstrap });
        } else {
          this.send(socket, { type: "error", message: t("zh-CN", "server.userNotFound") });
          socket.close();
          this.unregister(client);
          return;
        }
        return;
      }

      void this.handleEvent(client, event);
    });

    socket.on("close", () => {
      clearTimeout(authTimer);
      if (!client) return;
      const wentOffline = this.unregister(client);
      if (wentOffline) void this.markOfflineAndBroadcast(client.userId);
    });

    socket.on("error", () => {
      /* close handler will cleanup */
    });
  }

  private async markOnlineAndBroadcast(userId: ID) {
    await setPresence(userId, "online");
    const updated = await store.setPresence(userId, "online");
    if (updated) await this.broadcastPresence(userId, "online", updated.lastSeen);
  }

  private async markOfflineAndBroadcast(userId: ID) {
    await clearPresence(userId);
    const updated = await store.setPresence(userId, "offline");
    if (updated) await this.broadcastPresence(userId, "offline", updated.lastSeen);
  }

  private async audienceFor(userId: ID): Promise<ID[]> {
    const audience = new Set<ID>([userId]);
    const convs = await store.conversationsForUser(userId);
    for (const conv of convs) {
      for (const memberId of conv.memberIds) audience.add(memberId);
    }
    const friendships = await store.friendshipsFor(userId);
    for (const f of friendships) audience.add(f.userId);
    return Array.from(audience);
  }

  private async broadcastPresence(userId: ID, status: PresenceStatus, lastSeen: string) {
    await this.fanout(await this.audienceFor(userId), { type: "presence", userId, status, lastSeen });
  }

  async broadcastUserUpdate(user: PublicUser) {
    await this.fanout(await this.audienceFor(user.id), { type: "user:update", user });
  }

  async broadcastConversationUpdate(conv: Conversation) {
    await this.fanout(conv.memberIds, { type: "conversation:update", conversation: conv });
  }

  async notifyConversationNew(userId: ID, conv: Conversation) {
    await this.fanout([userId], { type: "conversation:new", conversation: conv });
  }

  async notifyConversationRemove(userId: ID, conversationId: ID) {
    await this.fanout([userId], { type: "conversation:remove", conversationId });
  }

  async notifyUserBanned(userId: ID, reason?: string) {
    await this.fanout([userId], { type: "user:banned", reason });
    this.kickUser(userId);
  }

  kickUser(userId: ID) {
    const sockets = this.byUser.get(userId);
    if (sockets) {
      for (const client of sockets) {
        try { client.socket.close(4001, "account_banned"); } catch {}
      }
      this.byUser.delete(userId);
    }
  }

  async broadcastHistoryCleared(conversationId: ID) {
    await this.fanoutToConversation(conversationId, { type: "history:cleared", conversationId });
  }

  async sendToUser(userId: ID, event: ServerEvent) {
    await this.fanout([userId], event);
  }

  async fanoutToAll(event: ServerEvent) {
    const allUserIds = new Set<string>();
    for (const [userId] of this.byUser) {
      allUserIds.add(userId);
    }
    if (allUserIds.size > 0) {
      await this.fanout(Array.from(allUserIds), event);
    }
  }

  private async canAdminCall(actor: ID, conversationId: ID): Promise<boolean> {
    const conv = await store.findConversation(conversationId);
    if (!conv) return false;
    if (conv.kind === "dm") {
      return conv.memberIds.includes(actor);
    }
    const role = await store.memberRole(conversationId, actor);
    return role === "owner" || role === "admin";
  }

  async notifyFriendRequest(toUserId: ID, request: FriendRequest, from: PublicUser) {
    await this.fanout([toUserId], { type: "friend:request", request, from });
  }

  async notifyFriendUpdate(recipientId: ID, otherUserId: ID) {
    const other = await store.findUserById(otherUserId);
    if (!other) return;
    if (!(await store.friendshipBetween(recipientId, otherUserId))) {
      await this.fanout([recipientId], { type: "friend:remove", userId: otherUserId });
      return;
    }
    const friendship = await store.viewFriendship(recipientId, otherUserId);
    await this.fanout([recipientId], {
      type: "friend:update",
      friendship,
      user: await store.publicUser(other),
    });
  }

  async notifyFriendRemove(recipientId: ID, otherUserId: ID) {
    await this.fanout([recipientId], { type: "friend:remove", userId: otherUserId });
  }

  private async handleEvent(client: LocalClient, event: ClientEvent) {
    switch (event.type) {
      case "message:send":
        if (!event.payload || !event.clientId) {
          this.send(client.socket, { type: "error", message: t("zh-CN", "server.invalidMessageFormat") });
          return;
        }
        await this.onMessageSend(client, event.payload, event.clientId);
        break;
      case "typing:start":
        if (!event.conversationId) return;
        if (await store.isMember(event.conversationId, client.userId)) {
          await this.fanoutToConversation(
            event.conversationId,
            { type: "typing", conversationId: event.conversationId, userId: client.userId, isTyping: true },
            client.socketId,
          );
        }
        break;
      case "typing:stop":
        if (!event.conversationId) return;
        if (await store.isMember(event.conversationId, client.userId)) {
          await this.fanoutToConversation(
            event.conversationId,
            { type: "typing", conversationId: event.conversationId, userId: client.userId, isTyping: false },
            client.socketId,
          );
        }
        break;
      case "presence:set": {
        if (!event.status) return;
        await setPresence(client.userId, event.status);
        const updated = await store.setPresence(client.userId, event.status);
        if (updated) await this.broadcastPresence(client.userId, event.status, updated.lastSeen);
        break;
      }
      case "reaction:toggle": {
        if (!event.messageId || !event.emoji) return;
        const m = await store.toggleReaction(event.messageId, client.userId, event.emoji);
        if (m) await this.fanoutToConversation(m.conversationId, { type: "message:update", message: m });
        break;
      }
      case "read": {
        if (!event.conversationId || !event.messageId) return;
        if (await store.isMember(event.conversationId, client.userId)) {
          await store.setRead(event.conversationId, client.userId, event.messageId);
          await this.fanoutToConversation(event.conversationId, {
            type: "read",
            conversationId: event.conversationId,
            userId: client.userId,
            messageId: event.messageId,
          });
        }
        break;
      }
      case "auth":
        break;
      case "message:recall": {
        if (!event.messageId) return;
        const result = await store.recallMessage(event.messageId, client.userId);
        if (result.ok) {
          await this.fanoutToConversation(result.message.conversationId, { type: "message:update", message: result.message });
        } else {
          this.send(client.socket, { type: "error", message: result.error });
        }
        break;
      }
      case "message:edit": {
        if (!event.messageId || !event.text) return;
        const m = await store.editMessage(event.messageId, client.userId, event.text);
        if (m) await this.fanoutToConversation(m.conversationId, { type: "message:update", message: m });
        break;
      }
      case "call:invite": {
        const conv = await store.findConversation(event.conversationId);
        if (!conv || !(await store.isMember(event.conversationId, client.userId))) return;
        const callees = conv.memberIds.filter((id) => id !== client.userId);
        if (callees.length === 0) return;
        this.callConv.set(event.callId, event.conversationId);
        this.callKindMap.set(event.callId, event.kind);
        this.callMeta.set(event.callId, {
          fromUserId: client.userId,
          startedAt: Date.now(),
          kind: event.kind,
        });
        const call = {
          id: event.callId,
          conversationId: event.conversationId,
          kind: event.kind,
          fromUserId: client.userId,
          createdAt: new Date().toISOString(),
        };
        await this.fanout(callees, { type: "call:incoming", call });
        const timeout = setTimeout(() => {
          if (this.callMeta.has(event.callId)) {
            this.callMeta.delete(event.callId);
            this.callTimeouts.delete(event.callId);
            void store.findConversation(event.conversationId).then((c) => {
              if (c) {
                void this.fanout(c.memberIds, { type: "call:cancelled", callId: event.callId });
              }
            });
          }
        }, 30_000);
        this.callTimeouts.set(event.callId, timeout);
        break;
      }
      case "call:accept": {
        const acceptTimeout = this.callTimeouts.get(event.callId);
        if (acceptTimeout) { clearTimeout(acceptTimeout); this.callTimeouts.delete(event.callId); }
        const room = getRoom(event.callId);
        if (!room) return;
        const fromUserId = room ? this.findCallOrigin(event.callId, client.userId) : null;
        if (fromUserId) {
          await this.fanout([fromUserId], {
            type: "call:accepted",
            callId: event.callId,
            byUserId: client.userId,
          });
        }
        break;
      }
      case "call:reject": {
        const rejectTimeout = this.callTimeouts.get(event.callId);
        if (rejectTimeout) { clearTimeout(rejectTimeout); this.callTimeouts.delete(event.callId); }
        const room = getRoom(event.callId);
        if (room) room.shutdown();
        const meta = this.callMeta.get(event.callId);
        const fromUserId = meta?.fromUserId ?? this.findCallOrigin(event.callId, client.userId);
        this.callMeta.delete(event.callId);
        if (fromUserId) {
          await this.fanout([fromUserId], {
            type: "call:rejected",
            callId: event.callId,
            byUserId: client.userId,
          });
        }
        break;
      }
      case "call:cancel": {
        const cancelTimeout = this.callTimeouts.get(event.callId);
        if (cancelTimeout) { clearTimeout(cancelTimeout); this.callTimeouts.delete(event.callId); }
        const room = getRoom(event.callId);
        if (room) room.shutdown();
        this.callMeta.delete(event.callId);
        const conv = await store.findConversation(this.callConversation(event.callId));
        if (conv) {
          await this.fanout(conv.memberIds, {
            type: "call:cancelled",
            callId: event.callId,
          }, client.socketId);
        }
        break;
      }
      case "call:hangup": {
        const room = getRoom(event.callId);
        if (room) {
          room.leave(client.userId);
        }
        const conv = await store.findConversation(this.callConversation(event.callId));
        if (conv) {
          await this.fanout(conv.memberIds, {
            type: "call:hangup",
            callId: event.callId,
            byUserId: client.userId,
          }, client.socketId);

          const meta = this.callMeta.get(event.callId);
          if (meta) {
            const durationMs = Date.now() - meta.startedAt;
            const durationText = formatDuration(durationMs);
            const kindText = meta.kind === "video" ? t("zh-CN", "call.video") : t("zh-CN", "call.audio");
            const caller = await store.findUserById(meta.fromUserId);
            const callerName = caller?.display_name ?? t("zh-CN", "common.unknown");
            const messageText = `${kindText}${t("zh-CN", "call.ended")} · ${callerName}${t("zh-CN", "call.initiatedBy")} · ${t("zh-CN", "call.duration")} ${durationText}`;
            const message = await store.createMessage({
              conversationId: conv.id,
              authorId: meta.fromUserId,
              kind: "system",
              text: messageText,
            });
            await this.fanoutToConversation(conv.id, { type: "message:new", message });
          }
          this.callMeta.delete(event.callId);
        }
        break;
      }
      case "call:offer": {
        try {
          const conv = await store.findConversation(this.callConversation(event.callId));
          if (!conv || !(await store.isMember(conv.id, client.userId))) return;
          const existing = getRoom(event.callId);
          const callKind: CallKind = existing?.kind ?? this.callKindFor(event.callId, conv);
          const room = existing ?? getOrCreateRoom({
            callId: event.callId,
            conversationId: conv.id,
            kind: callKind,
          });
          this.wireRoom(room);
          const result = await room.joinUpstream({
            callId: event.callId,
            conversationId: conv.id,
            userId: client.userId,
            kind: room.kind,
            sdp: event.sdp,
          });
          this.send(client.socket, { type: "call:answer", callId: event.callId, fromUserId: client.userId, sdp: result.sdp });
          for (const p of result.participants) {
            this.send(client.socket, {
              type: "call:peer-joined",
              callId: event.callId,
              userId: p.userId,
              kind: room.kind,
              publishing: p.kind,
            });
            const up = room.upstreams.get(p.userId);
            if (up) {
              for (const [trackKind] of up.tracks) {
                this.send(client.socket, {
                  type: "call:track-published",
                  callId: event.callId,
                  userId: p.userId,
                  kind: trackKind,
                });
              }
            }
          }
          for (const member of conv.memberIds) {
            if (member === client.userId) continue;
            await this.fanout([member], {
              type: "call:peer-joined",
              callId: event.callId,
              userId: client.userId,
              kind: room.kind,
              publishing: null,
            });
          }
        } catch (err) {
          this.send(client.socket, { type: "error", message: (err as Error).message });
        }
        break;
      }
      case "call:answer": {
        const room = getRoom(event.callId);
        if (!room) return;
        const ev = event as ClientEvent & { subscriberId?: ID; publisherId?: ID; sdp: string };
        if (!ev.subscriberId || !ev.publisherId) return;
        try {
          await room.answerDownstream({
            subscriberId: ev.subscriberId,
            publisherId: ev.publisherId,
            sdp: ev.sdp,
          });
        } catch (err) {
          this.send(client.socket, { type: "error", message: (err as Error).message });
        }
        break;
      }
      case "call:ice": {
        const room = getRoom(event.callId);
        if (!room) return;
        const ev = event as ClientEvent & { fromUserId?: ID; subscriberId?: ID; publisherId?: ID; candidate: RTCIceCandidateInit; target?: "upstream" | "downstream" };
        try {
          await room.addIce({
            fromUserId: client.userId,
            target: ev.target === "downstream" && ev.publisherId && ev.subscriberId
              ? { subscriberId: ev.subscriberId, publisherId: ev.publisherId }
              : "upstream",
            candidate: ev.candidate,
          });
        } catch {
          /* benign late-candidate */
        }
        break;
      }
      case "call:subscribe": {
        const room = getRoom(event.callId);
        if (!room) return;
        const ev = event as ClientEvent & { publisherId: ID; kind: CallTrackKind };
        if (ev.publisherId === client.userId) {
          console.warn("[ws] call:subscribe rejected — subscriber and publisher are the same user:", client.userId);
          return;
        }
        try {
          const answer = await room.subscribe({
            subscriberId: client.userId,
            publisherId: ev.publisherId,
            kind: ev.kind,
          });
          if (answer.sdp) {
            this.send(client.socket, {
              type: "call:downstream-offer",
              callId: event.callId,
              subscriberId: client.userId,
              publisherId: ev.publisherId,
              kind: ev.kind,
              sdp: answer.sdp,
            });
          }
        } catch (err) {
          this.send(client.socket, { type: "error", message: (err as Error).message });
        }
        break;
      }
      case "call:admin": {
        const conv = await store.findConversation(this.callConversation(event.callId));
        if (!conv) return;
        if (!(await this.canAdminCall(client.userId, conv.id))) {
          this.send(client.socket, { type: "error", message: t("zh-CN", "server.noPermissionCall") });
          return;
        }
        const room = getRoom(event.callId);
        const ev = event as ClientEvent & { action: "mute" | "unmute" | "ban"; userId: ID };
        if (!room && (ev.action === "mute" || ev.action === "unmute")) return;
        if (ev.action === "mute" && room) {
          room.mute(ev.userId, client.userId);
        } else if (ev.action === "unmute" && room) {
          room.unmute(ev.userId, client.userId);
        } else if (ev.action === "ban") {
          if (room) room.ban(ev.userId);
          await this.fanout(conv.memberIds, {
            type: "call:banned",
            callId: event.callId,
            userId: ev.userId,
          });
        }
        await this.fanout(conv.memberIds, {
          type: "call:admin-event",
          callId: event.callId,
          action: ev.action,
          userId: ev.userId,
          byUserId: client.userId,
        });
        break;
      }
      case "call:query-active": {
        const activeCalls: ActiveCallInfo[] = [];
        for (const [callId, convId] of this.callConv) {
          const room = getRoom(callId);
          if (!room) continue;
          if (!room.hasUser(client.userId)) continue;
          const meta = this.callMeta.get(callId);
          if (!meta) continue;
          const participants: ActiveCallParticipant[] = [];
          for (const [userId, state] of room.state) {
            participants.push({
              userId,
              publishing: state.publishing,
              muted: state.muted,
              banned: state.banned,
            });
          }
          activeCalls.push({
            callId,
            conversationId: convId,
            kind: room.kind,
            fromUserId: meta.fromUserId,
            createdAt: new Date(meta.startedAt).toISOString(),
            participants,
          });
        }
        this.send(client.socket, { type: "call:active-calls", calls: activeCalls });
        break;
      }
      case "presence:ping": {
        if (!event.conversationId) return;
        const pingConv = await store.findConversation(event.conversationId);
        if (!pingConv || pingConv.kind !== "dm") return;
        if (!(await store.isMember(event.conversationId, client.userId))) return;
        const pingSettings = await getSystemSettings();
        const pingMax = pingSettings.rateLimitPresencePingMax ?? 1;
        const pingWindowMs = (pingSettings.rateLimitPresencePingWindow ?? 30) * 1000;
        const pingRateKey = `${client.userId}:${event.conversationId}`;
        const pingRate = checkRateLimit("presence-ping", pingRateKey, pingMax, pingWindowMs);
        if (!pingRate.allowed) {
          this.send(client.socket, {
            type: "error",
            code: "presence_ping_rate_limited",
            message: t("zh-CN", "server.presencePingRateLimited", {
              seconds: Math.max(1, Math.ceil(pingRate.resetAfterMs / 1000)),
            }),
            conversationId: event.conversationId,
          });
          return;
        }
        const peerId = pingConv.memberIds.find((id) => id !== client.userId);
        if (!peerId) return;
        const fromUser = await store.getUserById(client.userId);
        const pingId = `ping_${nanoid(8)}`;
        await this.fanout([peerId], {
          type: "presence:ping",
          conversationId: event.conversationId,
          fromUserId: client.userId,
          fromName: fromUser?.display_name ?? "User",
          pingId,
        });
        break;
      }
      case "presence:pong": {
        if (!event.conversationId || !event.pingId || !event.toUserId) return;
        if (!(await store.isMember(event.conversationId, client.userId))) return;
        await this.fanout([event.toUserId], {
          type: "presence:pong",
          conversationId: event.conversationId,
          fromUserId: client.userId,
          pingId: event.pingId,
        });
        break;
      }
      case "poll:vote": {
        if (!event.messageId || !event.optionId) return;
        const msg = await store.findMessage(event.messageId);
        if (!msg || msg.kind !== "poll") {
          this.send(client.socket, { type: "error", message: t("zh-CN", "server.pollNotFound") });
          return;
        }
        if (!(await store.isMember(msg.conversationId, client.userId))) {
          this.send(client.socket, { type: "error", message: t("zh-CN", "server.notInConv") });
          return;
        }
        let pollData: { question: string; options: { id: string; text: string }[]; anonymous: boolean };
        try {
          pollData = JSON.parse(msg.text);
        } catch {
          this.send(client.socket, { type: "error", message: t("zh-CN", "server.invalidRequest") });
          return;
        }
        if (!pollData.options.some((o) => o.id === event.optionId)) {
          this.send(client.socket, { type: "error", message: t("zh-CN", "server.invalidPollOption") });
          return;
        }
        await store.votePoll(event.messageId, client.userId, event.optionId);
        const { results, totalVotes } = await store.getPollResults(event.messageId, pollData);
        await this.fanoutToConversation(msg.conversationId, {
          type: "poll:update",
          messageId: event.messageId,
          conversationId: msg.conversationId,
          results,
          totalVotes,
        });
        break;
      }
      default: {
        const _exhaustive: never = event;
        void _exhaustive;
      }
    }
  }

  private async onMessageSend(client: LocalClient, payload: SendMessageRequest, clientId: string) {
    const conv = await store.findConversation(payload.conversationId);
    if (!conv || !(await store.isMember(payload.conversationId, client.userId))) {
      this.send(client.socket, {
        type: "error",
        message: t("zh-CN", "server.cannotSendDM"),
        clientId,
        conversationId: payload.conversationId,
      });
      return;
    }

    // Blocked channel: no messages allowed
    if (conv.kind === "channel") {
      const ban = await isChannelBanned(payload.conversationId);
      if (ban.banned) {
        this.send(client.socket, {
          type: "error",
          message: t("zh-CN", "server.channelBanned"),
          clientId,
          conversationId: payload.conversationId,
        });
        return;
      }
    }

    if (payload.text) {
      const maxLenSetting = await queryOne<{ value: string }>("SELECT value FROM system_settings WHERE \`key\` = 'maxMessageLength'");
      const maxLen = maxLenSetting ? parseInt(maxLenSetting.value, 10) : 5000;
      if (payload.text.length > maxLen) {
        this.send(client.socket, {
          type: "error",
          message: t("zh-CN", "server.messageTooLong", { max: maxLen }),
          clientId,
          conversationId: payload.conversationId,
        });
        return;
      }
    }

    // Rate limit check — if user is captcha-locked, force captcha regardless of window
    const rateSettings = await getSystemSettings();
    const msgMax = rateSettings.rateLimitMessageCount ?? 60;
    const msgWindow = (rateSettings.rateLimitMessageWindow ?? 60) * 1000;
    const captchaEnabled = rateSettings.captchaEnabled && rateSettings.captchaProvider !== 'none';
    const isLocked = captchaEnabled && isCaptchaLocked(client.userId);
    const rateResult = isLocked ? { allowed: false } : checkRateLimit("message", client.userId, msgMax, msgWindow);

    if (!rateResult.allowed) {
      if (!captchaEnabled) {
        this.send(client.socket, {
          type: "error",
          code: "rate_limited",
          message: t("zh-CN", "server.rateLimitedMsg"),
          clientId,
          conversationId: payload.conversationId,
        });
        return;
      }
      if (!payload.captchaToken) {
        setCaptchaLock(client.userId);
        this.send(client.socket, {
          type: "captcha_required",
          message: t("zh-CN", "server.captchaRequiredMsg"),
          clientId,
          conversationId: payload.conversationId,
        });
        return;
      }
      const captchaOk = await validateCaptcha(payload.captchaToken);
      if (!captchaOk) {
        this.send(client.socket, {
          type: "error",
          code: "captcha_invalid",
          message: t("zh-CN", "server.captchaFailed"),
          clientId,
          conversationId: payload.conversationId,
        });
        return;
      }
      resetRateLimit("message", client.userId);
    }

    if (conv.kind === "dm") {
      const other = conv.memberIds.find((id) => id !== client.userId);
      if (other && other !== AI_USER_ID) {
        const iBlocked = await store.hasBlocked(client.userId, other);
        const theyBlocked = await store.hasBlocked(other, client.userId);
        if (iBlocked || theyBlocked) {
          const msg = iBlocked ? t("zh-CN", "server.blockedByYou") : t("zh-CN", "server.blockedByThem");
          this.send(client.socket, {
            type: "error",
            message: msg,
            clientId,
            conversationId: payload.conversationId,
          });
          return;
        }
      }
      if (other && other !== AI_USER_ID && !(await store.areFriends(client.userId, other))) {
        const recent = await store.recentMessages(payload.conversationId, 50);
        const sent = recent.filter((m) => m.authorId === client.userId && m.kind !== "system").length;
        if (sent >= 3) {
          this.send(client.socket, {
            type: "error",
            message: t("zh-CN", "server.nonFriendLimitReached"),
            clientId,
            conversationId: payload.conversationId,
          });
          return;
        }
      }
    }

    if (conv.kind === "channel") {
      const role = await store.memberRole(payload.conversationId, client.userId);
      if (await store.isMuted(payload.conversationId, client.userId)) {
        this.send(client.socket, {
          type: "error",
          message: t("zh-CN", "server.youAreMuted"),
          clientId,
          conversationId: payload.conversationId,
        });
        return;
      }
      if (conv.muteAll && role !== "owner" && role !== "admin") {
        this.send(client.socket, {
          type: "error",
          message: t("zh-CN", "server.channelMuteAll"),
          clientId,
          conversationId: payload.conversationId,
        });
        return;
      }
    }

    if (payload.kind === "friendCard" && payload.cardId && !(await store.areFriends(client.userId, payload.cardId))) {
      this.send(client.socket, {
        type: "error",
        message: t("zh-CN", "server.onlyFriendCard"),
        clientId,
        conversationId: payload.conversationId,
      });
      return;
    }

    const trimmed = (payload.text ?? "").trim();
    const hasAttachments = !!(payload.attachments && payload.attachments.length > 0);
    const hasCard = (payload.kind === "friendCard" || payload.kind === "channelCard") && !!payload.cardId;
    const isForward = payload.kind === "forwardedCard" && !!payload.sourceConvId && !!payload.forwardMessageIds?.length;
    if (!trimmed && !hasAttachments && !hasCard && !isForward) return;

    // Sensitive word check
    if (trimmed) {
      const swResult = await checkSensitiveWords(trimmed);
      if (swResult.blocked) {
        this.send(client.socket, {
          type: "error",
          message: t("zh-CN", "server.sensitiveBlocked"),
          clientId,
          conversationId: payload.conversationId,
        });
        return;
      }
      payload.text = swResult.masked;
    }
    const effectiveText = payload.text ?? "";
    const trimmedEffective = effectiveText.trim();

    let message: Message;

    if (isForward) {
      if (!(await store.isMember(payload.sourceConvId!, client.userId))) {
        this.send(client.socket, { type: "error", message: t("zh-CN", "server.cannotForward"), clientId, conversationId: payload.conversationId });
        return;
      }
      try {
        const result = await store.createForwardedCard({
          sourceConvId: payload.sourceConvId!,
          targetConvId: payload.conversationId,
          authorId: client.userId,
          messageIds: payload.forwardMessageIds!,
        });
        message = result.message;
      } catch (err) {
        this.send(client.socket, { type: "error", message: (err as Error).message, clientId, conversationId: payload.conversationId });
        return;
      }
    } else if (payload.e2ee) {
      // E2EE 消息：仅 WS 中继，不入库；消息体由客户端填充加密负载 + 临时 ID
      message = {
        id: `e2ee_${nanoid(12)}`,
        conversationId: payload.conversationId,
        authorId: client.userId,
        kind: payload.kind ?? (hasAttachments && !trimmedEffective ? (payload.attachments![0].mimeType.startsWith("image/") ? "image" : "file") : "text"),
        format: payload.format,
        text: trimmedEffective || " ",
        attachments: payload.attachments,
        cardId: payload.cardId,
        replyToId: payload.replyToId,
        scheduledAt: payload.scheduledAt,
        createdAt: new Date().toISOString(),
        e2ee: true,
        reactions: [],
      } as any;
    } else {
      message = await store.createMessage({
        conversationId: payload.conversationId,
        authorId: client.userId,
        kind: payload.kind ?? (hasAttachments && !trimmedEffective ? (payload.attachments![0].mimeType.startsWith("image/") ? "image" : "file") : "text"),
        format: payload.format,
        text: trimmedEffective || " ",
        attachments: payload.attachments,
        cardId: payload.cardId,
        replyToId: payload.replyToId,
        scheduledAt: payload.scheduledAt,
      });
    }

    // If scheduled, don't broadcast yet — server will deliver at the scheduled time
    if (message.scheduledAt) {
      // Acknowledge the schedule to the sender so they clear the pending timer
      this.send(client.socket, { type: "message:scheduled", clientId, messageId: message.id, scheduledAt: message.scheduledAt });
      this.scheduler?.onNewScheduled(message);
      return;
    }

    this.send(client.socket, { type: "message:new", message, clientId });
    await this.fanoutToConversation(message.conversationId, { type: "message:new", message }, client.socketId);

    // E2EE 消息：不触发离线推送（服务器无法解密内容），不触发 AI 回复
    if (!message.e2ee) {
      // 个推离线推送
      store.findConversation(message.conversationId).then((msgConv) => {
        if (!msgConv) return;
        const offlineIds = msgConv.memberIds.filter((uid: string) => !this.byUser.has(uid));
        if (offlineIds.length > 0) {
          import("./getui.js").then(({ pushToUsers }) => {
            void pushToUsers(offlineIds, message.text ?? "", message.conversationId, message.id);
          }).catch(() => {});
        }
      });

      this.maybeAiReply(message);
    }
  }

  private aiQueues = new Map<ID, Promise<void>>();

  private maybeAiReply(incoming: Message) {
    if (incoming.authorId === AI_USER_ID) return;
    void store.findConversation(incoming.conversationId).then((conv) => {
      if (!conv || !conv.memberIds.includes(AI_USER_ID)) return;
      if (conv.kind !== "dm") return;

      void this.fanoutToConversation(conv.id, {
        type: "typing",
        conversationId: conv.id,
        userId: AI_USER_ID,
        isTyping: true,
      });

      const prev = this.aiQueues.get(conv.id) ?? Promise.resolve();
      const next = prev.then(() => this.generateAiReplyWithDelay(conv.id, incoming.authorId));
      this.aiQueues.set(conv.id, next);
      void next.finally(() => {
        if (this.aiQueues.get(conv.id) === next) {
          this.aiQueues.delete(conv.id);
        }
      });
    });
  }

  private async generateAiReplyWithDelay(conversationId: ID, userId: ID) {
    await new Promise((r) => setTimeout(r, 300));
    let text: string;
    try {
      text = (await isAiConfigured())
        ? await generateAiReply(conversationId, userId)
        : t("zh-CN", "server.invalidRequest");
    } catch {
      text = t("zh-CN", "error.serverError");
    }
    await this.fanoutToConversation(conversationId, {
      type: "typing",
      conversationId,
      userId: AI_USER_ID,
      isTyping: false,
    });
    const reply = await store.createMessage({
      conversationId,
      authorId: AI_USER_ID,
      kind: "ai",
      format: "markdown",
      text,
    });
    await this.fanoutToConversation(conversationId, { type: "message:new", message: reply });
  }

  shutdown() {
    this.aiQueues.clear();
    this.wss.close();
  }

  private callConversation(callId: ID): ID {
    const conv = this.callConv.get(callId);
    if (conv) return conv;
    const room = getRoom(callId);
    return room?.conversationId ?? "";
  }

  private callKindFor(callId: ID, conv: Conversation): CallKind {
    const cached = this.callKindMap.get(callId);
    if (cached) return cached;
    return conv.kind === "dm" ? "video" : "audio";
  }

  private findCallOrigin(callId: ID, _excludedUserId: ID): ID | null {
    const room = getRoom(callId);
    if (room) {
      const first = room.upstreams.keys().next();
      if (!first.done) return first.value;
    }
    return null;
  }

  private wireRoom(room: SFU) {
    if (this.wiredRooms.has(room.callId)) return;
    this.wiredRooms.add(room.callId);
    const callId = room.callId;
    void store.findConversation(room.conversationId).then((conv) => {
      if (!conv) return;
      const sendToCall = (event: ServerEvent) => {
        void this.fanout(conv.memberIds, event);
      };

      room.on("user-left", ({ userId }) => {
        sendToCall({ type: "call:peer-left", callId, userId });
      });

      room.on("track-published", ({ userId, kind }) => {
        for (const memberId of conv.memberIds) {
          if (memberId === userId) continue;
          this.deliverLocally([memberId], { type: "call:track-published", callId, userId, kind });
        }
      });

      room.on("ice-upstream", ({ userId, candidate }) => {
        void this.fanout([userId], { type: "call:ice", callId, fromUserId: userId, candidate, target: "upstream" });
      });

      room.on("ice-downstream", ({ subscriberId, publisherId, candidate, kind }) => {
        void this.fanout([subscriberId], {
          type: "call:ice",
          callId,
          fromUserId: publisherId,
          candidate,
          target: "downstream",
          subscriberId,
          publisherId,
          kind,
        });
      });

      room.on("downstream-offer", ({ subscriberId, publisherId, sdp }) => {
        const room2 = getRoom(callId);
        const kind: CallTrackKind = room2?.downstreams.get(subscriberId)?.get(publisherId)?.currentKind ?? "camera";
        void this.fanout([subscriberId], {
          type: "call:downstream-offer",
          callId,
          subscriberId,
          publisherId,
          kind,
          sdp,
        });
      });

      room.on("user-muted", ({ userId, byUserId }) => {
        sendToCall({ type: "call:admin-event", callId, action: "mute", userId, byUserId });
      });

      room.on("user-unmuted", ({ userId, byUserId }) => {
        sendToCall({ type: "call:admin-event", callId, action: "unmute", userId, byUserId });
      });

      room.on("closed", () => {
        this.callConv.delete(callId);
        this.callKindMap.delete(callId);
        this.wiredRooms.delete(callId);
      });
    });
  }
}

let hubInstance: Hub | null = null;

export function attachWebSocket(server: Server): Hub {
  hubInstance = new Hub(server);
  return hubInstance;
}

export function getHub(): Hub | null {
  return hubInstance;
}

/**
 * E2EE 会话管理：负责会话的开始、结束、监听对方在线状态。
 *
 * 设计要点：
 *   - 通过 zustand store 维护 e2eeByConversation 状态
 *   - 服务端 POST /api/me/e2ee/sessions 记录会话生命周期
 *   - 文本消息：发送时携带 e2ee: true，服务器不持久化正文
 *   - 文件：上传时关联 e2eeSessionId，结束会话时由后台清理
 *
 * 双向会话：A 开启后，B 也会自动开启同一会话（保持双方一致）
 */

import { create } from "zustand";
import { useChatStore } from "./store";
import { api } from "./api";
import { addSystemMessage } from "./e2ee-system";

export interface E2eeState {
  /** 当前打开的 E2EE 会话：conversationId -> { sessionId, peerId, peerName, startedAt } */
  active: Record<string, { sessionId: string; peerId: string; peerName: string; startedAt: string }>;
  startSession: (conversationId: string, peerId: string, peerName: string) => Promise<void>;
  endSession: (conversationId: string, reason: "manual" | "peer_offline" | "server" | "client_error") => Promise<void>;
  /** 处理来自 ws 的 e2ee 事件（对方开启/结束） */
  handleWsEvent: (evt: { type: "e2ee:started" | "e2ee:ended"; conversationId: string; peerId?: string; sessionId?: string; reason?: string }) => void;
  /** 清理（登出时） */
  reset: () => void;
}

export const useE2eeStore = create<E2eeState>((set, get) => ({
  active: {},

  async startSession(conversationId, peerId, peerName) {
    try {
      const sessionId = `e2ee_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      await api.startE2eeSession({ conversationId, peerId, sessionId });
      set((s) => ({
        active: {
          ...s.active,
          [conversationId]: { sessionId, peerId, peerName, startedAt: new Date().toISOString() },
        },
      }));
      useChatStore.getState().setE2eeActive(conversationId, true);
      addSystemMessage(conversationId, "e2ee_started", { peerName });
    } catch (e) {
      console.error("[e2ee] startSession failed", e);
      throw e;
    }
  },

  async endSession(conversationId, reason) {
    const info = get().active[conversationId];
    if (!info) return;
    try {
      await api.endE2eeSession({ conversationId, sessionId: info.sessionId, reason });
    } catch (e) {
      console.warn("[e2ee] endSession server call failed", e);
    }
    set((s) => {
      const next = { ...s.active };
      delete next[conversationId];
      return { active: next };
    });
    useChatStore.getState().setE2eeActive(conversationId, false);
    // 标记该会话所有 E2EE 文件消息为已清理（占位渲染）
    useChatStore.getState().markE2eeFilesCleaned(conversationId);
    addSystemMessage(conversationId, "e2ee_ended", { peerName: info.peerName, reason });
  },

  handleWsEvent(evt) {
    if (evt.type === "e2ee:started") {
      // 对方开启了 E2EE：本地也同步开启（保持双方一致）
      const convId = evt.conversationId;
      if (!convId) return;
      const current = get().active[convId];
      if (current) return; // 本地已开启
      const peerId = evt.peerId ?? "";
      const peerUser = peerId ? useChatStore.getState().users[peerId] : undefined;
      const peerName = peerUser?.displayName || peerUser?.username || "对方";
      const sessionId = evt.sessionId || `e2ee_sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      set((s) => ({
        active: {
          ...s.active,
          [convId]: { sessionId, peerId, peerName, startedAt: new Date().toISOString() },
        },
      }));
      useChatStore.getState().setE2eeActive(convId, true);
      addSystemMessage(convId, "e2ee_started", { peerName, reason: "peer" });
    } else if (evt.type === "e2ee:ended") {
      // 对方结束了 E2EE：本地同步关闭
      const convId = evt.conversationId;
      if (!convId) return;
      const info = get().active[convId];
      if (!info) return;
      set((s) => {
        const next = { ...s.active };
        delete next[convId];
        return { active: next };
      });
      useChatStore.getState().setE2eeActive(convId, false);
      useChatStore.getState().markE2eeFilesCleaned(convId);
      addSystemMessage(convId, "e2ee_ended", { peerName: info.peerName, reason: evt.reason ?? "peer" });
    }
  },

  reset() {
    set({ active: {} });
  },
}));

/** 桥接：把 useE2eeStore 实例挂到 ws-client 事件入口。 */
class E2eeManager {
  private boundConvos = new Map<string, string | null>(); // conversationId -> peerUserId
  /** 离线宽限期定时器：conversationId -> TimeoutId */
  private offlineTimers = new Map<string, ReturnType<typeof setTimeout>>();

  bindConversation(conversationId: string, peerUserId: string | null) {
    this.boundConvos.set(conversationId, peerUserId);
  }

  unbindConversation(conversationId: string) {
    this.boundConvos.delete(conversationId);
    const t = this.offlineTimers.get(conversationId);
    if (t) {
      clearTimeout(t);
      this.offlineTimers.delete(conversationId);
    }
  }

  /**
   * 监听 presence 变化：
   *   - 对方上线：清除 10 分钟宽限期定时器
   *   - 对方离线：启动 10 分钟定时器；超时则自动结束会话
   *   - 若对方在同一会话期间反复掉线/上线：重置定时器
   */
  onPresenceChange(peerId: string, online: boolean) {
    const active = useE2eeStore.getState().active;
    for (const [convId, info] of Object.entries(active)) {
      if (info.peerId !== peerId) continue;
      if (online) {
        // 清除离线定时器
        const t = this.offlineTimers.get(convId);
        if (t) {
          clearTimeout(t);
          this.offlineTimers.delete(convId);
        }
      } else {
        // 设置 10 分钟定时器
        const existing = this.offlineTimers.get(convId);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          this.offlineTimers.delete(convId);
          const cur = useE2eeStore.getState().active[convId];
          if (cur && cur.peerId === peerId) {
            void useE2eeStore.getState().endSession(convId, "peer_offline");
          }
        }, 10 * 60 * 1000);
        this.offlineTimers.set(convId, timer);
      }
    }
  }
}

export const e2eeManager = new E2eeManager();


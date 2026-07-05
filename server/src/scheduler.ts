import type { Hub } from "./ws.js";
import { store } from "./store.js";
import type { Message } from "@navo/shared";

const POLL_INTERVAL_MS = 30_000;
/** 任一方离线超过此时长后自动结束 E2EE（毫秒） */
const E2EE_OFFLINE_TIMEOUT_MS = 10 * 60 * 1000;

export class ScheduledDelivery {
  private hub: Hub;
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(hub: Hub) {
    this.hub = hub;
  }

  async start() {
    await this.reload();
    this.interval = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    this.interval.unref();
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  /** Reload all pending scheduled messages from DB and set up timers. */
  async reload() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();

    // First deliver any that are already past due (e.g. server was down)
    await this.deliverDue();

    // Schedule future ones
    const pending = await store.fetchPendingScheduledMessages();
    for (const msg of pending) {
      this.scheduleOne(msg);
    }
  }

  /** Called when a new scheduled message is created — schedule it immediately. */
  async onNewScheduled(msg: Message) {
    if (!msg.scheduledAt) return;
    const due = new Date(msg.scheduledAt).getTime();
    if (due <= Date.now()) {
      // Already due — deliver now
      await this.deliverOne(msg);
    } else {
      this.scheduleOne(msg);
    }
  }

  // ---- private ----

  private scheduleOne(msg: Message) {
    const due = new Date(msg.scheduledAt!).getTime();
    const delay = due - Date.now();
    if (delay <= 0) {
      this.deliverOne(msg).catch((err) =>
        console.error("[scheduler] deliver error:", err)
      );
      return;
    }
    const timer = setTimeout(() => {
      this.timers.delete(msg.id);
      this.deliverOne(msg).catch((err) =>
        console.error("[scheduler] deliver error:", err)
      );
    }, delay);
    timer.unref();
    this.timers.set(msg.id, timer);
  }

  private async deliverDue() {
    const due = await store.fetchDueScheduledMessages();
    for (const msg of due) {
      await this.deliverOne(msg);
    }
  }

  private async deliverOne(msg: Message) {
    await store.deliverScheduledMessage(msg.id);
    // Re-fetch to get the updated message (scheduledAt cleared)
    const delivered = await store.findMessage(msg.id);
    if (!delivered) return;
    this.hub.fanoutToConversation(delivered.conversationId, {
      type: "message:new",
      message: delivered,
    });
  }

  private async poll() {
    try {
      await this.deliverDue();
    } catch (err) {
      console.error("[scheduler] poll error:", err);
    }
    // 每轮顺便清理 10 分钟前仍然存活的 E2EE 会话
    try {
      await this.sweepE2eeSessions();
    } catch (err) {
      console.error("[scheduler] e2ee sweep error:", err);
    }
  }

  /**
   * 解析 ISO 时间戳为毫秒（统一按 UTC 处理，避免 MySQL NOW() 与上海时区混用）。
   */
  private parseIsoMs(iso: string | null | undefined): number | null {
    if (!iso) return null;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : null;
  }

  /**
   * 判断 E2EE 会话是否应因离线超时而结束。
   * 仅当任一方当前不在线且 last_seen 距今超过 10 分钟时返回 true。
   */
  private async shouldEndE2eeForOffline(userId: string, peerId: string): Promise<boolean> {
    const nowMs = Date.now();
    for (const uid of [userId, peerId]) {
      if (this.hub.isUserOnline(uid)) continue;
      const user = await store.findUserById(uid);
      const lastSeenMs = this.parseIsoMs(user?.last_seen);
      if (lastSeenMs === null) continue;
      if (nowMs - lastSeenMs >= E2EE_OFFLINE_TIMEOUT_MS) {
        return true;
      }
    }
    return false;
  }

  /**
   * 清理超时未关闭的 E2EE 会话：
   *   - 任一方离线满 10 分钟后自动结束（短暂切到相册/文件选择器不算）
   *   - 插入"E2EE 加密已结束"系统消息到会话
   *   - 通知 WS 双方（推送 e2ee:ended）
   *   - 删除该会话关联的 E2EE 文件（attachments + 本地文件）
   */
  private async sweepE2eeSessions() {
    const { query, execute } = await import("./db.js");
    const rows = await query<{
      conversation_id: string;
      user_id: string;
      peer_id: string;
    }>("SELECT conversation_id, user_id, peer_id FROM e2ee_sessions").catch(() => []);
    for (const r of rows) {
      const shouldEnd = await this.shouldEndE2eeForOffline(r.user_id, r.peer_id);
      if (!shouldEnd) continue;
      try {
        const nowIso = new Date().toISOString();
        // 标记文件为已清理（拉取端根据 e2ee_session_id + expires_at < now 判定）
        await execute(
          "UPDATE attachments SET e2ee_expires_at = ? WHERE e2ee_session_id = ?",
          [nowIso, `${r.conversation_id}:${r.user_id}`],
        ).catch(() => {});
        // 删除会话
        await execute(
          "DELETE FROM e2ee_sessions WHERE conversation_id = ? AND user_id = ?",
          [r.conversation_id, r.user_id],
        ).catch(() => {});
        // 插入"加密已结束"系统消息，让两端都能看到
        try {
          const sysMsg = await store.createMessage({
            conversationId: r.conversation_id,
            authorId: "__system__",
            kind: "system",
            text: "E2EE_SYSTEM:e2ee_ended|{\"reason\":\"timeout\"}",
          });
          this.hub.fanoutToConversation(r.conversation_id, {
            type: "message:new",
            message: sysMsg,
          });
        } catch (e) {
          console.warn("[scheduler] failed to insert e2ee ended system message:", e);
        }
        // WS 通知双方
        this.hub.fanoutToConversation(r.conversation_id, {
          type: "e2ee:ended",
          conversationId: r.conversation_id,
          peerId: r.peer_id,
          reason: "timeout",
        });
        // 删除 E2EE 会话文件
        try {
          const { deleteE2eeConversationFiles } = await import("./e2ee-files.js");
          await deleteE2eeConversationFiles(r.conversation_id);
        } catch { /* ignore */ }
      } catch (err) {
        console.error("[scheduler] e2ee session sweep error:", err);
      }
    }
  }
}

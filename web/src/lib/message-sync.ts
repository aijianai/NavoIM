/**
 * 离线消息同步：检测本地缓存与服务器 lastMessageId 是否一致，按需增量拉取。
 */

import type { Conversation, ID, Message } from "@navo/shared";
import { RECONNECT_PULL_MAX } from "@navo/shared";
import { api } from "./api";
import { useChatStore } from "./store";

/** 判断本地消息缓存是否落后于服务器（列表预览有最新，点进会话却缺失）。 */
export function needsMessageSync(
  conv: Conversation | undefined,
  cached: Message[] | undefined,
  lastMessage?: Message,
): boolean {
  if (!conv?.lastMessageId) return false;
  if (!cached || cached.length === 0) return true;
  if (!cached.some((m) => m.id === conv.lastMessageId)) return true;
  if (lastMessage && !cached.some((m) => m.id === lastMessage.id)) return true;
  return false;
}

/** 有限并发执行异步任务。 */
async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/**
 * 同步单个会话的消息。
 *
 * - 无缓存：拉取最近一页。
 * - 有缓存但落后：按本地尾部时间戳增量拉取（messagesSince）。
 */
export async function syncConversationMessages(
  conversationId: ID,
  opts: { isFirstConnect?: boolean } = {},
): Promise<void> {
  const store = useChatStore.getState();
  const conv = store.conversationsById[conversationId];
  const cached = store.messagesByConv[conversationId];
  const lastMessage = store.lastMessages[conversationId];

  if (!needsMessageSync(conv, cached, lastMessage)) return;

  try {
    if (!cached || cached.length === 0) {
      const pageSize = opts.isFirstConnect ? 200 : RECONNECT_PULL_MAX;
      const res = await api.messagesPage(conversationId, { pageSize });
      if (!res) return;
      store.setMessages(conversationId, res.items, res.hasMore);
      const latest = res.items[res.items.length - 1];
      if (latest) store.setSyncAnchor(conversationId, latest.createdAt);
      return;
    }

    const tail = cached[cached.length - 1];
    const since = tail?.createdAt ?? store.syncAnchors[conversationId];
    if (!since) {
      const pageRes = await api.messagesPage(conversationId, { pageSize: RECONNECT_PULL_MAX });
      if (!pageRes || pageRes.items.length === 0) return;
      store.appendMessages(conversationId, pageRes.items, pageRes.hasMore);
      const latest = pageRes.items[pageRes.items.length - 1];
      if (latest) store.setSyncAnchor(conversationId, latest.createdAt);
      return;
    }

    const res = await api.messagesSince(conversationId, since);
    if (res && res.items.length > 0) {
      store.appendMessages(conversationId, res.items, res.hasMore);
      const latest = res.items[res.items.length - 1];
      if (latest) store.setSyncAnchor(conversationId, latest.createdAt);
      return;
    }

    // since 无增量但 lastMessageId 仍不匹配：回退拉取最近一页尾部
    const pageRes = await api.messagesPage(conversationId, { pageSize: RECONNECT_PULL_MAX });
    if (!pageRes || pageRes.items.length === 0) return;
    store.appendMessages(conversationId, pageRes.items, pageRes.hasMore);
    const latest = pageRes.items[pageRes.items.length - 1];
    if (latest) store.setSyncAnchor(conversationId, latest.createdAt);
  } catch (err) {
    console.warn("[message-sync] sync failed for", conversationId, err);
    throw err;
  }
}

/**
 * WebSocket ready 后批量补齐离线消息。
 * 优先同步有未读数的会话，并发上限 4 路。
 */
export async function catchUpStaleConversations(isFirstConnect: boolean): Promise<void> {
  try {
    const fresh = await api.conversations();
    for (const c of fresh) {
      useChatStore.getState().upsertConversation(c);
    }
  } catch (err) {
    console.warn("[message-sync] refresh conversations failed", err);
  }

  const state = useChatStore.getState();
  const stale = state.conversations
    .filter((c) =>
      needsMessageSync(c, state.messagesByConv[c.id], state.lastMessages[c.id]),
    )
    .sort((a, b) => (state.unread[b.id] ?? 0) - (state.unread[a.id] ?? 0));

  if (stale.length === 0) return;

  await mapPool(stale, 4, async (c) => {
    try {
      await syncConversationMessages(c.id, { isFirstConnect });
    } catch {
      // 单会话失败不阻塞其余会话
    }
  });
}

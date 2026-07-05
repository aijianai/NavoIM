/**
 * 自动已读定时器模块（Navo助手专用）
 *
 * 仅在用户向Navo助手发送消息时启动300毫秒自动已读定时器。
 * 定时器触发后将用户发送的该条消息标记为已读状态。
 *
 * 约束：
 * - 仅适用于用户→Navo助手的单向场景
 * - 普通用户间对话、群组消息不触发自动已读
 * - 仅对用户主动发送的文本/媒体消息生效，系统消息/通话信令不触发
 * - 用户切换会话时取消定时器
 */

import { AI_USER_ID } from "@navo/shared";
import { useChatStore } from "./store";

/** 自动已读延迟时间（毫秒） */
const AUTO_READ_DELAY_MS = 300;

/** 活跃的定时器映射 conversationId -> timer handle */
const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * 检查会话是否为Navo助手会话
 *
 * @param conversationId - 要检查的会话ID
 * @returns 是否为包含Navo助手的会话
 */
function isNavoAssistantConversation(conversationId: string): boolean {
  const state = useChatStore.getState();
  const conv = state.conversationsById[conversationId];
  if (!conv) return false;

  // 方法1：直接检查 memberIds 是否包含 AI_USER_ID
  if (conv.memberIds.includes(AI_USER_ID)) return true;

  // 方法2：如果是DM且对方用户是 navo_ai 用户名，也视为Navo助手会话
  if (conv.kind === "dm") {
    const me = state.me;
    if (me) {
      const otherId = conv.memberIds.find((id) => id !== me.id);
      if (otherId) {
        const otherUser = state.users[otherId];
        if (otherUser?.username === "navo_ai") return true;
      }
    }
  }

  return false;
}

/**
 * 判断消息是否为用户主动发送的文本/媒体消息
 *
 * 排除系统消息、通话信令、服务端推送事件等非用户消息类型。
 *
 * @param kind - 消息类型
 * @returns 是否为用户可发送的消息类型
 */
function isUserSentMessageType(kind: string): boolean {
  const userMessageTypes = new Set([
    "text",
    "image",
    "file",
    "voice",
    "location",
    "sticker",
    "forwardedCard",
    "friendCard",
    "channelCard",
    "poll",
    "ai",
  ]);
  return userMessageTypes.has(kind);
}

/**
 * 启动自动已读定时器
 *
 * 仅在以下条件同时满足时启动：
 * 1. 会话为Navo助手会话（成员包含AI_USER_ID）
 * 2. 消息为当前用户主动发送
 * 3. 消息类型为用户可发送的文本/媒体类型
 *
 * @param conversationId - 消息发送到的会话ID
 * @param messageId - 用户发送的消息ID
 * @param messageKind - 消息类型
 * @param authorId - 消息发送者ID
 */
export function startAutoReadTimer(
  conversationId: string,
  messageId: string,
  messageKind: string,
  authorId: string,
): void {
  const state = useChatStore.getState();
  const { me } = state;

  // 条件1：用户必须已登录
  if (!me) return;

  // 条件2：发送者必须为当前用户
  if (authorId !== me.id) return;

  // 条件3：会话必须为Navo助手会话
  if (!isNavoAssistantConversation(conversationId)) return;

  // 条件4：消息类型必须为用户可发送的文本/媒体类型
  if (!isUserSentMessageType(messageKind)) return;

  // 取消该会话的现有定时器（如果有）
  cancelAutoReadTimer(conversationId);

  const timer = setTimeout(() => {
    activeTimers.delete(conversationId);
    executeAutoRead(conversationId, messageId);
  }, AUTO_READ_DELAY_MS);

  activeTimers.set(conversationId, timer);
}

/**
 * 取消指定会话的自动已读定时器
 *
 * 在用户切换会话时调用，避免将非活跃会话的消息错误标记为已读。
 *
 * @param conversationId - 要取消定时器的会话ID
 */
export function cancelAutoReadTimer(conversationId: string): void {
  const timer = activeTimers.get(conversationId);
  if (timer) {
    clearTimeout(timer);
    activeTimers.delete(conversationId);
  }
}

/**
 * 取消所有活跃的自动已读定时器
 *
 * 在用户登出或重置状态时调用。
 */
export function cancelAllAutoReadTimers(): void {
  for (const timer of activeTimers.values()) {
    clearTimeout(timer);
  }
  activeTimers.clear();
}

/**
 * 执行自动已读操作
 *
 * 定时器触发时调用，发送已读回执到服务器并更新本地状态。
 * 仅标记用户发送的那条消息为已读，不涉及其他消息。
 *
 * @param conversationId - 要标记为已读的会话ID
 * @param messageId - 要标记为已读的消息ID
 */
function executeAutoRead(conversationId: string, messageId: string): void {
  const state = useChatStore.getState();
  const { selectedId, me } = state;

  // 确保会话仍然是当前活跃会话
  if (selectedId !== conversationId) {
    return;
  }

  // 确保用户已登录
  if (!me) {
    return;
  }

  // 发送已读回执到服务器
  import("./ws-client").then(({ wsClient }) => {
    wsClient.send({
      type: "read",
      conversationId,
      messageId,
    });
  });

  // 更新本地 readMarkers 状态
  const next = { ...state.readMarkers, [conversationId]: messageId };
  useChatStore.setState({ readMarkers: next });

  // 持久化到 localStorage
  try {
    const READ_CACHE_KEY = "navo:im:readMarkers";
    localStorage.setItem(
      READ_CACHE_KEY,
      JSON.stringify({ ts: Date.now(), data: next }),
    );
  } catch {
    // localStorage 写入失败时静默忽略
  }
}

/**
 * 检查指定会话是否有活跃的自动已读定时器
 *
 * @param conversationId - 要检查的会话ID
 * @returns 是否有活跃的定时器
 */
export function hasActiveAutoReadTimer(conversationId: string): boolean {
  return activeTimers.has(conversationId);
}

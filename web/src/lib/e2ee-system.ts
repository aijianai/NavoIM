/**
 * E2EE 系统消息：在聊天中插入"开启"/"结束"提示。
 * 走普通消息通道（kind=system），但通过特殊 text 前缀让 UI 识别。
 */

import { useChatStore } from "./store";
import type { Message } from "@navo/shared";

const SYSTEM_AUTHOR = "__system__";
const E2EE_PREFIX = "E2EE_SYSTEM:";

export function addSystemMessage(
  conversationId: string,
  kind: "e2ee_started" | "e2ee_ended",
  data: { peerName?: string; reason?: string },
): void {
  const text = `${E2EE_PREFIX}${kind}|${encodeURIComponent(JSON.stringify(data))}`;
  const id = `sys_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const msg: Message = {
    id,
    conversationId,
    authorId: SYSTEM_AUTHOR,
    kind: "system",
    text,
    attachments: [],
    reactions: [],
    createdAt: new Date().toISOString(),
  };
  useChatStore.getState().appendMessage(msg);
}

export function isE2eeSystemMessage(text: string | undefined): boolean {
  return !!text && text.startsWith(E2EE_PREFIX);
}

export function parseE2eeSystemMessage(text: string): { kind: "e2ee_started" | "e2ee_ended"; data: Record<string, string> } | null {
  if (!isE2eeSystemMessage(text)) return null;
  const body = text.slice(E2EE_PREFIX.length);
  const [kind, raw] = body.split("|", 2);
  try {
    const data = raw ? JSON.parse(decodeURIComponent(raw)) : {};
    return { kind: kind as "e2ee_started" | "e2ee_ended", data };
  } catch {
    return { kind: kind as "e2ee_started" | "e2ee_ended", data: {} };
  }
}

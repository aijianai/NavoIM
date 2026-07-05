import fs from "node:fs/promises";
import path from "node:path";
import type { Attachment, Message } from "@navo/shared";
import { config } from "./config.js";
import { store } from "./store.js";
import { queryOne, execute } from "./db.js";

interface ChatTextPart {
  type: "text";
  text: string;
}
interface ChatImagePart {
  type: "image_url";
  image_url: { url: string };
}
type ChatContent = string | Array<ChatTextPart | ChatImagePart>;

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: ChatContent;
}

const DEFAULT_SYSTEM_PROMPT = [
  "你是一个纯粹的对话助手：可以闲聊、答疑、帮用户起草和润色消息、解释概念、给出建议。",
  "你具备多模态视觉识别能力，可以查看用户发来的图片并理解其中的内容。",
  "你没有联网或检索实时信息的能力，也无法获取用户的真实隐私数据。",
  "如果用户询问需要实时信息才能回答的问题（如今天的新闻、实时价格、当前天气），",
  "请坦诚说明你无法获取实时信息，并在能力范围内给出通用性的帮助。",
  "回复保持友好、简洁、中文为主，可以适当使用 emoji。",
].join("\n");

const MAX_CHARS_PER_MSG = 4000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SUMMARY_THRESHOLD = 40;
const SUMMARY_RECENT_COUNT = 15;
const SUMMARY_REGENERATE_AFTER = 40;

interface SummaryRow {
  conversation_id: string;
  summary: string;
  message_count: number;
  updated_at: string;
}

async function getOrCreateSummary(conversationId: string): Promise<string | null> {
  const row = await queryOne<SummaryRow>(
    "SELECT * FROM ai_conversation_summaries WHERE conversation_id = ?",
    [conversationId]
  );
  if (row) return row.summary;
  return null;
}

async function saveSummary(conversationId: string, summary: string, messageCount: number): Promise<void> {
  const now = new Date().toISOString();
  await execute(
    `INSERT INTO ai_conversation_summaries (conversation_id, summary, message_count, updated_at)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE summary = VALUES(summary), message_count = VALUES(message_count), updated_at = VALUES(updated_at)`,
    [conversationId, summary, messageCount, now]
  );
}

async function generateSummary(
  history: Message[],
  baseUrl: string,
  apiKey: string,
  model: string,
  existingSummary?: string,
): Promise<string> {
  let summaryPrompt: string;

  if (existingSummary) {
    summaryPrompt = [
      "你是一个对话摘要更新器。你之前已经生成过一份对话摘要，现在对话又有了新进展。",
      "请根据以下「已有摘要」和「最新对话记录」，生成一份更新后的完整摘要。",
      "",
      "【已有摘要】：",
      existingSummary,
      "",
      "【摘要更新规则】：",
      "1. 保留已有摘要中仍然有效的信息",
      "2. 将新对话中的新信息合并到摘要中",
      "3. 如果新对话与旧摘要有冲突，以新对话为准",
      "4. 不要重复已有摘要中未变化的内容",
      "5. 确保更新后的摘要结构完整、条理清晰",
      "",
      "【新对话记录】中请覆盖：",
      "- 新出现的用户信息或偏好变化",
      "- 新讨论的话题和关键点",
      "- 新提出的问题和回答要点",
      "- 情绪或态度的变化",
      "",
      "要求：使用中文，摘要长度不低于800字。",
    ].join("\n");
  } else {
    summaryPrompt = [
      "你是一个对话摘要生成器。请对以下对话生成一份非常详细的结构化摘要，务必完整覆盖以下内容：",
      "",
      "1. 用户基本信息：用户的称呼、性别、性格特点等从对话中能推断出的信息",
      "2. 关键讨论主题：列出了哪些话题被讨论过，每个话题的关键点",
      "3. 用户偏好：用户的兴趣、喜好、厌恶、习惯等",
      "4. 问答记录：用户提出的重要问题以及你的回答要点",
      "5. 待办事项：用户提及的需要后续处理的事情",
      "6. 情感状态：用户在整个对话中的情绪变化",
      "7. 对话风格：用户喜欢的交流方式（正式/轻松、详细/简洁等）",
      "",
      "要求：",
      "- 使用中文，条理清晰，分段明确",
      "- 尽量保留具体细节和关键信息",
      "- 如果对话中包含图片内容，也要描述图片主题",
      "- 摘要长度不低于800字",
    ].join("\n");
  }

  const messages: ChatMessage[] = [{ role: "system", content: summaryPrompt }];

  for (const m of history) {
    if (m.kind === "system") continue;
    const role: "user" | "assistant" = m.authorId === config.ai.userId ? "assistant" : "user";
    const text = m.text.slice(0, MAX_CHARS_PER_MSG);
    if (!text.trim()) continue;
    messages.push({ role, content: text });
  }

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.5,
        max_tokens: 3000,
      }),
      signal: AbortSignal.timeout(config.ai.timeoutMs),
    });
    if (!res.ok) return "";
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() || "";
  } catch {
    return "";
  }
}

async function makeApiCall(
  messages: ChatMessage[],
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.ai.timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 1500,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[ai] upstream ${res.status}: ${detail.slice(0, 300)}`);
      return "抱歉，我现在有点忙不过来，稍后再试一次好吗？";
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text && text.length > 0 ? text : "（我暂时没有想到合适的回复）";
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return "回复超时了，我可能在思考一个很难的问题，请再问我一次";
    }
    console.error("[ai] request failed:", err);
    return "抱歉，连接 AI 服务时出错了，请稍后再试。";
  } finally {
    clearTimeout(timeout);
  }
}

async function toImageUrl(att: Attachment): Promise<string | null> {
  if (/^https?:\/\//i.test(att.url)) return att.url;
  if (/^data:/i.test(att.url)) return att.url;
  if (!att.url.startsWith("/uploads/")) return null;
  const filename = att.url.replace(/^\/uploads\//, "");
  if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) return null;
  const safe = path.basename(filename);
  const filePath = path.join(config.uploadsDir, safe);
  if (!filePath.startsWith(path.resolve(config.uploadsDir))) return null;
  try {
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_IMAGE_BYTES) {
      return `${config.publicBaseUrl}${att.url}`;
    }
    const buf = await fs.readFile(filePath);
    const mime = att.mimeType || "image/png";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return `${config.publicBaseUrl}${att.url}`;
  }
}

async function buildContent(msg: Message): Promise<ChatContent> {
  const images = msg.attachments.filter((a) => a.mimeType.startsWith("image/"));
  const text = msg.text.slice(0, MAX_CHARS_PER_MSG);
  if (images.length === 0) return text;

  const parts: Array<ChatTextPart | ChatImagePart> = [];
  if (text.trim()) parts.push({ type: "text", text });
  for (const img of images) {
    const url = await toImageUrl(img);
    if (url) parts.push({ type: "image_url", image_url: { url } });
  }
  if (parts.length === 0) parts.push({ type: "text", text: "(图片)" });
  return parts;
}

export async function isAiConfigured(): Promise<boolean> {
  if (config.ai.apiKey) return true;
  try {
    const { getSystemSettings } = await import("./admin.js");
    const settings = await getSystemSettings();
    return Boolean(settings.aiApiKey);
  } catch {
    return false;
  }
}

function buildSystemPrompt(settings: any, summary: string | null, userInfo: string): string {
  const aiName = settings.aiName || "Navo 助手";
  const lines: string[] = [];

  const customPrompt = settings.aiSystemPrompt || "";
  if (customPrompt) {
    lines.push("# 角色设定（最高优先级，以下所有规则必须在此基础上遵守）");
    lines.push("");
    lines.push(customPrompt);
    lines.push("");
    lines.push("# 系统默认规则");
    lines.push("");
  }

  lines.push(`你是 Navo IM 内置的聊天助手，名字叫「${aiName}」。`);
  lines.push(DEFAULT_SYSTEM_PROMPT);

  if (userInfo) {
    lines.push("");
    lines.push("以下是当前正在与你对话的用户信息：");
    lines.push(userInfo);
  }

  if (summary) {
    lines.push("");
    lines.push("以下是你们之前对话的详细摘要，请仔细阅读以了解对话背景和用户情况：");
    lines.push(summary);
    lines.push("");
    lines.push("注意：摘要是对之前对话的总结，用户可能已经改变了某些看法。请结合摘要和最近的对话内容进行回复，如果发现冲突以最近的对话为准。");
  }

  return lines.join("\n");
}

export async function generateAiReply(conversationId: string, userId: string): Promise<string> {
  const { getSystemSettings } = await import("./admin.js");
  const settings = await getSystemSettings();
  const baseUrl = settings.aiBaseUrl || config.ai.baseUrl;
  const apiKey = settings.aiApiKey || config.ai.apiKey;
  const model = settings.aiModel || config.ai.model;

  if (!apiKey) {
    return "AI 助手未配置 API Key，请在管理后台设置。";
  }

  const allMessages = await store.messagesFor(conversationId, 1000);
  const totalCount = allMessages.length;

  const summary = await getOrCreateSummary(conversationId);

  let summaryText: string | null = summary;
  let history: Message[];

  if (summaryText && totalCount > SUMMARY_THRESHOLD) {
    history = allMessages.slice(-SUMMARY_RECENT_COUNT);
  } else {
    if (totalCount > SUMMARY_THRESHOLD) {
      const genSummary = await generateSummary(allMessages, baseUrl, apiKey, model);
      if (genSummary) {
        await saveSummary(conversationId, genSummary, totalCount);
        summaryText = genSummary;
      }
      history = allMessages.slice(-SUMMARY_RECENT_COUNT);
    } else {
      history = allMessages;
    }
  }

  let totalChars = 0;
  for (const m of history) {
    totalChars += (m.text?.length || 0) + 100;
  }
  while (totalChars > 50000 && history.length > 5) {
    const removeCount = Math.ceil(history.length / 2);
    history = history.slice(removeCount);
    totalChars = 0;
    for (const m of history) {
      totalChars += (m.text?.length || 0) + 100;
    }
  }

  const user = await store.findUserById(userId);
  let userInfo = "";
  if (user) {
    const infoParts: string[] = [];
    if (user.display_name) infoParts.push(`名称：${user.display_name}`);
    if (user.username) infoParts.push(`用户名：${user.username}`);
    if (user.bio) infoParts.push(`个人介绍：${user.bio}`);
    if (user.gender && user.gender !== "unspecified") {
      const genderMap: Record<string, string> = { male: "男", female: "女", other: "其他" };
      infoParts.push(`性别：${genderMap[user.gender] || user.gender}`);
    }
    if (infoParts.length > 0) {
      userInfo = infoParts.join("\n");
    }
  }

  const systemPrompt = buildSystemPrompt(settings, summaryText, userInfo);
  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }];

  for (const m of history) {
    if (m.kind === "system") continue;
    const role: "user" | "assistant" = m.authorId === config.ai.userId ? "assistant" : "user";
    const content = await buildContent(m);
    if (typeof content === "string" && !content.trim()) continue;
    messages.push({ role, content });
  }

  const reply = await makeApiCall(messages, baseUrl, apiKey, model);

  const newCount = await queryOne<{ c: number }>(
    "SELECT COUNT(*) AS c FROM messages WHERE conversation_id = ? AND deleted_at IS NULL",
    [conversationId]
  );
  const currentTotal = newCount?.c ?? totalCount;
  if (currentTotal > SUMMARY_THRESHOLD) {
    const summaryRow = await queryOne<SummaryRow>(
      "SELECT * FROM ai_conversation_summaries WHERE conversation_id = ?",
      [conversationId]
    );
    if (!summaryRow || currentTotal - summaryRow.message_count >= SUMMARY_REGENERATE_AFTER) {
      const oldSummary = summaryRow?.summary;
      let newMessages: Message[];
      if (oldSummary) {
        newMessages = allMessages.filter(
          (m) => summaryRow && m.createdAt > (summaryRow.updated_at || "")
        );
      } else {
        newMessages = allMessages;
      }
      const genSummary = await generateSummary(newMessages, baseUrl, apiKey, model, oldSummary);
      if (genSummary) {
        await saveSummary(conversationId, genSummary, currentTotal);
      }
    }
  }

  return reply;
}

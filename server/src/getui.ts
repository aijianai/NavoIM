import crypto from "node:crypto";
import type { ID } from "@navo/shared";

const GETUI_AUTH_URL = "https://restapi.getui.com/v2";
let cachedToken: string | null = null;
let tokenExpiry = 0;

interface GetuiConfig {
  appId: string;
  appKey: string;
  appSecret: string;
  masterSecret: string;
}

async function getConfig(): Promise<GetuiConfig | null> {
  try {
    const { queryOne } = await import("./db.js");
    const appId = await queryOne<{ value: string }>("SELECT value FROM system_settings WHERE `key`='getui_app_id'");
    const appKey = await queryOne<{ value: string }>("SELECT value FROM system_settings WHERE `key`='getui_app_key'");
    const appSecret = await queryOne<{ value: string }>("SELECT value FROM system_settings WHERE `key`='getui_app_secret'");
    const masterSecret = await queryOne<{ value: string }>("SELECT value FROM system_settings WHERE `key`='getui_master_secret'");
    if (!appId?.value || !appKey?.value || !appSecret?.value || !masterSecret?.value) return null;
    return {
      appId: appId.value.trim(),
      appKey: appKey.value.trim(),
      appSecret: appSecret.value.trim(),
      masterSecret: masterSecret.value.trim(),
    };
  } catch { return null; }
}

async function getToken(cfg: GetuiConfig): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  // 个推 V2 鉴权: sign = sha256(appkey + timestamp + mastersecret)，timestamp 为 13 位毫秒字符串
  const timestamp = String(Date.now());
  const sign = crypto
    .createHash("sha256")
    .update(`${cfg.appKey}${timestamp}${cfg.masterSecret}`, "utf8")
    .digest("hex");

  const res = await fetch(`${GETUI_AUTH_URL}/${cfg.appId}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json;charset=utf-8" },
    body: JSON.stringify({ sign, timestamp, appkey: cfg.appKey }),
  });
  const data = await res.json() as { code: number; msg: string; data?: { token: string; expire_time: string } };
  if (data.code !== 0) {
    cachedToken = null;
    tokenExpiry = 0;
    throw new Error(`Getui auth failed: ${data.msg}`);
  }
  cachedToken = data.data!.token;
  const expireMs = Number(data.data!.expire_time) || Date.now() + 86400000;
  tokenExpiry = expireMs - 60_000;
  console.log("[getui] token acquired, expires at", new Date(expireMs).toISOString());
  return cachedToken!;
}

async function getCidsForUsers(userIds: ID[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  try {
    const { query } = await import("./db.js");
    const placeholders = userIds.map(() => "?").join(",");
    const rows = await query<{ token: string }>(
      `SELECT token FROM push_tokens WHERE user_id IN (${placeholders}) AND provider='getui'`,
      userIds,
    );
    console.log(`[getui] found ${rows.length} CIDs for ${userIds.length} users`);
    return rows.map((r) => r.token);
  } catch { return []; }
}

async function doPush(cfg: GetuiConfig, token: string, body: unknown): Promise<{ ok: boolean; msg: string }> {
  const url = `${GETUI_AUTH_URL}/${cfg.appId}/push/single/cid`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json;charset=utf-8", token },
    body: JSON.stringify(body),
  });
  const data = await res.json() as { code: number; msg: string };
  if (data.code === 10001) {
    cachedToken = null;
    tokenExpiry = 0;
  }
  if (data.code === 0) {
    const cid = (body as { audience?: { cid?: string[] } }).audience?.cid?.[0] || "?";
    console.log(`[getui] push success for cid ${cid}`);
    return { ok: true, msg: "ok" };
  }
  console.warn(`[getui] push failed: code=${data.code} msg=${data.msg}`);
  return { ok: false, msg: `${data.code}: ${data.msg}` };
}

/** 个推离线必须配置 push_channel.android.ups.notification，否则杀进程后收不到 */
function buildAndroidIntent(conversationId?: string): string {
  if (conversationId) {
    return `intent://com.navo.im/conv/${conversationId}#Intent;scheme=navoim;launchFlags=0x10000000;component=com.navo.im/com.navo.im.MainActivity;S.conversationId=${conversationId};end`;
  }
  return "intent://com.navo.im#Intent;component=com.navo.im/com.navo.im.MainActivity;end";
}

/** 个推平台禁止文案中出现「个推」等敏感词 */
function sanitizePushText(text: string): string {
  const cleaned = text.replace(/个推/g, "").trim();
  return cleaned || "新消息";
}

function buildSingleCidPayload(cid: string, body: string, conversationId?: string, messageId?: string) {
  const preview = sanitizePushText((body?.trim() || "新消息").slice(0, 100));
  const transmission = JSON.stringify({
    conversationId: conversationId || "",
    messageId: messageId || "",
    body: preview,
  });
  return {
    request_id: crypto.randomUUID(),
    audience: { cid: [cid] },
    settings: {
      ttl: 3 * 24 * 3600 * 1000,
    },
    push_message: {
      transmission,
    },
    push_channel: {
      android: {
        ups: {
          notification: {
            title: "Navo IM",
            body: preview,
            click_type: "intent",
            intent: buildAndroidIntent(conversationId),
            channel_id: "navo_messages",
            channel_name: "新消息",
            channel_level: 4,
          },
        },
      },
    },
  };
}

export interface PushResult {
  total: number;
  success: number;
  failed: { cid: string; error: string }[];
  tokenError?: string;
  configOk: boolean;
}

export async function pushToUsers(userIds: ID[], body: string, conversationId?: string, messageId?: string): Promise<PushResult> {
  const result: PushResult = { total: 0, success: 0, failed: [], configOk: false };
  const cfg = await getConfig();
  if (!cfg) { console.warn("[getui] pushToUsers: no config"); return result; }
  result.configOk = true;
  const cids = await getCidsForUsers(userIds);
  result.total = cids.length;
  if (cids.length === 0) { console.log("[getui] pushToUsers: no CIDs found"); return result; }

  try {
    let token = await getToken(cfg);
    for (const cid of cids) {
      const payload = buildSingleCidPayload(cid, body, conversationId, messageId);
      let r = await doPush(cfg, token, payload);
      if (!r.ok && r.msg.includes("10001")) {
        token = await getToken(cfg);
        r = await doPush(cfg, token, payload);
      }
      if (r.ok) result.success++;
      else result.failed.push({ cid, error: r.msg });
    }
  } catch (e) {
    result.tokenError = (e as Error).message;
    console.warn("[getui] pushToUsers error:", (e as Error).message);
  }
  console.log(`[getui] pushToUsers done: ${result.success}/${result.total} ok, ${result.failed.length} failed`);
  return result;
}

export async function pushToAllUsers(title: string, content: string): Promise<PushResult> {
  const result: PushResult = { total: 0, success: 0, failed: [], configOk: false };
  const cfg = await getConfig();
  if (!cfg) { console.warn("[getui] pushToAllUsers: no config"); return result; }
  result.configOk = true;
  try {
    const token = await getToken(cfg);
    const preview = sanitizePushText((content?.trim() || title?.trim() || "新消息").slice(0, 100));
    const safeTitle = sanitizePushText(title?.trim() || "Navo IM");
    const url = `${GETUI_AUTH_URL}/${cfg.appId}/push/all`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json;charset=utf-8", token },
      body: JSON.stringify({
        request_id: crypto.randomUUID(),
        audience: "all",
        push_message: {
          transmission: JSON.stringify({ title: safeTitle, body: preview }),
        },
        push_channel: {
          android: {
            ups: {
              notification: {
                title: safeTitle,
                body: preview,
                channel_id: "navo_messages",
                click_type: "intent",
                intent: "intent://com.navo.im#Intent;component=com.navo.im/com.navo.im.MainActivity;end",
              },
            },
          },
        },
      }),
    });
    const data = await res.json() as { code: number; msg: string };
    if (data.code === 0) {
      result.success = 1;
      result.total = 1;
      console.log("[getui] pushToAllUsers success");
    } else {
      console.warn(`[getui] pushToAllUsers failed: code=${data.code} msg=${data.msg}`);
      result.failed.push({ cid: "*", error: `${data.code}: ${data.msg}` });
    }
  } catch (e) {
    result.tokenError = (e as Error).message;
    console.warn("[getui] pushToAllUsers error:", (e as Error).message);
  }
  return result;
}

/** 配置变更后清除鉴权缓存 */
export function clearGetuiTokenCache(): void {
  cachedToken = null;
  tokenExpiry = 0;
}

export async function registerToken(userId: ID, token: string): Promise<void> {
  try {
    const { execute } = await import("./db.js");
    // 每台设备只保留最新 CID，避免旧 CID 离线推送失败
    await execute("DELETE FROM push_tokens WHERE user_id=? AND provider='getui'", [userId]);
    await execute(
      "INSERT INTO push_tokens (user_id, token, provider, created_at) VALUES (?, ?, 'getui', ?)",
      [userId, token, new Date().toISOString()],
    );
    console.log(`[getui] registered token for user ${userId}: ${token.slice(0, 8)}...`);
  } catch (e) {
    console.warn("[getui] registerToken error:", (e as Error).message);
  }
}
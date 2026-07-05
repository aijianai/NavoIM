import crypto from "node:crypto";
import { query } from "./db.js";

/**
 * 短信发送模块
 * 支持腾讯云 SMS（TC3-HMAC-SHA256 签名）与阿里云 Dysmsapi（HMAC-SHA1 RPC 签名）。
 * 配置从 system_settings 表动态读取，不使用任何第三方 npm 包。
 */

export type SmsProvider = "tencent" | "aliyun" | "none";

export interface SmsConfig {
  provider: SmsProvider;
  sdkAppId: string;
  accessKeyId: string;
  accessKeySecret: string;
  signName: string;
  templateCode: string;
  region: string;
  endpoint: string;
}

export interface SmsSendResult {
  ok: boolean;
  requestId?: string;
  message?: string;
}

async function loadConfig(): Promise<SmsConfig | null> {
  try {
    const rows = await query<{ key: string; value: string }>(
      `SELECT \`key\`, value FROM system_settings WHERE \`key\` LIKE 'sms_%'`
    );
    const s: Record<string, string> = {};
    for (const r of rows) s[r.key] = r.value;
    const provider = (s.sms_provider || "none") as SmsProvider;
    if (provider === "none") return null;
    return {
      provider,
      sdkAppId: s.sms_sdk_app_id || "",
      accessKeyId: s.sms_access_key_id || "",
      accessKeySecret: s.sms_access_key_secret || "",
      signName: s.sms_sign_name || "",
      templateCode: s.sms_template_code || "",
      region: s.sms_region || "",
      endpoint: s.sms_endpoint || "",
    };
  } catch {
    return null;
  }
}

export function isConfigComplete(cfg: SmsConfig | null): cfg is SmsConfig {
  if (!cfg) return false;
  if (cfg.provider === "none") return false;
  if (!cfg.accessKeyId || !cfg.accessKeySecret || !cfg.signName || !cfg.templateCode) return false;
  if (cfg.provider === "tencent" && !cfg.sdkAppId) return false;
  return true;
}

/** 校验手机号（含国家码 +） */
export function isValidPhone(phone: string): boolean {
  if (!phone) return false;
  return /^\+\d{6,20}$/.test(phone.trim());
}

/** 规范化手机号：缺国家码则补 +86 */
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim().replace(/\s+/g, "");
  if (trimmed.startsWith("+")) return trimmed;
  if (/^86\d{11}$/.test(trimmed)) return `+${trimmed}`;
  if (/^\d{11}$/.test(trimmed)) return `+86${trimmed}`;
  return `+${trimmed.replace(/^\+/, "")}`;
}

// ---------------------------------------------------------------------------
// 腾讯云 SMS（TC3-HMAC-SHA256）
// ---------------------------------------------------------------------------

const TENCENT_API_VERSION = "2021-01-11";
const TENCENT_SERVICE = "sms";
const TENCENT_DEFAULT_HOST = "sms.tencentcloudapi.com";

function sha256Hex(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function hmacSha256(key: string | Buffer, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data).digest();
}

async function sendTencentSms(cfg: SmsConfig, phone: string, code: string): Promise<SmsSendResult> {
  const host = cfg.endpoint || TENCENT_DEFAULT_HOST;
  const region = cfg.region || "ap-guangzhou";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const date = new Date(parseInt(timestamp) * 1000).toISOString().slice(0, 10);

  const payload = {
    PhoneNumberSet: [phone],
    SmsSdkAppId: cfg.sdkAppId,
    SignName: cfg.signName,
    TemplateId: cfg.templateCode,
    TemplateParamSet: [code],
  };
  const body = JSON.stringify(payload);

  // 1. 拼接规范请求串
  const httpRequestMethod = "POST";
  const canonicalUri = "/";
  const canonicalQueryString = "";
  const contentType = "application/json; charset=utf-8";
  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-tc-action:sendsms\n`;
  const signedHeaders = "content-type;host;x-tc-action";
  const hashedRequestPayload = sha256Hex(body);
  const canonicalRequest =
    httpRequestMethod + "\n" +
    canonicalUri + "\n" +
    canonicalQueryString + "\n" +
    canonicalHeaders + "\n" +
    signedHeaders + "\n" +
    hashedRequestPayload;

  // 2. 拼接待签名字符串
  const credentialScope = `${date}/${TENCENT_SERVICE}/tc3_request`;
  const stringToSign =
    "TC3-HMAC-SHA256\n" +
    timestamp + "\n" +
    credentialScope + "\n" +
    sha256Hex(canonicalRequest);

  // 3. 计算签名
  const secretDate = hmacSha256(`TC3${cfg.accessKeySecret}`, date);
  const secretService = hmacSha256(secretDate, TENCENT_SERVICE);
  const secretSigning = hmacSha256(secretService, "tc3_request");
  const signature = crypto.createHmac("sha256", secretSigning).update(stringToSign).digest("hex");

  // 4. 拼接 Authorization
  const authorization =
    `TC3-HMAC-SHA256 Credential=${cfg.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`https://${host}`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": contentType,
      Host: host,
      "X-TC-Action": "SendSms",
      "X-TC-Timestamp": timestamp,
      "X-TC-Version": TENCENT_API_VERSION,
      "X-TC-Region": region,
    },
    body,
  });

  const data = (await res.json().catch(() => ({}))) as {
    Response?: { SendStatusSet?: { Code: string; Message: string }[]; RequestId?: string };
    Error?: { Code: string; Message: string };
  };

  if (data.Error) {
    return { ok: false, message: data.Error.Message || data.Error.Code };
  }
  const status = data.Response?.SendStatusSet?.[0];
  if (!status) {
    return { ok: false, message: "Empty response", requestId: data.Response?.RequestId };
  }
  if (status.Code !== "Ok") {
    return { ok: false, message: `${status.Code}: ${status.Message}`, requestId: data.Response?.RequestId };
  }
  return { ok: true, requestId: data.Response?.RequestId };
}

// ---------------------------------------------------------------------------
// 阿里云 Dysmsapi（HMAC-SHA1 RPC 签名）
// ---------------------------------------------------------------------------

const ALIYUN_DEFAULT_ENDPOINT = "dysmsapi.aliyuncs.com";
const ALIYUN_DEFAULT_REGION = "cn-hangzhou";

function percentEncode(s: string): string {
  return encodeURIComponent(s)
    .replace(/\!/g, "%21")
    .replace(/\'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A")
    .replace(/\+/g, "%20")
    .replace(/%7E/g, "~");
}

function aliyunSign(stringToSign: string, accessKeySecret: string): string {
  return crypto
    .createHmac("sha1", `${accessKeySecret}&`)
    .update(stringToSign, "utf8")
    .digest("base64");
}

async function sendAliyunSms(cfg: SmsConfig, phone: string, code: string): Promise<SmsSendResult> {
  const host = cfg.endpoint || ALIYUN_DEFAULT_ENDPOINT;
  const params: Record<string, string> = {
    AccessKeyId: cfg.accessKeyId,
    Action: "SendSms",
    Format: "JSON",
    PhoneNumbers: phone,
    RegionId: cfg.region || ALIYUN_DEFAULT_REGION,
    SignName: cfg.signName,
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: crypto.randomBytes(16).toString("hex"),
    SignatureVersion: "1.0",
    TemplateCode: cfg.templateCode,
    TemplateParam: JSON.stringify({ code }),
    Timestamp: new Date().toISOString().replace(/\.\d{3}/, "").replace(/:/g, "%3A"),
    Version: "2017-05-25",
  };

  // 排序
  const sortedKeys = Object.keys(params).sort();
  const canonicalizedQueryString = sortedKeys
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join("&");

  const stringToSign = `POST&%2F&${percentEncode(canonicalizedQueryString)}`;
  params.Signature = aliyunSign(stringToSign, cfg.accessKeySecret);

  const formBody = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const res = await fetch(`https://${host}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody,
  });

  const data = (await res.json().catch(() => ({}))) as {
    Code?: string;
    Message?: string;
    RequestId?: string;
    BizId?: string;
  };

  if (data.Code && data.Code !== "OK") {
    return { ok: false, message: `${data.Code}: ${data.Message}`, requestId: data.RequestId };
  }
  return { ok: true, requestId: data.RequestId || data.BizId };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** 发送注册验证码。返回 { ok, requestId?, message? }。配置缺失或号码无效时 ok=false */
export async function sendSmsCode(phone: string, code: string): Promise<SmsSendResult> {
  const cfg = await loadConfig();
  if (!isConfigComplete(cfg)) {
    return { ok: false, message: "SMS not configured" };
  }
  const normalized = normalizePhone(phone);
  if (!isValidPhone(normalized)) {
    return { ok: false, message: "Invalid phone" };
  }
  try {
    if (cfg.provider === "tencent") return await sendTencentSms(cfg, normalized, code);
    if (cfg.provider === "aliyun") return await sendAliyunSms(cfg, normalized, code);
    return { ok: false, message: "Unknown provider" };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Unknown error" };
  }
}

/** 测试用：发送一条任意内容的短信（仍走验证码模板） */
export async function sendSmsTest(phone: string): Promise<SmsSendResult> {
  return sendSmsCode(phone, "000000");
}

/** 提供给配置测试使用：仅做配置完整性检查 */
export async function getSmsConfig(): Promise<SmsConfig | null> {
  return loadConfig();
}

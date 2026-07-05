import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import multer from "multer";
import { nanoid } from "nanoid";
import rateLimit from "express-rate-limit";
import type {
  AuthResponse,
  Attachment,
  BootstrapData,
  ChangePasswordRequest,
  ChannelMemberActionBody,
  CreateChannelRequest,
  CreateDMRequest,
  LoginRequest,
  RegisterRequest,
  SendFriendRequestBody,
  SetBannedBody,
  SetMutedBody,
  SetRoleBody,
  UpdateChannelRequest,
  UpdateProfileRequest,
  DeleteAccountRequest,
} from "@navo/shared";
import { AI_USER_ID } from "@navo/shared";
import { t, type Language, detectBrowserLanguage } from "@navo/shared";
import { config } from "./config.js";
import { query, queryOne, execute } from "./db.js";
import { store } from "./store.js";
import { issueToken, verifyToken } from "./auth.js";
import { isUserBanned, isChannelBanned, getNotificationsForUser, markNotificationRead, getSystemSettings, validateCaptcha } from "./admin.js";
import { checkRateLimit } from "./rate-limit.js";
import type { VerificationPurpose } from "./verification.js";
import type { Hub } from "./ws.js";

interface AuthedRequest extends Request {
  userId?: string;
  userLanguage?: Language;
}

/** Extract real client IP from X-Forwarded-For or connection. */
function getClientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    const first = xff.split(",")[0].trim();
    if (first) return first;
  }
  if (Array.isArray(xff) && xff.length > 0) return xff[0].trim();
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

/** 规范化手机号：缺国家码则补 +86。格式无效返回空字符串。 */
function normalizePhoneOr400(phone: string): string {
  if (!phone) return "";
  const trimmed = phone.trim().replace(/\s+/g, "");
  if (!/^\+?\d{6,20}$/.test(trimmed)) return "";
  if (trimmed.startsWith("+")) return trimmed;
  if (/^86\d{11}$/.test(trimmed)) return `+${trimmed}`;
  if (/^\d{11}$/.test(trimmed)) return `+86${trimmed}`;
  return `+${trimmed}`;
}

function lang(req: Request): Language {
  const ar = req as AuthedRequest;
  if (ar.userLanguage) return ar.userLanguage;
  const acceptLang = req.headers["accept-language"];
  if (acceptLang?.startsWith("ja")) return "ja";
  if (acceptLang?.startsWith("en")) return "en";
  return "zh-CN";
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? "";
  let token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token && typeof req.query.token === "string") token = req.query.token;
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: t(lang(req), "server.loginRequired") });
    return;
  }
  req.userId = payload.sub;
  req.userLanguage = (payload.lang as Language) || detectBrowserLanguage();
  next();
}

const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadsDir,
    filename: (_req, _file, cb) => {
      cb(null, `${nanoid(16)}.navofile`);
    },
  }),
  limits: { fileSize: config.maxUploadBytes },
  fileFilter: (_req, _file, cb) => {
    cb(null, true);
  },
});

const nsfwUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(null, false);
  },
});

function ffmpegExtractPoster(inputPath: string, outputPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const args = [
      "-y",
      "-ss", "0",
      "-i", inputPath,
      "-frames:v", "1",
      "-vf", "scale=w=-2:h=320",
      "-q:v", "5",
      outputPath,
    ];
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    try {
      const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "ignore"] });
      child.on("error", () => finish(false));
      child.on("close", (code) => {
        if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          finish(true);
        } else {
          try { fs.unlinkSync(outputPath); } catch { /* noop */ }
          finish(false);
        }
      });
      setTimeout(() => {
        if (settled) return;
        try { child.kill("SIGKILL"); } catch { /* noop */ }
        try { fs.unlinkSync(outputPath); } catch { /* noop */ }
        finish(false);
      }, 5000);
    } catch {
      finish(false);
    }
  });
}

/** 使用 ffmpeg -i 解析音视频时长（秒）。失败返回 0。5s 超时。 */
function ffmpegProbeDuration(inputPath: string): Promise<number> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v: number) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    let stdout = "";
    try {
      const child = spawn("ffmpeg", ["-i", inputPath], { stdio: ["ignore", "pipe", "pipe"] });
      child.stdout.on("data", (d) => { stdout += d.toString(); });
      child.stderr.on("data", (d) => { stdout += d.toString(); });
      child.on("error", () => finish(0));
      child.on("close", () => {
        const m = stdout.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (m) {
          const h = parseInt(m[1], 10);
          const mi = parseInt(m[2], 10);
          const s = parseFloat(m[3]);
          finish(h * 3600 + mi * 60 + s);
        } else {
          finish(0);
        }
      });
      setTimeout(() => {
        if (settled) return;
        try { child.kill("SIGKILL"); } catch { /* noop */ }
        finish(0);
      }, 5000);
    } catch {
      finish(0);
    }
  });
}

export async function createHttpApp(getHub: () => Hub | null) {
  const app = express();

  const corsOrigin = process.env.CORS_ORIGIN;
  app.use(cors({
    origin: corsOrigin
      ? corsOrigin.split(",").map((s) => s.trim())
      : (origin, cb) => {
          if (!origin || process.env.NODE_ENV === "development") {
            cb(null, true);
          } else {
            const allowed = [/^https?:\/\/localhost(:\d+)?$/];
            if (allowed.some((re) => re.test(origin))) {
              cb(null, true);
            } else {
              cb(null, origin);
            }
          }
        },
    credentials: true,
  }));

  app.use(express.json({ limit: "16mb" }));

  app.set("trust proxy", 1);

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 240,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: t("zh-CN", "error.rateLimited") },
  });
  app.use("/api/", apiLimiter);

  app.use(
    "/uploads",
    express.static(config.uploadsDir, {
      setHeaders(res) {
        res.setHeader("Content-Disposition", "attachment");
        res.setHeader("X-Content-Type-Options", "nosniff");
      },
    }),
  );

  // Maintenance mode check
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    const setting = await queryOne<{ value: string }>("SELECT value FROM system_settings WHERE \`key\` = 'maintenanceMode'");
    if (setting?.value === "true" && !req.path.startsWith("/api/admin")) {
      const header = req.headers.authorization ?? "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : "";
      if (token) {
        const payload = verifyToken(token);
        if (payload?.sub) {
          const adminRole = await queryOne<{ role: string }>("SELECT role FROM admin_roles WHERE user_id = ?", [payload.sub]);
          if (adminRole?.role === "super_admin" || adminRole?.role === "admin") {
            return next();
          }
        }
      }
      res.status(503).json({ error: t(lang(req), "server.maintenance") });
      return;
    }
    next();
  });

  const hub = () => getHub();

  /** If the channel is banned, return 403 and true; otherwise false. */
  async function assertChannelNotBanned(channelId: string, req: Request, res: Response): Promise<boolean> {
    if (channelId.startsWith("dm:")) return false;
    const ban = await isChannelBanned(channelId);
    if (ban.banned) {
      res.status(403).json({ error: t(lang(req), "server.channelBanned"), banned: true, reason: ban.reason });
      return true;
    }
    return false;
  }

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "navo-im", time: new Date().toISOString() });
  });

  // Public system settings
  app.get("/api/system/settings", async (_req, res) => {
    const settings = await getSystemSettings();
    const nsfwRow = await queryOne<{ value: string }>("SELECT value FROM system_settings WHERE `key` = 'nsfwEnabled'");
    const nsfwThresholdRow = await queryOne<{ value: string }>("SELECT value FROM system_settings WHERE `key` = 'nsfwThreshold'");
    const ssoEnabledRow = await queryOne<{ value: string }>("SELECT value FROM system_settings WHERE `key` = 'ssoEnabled'");
    const ssoCompanyNameRow = await queryOne<{ value: string }>("SELECT value FROM system_settings WHERE `key` = 'ssoCompanyName'");
    const ssoCompanyFormalNameRow = await queryOne<{ value: string }>("SELECT value FROM system_settings WHERE `key` = 'ssoCompanyFormalName'");
    const ssoIconUrlRow = await queryOne<{ value: string }>("SELECT value FROM system_settings WHERE `key` = 'ssoIconUrl'");
    res.json({
      requireInviteCode: settings.requireInviteCode,
      allowRegistration: settings.allowRegistration,
      maintenanceMode: settings.maintenanceMode,
      maintenanceMessage: settings.maintenanceMessage,
      siteName: settings.siteName,
      usernameRegistrationEnabled: settings.usernameRegistrationEnabled,
      emailRegistrationEnabled: settings.emailRegistrationEnabled,
      phoneRegistrationEnabled: settings.phoneRegistrationEnabled,
      nsfwEnabled: nsfwRow?.value === "true",
      nsfwThreshold: parseFloat(nsfwThresholdRow?.value || "0.6"),
      ssoEnabled: ssoEnabledRow?.value === "true",
      ssoCompanyName: ssoCompanyNameRow?.value || "",
      ssoCompanyFormalName: ssoCompanyFormalNameRow?.value || "",
      ssoIconUrl: ssoIconUrlRow?.value || "",
    });
  });

  // Public captcha config (for login page)
  app.get("/api/system/captcha-config", async (_req, res) => {
    const settings = await getSystemSettings();
    res.json({
      enabled: settings.captchaEnabled,
      provider: settings.captchaProvider,
      frontendUrl: settings.captchaFrontendUrl,
    });
  });

  // Public CDN config (for dynamic resource loading)
  app.get("/api/system/cdn-config", async (_req, res) => {
    const settings = await getSystemSettings();
    res.json({
      fontsGoogleCssUrl: settings.cdnFontsGoogleCssUrl || "",
      vconsoleEnabled: settings.cdnVconsoleEnabled ?? false,
    });
  });

  // Public ICE servers config (for WebRTC)
  app.get("/api/system/ice-servers", async (_req, res) => {
    const settings = await getSystemSettings();
    const parseJsonArray = (s: string): any[] => {
      try { return JSON.parse(s); } catch { return []; }
    };
    const stunServers = parseJsonArray(settings.iceStunUrls);
    const turnServers = parseJsonArray(settings.iceTurnUrl);
    const servers: any[] = [
      ...stunServers.map((s: any) => ({ urls: s.url })),
      ...turnServers.map((s: any) => ({
        urls: s.url,
        username: s.username || undefined,
        credential: s.credential || undefined,
      })),
    ];
    res.json({ iceServers: servers });
  });

  // Auth
  app.post("/api/auth/login", async (req, res) => {
    const { username, password, captchaToken } = (req.body ?? {}) as LoginRequest;

    // Dynamic rate limit
    const rateSettings = await getSystemSettings();
    const loginMax = rateSettings.rateLimitLoginMax ?? 10;
    const loginWindow = (rateSettings.rateLimitLoginWindow ?? 900) * 1000;
    const ip = getClientIp(req);
    const rateResult = checkRateLimit("login", ip, loginMax, loginWindow);
    if (!rateResult.allowed) {
      res.status(429).json({ error: t(lang(req), "server.loginRateLimited") });
      return;
    }

    if (!username || !password) {
      res.status(400).json({ error: t(lang(req), "server.enterUsernamePassword") });
      return;
    }
    const captchaSettings = await getSystemSettings();
    const captchaEnabled = captchaSettings.captchaEnabled && captchaSettings.captchaProvider !== 'none';
    if (captchaEnabled) {
      if (!captchaToken) {
        res.status(400).json({ error: t(lang(req), "server.captchaRequired") });
        return;
      }
      const captchaOk = await validateCaptcha(captchaToken);
      if (!captchaOk) {
        res.status(400).json({ error: t(lang(req), "server.captchaFailed") });
        return;
      }
    }
    const user = await store.findUserByUsername(username);
    if (!user || !(await store.verifyPassword(user, password))) {
      res.status(401).json({ error: t(lang(req), "server.wrongCredentials") });
      return;
    }
    const banStatus = await isUserBanned(user.id);
    if (banStatus.banned) {
      res.status(403).json({ error: t(lang(req), "server.accountBanned", { reason: banStatus.reason ?? "" }), banned: true, reason: banStatus.reason });
      return;
    }
    console.log(`[auth] login user=${user.id} ip=${ip}`);
    const token = issueToken(user.id, user.username, user.language ?? undefined);

    const needSecondPassword = await store.hasSecondPassword(user.id);
    let secondPasswordHint: string | undefined;
    if (needSecondPassword) {
      secondPasswordHint = await store.getSecondPasswordHint(user.id) ?? undefined;
    }

    const body: AuthResponse = {
      token,
      user: await store.publicUser(user),
      needSecondPassword,
      secondPasswordHint
    };
    res.json(body);
  });

  // ── SSO 单点登录：OAuth 2.0 / OIDC 授权码流程 ──

  /** 计算服务端 SSO 回调地址 */
  function ssoRedirectUri(): string {
    const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
    return `${base}/api/auth/sso/callback`;
  }

  // 步骤 1：前端请求此端点，服务端返回授权地址（含 PKCE state）
  app.post("/api/auth/sso/initiate", async (req, res) => {
    try {
      const ssoConfig = await (await import("./sso.js")).loadSsoConfig();
      if (!ssoConfig) {
        res.status(403).json({ error: t(lang(req), "server.ssoDisabled") || "SSO not enabled" });
        return;
      }
      const { generateCodeChallenge, generateCodeVerifier, generateState, saveSsoState } = await import("./sso.js");
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);
      const state = generateState();
      const redirectUri = ssoRedirectUri();
      await saveSsoState(state, codeVerifier, redirectUri);
      const authUrl = new URL(ssoConfig.authorizationEndpoint);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("client_id", ssoConfig.clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("scope", ssoConfig.scopes);
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");
      res.json({ authorizationUrl: authUrl.toString() });
    } catch (e) {
      console.error("[sso] initiate failed:", e);
      res.status(500).json({ error: "SSO initiate failed" });
    }
  });

  // 步骤 2：IdP 重定向回此端点，换 token 并签发会话
  app.get("/api/auth/sso/callback", async (req, res) => {
    const { code, state, error: ssoError } = req.query as { code?: string; state?: string; error?: string };
    const frontendBase = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
    if (ssoError) {
      res.redirect(`${frontendBase}/login?sso_error=${encodeURIComponent(ssoError)}`);
      return;
    }
    if (!code || !state) {
      res.status(400).send("Missing code or state");
      return;
    }
    try {
      const ssoConfig = await (await import("./sso.js")).loadSsoConfig();
      if (!ssoConfig) {
        res.status(403).send("SSO not enabled");
        return;
      }
      const { consumeSsoState, exchangeCodeForToken, fetchUserInfo } = await import("./sso.js");
      const stateRow = await consumeSsoState(state);
      if (!stateRow) {
        res.status(400).send("Invalid or expired state");
        return;
      }
      const tokenResp = await exchangeCodeForToken(
        ssoConfig.tokenEndpoint,
        ssoConfig.clientId,
        ssoConfig.clientSecret,
        code,
        stateRow.code_verifier || "",
        stateRow.redirect_uri,
      );
      if (!tokenResp.access_token) {
        throw new Error("SSO token response missing access_token");
      }
      let userInfo: { sub?: string; id?: string; email?: string; name?: string; preferred_username?: string; nickname?: string; picture?: string } = {};
      if (ssoConfig.userInfoEndpoint) {
        userInfo = await fetchUserInfo(ssoConfig.userInfoEndpoint, tokenResp.access_token);
      }
      const ssoSub = String(userInfo.sub || userInfo.id || userInfo.email || "");
      if (!ssoSub) {
        throw new Error("SSO userinfo missing sub/id/email");
      }
      const formalName = ssoConfig.companyFormalName || "sso";
      const safeSub = ssoSub.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || nanoid(10);
      const username = `${formalName}_${safeSub}`.slice(0, 128);
      const ip = getClientIp(req);
      const existing = await store.findUserByUsername(username);
      let userId: string;
      let userUsername: string;
      if (existing) {
        userId = existing.id;
        userUsername = existing.username;
      } else {
        const displayName = (userInfo.name || userInfo.nickname || userInfo.preferred_username || ssoConfig.companyName + "用户").slice(0, 64);
        const created = await store.createUser({
          username,
          password: crypto.randomBytes(32).toString("hex"),
          displayName,
          email: userInfo.email || undefined,
          avatarUrl: userInfo.picture || undefined,
          registerIp: ip,
          language: lang(req),
        });
        userId = created.id;
        userUsername = created.username;
      }
      const token = issueToken(userId, userUsername, lang(req));
      res.redirect(`${frontendBase}/login?sso_token=${encodeURIComponent(token)}`);
    } catch (e) {
      console.error("[sso] callback failed:", e);
      res.redirect(`${frontendBase}/login?sso_error=${encodeURIComponent((e as Error).message || "SSO callback failed")}`);
    }
  });

  // 保留旧端点为兼容：直接签发 token 模式（首次访问自动创建用户，无 OAuth 校验）
  app.post("/api/auth/sso", async (req, res) => {
    try {
      const regSetting = await queryOne<{ value: string }>("SELECT value FROM system_settings WHERE `key` = 'ssoEnabled'");
      if (regSetting?.value !== "true") {
        res.status(403).json({ error: t(lang(req), "server.ssoDisabled") || "SSO not enabled" });
        return;
      }
      const formalNameRow = await queryOne<{ value: string }>("SELECT value FROM system_settings WHERE `key` = 'ssoCompanyFormalName'");
      const companyNameRow = await queryOne<{ value: string }>("SELECT value FROM system_settings WHERE `key` = 'ssoCompanyName'");
      const formalName = formalNameRow?.value || "";
      const companyName = companyNameRow?.value || "";
      if (!formalName || !companyName) {
        res.status(403).json({ error: "SSO not configured" });
        return;
      }
      // 16 位 hex uuid
      const hex16 = Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const username = `${formalName}_${hex16}`;
      const displayName = `${companyName}用户_${hex16}`;
      const ip = getClientIp(req);
      const user = await store.createUser({
        username,
        password: crypto.randomBytes(32).toString("hex"),
        displayName,
        registerIp: ip,
        language: lang(req),
      });
      const token = issueToken(user.id, user.username, lang(req));
      const body: AuthResponse = { token, user };
      res.status(201).json(body);
    } catch (e) {
      console.error("[sso] login failed:", e);
      res.status(500).json({ error: "SSO login failed" });
    }
  });

  app.post("/api/auth/verification-code", async (req, res) => {
    const body = (req.body ?? {}) as { target?: string; type?: "email" | "phone"; purpose?: string; captchaToken?: string };
    const { target, type, purpose, captchaToken } = body;
    if (!target || (type !== "email" && type !== "phone")) {
      res.status(400).json({ error: t(lang(req), "server.registrationIncomplete") });
      return;
    }
    const validPurposes = new Set(["register", "bind_email", "bind_phone", "change_email", "change_phone", "reset_password"]);
    const finalPurpose: VerificationPurpose = purpose && validPurposes.has(purpose) ? (purpose as VerificationPurpose) : "register";
    const isBindOrChange = finalPurpose !== "register" && finalPurpose !== "reset_password";
    if (isBindOrChange) {
      const header = req.headers.authorization ?? "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : "";
      const payload = token ? verifyToken(token) : null;
      if (!payload?.sub) {
        res.status(401).json({ error: t(lang(req), "server.unauthorized") || "Unauthorized" });
        return;
      }
    }
    const settings = await getSystemSettings();
    // 人机验证：开启后，发送验证码前必须先通过人机验证（注册、邮箱/手机号绑定、换绑、重置密码均需要）
    const captchaEnabled = settings.captchaEnabled && settings.captchaProvider !== "none";
    if (captchaEnabled) {
      if (!captchaToken) {
        res.status(400).json({ error: t(lang(req), "server.captchaRequired") });
        return;
      }
      const captchaOk = await validateCaptcha(captchaToken);
      if (!captchaOk) {
        res.status(400).json({ error: t(lang(req), "server.captchaFailed") });
        return;
      }
    }
    if (type === "email" && finalPurpose !== "reset_password" && !settings.emailRegistrationEnabled) {
      res.status(403).json({ error: t(lang(req), "server.emailChannelClosed") });
      return;
    }
    if (type === "phone" && finalPurpose !== "reset_password" && !settings.phoneRegistrationEnabled) {
      res.status(403).json({ error: t(lang(req), "server.phoneChannelClosed") });
      return;
    }
    if (type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      res.status(400).json({ error: t(lang(req), "server.invalidEmail") });
      return;
    }
    const normalizedPhone = type === "phone" ? normalizePhoneOr400(target) : "";
    if (type === "phone" && !normalizedPhone) {
      res.status(400).json({ error: t(lang(req), "server.invalidPhone") });
      return;
    }
    // 白名单校验：注册、绑定、变更邮箱/手机号（未配置白名单时默认允许全部）
    const whitelistPurposes = new Set(["register", "bind_email", "bind_phone", "change_email", "change_phone"]);
    if (whitelistPurposes.has(finalPurpose)) {
      if (type === "email") {
        const { isEmailWhitelisted } = await import("./email.js");
        const whitelisted = await isEmailWhitelisted(target.toLowerCase().trim());
        if (!whitelisted) {
          res.status(403).json({ error: t(lang(req), "server.emailNotWhitelisted") || "Email not in whitelist" });
          return;
        }
      } else if (type === "phone") {
        const { isPhoneWhitelisted } = await import("./email.js");
        const whitelisted = await isPhoneWhitelisted(normalizedPhone);
        if (!whitelisted) {
          res.status(403).json({ error: t(lang(req), "server.phoneNotWhitelisted") || "Phone not in whitelist" });
          return;
        }
      }
    }
    // 频率限制：每 60 秒最多发送 1 次
    const ip = getClientIp(req);
    const codeRate = checkRateLimit("code", `${type}:${type === "phone" ? normalizedPhone : target}:${finalPurpose}`, 1, 60_000);
    if (!codeRate.allowed) {
      res.status(429).json({ error: t(lang(req), "server.codeRateLimited") });
      return;
    }
    const ipRate = checkRateLimit("code-ip", ip, 10, 60_000);
    if (!ipRate.allowed) {
      res.status(429).json({ error: t(lang(req), "server.codeRateLimited") });
      return;
    }
    const finalTarget = type === "phone" ? normalizedPhone : target;
    if (finalPurpose === "reset_password") {
      const user = type === "email"
        ? await store.findUserByEmail(finalTarget.toLowerCase().trim())
        : await store.findUserByPhone(finalTarget);
      if (!user) {
        res.status(404).json({ error: t(lang(req), "server.accountNotFound") || "Account not found" });
        return;
      }
    }
    const { createVerificationCode } = await import("./verification.js");
    const code = await createVerificationCode(finalTarget, finalPurpose);
    if (type === "email") {
      const { sendEmail } = await import("./email.js");
      const templateKey = finalPurpose === "register"
        ? "register_code"
        : finalPurpose === "reset_password"
          ? "reset_password_code"
          : "bind_code";
      const ok = await sendEmail(finalTarget, templateKey, { code });
      if (!ok) {
        res.status(500).json({ error: t(lang(req), "server.emailSendFailed") });
        return;
      }
    } else {
      const { sendSmsCode } = await import("./sms.js");
      const result = await sendSmsCode(finalTarget, code);
      if (!result.ok) {
        const message = result.message?.includes("not configured")
          ? t(lang(req), "server.smsNotConfigured")
          : t(lang(req), "server.smsSendFailed");
        res.status(500).json({ error: message });
        return;
      }
    }
    res.json({ ok: true, ttl: 600 });
  });

  app.post("/api/auth/register", async (req, res) => {
    const body = (req.body ?? {}) as RegisterRequest;
    const { type, username, password, displayName, email, phone, code, captchaToken, inviteCode } = body;
    const registerType = (type || "username") as "username" | "email" | "phone";
    if (!username || !password || !displayName) {
      res.status(400).json({ error: t(lang(req), "server.registrationIncomplete") });
      return;
    }
    if (registerType === "email" && !email) {
      res.status(400).json({ error: t(lang(req), "server.invalidEmail") });
      return;
    }
    if (registerType === "phone" && !phone) {
      res.status(400).json({ error: t(lang(req), "server.invalidPhone") });
      return;
    }
    const regSetting = await queryOne<{ value: string }>("SELECT value FROM system_settings WHERE `key` = 'allowRegistration'");
    if (regSetting?.value === "false") {
      res.status(403).json({ error: t(lang(req), "server.registerClosed") });
      return;
    }

    // Rate limit + IP account limit
    const rateSettings = await getSystemSettings();
    if (registerType === "username" && !rateSettings.usernameRegistrationEnabled) {
      res.status(403).json({ error: t(lang(req), "server.usernameChannelClosed") || "Username registration closed" });
      return;
    }
    if (registerType === "email" && !rateSettings.emailRegistrationEnabled) {
      res.status(403).json({ error: t(lang(req), "server.emailChannelClosed") });
      return;
    }
    if (registerType === "phone" && !rateSettings.phoneRegistrationEnabled) {
      res.status(403).json({ error: t(lang(req), "server.phoneChannelClosed") });
      return;
    }
    const ip = getClientIp(req);
    const regMax = rateSettings.rateLimitRegisterMax ?? 5;
    const regWindow = (rateSettings.rateLimitRegisterWindow ?? 3600) * 1000;
    const regRate = checkRateLimit("register", ip, regMax, regWindow);
    if (!regRate.allowed) {
      res.status(429).json({ error: t(lang(req), "server.regRateLimited") });
      return;
    }
    const maxAccountsPerIp = rateSettings.rateLimitMaxAccountsPerIp ?? 3;
    const existingCount = await queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM users WHERE register_ip = ?", [ip]);
    if (existingCount && existingCount.c >= maxAccountsPerIp) {
      res.status(429).json({ error: t(lang(req), "server.ipLimit", { count: existingCount.c }) });
      return;
    }
    const inviteSetting = await queryOne<{ value: string }>("SELECT value FROM system_settings WHERE `key` = 'requireInviteCode'");
    if (inviteSetting?.value === "true") {
      const codeSetting = await queryOne<{ value: string }>("SELECT value FROM system_settings WHERE `key` = 'inviteCode'");
      if (codeSetting?.value && inviteCode !== codeSetting.value) {
        res.status(403).json({ error: t(lang(req), "server.inviteCodeError") });
        return;
      }
    }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      res.status(400).json({ error: t(lang(req), "server.registrationIncomplete") });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: t(lang(req), "server.passwordTooShort") });
      return;
    }
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      res.status(400).json({ error: t(lang(req), "server.passwordRequirements") });
      return;
    }
    const captchaSettings = await getSystemSettings();
    const captchaEnabled = captchaSettings.captchaEnabled && captchaSettings.captchaProvider !== 'none';
    if (captchaEnabled) {
      if (!captchaToken) {
        res.status(400).json({ error: t(lang(req), "server.captchaRequired") });
        return;
      }
      const captchaOk = await validateCaptcha(captchaToken);
      if (!captchaOk) {
        res.status(400).json({ error: t(lang(req), "server.captchaFailed") });
        return;
      }
    }
    if (await store.findUserByUsername(username)) {
      res.status(409).json({ error: t(lang(req), "server.usernameTaken") });
      return;
    }
    // 邮箱/手机号注册：验证邮箱/手机号唯一性 + 验证码
    if (registerType === "email") {
      const normalizedEmail = email!.toLowerCase().trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        res.status(400).json({ error: t(lang(req), "server.invalidEmail") });
        return;
      }
      const { isEmailWhitelisted } = await import("./email.js");
      if (!await isEmailWhitelisted(normalizedEmail)) {
        res.status(403).json({ error: t(lang(req), "server.emailNotWhitelisted") || "Email not in whitelist" });
        return;
      }
      if (await store.findUserByEmail(normalizedEmail)) {
        res.status(409).json({ error: t(lang(req), "server.emailRegistered") });
        return;
      }
      if (!code) {
        res.status(400).json({ error: t(lang(req), "server.emailCodeError") });
        return;
      }
      const { verifyCode } = await import("./verification.js");
      const codeOk = await verifyCode(normalizedEmail, "register", code);
      if (!codeOk) {
        res.status(400).json({ error: t(lang(req), "server.emailCodeError") });
        return;
      }
    } else if (registerType === "phone") {
      const normalized = normalizePhoneOr400(phone!);
      if (!normalized) {
        res.status(400).json({ error: t(lang(req), "server.invalidPhone") });
        return;
      }
      const { isPhoneWhitelisted } = await import("./email.js");
      if (!await isPhoneWhitelisted(normalized)) {
        res.status(403).json({ error: t(lang(req), "server.phoneNotWhitelisted") || "Phone not in whitelist" });
        return;
      }
      if (await store.findUserByPhone(normalized)) {
        res.status(409).json({ error: t(lang(req), "server.phoneRegistered") });
        return;
      }
      if (!code) {
        res.status(400).json({ error: t(lang(req), "server.phoneCodeError") });
        return;
      }
      const { verifyCode } = await import("./verification.js");
      const codeOk = await verifyCode(normalized, "register", code);
      if (!codeOk) {
        res.status(400).json({ error: t(lang(req), "server.phoneCodeError") });
        return;
      }
    }
    console.log(`[auth] register user=${username} type=${registerType} ip=${ip}`);
    const regLang = lang(req);
    const normalizedFinalPhone = registerType === "phone" ? normalizePhoneOr400(phone!) : undefined;
    const user = await store.createUser({
      username,
      password,
      displayName,
      registerIp: ip,
      language: regLang,
      email: registerType === "email" ? email : undefined,
      phone: normalizedFinalPhone,
    });
    const token = issueToken(user.id, user.username, regLang);
    const authBody: AuthResponse = { token, user };
    res.status(201).json(authBody);
  });

  /** 通过邮箱/手机号验证码重置密码（无需登录）。 */
  app.post("/api/auth/reset-password", async (req, res) => {
    const body = (req.body ?? {}) as {
      target?: string;
      type?: "email" | "phone";
      code?: string;
      newPassword?: string;
      captchaToken?: string;
    };
    const { target, type, code, newPassword, captchaToken } = body;
    if (!target || (type !== "email" && type !== "phone") || !code || !newPassword) {
      res.status(400).json({ error: t(lang(req), "server.registrationIncomplete") });
      return;
    }
    const settings = await getSystemSettings();
    const captchaEnabled = settings.captchaEnabled && settings.captchaProvider !== "none";
    if (captchaEnabled) {
      if (!captchaToken) {
        res.status(400).json({ error: t(lang(req), "server.captchaRequired") });
        return;
      }
      const captchaOk = await validateCaptcha(captchaToken);
      if (!captchaOk) {
        res.status(400).json({ error: t(lang(req), "server.captchaFailed") });
        return;
      }
    }
    const normalizedPhone = type === "phone" ? normalizePhoneOr400(target) : "";
    if (type === "phone" && !normalizedPhone) {
      res.status(400).json({ error: t(lang(req), "server.invalidPhone") });
      return;
    }
    const finalTarget = type === "phone" ? normalizedPhone : target.toLowerCase().trim();
    const user = type === "email"
      ? await store.findUserByEmail(finalTarget)
      : await store.findUserByPhone(finalTarget);
    if (!user) {
      res.status(404).json({ error: t(lang(req), "server.accountNotFound") || "Account not found" });
      return;
    }
    const { verifyCode } = await import("./verification.js");
    const codeOk = await verifyCode(finalTarget, "reset_password", code.trim());
    if (!codeOk) {
      res.status(400).json({ error: t(lang(req), "server.codeInvalid") || "Invalid code" });
      return;
    }
    const result = await store.resetPasswordByTarget(user.id, newPassword);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  });

  app.get("/api/me", requireAuth, async (req: AuthedRequest, res) => {
    const user = await store.findUserById(req.userId!);
    if (!user) {
      res.status(404).json({ error: t(req.userLanguage || "zh-CN", "server.userNotFound") });
      return;
    }
    res.json(await store.publicUser(user));
  });

  app.patch("/api/me", requireAuth, async (req: AuthedRequest, res) => {
    const body = (req.body ?? {}) as UpdateProfileRequest;
    const updated = await store.updateProfile(req.userId!, body);
    if (!updated) {
      res.status(404).json({ error: t(req.userLanguage || "zh-CN", "server.userNotFound") });
      return;
    }
    res.json(updated);
    hub()?.broadcastUserUpdate(updated);
  });

  app.post("/api/me/password", requireAuth, async (req: AuthedRequest, res) => {
    const body = (req.body ?? {}) as ChangePasswordRequest;
    if (!body.currentPassword || !body.newPassword) {
      res.status(400).json({ error: t(req.userLanguage || "zh-CN", "server.enterCurrentNewPassword") });
      return;
    }
    const captchaPwdSettings = await getSystemSettings();
    const captchaPwdEnabled = captchaPwdSettings.captchaEnabled && captchaPwdSettings.captchaProvider !== 'none';
    if (captchaPwdEnabled) {
      if (!body.captchaToken) {
        res.status(400).json({ error: t(req.userLanguage || "zh-CN", "server.captchaRequired") });
        return;
      }
      const captchaOk = await validateCaptcha(body.captchaToken);
      if (!captchaOk) {
        res.status(400).json({ error: t(req.userLanguage || "zh-CN", "server.captchaFailed") });
        return;
      }
    }
    const result = await store.changePassword(req.userId!, body.currentPassword, body.newPassword);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  });

  // ── 邮箱/手机号绑定与换绑 ──

  /** 检查当前用户密码是否匹配（用于换绑/解绑敏感操作） */
  async function verifyPasswordOrReject(userId: string, password: string, _lang: string): Promise<boolean> {
    if (!password) return false;
    const u = await store.getUserById(userId);
    if (!u) return false;
    return store.verifyPassword(u, password);
  }

  app.post("/api/me/email/bind", requireAuth, async (req: AuthedRequest, res) => {
    const { email, code } = (req.body ?? {}) as { email?: string; code?: string };
    if (!email || !code) {
      res.status(400).json({ error: t(req.userLanguage || "zh-CN", "server.registrationIncomplete") });
      return;
    }
    const userLang = req.userLanguage || "zh-CN";
    const settings = await getSystemSettings();
    if (!settings.emailRegistrationEnabled) {
      res.status(403).json({ error: t(userLang, "server.emailChannelClosed") });
      return;
    }
    const normalizedEmail = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      res.status(400).json({ error: t(userLang, "server.invalidEmail") });
      return;
    }
    const { isEmailWhitelisted } = await import("./email.js");
    if (!await isEmailWhitelisted(normalizedEmail)) {
      res.status(403).json({ error: t(userLang, "server.emailNotWhitelisted") });
      return;
    }
    const { verifyCode } = await import("./verification.js");
    const ok = await verifyCode(normalizedEmail, "bind_email", code.trim());
    if (!ok) {
      res.status(400).json({ error: t(userLang, "server.emailCodeError") });
      return;
    }
    if (await store.findUserByEmail(normalizedEmail)) {
      res.status(409).json({ error: t(userLang, "server.emailAlreadyUsed") });
      return;
    }
    const updated = await store.updateContact(req.userId!, { email: normalizedEmail });
    if (!updated) {
      res.status(404).json({ error: t(userLang, "server.userNotFound") });
      return;
    }
    hub()?.broadcastUserUpdate(updated);
    res.json({ ok: true, user: updated });
  });

  app.post("/api/me/email/change", requireAuth, async (req: AuthedRequest, res) => {
    const { newEmail, code, password } = (req.body ?? {}) as { newEmail?: string; code?: string; password?: string };
    if (!newEmail || !code || !password) {
      res.status(400).json({ error: t(req.userLanguage || "zh-CN", "server.registrationIncomplete") });
      return;
    }
    const userLang = req.userLanguage || "zh-CN";
    if (!await verifyPasswordOrReject(req.userId!, password, userLang)) {
      res.status(403).json({ error: t(userLang, "server.passwordIncorrect") });
      return;
    }
    const settings = await getSystemSettings();
    if (!settings.emailRegistrationEnabled) {
      res.status(403).json({ error: t(userLang, "server.emailChannelClosed") });
      return;
    }
    const normalizedNewEmail = newEmail.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedNewEmail)) {
      res.status(400).json({ error: t(userLang, "server.invalidEmail") });
      return;
    }
    const { isEmailWhitelisted } = await import("./email.js");
    if (!await isEmailWhitelisted(normalizedNewEmail)) {
      res.status(403).json({ error: t(userLang, "server.emailNotWhitelisted") });
      return;
    }
    const { verifyCode } = await import("./verification.js");
    const ok = await verifyCode(normalizedNewEmail, "change_email", code.trim());
    if (!ok) {
      res.status(400).json({ error: t(userLang, "server.emailCodeError") });
      return;
    }
    if (await store.findUserByEmail(normalizedNewEmail)) {
      res.status(409).json({ error: t(userLang, "server.emailAlreadyUsed") });
      return;
    }
    const updated = await store.updateContact(req.userId!, { email: normalizedNewEmail });
    if (!updated) {
      res.status(404).json({ error: t(userLang, "server.userNotFound") });
      return;
    }
    hub()?.broadcastUserUpdate(updated);
    res.json({ ok: true, user: updated });
  });

  app.delete("/api/me/email", requireAuth, async (req: AuthedRequest, res) => {
    const { password } = (req.body ?? {}) as { password?: string };
    const userLang = req.userLanguage || "zh-CN";
    if (!await verifyPasswordOrReject(req.userId!, password || "", userLang)) {
      res.status(403).json({ error: t(userLang, "server.passwordIncorrect") });
      return;
    }
    const updated = await store.updateContact(req.userId!, { email: null });
    if (!updated) {
      res.status(404).json({ error: t(userLang, "server.userNotFound") });
      return;
    }
    hub()?.broadcastUserUpdate(updated);
    res.json({ ok: true, user: updated });
  });

  app.post("/api/me/phone/bind", requireAuth, async (req: AuthedRequest, res) => {
    const { phone, code } = (req.body ?? {}) as { phone?: string; code?: string };
    if (!phone || !code) {
      res.status(400).json({ error: t(req.userLanguage || "zh-CN", "server.registrationIncomplete") });
      return;
    }
    const userLang = req.userLanguage || "zh-CN";
    const settings = await getSystemSettings();
    if (!settings.phoneRegistrationEnabled) {
      res.status(403).json({ error: t(userLang, "server.phoneChannelClosed") });
      return;
    }
    const normalized = normalizePhoneOr400(phone);
    if (!normalized) {
      res.status(400).json({ error: t(userLang, "server.invalidPhone") });
      return;
    }
    const { isPhoneWhitelisted } = await import("./email.js");
    if (!await isPhoneWhitelisted(normalized)) {
      res.status(403).json({ error: t(userLang, "server.phoneNotWhitelisted") });
      return;
    }
    const { verifyCode } = await import("./verification.js");
    const ok = await verifyCode(normalized, "bind_phone", code.trim());
    if (!ok) {
      res.status(400).json({ error: t(userLang, "server.phoneCodeError") });
      return;
    }
    if (await store.findUserByPhone(normalized)) {
      res.status(409).json({ error: t(userLang, "server.phoneAlreadyUsed") });
      return;
    }
    const updated = await store.updateContact(req.userId!, { phone: normalized });
    if (!updated) {
      res.status(404).json({ error: t(userLang, "server.userNotFound") });
      return;
    }
    hub()?.broadcastUserUpdate(updated);
    res.json({ ok: true, user: updated });
  });

  app.post("/api/me/phone/change", requireAuth, async (req: AuthedRequest, res) => {
    const { newPhone, code, password } = (req.body ?? {}) as { newPhone?: string; code?: string; password?: string };
    if (!newPhone || !code || !password) {
      res.status(400).json({ error: t(req.userLanguage || "zh-CN", "server.registrationIncomplete") });
      return;
    }
    const userLang = req.userLanguage || "zh-CN";
    if (!await verifyPasswordOrReject(req.userId!, password, userLang)) {
      res.status(403).json({ error: t(userLang, "server.passwordIncorrect") });
      return;
    }
    const settings = await getSystemSettings();
    if (!settings.phoneRegistrationEnabled) {
      res.status(403).json({ error: t(userLang, "server.phoneChannelClosed") });
      return;
    }
    const normalized = normalizePhoneOr400(newPhone);
    if (!normalized) {
      res.status(400).json({ error: t(userLang, "server.invalidPhone") });
      return;
    }
    const { isPhoneWhitelisted } = await import("./email.js");
    if (!await isPhoneWhitelisted(normalized)) {
      res.status(403).json({ error: t(userLang, "server.phoneNotWhitelisted") });
      return;
    }
    const { verifyCode } = await import("./verification.js");
    const ok = await verifyCode(normalized, "change_phone", code.trim());
    if (!ok) {
      res.status(400).json({ error: t(userLang, "server.phoneCodeError") });
      return;
    }
    if (await store.findUserByPhone(normalized)) {
      res.status(409).json({ error: t(userLang, "server.phoneAlreadyUsed") });
      return;
    }
    const updated = await store.updateContact(req.userId!, { phone: normalized });
    if (!updated) {
      res.status(404).json({ error: t(userLang, "server.userNotFound") });
      return;
    }
    hub()?.broadcastUserUpdate(updated);
    res.json({ ok: true, user: updated });
  });

  app.delete("/api/me/phone", requireAuth, async (req: AuthedRequest, res) => {
    const { password } = (req.body ?? {}) as { password?: string };
    const userLang = req.userLanguage || "zh-CN";
    if (!await verifyPasswordOrReject(req.userId!, password || "", userLang)) {
      res.status(403).json({ error: t(userLang, "server.passwordIncorrect") });
      return;
    }
    const updated = await store.updateContact(req.userId!, { phone: null });
    if (!updated) {
      res.status(404).json({ error: t(userLang, "server.userNotFound") });
      return;
    }
    hub()?.broadcastUserUpdate(updated);
    res.json({ ok: true, user: updated });
  });

  app.post("/api/me/second-password", requireAuth, async (req: AuthedRequest, res) => {
    const { password, hint, captchaToken } = req.body ?? {};
    if (!password) {
      res.status(400).json({ error: t(req.userLanguage || "zh-CN", "server.enterSecondPassword") });
      return;
    }
    if (!hint) {
      res.status(400).json({ error: t(req.userLanguage || "zh-CN", "server.enterHint") });
      return;
    }
    if (password.length < 4) {
      res.status(400).json({ error: t(req.userLanguage || "zh-CN", "server.secondPasswordTooShort") });
      return;
    }
    if (captchaToken) {
      const captchaOk = await validateCaptcha(captchaToken);
      if (!captchaOk) {
        res.status(400).json({ error: t(req.userLanguage || "zh-CN", "server.captchaFailed") });
        return;
      }
    }
    const result = await store.setSecondPassword(req.userId!, password, hint);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  });

  app.delete("/api/me/second-password", requireAuth, async (req: AuthedRequest, res) => {
    const { captchaToken } = req.body ?? {};
    if (captchaToken) {
      const captchaOk = await validateCaptcha(captchaToken);
      if (!captchaOk) {
        res.status(400).json({ error: t(req.userLanguage || "zh-CN", "server.captchaFailed") });
        return;
      }
    }
    await store.removeSecondPassword(req.userId!);
    res.json({ ok: true });
  });

  app.get("/api/me/second-password", requireAuth, async (req: AuthedRequest, res) => {
    const has = await store.hasSecondPassword(req.userId!);
    const hint = has ? await store.getSecondPasswordHint(req.userId!) : null;
    res.json({ has, hint });
  });

  app.post("/api/auth/verify-second-password", async (req, res) => {
    const { token, password } = req.body ?? {};
    if (!token || !password) {
      res.status(400).json({ error: t(lang(req), "server.enterPassword") });
      return;
    }
    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: t(lang(req), "server.loginRequired") });
      return;
    }
    const user = await store.findUserById(payload.sub);
    if (!user) {
      res.status(404).json({ error: t(lang(req), "server.userNotFound") });
      return;
    }
    const ok = await store.verifySecondPassword(user.id, password);
    if (!ok) {
      res.status(401).json({ error: t(lang(req), "server.authFailed") });
      return;
    }
    const userData = await store.publicUser(user);
    res.json({ user: userData });
  });

  // Delete account
  app.delete("/api/me", requireAuth, async (req: AuthedRequest, res) => {
    const body = (req.body ?? {}) as DeleteAccountRequest;
    if (!body.password) {
      res.status(400).json({ error: t(req.userLanguage || "zh-CN", "server.enterPassword") });
      return;
    }
    const captchaDelSettings = await getSystemSettings();
    const captchaDelEnabled = captchaDelSettings.captchaEnabled && captchaDelSettings.captchaProvider !== 'none';
    if (captchaDelEnabled) {
      if (!body.captchaToken) {
        res.status(400).json({ error: t(req.userLanguage || "zh-CN", "server.captchaRequired") });
        return;
      }
      const captchaOk = await validateCaptcha(body.captchaToken);
      if (!captchaOk) {
        res.status(400).json({ error: t(req.userLanguage || "zh-CN", "server.captchaFailed") });
        return;
      }
    }
    const result = await store.deleteAccount(req.userId!, body.password);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    console.log(`[auth] account deleted user=${req.userId}`);
    res.json({ ok: true });
  });

  // Users
  app.get("/api/users/search", requireAuth, async (req: AuthedRequest, res) => {
    const q = (req.query.q as string ?? "").trim().toLowerCase();
    if (!q) { res.json([]); return; }
    const meId = req.userId!;
    const results = await store.searchUsers(q, meId);
    res.json(results);
  });

  // Bootstrap
  app.get("/api/bootstrap", requireAuth, async (req: AuthedRequest, res) => {
    const me = await store.findUserById(req.userId!);
    if (!me) {
      res.status(404).json({ error: t(req.userLanguage || "zh-CN", "server.userNotFound") });
      return;
    }
    const convs = await store.conversationsForUser(me.id);
    const convMembers = new Set<string>();
    for (const c of convs) {
      for (const m of c.memberIds) convMembers.add(m);
    }
    const friendships = await store.friendshipsFor(me.id);
    const friendIds = new Set(friendships.filter((f) => f.status === "accepted").map((f) => f.userId));
    const incomingReqs = await store.incomingFriendRequests(me.id);
    const requesterIds = new Set(incomingReqs.map((r) => r.fromUserId));
    const allowedIds = new Set([me.id, AI_USER_ID, ...convMembers, ...friendIds, ...requesterIds]);
    const allUsers = await store.allUsers();
    const filteredUsers = allUsers.filter((u) => allowedIds.has(u.id));
    const data: BootstrapData = {
      me: await store.publicUser(me),
      users: filteredUsers,
      conversations: convs,
      friends: friendships,
      friendRequests: incomingReqs,
      readMarkers: await store.readMarkersForUser(me.id),
      channelReadStates: await store.channelReadStatesForUser(me.id),
      lastMessages: await store.lastMessagesForUser(me.id),
      notifications: await getNotificationsForUser(me.id),
    };
    res.json(data);
  });

  // Get a single conversation
  app.get("/api/conversations/:id", requireAuth, async (req: AuthedRequest, res) => {
    const { id } = req.params;
    const conv = await store.findConversation(id);
    if (!conv) {
      res.status(404).json({ error: t(req.userLanguage || "zh-CN", "server.conversationNotFound") });
      return;
    }
    if (!conv.memberIds.includes(req.userId!)) {
      res.status(403).json({ error: t(req.userLanguage || "zh-CN", "server.noPermission") });
      return;
    }
    res.json(conv);
  });

  // Ban status for a conversation
  app.get("/api/conversations/:id/ban-status", requireAuth, async (req: AuthedRequest, res) => {
    const { id } = req.params;
    if (!(await store.isMember(id, req.userId!))) {
      res.status(403).json({ error: t(req.userLanguage || "zh-CN", "server.noPermission") });
      return;
    }
    const conv = await store.findConversation(id);
    if (!conv) {
      res.status(404).json({ error: t(req.userLanguage || "zh-CN", "server.conversationNotFound") });
      return;
    }
    if (conv.kind === "dm") {
      const otherId = conv.memberIds.find((mId) => mId !== req.userId!);
      if (otherId) {
        const banStatus = await isUserBanned(otherId);
        if (banStatus.banned) {
          res.json({ banned: true, reason: banStatus.reason, type: "user" });
          return;
        }
      }
      res.json({ banned: false, type: "user" });
    } else {
      const banStatus = await store.isChannelBanned(id);
      if (banStatus.banned) {
        res.json({ banned: true, reason: banStatus.reason, type: "channel" });
        return;
      }
      res.json({ banned: false, type: "channel" });
    }
  });

  // Conversations & messages
  app.get("/api/conversations", requireAuth, async (req: AuthedRequest, res) => {
    res.json(await store.conversationsForUser(req.userId!));
  });

  app.get("/api/conversations/:id/messages", requireAuth, async (req: AuthedRequest, res) => {
    const { id } = req.params;
    if (!(await store.isMember(id, req.userId!))) {
      res.status(403).json({ error: t(req.userLanguage || "zh-CN", "server.noPermission") });
      return;
    }
    const { before, page, pageSize, cursor, since } = req.query as Record<string, string | undefined>;

    // ETag-based cache: use conversation lastMessageAt as the cache key
    if (!since && !before && !cursor && !page && !pageSize) {
      const conv = await store.findConversation(id);
      const etag = `"${conv?.lastMessageAt ?? "empty"}"`;
      if (req.headers["if-none-match"] === etag) {
        res.status(304).end();
        return;
      }
      const result = await store.messagesFor(id, 200);
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
      res.json(result);
      return;
    }

    if (since) {
      const items = await store.messagesSince(id, since);
      res.json({ items, hasMore: false, total: items.length, pageSize: items.length });
      return;
    }
    if (before || cursor || page || pageSize) {
      const beforeIso = before ?? cursor ?? undefined;
      const ps = pageSize ? Math.max(1, parseInt(pageSize, 10) || 50) : 50;
      const pg = page ? Math.max(1, parseInt(page, 10) || 1) : undefined;
      const offset = pg ? (pg - 1) * ps : undefined;
      const result = await store.pagedMessages(id, { before: beforeIso, pageSize: ps, offset });
      res.json(result);
      return;
    }
    res.json(await store.messagesFor(id, 200));
  });

  app.delete("/api/conversations/:id/messages", requireAuth, async (req: AuthedRequest, res) => {
    const { id } = req.params;
    if (!(await store.isMember(id, req.userId!))) {
      res.status(403).json({ error: t(req.userLanguage || "zh-CN", "server.noPermission") });
      return;
    }
    if (await assertChannelNotBanned(id, req, res)) return;
    await store.clearHistory(id);
    res.json({ ok: true });
    hub()?.broadcastHistoryCleared(id);
  });

  // Pin / unpin messages
  app.post("/api/conversations/:id/pin", requireAuth, async (req: AuthedRequest, res) => {
    const { id } = req.params;
    if (!(await store.isMember(id, req.userId!))) {
      res.status(403).json({ error: t(req.userLanguage || "zh-CN", "server.noPermission") });
      return;
    }
    const { messageId } = req.body as { messageId: string };
    if (!messageId) {
      res.status(400).json({ error: t(req.userLanguage || "zh-CN", "server.invalidRequest") });
      return;
    }
    await store.pinMessage(id, messageId, req.userId!);
    const conv = await store.findConversation(id);
    if (conv) {
      conv.pinned = await store.getPinnedMessages(id);
      hub()?.broadcastConversationUpdate(conv);
    }
    res.json({ ok: true });
  });

  app.delete("/api/conversations/:id/pin/:messageId", requireAuth, async (req: AuthedRequest, res) => {
    const { id, messageId } = req.params;
    if (!(await store.isMember(id, req.userId!))) {
      res.status(403).json({ error: t(req.userLanguage || "zh-CN", "server.noPermission") });
      return;
    }
    await store.unpinMessage(id, messageId);
    const conv = await store.findConversation(id);
    if (conv) {
      conv.pinned = await store.getPinnedMessages(id);
      hub()?.broadcastConversationUpdate(conv);
    }
    res.json({ ok: true });
  });

  app.get("/api/conversations/:id/pins", requireAuth, async (req: AuthedRequest, res) => {
    const { id } = req.params;
    if (!(await store.isMember(id, req.userId!))) {
      res.status(403).json({ error: t(req.userLanguage || "zh-CN", "server.noPermission") });
      return;
    }
    const pinned = await store.getPinnedMessages(id);
    const messageIds = pinned.map((p) => p.messageId);
    if (messageIds.length === 0) {
      res.json({ items: [] });
      return;
    }
    const items = await store.hydrateMessages(
      await query("SELECT * FROM messages WHERE id IN (?)", [messageIds])
    );
    // Attach pin metadata
    const pinMap = new Map(pinned.map((p) => [p.messageId, p]));
    res.json({ items: items.map((m) => ({ ...m, pinnedBy: pinMap.get(m.id)?.pinnedBy, pinnedAt: pinMap.get(m.id)?.pinnedAt })) });
  });

  // Message search
  app.get("/api/conversations/:id/messages/search", requireAuth, async (req: AuthedRequest, res) => {
    const { id } = req.params;
    if (!(await store.isMember(id, req.userId!))) {
      res.status(403).json({ error: t(req.userLanguage || "zh-CN", "server.noPermission") });
      return;
    }
    const { q, kind, page: pageStr, limit: limitStr } = req.query as Record<string, string | undefined>;
    const page = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(limitStr ?? "20", 10) || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = ["m.conversation_id = ?", "m.deleted_at IS NULL"];
    const params: any[] = [id];

    if (q && q.trim()) {
      conditions.push("m.text LIKE ?");
      params.push(`%${q.trim()}%`);
    }

    if (kind === "video") {
      conditions.push("EXISTS (SELECT 1 FROM attachments a WHERE a.message_id = m.id AND a.mime_type LIKE 'video/%')");
    } else if (kind === "audio") {
      conditions.push("EXISTS (SELECT 1 FROM attachments a WHERE a.message_id = m.id AND a.mime_type LIKE 'audio/%')");
    } else if (kind && kind !== "text") {
      conditions.push("m.kind = ?");
      params.push(kind);
    } else if (kind === "text") {
      conditions.push("m.kind = 'text'");
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countRow = await queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM messages m ${whereClause}`,
      params
    );
    const total = countRow?.c ?? 0;

    const rows = await query<any>(
       `SELECT m.id, m.conversation_id, m.author_id, m.kind, m.text, m.card_id, m.reply_to_id, m.edited_at, m.created_at, m.deleted_at,
              u.display_name AS author_name, u.avatar_url AS author_avatar_url, u.avatar_color AS author_avatar_color, u.username AS author_username
       FROM messages m
       LEFT JOIN users u ON u.id = m.author_id
       ${whereClause}
       ORDER BY m.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const msgIds = rows.map((r: any) => r.id);
    let attachmentsByMsg: Map<string, any[]> = new Map();
    if (msgIds.length > 0) {
      const placeholders = msgIds.map(() => "?").join(",");
      const atts = await query<any>(
        `SELECT * FROM attachments WHERE message_id IN (${placeholders})`,
        msgIds
      );
      for (const a of atts) {
        const list = attachmentsByMsg.get(a.message_id) ?? [];
        list.push({
          id: a.id,
          name: a.name,
          url: a.url,
          mimeType: a.mime_type,
          size: a.size,
          width: a.width ?? undefined,
          height: a.height ?? undefined,
          poster: a.poster ?? undefined,
        });
        attachmentsByMsg.set(a.message_id, list);
      }
    }

    // Batch fetch replyTo messages
    const replyToIds = rows.map((r: any) => r.reply_to_id).filter(Boolean);
    const replyToMap = new Map<string, any>();
    if (replyToIds.length > 0) {
      const replyPlaceholders = replyToIds.map(() => "?").join(",");
      const replyRows = await query<any>(
        `SELECT m.id, m.text, m.author_id, u.display_name, m.kind, m.card_id
         FROM messages m
         LEFT JOIN users u ON u.id = m.author_id
         WHERE m.id IN (${replyPlaceholders})`,
        replyToIds
      );
      for (const rr of replyRows) {
        replyToMap.set(rr.id, rr);
      }
      const replyAtts = await query<any>(
        `SELECT * FROM attachments WHERE message_id IN (${replyPlaceholders})`,
        replyToIds
      );
      for (const a of replyAtts) {
        const entry = replyToMap.get(a.message_id);
        if (entry) {
          if (!entry._atts) entry._atts = [];
          entry._atts.push({
            id: a.id,
            name: a.name,
            url: a.url,
            mimeType: a.mime_type,
            size: a.size,
            width: a.width ?? undefined,
            height: a.height ?? undefined,
            poster: a.poster ?? undefined,
          });
        }
      }
    }

    const items = rows.map((r: any) => {
      const item: any = {
        id: r.id,
        conversationId: r.conversation_id,
        authorId: r.author_id,
        kind: r.kind,
        text: r.text,
        cardId: r.card_id ?? undefined,
        replyToId: r.reply_to_id ?? undefined,
        editedAt: r.edited_at ?? undefined,
        createdAt: r.created_at,
        deleted: !!r.deleted_at,
        attachments: attachmentsByMsg.get(r.id) ?? [],
        reactions: [],
        authorName: r.author_name ?? "未知",
        authorAvatarUrl: r.author_avatar_url ?? undefined,
      };
      const replyRow = r.reply_to_id ? replyToMap.get(r.reply_to_id) : undefined;
      if (replyRow) {
        item.replyTo = {
          id: replyRow.id,
          text: replyRow.text,
          authorId: replyRow.author_id,
          authorName: replyRow.display_name || "未知",
          attachments: replyRow._atts ?? [],
          kind: replyRow.kind,
          cardId: replyRow.card_id ?? undefined,
        };
      }
      return item;
    });

    res.json({ items, total });
  });

  app.get("/api/conversations/:id/poll-results", requireAuth, async (req: AuthedRequest, res) => {
    const { id } = req.params;
    if (!(await store.isMember(id, req.userId!))) {
      res.status(403).json({ error: t(req.userLanguage || "zh-CN", "server.noPermission") });
      return;
    }
    const messages = await store.messagesFor(id, 500);
    const pollMessages = messages.filter((m) => m.kind === "poll");
    const results: Record<string, { results: import("@navo/shared").PollResult[]; totalVotes: number }> = {};
    for (const msg of pollMessages) {
      try {
        const pollData = JSON.parse(msg.text);
        results[msg.id] = await store.getPollResults(msg.id, pollData);
      } catch { /* skip malformed */ }
    }
    res.json(results);
  });

  app.get("/api/forwarded/:id", requireAuth, async (req: AuthedRequest, res) => {
    const { id } = req.params;
    const data = await store.getForwardedMessages(id);
    if (!data) {
      res.status(404).json({ error: t(req.userLanguage || "zh-CN", "server.conversationNotFound") });
      return;
    }
    res.json(data);
  });

  // Public channels discovery
  app.get("/api/channels/public", requireAuth, async (req: AuthedRequest, res) => {
    const { search } = req.query as Record<string, string | undefined>;
    const channels = await store.getPublicChannels(search, req.userId!);
    res.json(channels);
  });

  app.post("/api/channels", requireAuth, async (req: AuthedRequest, res) => {
    const body = (req.body ?? {}) as CreateChannelRequest;
    if (!body.name || !body.name.trim()) {
      res.status(400).json({ error: t(req.userLanguage || "zh-CN", "server.channelNameRequired") });
      return;
    }
    const conv = await store.createChannel({
      name: body.name.trim(),
      topic: body.topic,
      isPrivate: body.isPrivate,
      icon: body.icon,
      ownerId: req.userId!,
      memberIds: body.memberIds ?? [],
    });
    res.status(201).json(conv);
    for (const uid of conv.memberIds) hub()?.notifyConversationNew(uid, conv);
  });

  app.patch("/api/channels/:id", requireAuth, async (req: AuthedRequest, res) => {
    const { id } = req.params;
    if (!(await store.isChannelAdmin(id, req.userId!))) {
      res.status(403).json({ error: t(req.userLanguage || "zh-CN", "server.needAdminPermission") });
      return;
    }
    if (await assertChannelNotBanned(id, req, res)) return;
    const conv = await store.updateChannel(id, (req.body ?? {}) as UpdateChannelRequest);
    if (!conv) {
      res.status(404).json({ error: t(req.userLanguage || "zh-CN", "server.channelNotFound") });
      return;
    }
    res.json(conv);
    hub()?.broadcastConversationUpdate(conv);
  });

  app.post("/api/dms", requireAuth, async (req: AuthedRequest, res) => {
    const body = (req.body ?? {}) as CreateDMRequest;
    if (!body.userId || body.userId === req.userId) {
      res.status(400).json({ error: t(req.userLanguage || "zh-CN", "server.cannotCreateDMSelf") });
      return;
    }
    const other = await store.findUserById(body.userId);
    if (!other) {
      res.status(404).json({ error: t(req.userLanguage || "zh-CN", "server.targetUserNotFound") });
      return;
    }
    const conv = await store.findOrCreateDM(req.userId!, other.id);
    res.status(201).json(conv);
    hub()?.notifyConversationNew(other.id, conv);
  });

  // Channel membership & admin
  app.post("/api/channels/:id/members", requireAuth, async (req: AuthedRequest, res) => {
    const { id } = req.params;
    const { userId } = (req.body ?? {}) as ChannelMemberActionBody;
    if (await assertChannelNotBanned(id, req, res)) return;
    if (userId !== req.userId && !(await store.areFriends(req.userId!, userId))) {
      res.status(403).json({ error: t(req.userLanguage || "zh-CN", "server.onlyInviteFriends") });
      return;
    }
    const conv = await store.addMember(id, userId, req.userId!);
    if (!conv) {
      res.status(403).json({ error: t(req.userLanguage || "zh-CN", "server.membersCannotInvite") });
      return;
    }
    res.json(conv);
    hub()?.broadcastConversationUpdate(conv);
    hub()?.notifyConversationNew(userId, conv);
    // Broadcast new member's user data so existing members can render them in the panel
    const newMember = await store.getUserById(userId);
    if (newMember) {
      const { password_hash, ...safe } = newMember;
      hub()?.fanout(conv.memberIds, { type: "user:update", user: safe as any });
    }
  });

  app.delete("/api/channels/:id/members/:userId", requireAuth, async (req: AuthedRequest, res) => {
    const { id, userId } = req.params;
    if (await assertChannelNotBanned(id, req, res)) return;
    const result = await store.removeMember(id, req.userId!, userId);
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result.conversation);
    hub()?.broadcastConversationUpdate(result.conversation!);
    hub()?.notifyConversationRemove(userId, id);
  });

  app.post("/api/channels/:id/role", requireAuth, async (req: AuthedRequest, res) => {
    const { id } = req.params;
    if (await assertChannelNotBanned(id, req, res)) return;
    const { userId, role } = (req.body ?? {}) as SetRoleBody;
    const result = await store.setRole(id, req.userId!, userId, role);
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result.conversation);
    hub()?.broadcastConversationUpdate(result.conversation!);
  });

  app.post("/api/channels/:id/mute", requireAuth, async (req: AuthedRequest, res) => {
    const { id } = req.params;
    if (await assertChannelNotBanned(id, req, res)) return;
    const { userId, muted } = (req.body ?? {}) as SetMutedBody;
    const result = await store.setMemberMuted(id, req.userId!, userId, muted);
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result.conversation);
    hub()?.broadcastConversationUpdate(result.conversation!);
  });

  app.post("/api/channels/:id/ban", requireAuth, async (req: AuthedRequest, res) => {
    const { id } = req.params;
    if (await assertChannelNotBanned(id, req, res)) return;
    const { userId, banned } = (req.body ?? {}) as SetBannedBody;
    const result = await store.setMemberBanned(id, req.userId!, userId, banned);
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result.conversation);
    hub()?.broadcastConversationUpdate(result.conversation!);
    if (banned) hub()?.notifyConversationRemove(userId, id);
  });

  app.post("/api/channels/:id/leave", requireAuth, async (req: AuthedRequest, res) => {
    const { id } = req.params;
    if (await assertChannelNotBanned(id, req, res)) return;
    const result = await store.leaveChannel(id, req.userId!);
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
    if (result.conversation) hub()?.broadcastConversationUpdate(result.conversation);
    hub()?.notifyConversationRemove(req.userId!, id);
  });

  app.delete("/api/channels/:id", requireAuth, async (req: AuthedRequest, res) => {
    const { id } = req.params;
    if (await assertChannelNotBanned(id, req, res)) return;
    const result = await store.disbandChannel(id, req.userId!);
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
    for (const uid of result.memberIds ?? []) {
      hub()?.notifyConversationRemove(uid, id);
    }
  });

  // Friends
  app.post("/api/friends/request", requireAuth, async (req: AuthedRequest, res) => {
    const { username, message } = (req.body ?? {}) as SendFriendRequestBody;
    const target = await store.findUserByUsername(username ?? "");
    if (!target) {
      res.status(404).json({ error: t(req.userLanguage || "zh-CN", "server.userNotFound") });
      return;
    }
    const result = await store.sendFriendRequest(req.userId!, target.id, message ?? "");
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(201).json(result.body);
    const me = await store.findUserById(req.userId!);
    if (result.request && me) {
      hub()?.notifyFriendRequest(target.id, result.request, await store.publicUser(me));
    }
    if (result.autoAccepted) {
      hub()?.notifyFriendUpdate(target.id, req.userId!);
      hub()?.notifyFriendUpdate(req.userId!, target.id);
    }
  });

  app.post("/api/friends/requests/:id/accept", requireAuth, async (req: AuthedRequest, res) => {
    const { id } = req.params;
    const result = await store.acceptFriendRequest(req.userId!, id);
    if (result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
    if (result.otherUserId) {
      hub()?.notifyFriendUpdate(result.otherUserId, req.userId!);
      hub()?.notifyFriendUpdate(req.userId!, result.otherUserId);
    }
  });

  app.post("/api/friends/requests/:id/decline", requireAuth, async (req: AuthedRequest, res) => {
    const { id } = req.params;
    const ok = await store.declineFriendRequest(req.userId!, id);
    if (!ok) {
      res.status(404).json({ error: t(req.userLanguage || "zh-CN", "server.friendRequestNotFound") });
      return;
    }
    res.json({ ok: true });
  });

  app.delete("/api/friends/:userId", requireAuth, async (req: AuthedRequest, res) => {
    const { userId } = req.params;
    await store.removeFriend(req.userId!, userId);
    res.json({ ok: true });
    hub()?.notifyFriendRemove(userId, req.userId!);
  });

  app.post("/api/friends/:userId/block", requireAuth, async (req: AuthedRequest, res) => {
    const { userId } = req.params;
    await store.blockUser(req.userId!, userId);
    res.json({ ok: true });
    hub()?.notifyFriendUpdate(req.userId!, userId);
    hub()?.notifyFriendUpdate(userId, req.userId!);
  });

  app.post("/api/friends/:userId/unblock", requireAuth, async (req: AuthedRequest, res) => {
    const { userId } = req.params;
    await store.unblockUser(req.userId!, userId);
    res.json({ ok: true });
    hub()?.notifyFriendUpdate(req.userId!, userId);
    hub()?.notifyFriendUpdate(userId, req.userId!);
  });

  app.patch("/api/friends/:userId/note", requireAuth, async (req: AuthedRequest, res) => {
    const { userId } = req.params;
    const { note } = req.body as { note?: string };
    await store.setFriendNote(req.userId!, userId, note ?? "");
    res.json({ ok: true });
  });

  app.get("/api/friends/:userId", requireAuth, async (req: AuthedRequest, res) => {
    const { userId } = req.params;
    const other = await store.findUserById(userId);
    if (!other) {
      res.status(404).json({ error: t(req.userLanguage || "zh-CN", "server.userNotFound") });
      return;
    }
    const row = await store.friendshipBetween(req.userId!, userId);
    if (!row) {
      res.json({
        userId,
        status: "none",
        direction: "none",
        blockedByMe: false,
        createdAt: new Date(0).toISOString(),
      });
      return;
    }
    res.json(await store.viewFriendship(req.userId!, userId));
  });

  // NSFW 预检（客户端上传前调用，模型运行在本地服务端）
  app.post("/api/nsfw/check", requireAuth, nsfwUpload.single("file"), async (req: AuthedRequest, res) => {
    const file = req.file;
    if (!file || !file.buffer) {
      res.status(400).json({ error: t(req.userLanguage || "zh-CN", "server.uploadNoFile") });
      return;
    }
    try {
      const { checkBufferNsfw } = await import("./nsfw.js");
      const result = await checkBufferNsfw(file.buffer, file.mimetype);
      if (!result.ok) {
        res.status(400).json({ ok: false, error: t(req.userLanguage || "zh-CN", "nsfw.rejected"), score: result.score });
        return;
      }
      res.json({ ok: true, score: result.score });
    } catch (e) {
      console.warn("[nsfw] check api error:", e);
      res.json({ ok: true });
    }
  });

  // Upload
  app.post("/api/upload", requireAuth, upload.single("file"), async (req: AuthedRequest, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: t(req.userLanguage || "zh-CN", "server.uploadNoFile") });
      return;
    }
    // NSFW 本地审核：图片上传时自动检测（异步读盘 + 内存推理）
    try {
      const { checkBufferNsfw } = await import("./nsfw.js");
      const buf = await fs.promises.readFile(file.path);
      const nsfwResult = await checkBufferNsfw(buf, file.mimetype);
      if (!nsfwResult.ok) {
        try { fs.unlinkSync(file.path); } catch { /* noop */ }
        res.status(400).json({ error: t(req.userLanguage || "zh-CN", "nsfw.rejected") });
        return;
      }
    } catch (e) {
      console.warn("[upload] nsfw check error (passing through):", e);
    }
    const maxSizeSetting = await queryOne<{ value: string }>("SELECT value FROM system_settings WHERE \`key\` = 'maxFileSize'");
    const maxSize = maxSizeSetting ? parseInt(maxSizeSetting.value, 10) : 26214400;
    if (file.size > maxSize) {
      try { fs.unlinkSync(file.path); } catch { /* noop */ }
      res.status(400).json({ error: t(req.userLanguage || "zh-CN", "server.fileTooLarge", { size: (maxSize / 1024 / 1024).toFixed(1) }) });
      return;
    }
    const safeName = Buffer.from(file.originalname, "latin1").toString("utf8");

    const attachmentId = `a_${nanoid(10)}`;
    const ossFileName = `${attachmentId}.navofile`;

    const attachment: Attachment = {
      id: attachmentId,
      name: safeName,
      url: `/uploads/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
    };

    const e2eeConversationId = typeof req.body?.e2eeConversationId === "string"
      ? req.body.e2eeConversationId.trim()
      : "";
    if (e2eeConversationId) {
      const { registerE2eeFile } = await import("./e2ee-files.js");
      await registerE2eeFile(e2eeConversationId, req.userId!, attachmentId, attachment.url);
    }

    // Try to upload to OSS if a default binding exists
    try {
      const { getDefaultGlobalOssBinding, uploadToOss } = await import("./oss-upload.js");
      const binding = await getDefaultGlobalOssBinding();
      if (binding) {
        const ossUrl = await uploadToOss(binding, file.path, ossFileName, file.mimetype);
        attachment.url = ossUrl;
      }
    } catch (e) {
      // OSS upload failed, fall back to local
    }

    function respond() {
      res.status(201).json(attachment);
    }

    async function uploadPosterToOss(posterPath: string, posterName: string, mime: string) {
      if (!attachment.url.startsWith("http")) return;
      try {
        const { getDefaultGlobalOssBinding, uploadToOss } = await import("./oss-upload.js");
        const binding = await getDefaultGlobalOssBinding();
        if (binding) {
          const url = await uploadToOss(binding, posterPath, `posters/${posterName}`, mime);
          attachment.poster = url;
        }
      } catch {}
    }

    if (file.mimetype.startsWith("video/")) {
      const posterName = `${nanoid(16)}.jpg`;
      const posterPath = path.join(config.uploadsDir, posterName);
      const inputPath = file.path;
      Promise.all([
        ffmpegExtractPoster(inputPath, posterPath),
        ffmpegProbeDuration(inputPath),
      ]).then(async ([posterOk, duration]) => {
        if (posterOk) {
          attachment.poster = `/uploads/${posterName}`;
          await uploadPosterToOss(posterPath, posterName, "image/jpeg");
        }
        if (duration > 0) attachment.duration = Math.round(duration * 100) / 100;
        respond();
      });
      return;
    }

    if (file.mimetype.startsWith("audio/")) {
      ffmpegProbeDuration(file.path).then((duration) => {
        if (duration > 0) attachment.duration = Math.round(duration * 100) / 100;
        respond();
      });
      return;
    }

    const posterField = typeof req.body?.poster === "string" ? req.body.poster : "";
    if (posterField) {
      const m = posterField.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (m) {
        (async () => {
          try {
            const ext = m[1].toLowerCase() === "jpeg" ? "jpg" : m[1].toLowerCase();
            const buffer = Buffer.from(m[2], "base64");
            const posterName = `${nanoid(16)}.${ext}`;
            const posterPath = path.join(config.uploadsDir, posterName);
            await fs.promises.writeFile(posterPath, buffer);
            attachment.poster = `/uploads/${posterName}`;
            await uploadPosterToOss(posterPath, posterName, `image/${ext}`);
          } catch {}
          respond();
        })();
        return;
      }
    }
    respond();
  });

  // User notifications
  app.get("/api/notifications", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const notifications = await getNotificationsForUser(req.userId!);
      res.json(notifications);
    } catch (error) {
      console.error("Failed to get notifications:", error);
      res.status(500).json({ error: t(req.userLanguage || "zh-CN", "server.failedToGetNotifications") });
    }
  });

  app.post("/api/notifications/:id/read", requireAuth, async (req: AuthedRequest, res) => {
    try {
      await markNotificationRead(req.userId!, req.params.id);
      res.json({ ok: true });
    } catch (error) {
      console.error("Failed to mark notification read:", error);
      res.status(500).json({ error: t(req.userLanguage || "zh-CN", "server.failedToUpdateSettings") });
    }
  });

  // ---- Reports ----
  app.post("/api/reports", requireAuth, async (req: AuthedRequest, res) => {
    const { targetType, targetId, reason, screenshotUrl, captchaToken } = req.body ?? {};
    if (!targetType || !targetId || !reason?.trim()) {
      res.status(400).json({ error: t(req.userLanguage || "zh-CN", "server.reportMissingFields") });
      return;
    }
    if (captchaToken && !(await validateCaptcha(captchaToken))) {
      res.status(400).json({ error: t(req.userLanguage || "zh-CN", "server.captchaFailed") });
      return;
    }
    try {
      const { createReport } = await import("./admin.js");
      const report = await createReport(req.userId!, targetType, targetId, reason.trim(), screenshotUrl);
      res.status(201).json(report);
    } catch (error) {
      console.error("Failed to create report:", error);
      res.status(500).json({ error: t(req.userLanguage || "zh-CN", "server.failedToGetReports") });
    }
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    let message: string;
    if (err instanceof Error) {
      if (err.message.startsWith("UNSUPPORTED_FILE_TYPE:")) {
        const fileType = err.message.slice("UNSUPPORTED_FILE_TYPE:".length);
        message = t(lang(_req), "server.unsupportedFileType", { type: fileType });
      } else if ((err as any).code === "LIMIT_FILE_SIZE") {
        message = t(lang(_req), "server.fileTooLarge", { size: "" });
      } else {
        message = t(lang(_req), "error.uploadFailed");
      }
    } else {
      message = t(lang(_req), "error.serverError");
    }
    res.status(400).json({ error: message });
  });

  // Public org lookup (returns name + path for any authenticated user)
  app.get("/api/orgs/:id", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const { getOrgPath } = await import("./admin.js");
      const path = await getOrgPath(req.params.id);
      const org = path.length > 0 ? path[path.length - 1] : null;
      res.json({ org, path });
    } catch {
      res.status(404).json({ error: t(req.userLanguage || "zh-CN", "server.notFound") });
    }
  });

  // Sticker packs (public, authenticated)
  app.get("/api/sticker-packs", requireAuth, async (_req: AuthedRequest, res) => {
    const packs = await store.listStickerPacks();
    const result = [];
    for (const p of packs) {
      const stickers = await store.listStickers(p.id);
      result.push({ ...p, stickers });
    }
    res.json(result);
  });

  // 个推 token 注册
  app.post("/api/push/register", requireAuth, async (req: AuthedRequest, res) => {
    const { token } = req.body as { token?: string };
    if (!token || typeof token !== "string" || !req.userId) {
      res.status(400).json({ error: "Missing token or user" });
      return;
    }
    const { registerToken } = await import("./getui.js");
    await registerToken(req.userId, token);
    res.json({ ok: true });
  });

  app.post("/api/push/unregister", requireAuth, async (req: AuthedRequest, res) => {
    const { token } = req.body as { token?: string };
    if (token && req.userId) {
      const { execute } = await import("./db.js");
      await execute("DELETE FROM push_tokens WHERE user_id=? AND token=?", [req.userId, token]);
    }
    res.json({ ok: true });
  });

  // ── E2EE 端到端加密 ─────────────────────────────────────────────
  // 基于 X3DH 协议：用户登录时上传预密钥包 (IK + SPK + OPK×N)，
  // 其他用户首次发起加密会话时拉取一份并消费一个 OPK 完成握手。
  // 之后使用共享密钥加密每条消息；服务器仅中继密文。

  /** 上传/更新当前用户的预密钥包（IK + SPK + 若干 OPK）。 */
  app.put("/api/me/e2ee/prekey", requireAuth, async (req: AuthedRequest, res) => {
    const { identityKey, signedPreKey, signedPreKeySig, oneTimePreKeys } = (req.body ?? {}) as {
      identityKey?: string;
      signedPreKey?: string;
      signedPreKeySig?: string;
      oneTimePreKeys?: string[];
    };
    if (!identityKey || !signedPreKey || !signedPreKeySig) {
      res.status(400).json({ error: "identityKey / signedPreKey / signedPreKeySig 必填" });
      return;
    }
    const ts = new Date().toISOString();
    try {
      await execute(
        `INSERT INTO e2ee_prekey_bundles (user_id, identity_key, signed_pre_key, signed_pre_key_sig, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE identity_key = VALUES(identity_key), signed_pre_key = VALUES(signed_pre_key), signed_pre_key_sig = VALUES(signed_pre_key_sig), updated_at = VALUES(updated_at)`,
        [req.userId!, identityKey, signedPreKey, signedPreKeySig, ts, ts],
      );
      if (Array.isArray(oneTimePreKeys) && oneTimePreKeys.length > 0) {
        for (const pk of oneTimePreKeys) {
          await execute(
            "INSERT INTO e2ee_one_time_prekeys (user_id, pre_key, consumed, created_at) VALUES (?, ?, 0, ?)",
            [req.userId!, pk, ts],
          );
        }
      }
      res.json({ ok: true, uploadedOpk: Array.isArray(oneTimePreKeys) ? oneTimePreKeys.length : 0 });
    } catch (e) {
      res.status(500).json({ error: "Failed to upload prekey bundle" });
    }
  });

  /** 拉取对方的预密钥包（消耗一个 OPK）。 */
  app.get("/api/users/:userId/e2ee/prekey", requireAuth, async (req: AuthedRequest, res) => {
    const { userId } = req.params;
    if (!userId) {
      res.status(400).json({ error: "userId 必填" });
      return;
    }
    try {
      const bundle = await queryOne<{ identity_key: string; signed_pre_key: string; signed_pre_key_sig: string }>(
        "SELECT identity_key, signed_pre_key, signed_pre_key_sig FROM e2ee_prekey_bundles WHERE user_id = ?",
        [userId],
      );
      if (!bundle) {
        res.status(404).json({ error: "用户尚未发布预密钥包" });
        return;
      }
      // 消费一个未使用的 OPK
      const opk = await queryOne<{ id: number; pre_key: string }>(
        "SELECT id, pre_key FROM e2ee_one_time_prekeys WHERE user_id = ? AND consumed = 0 ORDER BY id ASC LIMIT 1",
        [userId],
      );
      let oneTimePreKey: string | null = null;
      let oneTimePreKeyId: number | null = null;
      if (opk) {
        oneTimePreKey = opk.pre_key;
        oneTimePreKeyId = opk.id;
        await execute(
          "UPDATE e2ee_one_time_prekeys SET consumed = 1, consumed_at = ? WHERE id = ?",
          [new Date().toISOString(), opk.id],
        );
      }
      res.json({
        identityKey: bundle.identity_key,
        signedPreKey: bundle.signed_pre_key,
        signedPreKeySig: bundle.signed_pre_key_sig,
        oneTimePreKey,
        oneTimePreKeyId,
      });
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch prekey bundle" });
    }
  });

  /** 上报一个握手（X3DH 首次消息），接收方据此初始化会话。 */
  app.post("/api/me/e2ee/sessions", requireAuth, async (req: AuthedRequest, res) => {
    const { conversationId, peerId, sessionId, ratchetState } = (req.body ?? {}) as {
      conversationId?: string;
      peerId?: string;
      sessionId?: string;
      ratchetState?: string;
    };
    if (!conversationId || !peerId) {
      res.status(400).json({ error: "conversationId / peerId 必填" });
      return;
    }
    // 服务端在线校验：对方必须当前在线才能开启 E2EE
    const { getHub } = await import("./ws.js");
    const hub = getHub();
    if (hub && !hub.isUserOnline(peerId)) {
      res.status(400).json({ error: "对方不在线，无法开启 E2EE 加密" });
      return;
    }
    const ts = new Date().toISOString();
    try {
      await execute(
        `INSERT INTO e2ee_sessions (conversation_id, user_id, peer_id, ratchet_state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE ratchet_state = VALUES(ratchet_state), updated_at = VALUES(updated_at)`,
        [conversationId, req.userId!, peerId, ratchetState ?? null, ts, ts],
      );
      // 通知对端：开启了 E2EE 会话
      hub?.fanoutToConversation(conversationId, {
        type: "e2ee:started",
        conversationId,
        peerId: req.userId!,
        sessionId: sessionId || undefined,
      });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to upsert session" });
    }
  });

  /** 拉取一个会话的当前 ratchet state。 */
  app.get("/api/me/e2ee/sessions/:conversationId", requireAuth, async (req: AuthedRequest, res) => {
    const { conversationId } = req.params;
    if (!conversationId) {
      res.status(400).json({ error: "conversationId 必填" });
      return;
    }
    try {
      const row = await queryOne<{ ratchet_state: string | null }>(
        "SELECT ratchet_state FROM e2ee_sessions WHERE conversation_id = ? AND user_id = ?",
        [conversationId, req.userId!],
      );
      res.json({ ratchetState: row?.ratchet_state ?? null });
    } catch {
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });

  /**
   * 主动结束 E2EE 会话：
   *   - 删除本地会话记录
   *   - 标记本会话的所有附件为已清理
   *   - WS 广播 e2ee:ended 给双方
   */
  app.delete("/api/me/e2ee/sessions/:conversationId", requireAuth, async (req: AuthedRequest, res) => {
    const { conversationId } = req.params;
    if (!conversationId) {
      res.status(400).json({ error: "conversationId 必填" });
      return;
    }
    const { reason } = (req.body ?? {}) as { reason?: string };
    const ts = new Date().toISOString();
    try {
      const session = await queryOne<{ peer_id: string }>(
        "SELECT peer_id FROM e2ee_sessions WHERE conversation_id = ? AND user_id = ?",
        [conversationId, req.userId!],
      );
      if (!session) {
        res.json({ ok: true, alreadyEnded: true });
        return;
      }
      const { deleteE2eeConversationFiles } = await import("./e2ee-files.js");
      await deleteE2eeConversationFiles(conversationId);
      // 标记本会话所有附件为已清理（兼容旧逻辑）
      await execute(
        "UPDATE attachments SET e2ee_expires_at = ? WHERE e2ee_session_id = ?",
        [ts, `${conversationId}:${req.userId!}`],
      ).catch(() => {});
      // 删除会话
      await execute(
        "DELETE FROM e2ee_sessions WHERE conversation_id = ? AND user_id = ?",
        [conversationId, req.userId!],
      ).catch(() => {});
      // WS 广播给双方
      const { getHub } = await import("./ws.js");
      getHub()?.fanoutToConversation(conversationId, {
        type: "e2ee:ended",
        conversationId,
        peerId: session.peer_id,
        reason: reason || "manual",
      });
      res.json({ ok: true });
    } catch (e) {
      console.error("[e2ee] end session error:", e);
      res.status(500).json({ error: "Failed to end session" });
    }
  });

  // Admin routes
  const { setupAdminRoutes } = await import("./admin-routes.js");
  setupAdminRoutes(app, getHub);

  return app;
}

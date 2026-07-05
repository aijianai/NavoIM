import { type Request, type Response, type NextFunction } from "express";
import { nanoid } from "nanoid";
import { query, queryOne, execute } from "./db.js";
import { verifyToken } from "./auth.js";
import type {
  AdminUser,
  SystemSettings,
  SystemRole,
  AdminPermission,
  GrantAdminRoleRequest,
  BanUserRequest,
  UpdateSystemSettingsRequest,
  AdminDashboardStats,
  Notification,
  CreateNotificationRequest,
  UpdateNotificationRequest,
  SensitiveWord,
  Organization,
  OssBinding,
} from "@navo/shared";

interface AuthedRequest extends Request {
  userId?: string;
}

const now = () => new Date().toISOString();

function parseAuth(req: AuthedRequest, res: Response): boolean {
  const header = req.headers.authorization ?? "";
  let token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token && typeof req.query.token === "string") token = req.query.token;
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: "未授权" });
    return false;
  }
  req.userId = payload.sub;
  return true;
}

export async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  if (!parseAuth(req, res)) return;

  const adminRole = await queryOne<any>("SELECT * FROM admin_roles WHERE user_id = ?", [req.userId]);

  if (!adminRole) {
    res.status(403).json({ error: "需要管理员权限" });
    return;
  }

  if (adminRole.expires_at && new Date(adminRole.expires_at) < new Date()) {
    res.status(403).json({ error: "管理员权限已过期" });
    return;
  }

  next();
}

export function requirePermission(permission: AdminPermission) {
  return async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!parseAuth(req, res)) return;

    const adminRole = await queryOne<any>("SELECT * FROM admin_roles WHERE user_id = ?", [req.userId]);

    if (!adminRole) {
      res.status(403).json({ error: "需要管理员权限" });
      return;
    }

    if (adminRole.expires_at && new Date(adminRole.expires_at) < new Date()) {
      res.status(403).json({ error: "管理员权限已过期" });
      return;
    }

    const permissions = JSON.parse(adminRole.permissions || "[]") as AdminPermission[];

    if (adminRole.role === "super_admin" || permissions.includes(permission)) {
      next();
    } else {
      res.status(403).json({ error: "权限不足" });
    }
  };
}

export async function getAdminRole(userId: string): Promise<AdminUser | null> {
  const row = await queryOne<any>("SELECT * FROM admin_roles WHERE user_id = ?", [userId]);
  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    role: row.role as SystemRole,
    permissions: JSON.parse(row.permissions || "[]") as AdminPermission[],
    grantedBy: row.granted_by,
    grantedAt: row.granted_at,
    expiresAt: row.expires_at,
    note: row.note,
  };
}

export async function grantAdminRole(userId: string, grantedBy: string, request: GrantAdminRoleRequest): Promise<AdminUser> {
  const existing = await queryOne<any>("SELECT * FROM admin_roles WHERE user_id = ?", [userId]);

  if (existing) {
    await execute(
      `UPDATE admin_roles SET role = ?, permissions = ?, granted_by = ?, granted_at = ?, expires_at = ?, note = ? WHERE user_id = ?`,
      [request.role, JSON.stringify(request.permissions || []), grantedBy, now(), request.expiresAt || null, request.note || null, userId]
    );
  } else {
    await execute(
      `INSERT INTO admin_roles (id, user_id, role, permissions, granted_by, granted_at, expires_at, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [`ar_${nanoid(10)}`, userId, request.role, JSON.stringify(request.permissions || []), grantedBy, now(), request.expiresAt || null, request.note || null]
    );
  }

  logAuditAction(grantedBy, "admin.grant", "user", userId, `授予 ${request.role} 角色`);
  return (await getAdminRole(userId))!;
}

export async function removeAdminRole(userId: string, removedBy: string): Promise<void> {
  await execute("DELETE FROM admin_roles WHERE user_id = ?", [userId]);
  logAuditAction(removedBy, "admin.revoke", "user", userId, "撤销管理员角色");
}

export function logAuditAction(
  userId: string,
  action: string,
  targetType: "user" | "channel" | "message" | "system",
  targetId?: string,
  details?: string,
  ipAddress?: string
): void {
  execute(
    `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, details, ip_address, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [`al_${nanoid(10)}`, userId, action, targetType, targetId || null, details || null, ipAddress || null, now()]
  ).catch(() => {});
}

export async function validateCaptcha(token: string): Promise<boolean> {
  const settings = await getSystemSettings();
  if (!settings.captchaEnabled) return true;
  if (settings.captchaProvider === 'none') return true;
  try {
    if (settings.captchaProvider === 'cap-pow') {
      const res = await fetch(`${settings.captchaBackendUrl}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, keepToken: false }),
        signal: AbortSignal.timeout(8000),
      });
      const data = (await res.json()) as { success?: boolean };
      return data.success === true;
    }
    if (settings.captchaProvider === 'cloudflare') {
      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret: settings.captchaBackendUrl, response: token }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json() as { success: boolean };
      return data.success;
    }
    return true;
  } catch { return false; }
}

export async function getSystemSettings(): Promise<SystemSettings> {
  const rows = await query<{ key: string; value: string }>("SELECT `key`, value FROM system_settings");
  const settings: any = {};

  for (const row of rows) {
    if (row.value === "true") {
      settings[row.key] = true;
    } else if (row.value === "false") {
      settings[row.key] = false;
    } else if (!isNaN(Number(row.value))) {
      settings[row.key] = Number(row.value);
    } else {
      settings[row.key] = row.value;
    }
  }

  return {
    siteName: settings.siteName || "Navo IM",
    siteDescription: settings.siteDescription || "下一代 IM 聊天软件",
    allowRegistration: settings.allowRegistration ?? true,
    requireInviteCode: settings.requireInviteCode ?? false,
    inviteCode: settings.inviteCode,
    maxFileSize: settings.maxFileSize || 26214400,
    maxMessageLength: settings.maxMessageLength || 5000,
    aiEnabled: settings.aiEnabled ?? true,
    maintenanceMode: settings.maintenanceMode ?? false,
    maintenanceMessage: settings.maintenanceMessage,
    requireSecondPassword: settings.requireSecondPassword ?? false,
    captchaEnabled: settings.captchaEnabled ?? false,
    captchaBackendUrl: settings.captchaBackendUrl || "",
    captchaFrontendUrl: settings.captchaFrontendUrl || "",
    captchaProvider: settings.captchaProvider || "cap-pow",
    aiBaseUrl: settings.aiBaseUrl || "",
    aiApiKey: settings.aiApiKey || "",
    aiModel: settings.aiModel || "",
    aiSystemPrompt: settings.aiSystemPrompt || "",
    aiName: settings.aiName || "Navo 助手",
    aiBio: settings.aiBio || "你的专属聊天助手，可以陪你聊天、帮你起草文字、解释概念。",
    aiAvatarUrl: settings.aiAvatarUrl || "",
    cdnFontsGoogleCssUrl: settings.cdnFontsGoogleCssUrl || "",
    cdnVconsoleEnabled: settings.cdnVconsoleEnabled ?? false,
    translationProvider: settings.translationProvider || "bing",
    deeplApiKey: settings.deeplApiKey || "",
    googleApiKey: settings.googleApiKey || "",
    bingApiKey: settings.bingApiKey || "",
    iceStunUrls: settings.iceStunUrls || JSON.stringify([{ url: "stun:stun.l.google.com:19302" }, { url: "stun:stun1.l.google.com:19302" }]),
    iceTurnUrl: settings.iceTurnUrl || "[]",
    iceTurnUsername: settings.iceTurnUsername || "",
    iceTurnCredential: settings.iceTurnCredential || "",
    rateLimitMessageCount: settings.rateLimitMessageCount ?? 60,
    rateLimitMessageWindow: settings.rateLimitMessageWindow ?? 60,
    rateLimitLoginMax: settings.rateLimitLoginMax ?? 10,
    rateLimitLoginWindow: settings.rateLimitLoginWindow ?? 900,
    rateLimitRegisterMax: settings.rateLimitRegisterMax ?? 5,
    rateLimitRegisterWindow: settings.rateLimitRegisterWindow ?? 3600,
    rateLimitMaxAccountsPerIp: settings.rateLimitMaxAccountsPerIp ?? 3,
    rateLimitPresencePingMax: settings.rateLimitPresencePingMax ?? 1,
    rateLimitPresencePingWindow: settings.rateLimitPresencePingWindow ?? 30,
    usernameRegistrationEnabled: settings.usernameRegistrationEnabled ?? true,
    emailRegistrationEnabled: settings.emailRegistrationEnabled ?? false,
    phoneRegistrationEnabled: settings.phoneRegistrationEnabled ?? false,
    smsProvider: (settings.smsProvider as any) || "none",
    smsSdkAppId: settings.smsSdkAppId || "",
    smsAccessKeyId: settings.smsAccessKeyId || "",
    smsAccessKeySecret: settings.smsAccessKeySecret || "",
    smsSignName: settings.smsSignName || "",
    smsTemplateCode: settings.smsTemplateCode || "",
    smsRegion: settings.smsRegion || "",
    smsEndpoint: settings.smsEndpoint || "",
  };
}

export async function updateSystemSettings(request: UpdateSystemSettingsRequest): Promise<SystemSettings> {
  const currentTime = now();

  const updates: [string, any][] = [];
  if (request.siteName !== undefined) updates.push(["siteName", request.siteName]);
  if (request.siteDescription !== undefined) updates.push(["siteDescription", request.siteDescription]);
  if (request.allowRegistration !== undefined) updates.push(["allowRegistration", String(request.allowRegistration)]);
  if (request.requireInviteCode !== undefined) updates.push(["requireInviteCode", String(request.requireInviteCode)]);
  if (request.inviteCode !== undefined) updates.push(["inviteCode", request.inviteCode]);
  if (request.maxFileSize !== undefined) updates.push(["maxFileSize", String(request.maxFileSize)]);
  if (request.maxMessageLength !== undefined) updates.push(["maxMessageLength", String(request.maxMessageLength)]);
  if (request.aiEnabled !== undefined) updates.push(["aiEnabled", String(request.aiEnabled)]);
  if (request.maintenanceMode !== undefined) updates.push(["maintenanceMode", String(request.maintenanceMode)]);
  if (request.maintenanceMessage !== undefined) updates.push(["maintenanceMessage", request.maintenanceMessage]);
  if (request.cdnFontsGoogleCssUrl !== undefined) updates.push(["cdnFontsGoogleCssUrl", request.cdnFontsGoogleCssUrl]);
  if (request.cdnVconsoleEnabled !== undefined) updates.push(["cdnVconsoleEnabled", String(request.cdnVconsoleEnabled)]);
  if (request.captchaEnabled !== undefined) updates.push(["captchaEnabled", String(request.captchaEnabled)]);
  if (request.captchaBackendUrl !== undefined) updates.push(["captchaBackendUrl", request.captchaBackendUrl]);
  if (request.captchaFrontendUrl !== undefined) updates.push(["captchaFrontendUrl", request.captchaFrontendUrl]);
  if (request.captchaProvider !== undefined) updates.push(["captchaProvider", request.captchaProvider]);
  if (request.requireSecondPassword !== undefined) updates.push(["requireSecondPassword", String(request.requireSecondPassword)]);
  if (request.aiBaseUrl !== undefined) updates.push(["aiBaseUrl", request.aiBaseUrl]);
  if (request.aiApiKey !== undefined) updates.push(["aiApiKey", request.aiApiKey]);
  if (request.aiModel !== undefined) updates.push(["aiModel", request.aiModel]);
  if (request.aiSystemPrompt !== undefined) updates.push(["aiSystemPrompt", request.aiSystemPrompt]);
  if (request.aiName !== undefined) updates.push(["aiName", request.aiName]);
  if (request.aiBio !== undefined) updates.push(["aiBio", request.aiBio]);
  if (request.aiAvatarUrl !== undefined) updates.push(["aiAvatarUrl", request.aiAvatarUrl]);
  if (request.translationProvider !== undefined) updates.push(["translationProvider", request.translationProvider]);
  if (request.deeplApiKey !== undefined) updates.push(["deeplApiKey", request.deeplApiKey]);
  if (request.googleApiKey !== undefined) updates.push(["googleApiKey", request.googleApiKey]);
  if (request.bingApiKey !== undefined) updates.push(["bingApiKey", request.bingApiKey]);
  if (request.iceStunUrls !== undefined) updates.push(["iceStunUrls", request.iceStunUrls]);
  if (request.iceTurnUrl !== undefined) updates.push(["iceTurnUrl", request.iceTurnUrl]);
  if (request.iceTurnUsername !== undefined) updates.push(["iceTurnUsername", request.iceTurnUsername]);
  if (request.iceTurnCredential !== undefined) updates.push(["iceTurnCredential", request.iceTurnCredential]);
  if (request.rateLimitMessageCount !== undefined) updates.push(["rateLimitMessageCount", String(request.rateLimitMessageCount)]);
  if (request.rateLimitMessageWindow !== undefined) updates.push(["rateLimitMessageWindow", String(request.rateLimitMessageWindow)]);
  if (request.rateLimitLoginMax !== undefined) updates.push(["rateLimitLoginMax", String(request.rateLimitLoginMax)]);
  if (request.rateLimitLoginWindow !== undefined) updates.push(["rateLimitLoginWindow", String(request.rateLimitLoginWindow)]);
  if (request.rateLimitRegisterMax !== undefined) updates.push(["rateLimitRegisterMax", String(request.rateLimitRegisterMax)]);
  if (request.rateLimitRegisterWindow !== undefined) updates.push(["rateLimitRegisterWindow", String(request.rateLimitRegisterWindow)]);
  if (request.rateLimitMaxAccountsPerIp !== undefined) updates.push(["rateLimitMaxAccountsPerIp", String(request.rateLimitMaxAccountsPerIp)]);
  if (request.rateLimitPresencePingMax !== undefined) updates.push(["rateLimitPresencePingMax", String(request.rateLimitPresencePingMax)]);
  if (request.rateLimitPresencePingWindow !== undefined) updates.push(["rateLimitPresencePingWindow", String(request.rateLimitPresencePingWindow)]);
  if (request.usernameRegistrationEnabled !== undefined) updates.push(["usernameRegistrationEnabled", String(request.usernameRegistrationEnabled)]);
  if (request.emailRegistrationEnabled !== undefined) updates.push(["emailRegistrationEnabled", String(request.emailRegistrationEnabled)]);
  if (request.phoneRegistrationEnabled !== undefined) updates.push(["phoneRegistrationEnabled", String(request.phoneRegistrationEnabled)]);
  if (request.smsProvider !== undefined) updates.push(["smsProvider", request.smsProvider]);
  if (request.smsSdkAppId !== undefined) updates.push(["smsSdkAppId", request.smsSdkAppId]);
  if (request.smsAccessKeyId !== undefined) updates.push(["smsAccessKeyId", request.smsAccessKeyId]);
  if (request.smsAccessKeySecret !== undefined) updates.push(["smsAccessKeySecret", request.smsAccessKeySecret]);
  if (request.smsSignName !== undefined) updates.push(["smsSignName", request.smsSignName]);
  if (request.smsTemplateCode !== undefined) updates.push(["smsTemplateCode", request.smsTemplateCode]);
  if (request.smsRegion !== undefined) updates.push(["smsRegion", request.smsRegion]);
  if (request.smsEndpoint !== undefined) updates.push(["smsEndpoint", request.smsEndpoint]);

  for (const [key, value] of updates) {
    await execute(
      `INSERT INTO system_settings (\`key\`, value, updated_at) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)`,
      [key, value, currentTime]
    );
  }

  return getSystemSettings();
}

export async function banUser(userId: string, bannedBy: string, request: BanUserRequest): Promise<void> {
  const existing = await queryOne<any>("SELECT * FROM user_bans WHERE user_id = ?", [userId]);

  if (existing) {
    await execute(
      "UPDATE user_bans SET banned_by = ?, reason = ?, expires_at = ?, created_at = ? WHERE user_id = ?",
      [bannedBy, request.reason || null, request.expiresAt || null, now(), userId]
    );
  } else {
    await execute(
      "INSERT INTO user_bans (id, user_id, banned_by, reason, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [`ub_${nanoid(10)}`, userId, bannedBy, request.reason || null, request.expiresAt || null, now()]
    );
  }

  logAuditAction(bannedBy, "user.ban", "user", userId, request.reason);
}

export async function unbanUser(userId: string, unbannedBy: string): Promise<void> {
  await execute("DELETE FROM user_bans WHERE user_id = ?", [userId]);
  logAuditAction(unbannedBy, "user.unban", "user", userId, "解除封禁");
}

export async function isUserBanned(userId: string): Promise<{ banned: boolean; reason?: string; expiresAt?: string }> {
  const row = await queryOne<any>("SELECT * FROM user_bans WHERE user_id = ?", [userId]);

  if (!row) return { banned: false };

  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    await execute("DELETE FROM user_bans WHERE user_id = ?", [userId]);
    return { banned: false };
  }

  return { banned: true, reason: row.reason, expiresAt: row.expires_at };
}

export async function getDashboardStats(): Promise<AdminDashboardStats> {
  const totalUsers = (await queryOne<{ count: number }>("SELECT COUNT(*) as count FROM users"))?.count ?? 0;
  const totalChannels = (await queryOne<{ count: number }>("SELECT COUNT(*) as count FROM conversations WHERE kind = 'channel'"))?.count ?? 0;
  const totalMessages = (await queryOne<{ count: number }>("SELECT COUNT(*) as count FROM messages"))?.count ?? 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoISO = weekAgo.toISOString();

  const activeUsers = (await queryOne<{ count: number }>(
    "SELECT COUNT(DISTINCT user_id) as count FROM conversation_members WHERE joined_at >= ?",
    [weekAgoISO]
  ))?.count ?? 0;

  const newUsersToday = (await queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM users WHERE last_seen >= ?",
    [todayISO]
  ))?.count ?? 0;

  const newUsersThisWeek = (await queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM users WHERE last_seen >= ?",
    [weekAgoISO]
  ))?.count ?? 0;

  const messagesToday = (await queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM messages WHERE created_at >= ?",
    [todayISO]
  ))?.count ?? 0;

  const messagesThisWeek = (await queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM messages WHERE created_at >= ?",
    [weekAgoISO]
  ))?.count ?? 0;

  return { totalUsers, activeUsers, totalChannels, totalMessages, newUsersToday, newUsersThisWeek, messagesToday, messagesThisWeek };
}

export async function getAllUsers(page: number = 1, limit: number = 20, search?: string) {
  const offset = (page - 1) * limit;

  let sql = "SELECT * FROM users";
  let countSql = "SELECT COUNT(*) as count FROM users";
  const params: any[] = [];

  if (search) {
    const searchCondition = " WHERE username LIKE ? OR display_name LIKE ?";
    sql += searchCondition;
    countSql += searchCondition;
    params.push(`%${search}%`, `%${search}%`);
  }

  const total = (await queryOne<{ count: number }>(countSql, params))?.count ?? 0;
  const users = await query<any>(sql + " ORDER BY last_seen DESC LIMIT ? OFFSET ?", [...params, limit, offset]);

  return {
    users: users.map((u: any) => ({
      id: u.id,
      username: u.username,
      displayName: u.display_name,
      avatarColor: u.avatar_color,
      avatarUrl: u.avatar_url,
      bio: u.bio,
      gender: u.gender,
      status: u.status,
      lastSeen: u.last_seen,
      requireFriendApproval: !!u.require_friend_approval,
      organizationId: u.organization_id ?? undefined,
      orgTitle: u.org_title ?? undefined,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getAllChannels(page: number = 1, limit: number = 20, search?: string) {
  const offset = (page - 1) * limit;

  let sql = "SELECT * FROM conversations WHERE kind = 'channel'";
  let countSql = "SELECT COUNT(*) as count FROM conversations WHERE kind = 'channel'";
  const params: any[] = [];

  if (search) {
    const searchCondition = " AND (name LIKE ? OR topic LIKE ?)";
    sql += searchCondition;
    countSql += searchCondition;
    params.push(`%${search}%`, `%${search}%`);
  }

  const total = (await queryOne<{ count: number }>(countSql, params))?.count ?? 0;
  const channels = await query<any>(sql + " ORDER BY created_at DESC LIMIT ? OFFSET ?", [...params, limit, offset]);

  const channelsWithCount = await Promise.all(
    channels.map(async (c: any) => ({
      id: c.id,
      name: c.name,
      topic: c.topic,
      isPrivate: !!c.is_private,
      icon: c.icon,
      avatarUrl: c.avatar_url,
      ownerId: c.owner_id,
      createdAt: c.created_at,
      memberCount: (await queryOne<{ count: number }>(
        "SELECT COUNT(*) as count FROM conversation_members WHERE conversation_id = ?",
        [c.id]
      ))?.count ?? 0,
    }))
  );

  return { channels: channelsWithCount, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getAuditLogs(page: number = 1, limit: number = 50, filters?: {
  userId?: string;
  action?: string;
  targetType?: string;
  startDate?: string;
  endDate?: string;
}) {
  const offset = (page - 1) * limit;

  let sql = "SELECT al.*, u.username, u.display_name FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id WHERE 1=1";
  let countSql = "SELECT COUNT(*) as count FROM audit_logs WHERE 1=1";
  const params: any[] = [];
  const countParams: any[] = [];

  if (filters?.userId) {
    sql += " AND al.user_id = ?";
    countSql += " AND user_id = ?";
    params.push(filters.userId);
    countParams.push(filters.userId);
  }
  if (filters?.action) {
    sql += " AND al.action = ?";
    countSql += " AND action = ?";
    params.push(filters.action);
    countParams.push(filters.action);
  }
  if (filters?.targetType) {
    sql += " AND al.target_type = ?";
    countSql += " AND target_type = ?";
    params.push(filters.targetType);
    countParams.push(filters.targetType);
  }
  if (filters?.startDate) {
    sql += " AND al.created_at >= ?";
    countSql += " AND created_at >= ?";
    params.push(filters.startDate);
    countParams.push(filters.startDate);
  }
  if (filters?.endDate) {
    sql += " AND al.created_at <= ?";
    countSql += " AND created_at <= ?";
    params.push(filters.endDate);
    countParams.push(filters.endDate);
  }

  const total = (await queryOne<{ count: number }>(countSql, countParams))?.count ?? 0;
  const logs = await query<any>(sql + " ORDER BY al.created_at DESC LIMIT ? OFFSET ?", [...params, limit, offset]);

  return {
    logs: logs.map((l: any) => ({
      id: l.id,
      userId: l.user_id,
      username: l.username,
      displayName: l.display_name,
      action: l.action,
      targetType: l.target_type,
      targetId: l.target_id,
      details: l.details,
      ipAddress: l.ip_address,
      createdAt: l.created_at,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function deleteUser(userId: string, deletedBy: string): Promise<void> {
  await execute("DELETE FROM messages WHERE author_id = ?", [userId]);
  await execute("DELETE FROM reactions WHERE user_id = ?", [userId]);
  await execute("DELETE FROM friendships WHERE user_a = ? OR user_b = ?", [userId, userId]);
  await execute("DELETE FROM friend_requests WHERE from_user_id = ? OR to_user_id = ?", [userId, userId]);
  await execute("DELETE FROM conversation_members WHERE user_id = ?", [userId]);
  await execute("DELETE FROM \`reads\` WHERE user_id = ?", [userId]);
  await execute("DELETE FROM admin_roles WHERE user_id = ?", [userId]);
  await execute("DELETE FROM user_bans WHERE user_id = ?", [userId]);
  await execute("DELETE FROM users WHERE id = ?", [userId]);
  logAuditAction(deletedBy, "user.delete", "user", userId, "删除用户");
}

export async function deleteChannel(channelId: string, deletedBy: string): Promise<void> {
  await execute("DELETE FROM messages WHERE conversation_id = ?", [channelId]);
  await execute("DELETE FROM conversation_members WHERE conversation_id = ?", [channelId]);
  await execute("DELETE FROM \`reads\` WHERE conversation_id = ?", [channelId]);
  await execute("DELETE FROM conversations WHERE id = ?", [channelId]);
  logAuditAction(deletedBy, "channel.delete", "channel", channelId, "删除频道");
}

export async function deleteMessage(messageId: string, deletedBy: string): Promise<void> {
  const ts = new Date().toISOString();
  await execute("UPDATE messages SET deleted_at = ?, deleted_by = ? WHERE id = ?", [ts, deletedBy, messageId]);
  logAuditAction(deletedBy, "message.delete", "message", messageId, "删除消息");
}

// ---------------------------------------------------------------------------
// System notifications
// ---------------------------------------------------------------------------

function hydrateNotification(row: any): Notification {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    imageUrl: row.image_url || undefined,
    authorId: row.author_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    targetUserId: row.target_user_id || undefined,
  };
}

export async function createNotification(authorId: string, request: CreateNotificationRequest): Promise<Notification> {
  const id = `notif_${nanoid(10)}`;
  const time = now();
  await execute(
    "INSERT INTO notifications (id, title, content, image_url, author_id, target_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [id, request.title, request.content, request.imageUrl || null, authorId, request.targetUserId ?? null, time, time]
  );
  logAuditAction(authorId, "notification.create", "system", id, `创建通知: ${request.title}`);
  const row = await queryOne<any>("SELECT * FROM notifications WHERE id = ?", [id]);
  return hydrateNotification(row);
}

export async function updateNotification(notificationId: string, request: UpdateNotificationRequest): Promise<Notification | null> {
  const existing = await queryOne<any>("SELECT * FROM notifications WHERE id = ?", [notificationId]);
  if (!existing) return null;
  const updates: string[] = [];
  const params: any[] = [];
  if (request.title !== undefined) { updates.push("title = ?"); params.push(request.title); }
  if (request.content !== undefined) { updates.push("content = ?"); params.push(request.content); }
  if (request.imageUrl !== undefined) { updates.push("image_url = ?"); params.push(request.imageUrl); }
  updates.push("updated_at = ?");
  params.push(now());
  params.push(notificationId);
  await execute(`UPDATE notifications SET ${updates.join(", ")} WHERE id = ?`, params);
  const row = await queryOne<any>("SELECT * FROM notifications WHERE id = ?", [notificationId]);
  return row ? hydrateNotification(row) : null;
}

export async function deleteNotification(notificationId: string): Promise<boolean> {
  const result = await execute("DELETE FROM notifications WHERE id = ?", [notificationId]);
  return result.affectedRows > 0;
}

export async function getNotification(notificationId: string): Promise<Notification | null> {
  const row = await queryOne<any>("SELECT * FROM notifications WHERE id = ?", [notificationId]);
  return row ? hydrateNotification(row) : null;
}

export async function getAllNotifications(page: number = 1, limit: number = 20): Promise<{ items: Notification[]; total: number; page: number; limit: number }> {
  const total = (await queryOne<{ count: number }>("SELECT COUNT(*) as count FROM notifications WHERE target_user_id IS NULL"))?.count ?? 0;
  const offset = (page - 1) * limit;
  const rows = await query<any>("SELECT * FROM notifications WHERE target_user_id IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?", [limit, offset]);
  return { items: rows.map(hydrateNotification), total, page, limit };
}

export async function getPrivateNotifications(page: number = 1, limit: number = 20): Promise<{ items: Notification[]; total: number; page: number; limit: number }> {
  const total = (await queryOne<{ count: number }>("SELECT COUNT(*) as count FROM notifications WHERE target_user_id IS NOT NULL"))?.count ?? 0;
  const offset = (page - 1) * limit;
  const rows = await query<any>("SELECT * FROM notifications WHERE target_user_id IS NOT NULL ORDER BY created_at DESC LIMIT ? OFFSET ?", [limit, offset]);
  return { items: rows.map(hydrateNotification), total, page, limit };
}

export async function getNotificationsForUser(userId: string): Promise<Array<Notification & { read: boolean }>> {
  const rows = await query<any>(
    `SELECT n.*, CASE WHEN un.read_at IS NOT NULL THEN 1 ELSE 0 END as is_read
     FROM notifications n
     LEFT JOIN user_notifications un ON un.notification_id = n.id AND un.user_id = ?
     WHERE n.target_user_id IS NULL OR n.target_user_id = ?
     ORDER BY n.created_at DESC`,
    [userId, userId]
  );
  return rows.map((r: any) => ({
    ...hydrateNotification(r),
    read: !!r.is_read,
  }));
}

export async function markNotificationRead(userId: string, notificationId: string): Promise<void> {
  await execute(
    `INSERT IGNORE INTO user_notifications (notification_id, user_id, read_at) VALUES (?, ?, ?)`,
    [notificationId, userId, now()]
  );
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const row = await queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM notifications n
     WHERE NOT EXISTS (
       SELECT 1 FROM user_notifications un
       WHERE un.notification_id = n.id AND un.user_id = ?
     )`,
    [userId]
  );
  return row?.count ?? 0;
}

// ---------------------------------------------------------------------------
// Channel bans
// ---------------------------------------------------------------------------

export async function banChannel(channelId: string, bannedBy: string, reason?: string): Promise<void> {
  const id = `cb_${nanoid(10)}`;
  await execute(
    `INSERT INTO channel_bans (id, channel_id, banned_by, reason, created_at) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE banned_by = VALUES(banned_by), reason = VALUES(reason), created_at = VALUES(created_at)`,
    [id, channelId, bannedBy, reason || null, now()]
  );
  logAuditAction(bannedBy, "channel.ban", "channel", channelId, reason);
}

export async function unbanChannel(channelId: string, unbannedBy: string): Promise<void> {
  await execute("DELETE FROM channel_bans WHERE channel_id = ?", [channelId]);
  logAuditAction(unbannedBy, "channel.unban", "channel", channelId, "解除封禁");
}

export async function isChannelBanned(channelId: string): Promise<{ banned: boolean; reason?: string }> {
  const row = await queryOne<{ channel_id: string; reason: string | null }>(
    "SELECT channel_id, reason FROM channel_bans WHERE channel_id = ?",
    [channelId]
  );
  if (!row) return { banned: false };
  return { banned: true, reason: row.reason ?? undefined };
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface Report {
  id: string;
  reporterId: string;
  targetType: string;
  targetId: string;
  reason: string;
  screenshotUrl?: string;
  status: string;
  result?: string;
  handledBy?: string;
  createdAt: string;
  updatedAt: string;
}

export async function createReport(reporterId: string, targetType: string, targetId: string, reason: string, screenshotUrl?: string): Promise<Report> {
  const id = nanoid();
  const ts = now();
  await execute(
    `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, screenshot_url, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [id, reporterId, targetType, targetId, reason, screenshotUrl || null, ts, ts]
  );
  return (await queryOne<Report>("SELECT * FROM reports WHERE id = ?", [id]))!;
}

export async function getReports(page = 1, limit = 20, status?: string): Promise<{ items: any[]; total: number }> {
  const conditions: string[] = [];
  const params: any[] = [];
  if (status) {
    conditions.push("r.status = ?");
    params.push(status);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const total = (await queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM reports r ${where}`, params))?.count ?? 0;
  const offset = (page - 1) * limit;
  const rows = await query<any>(
    `SELECT r.*,
      ru.display_name as reporter_name, ru.username as reporter_username, ru.avatar_url as reporter_avatar, ru.id as reporter_id,
      tu.display_name as target_name, tu.username as target_username, tu.avatar_url as target_avatar,
      rm.text as message_text, rm.created_at as message_created_at
     FROM reports r
     LEFT JOIN users ru ON ru.id = r.reporter_id
     LEFT JOIN users tu ON tu.id = r.target_id
     LEFT JOIN messages rm ON rm.id = r.target_id AND r.target_type = 'message'
     ${where}
     ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return {
    items: rows.map((r: any) => ({
      id: r.id,
      reporter_id: r.reporter_id,
      reporter_name: r.reporter_name,
      reporter_username: r.reporter_username,
      reporter_avatar: r.reporter_avatar,
      targetType: r.target_type,
      targetId: r.target_id,
      target_name: r.target_name,
      target_username: r.target_username,
      target_avatar: r.target_avatar,
      message_text: r.message_text,
      message_created_at: r.message_created_at,
      reason: r.reason,
      screenshotUrl: r.screenshot_url,
      status: r.status,
      result: r.result,
      handledBy: r.handled_by,
      created_at: r.created_at,
      updated_at: r.updated_at,
    })),
    total,
  };
}

export async function handleReport(reportId: string, status: string, result: string, handledBy: string): Promise<void> {
  const ts = now();
  await execute(
    "UPDATE reports SET status = ?, result = ?, handled_by = ?, updated_at = ? WHERE id = ?",
    [status, result, handledBy, ts, reportId]
  );
  logAuditAction(handledBy, "report.handle", "system", reportId, `${status}: ${result}`);
}

// ---------------------------------------------------------------------------
// Admin notify user via DM
// ---------------------------------------------------------------------------

export async function sendAdminNotify(userId: string, content: string, fromUserId: string): Promise<void> {
  await createNotification(fromUserId, { title: "管理员通知", content, targetUserId: userId });
  // Push to the targeted user via WS
  try {
    const { getHub } = await import("./ws.js");
    const hub = getHub();
    if (hub) {
      const notif = (await getNotificationsForUser(userId))[0];
      if (notif) hub.sendToUser(userId, { type: "notification:update", notification: notif });
    }
  } catch {}
  logAuditAction(fromUserId, "user.notify", "user", userId, `管理员通知: ${content.slice(0, 50)}`);
}

// ---------------------------------------------------------------------------
// Sensitive words
// ---------------------------------------------------------------------------

export async function checkSensitiveWords(text: string): Promise<{ blocked: boolean; masked: string }> {
  const rows = await query<{ word: string; policy: string }>("SELECT word, policy FROM sensitive_words");
  let masked = text;
  for (const r of rows) {
    if (masked.toLowerCase().includes(r.word.toLowerCase())) {
      if (r.policy === "block") {
        return { blocked: true, masked: text };
      }
      // mask: replace with asterisks
      const regex = new RegExp(r.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      masked = masked.replace(regex, (match) => "*".repeat(match.length));
    }
  }
  return { blocked: false, masked };
}

export async function getSensitiveWords(opts: {
  page?: number; pageSize?: number; search?: string; policy?: string;
}): Promise<{ items: SensitiveWord[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 50));
  const offset = (page - 1) * pageSize;
  const conditions: string[] = [];
  const params: any[] = [];
  if (opts.search) { conditions.push("word LIKE ?"); params.push(`%${opts.search}%`); }
  if (opts.policy) { conditions.push("policy = ?"); params.push(opts.policy); }
  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const total = (await queryOne<{ c: number }>(`SELECT COUNT(*) AS c FROM sensitive_words ${where}`, params))?.c ?? 0;
  const rows = await query<any>(`SELECT * FROM sensitive_words ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
  return { items: rows.map((r: any) => ({ id: r.id, word: r.word, policy: r.policy, createdBy: r.created_by, createdAt: r.created_at })), total };
}

export async function addSensitiveWords(words: { word: string; policy: string }[], createdBy: string): Promise<void> {
  for (const w of words) {
    const id = `sw_${nanoid(12)}`;
    await execute("INSERT INTO sensitive_words (id, word, policy, created_by, created_at) VALUES (?, ?, ?, ?, ?)",
      [id, w.word, w.policy, createdBy, now()]);
  }
}

export async function deleteSensitiveWords(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  await execute(`DELETE FROM sensitive_words WHERE id IN (${placeholders})`, ids);
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

export async function getOrganizations(): Promise<Organization[]> {
  const rows = await query<any>("SELECT * FROM organizations ORDER BY name ASC");
  return rows.map((r: any) => ({
    id: r.id, name: r.name, parentId: r.parent_id ?? undefined,
    description: r.description ?? "", createdAt: r.created_at,
  }));
}

export async function createOrganization(name: string, parentId: string | undefined, description: string, createdBy: string): Promise<Organization> {
  const id = `org_${nanoid(12)}`;
  await execute("INSERT INTO organizations (id, name, parent_id, description, created_at) VALUES (?, ?, ?, ?, ?)",
    [id, name, parentId ?? null, description, now()]);
  logAuditAction(createdBy, "org.create", "system", id, `创建组织: ${name}`);
  return { id, name, parentId, description, createdAt: now() };
}

export async function deleteOrganization(id: string, deletedBy: string): Promise<void> {
  await execute("UPDATE organizations SET parent_id = NULL WHERE parent_id = ?", [id]);
  await execute("UPDATE users SET organization_id = NULL, org_title = NULL WHERE organization_id = ?", [id]);
  await execute("DELETE FROM organizations WHERE id = ?", [id]);
  logAuditAction(deletedBy, "org.delete", "system", id, "删除组织");
}

export async function setUserOrganization(userId: string, orgId: string | null, title: string | null): Promise<void> {
  await execute("UPDATE users SET organization_id = ?, org_title = ? WHERE id = ?", [orgId, title, userId]);
}

export async function getOrgMembers(orgId: string): Promise<any[]> {
  return query<any>("SELECT id, display_name, username, org_title FROM users WHERE organization_id = ? ORDER BY display_name ASC", [orgId]);
}

export async function getOrgPath(orgId: string): Promise<{ id: string; name: string }[]> {
  const path: { id: string; name: string }[] = [];
  let currentId: string | null = orgId;
  while (currentId) {
    const row: any = await queryOne("SELECT id, name, parent_id FROM organizations WHERE id = ?", [currentId]);
    if (!row) break;
    path.unshift({ id: row.id, name: row.name });
    currentId = row.parent_id;
  }
  return path;
}

// ---------------------------------------------------------------------------
// OSS bindings
// ---------------------------------------------------------------------------

export async function getUserOssBindings(userId: string): Promise<OssBinding[]> {
  const rows = await query<any>("SELECT * FROM oss_bindings WHERE user_id = ? ORDER BY created_at DESC", [userId]);
  return rows.map((r: any) => ({
    id: r.id, userId: r.user_id, name: r.name, provider: r.provider,
    endpoint: r.endpoint, bucket: r.bucket, region: r.region ?? undefined,
    accessKeyId: r.access_key_id, isDefault: !!r.is_default,
    createdAt: r.created_at,
  }));
}

export async function getAllOssBindings(): Promise<OssBinding[]> {
  const rows = await query<any>("SELECT * FROM oss_bindings ORDER BY created_at DESC");
  return rows.map((r: any) => ({
    id: r.id, userId: r.user_id, name: r.name, provider: r.provider,
    endpoint: r.endpoint, bucket: r.bucket, region: r.region ?? undefined,
    accessKeyId: r.access_key_id, isDefault: !!r.is_default,
    createdAt: r.created_at,
  }));
}

export async function createOssBinding(binding: {
  userId: string; name: string; provider: string; endpoint: string;
  bucket: string; region?: string; accessKeyId: string; accessKeySecret: string;
}): Promise<OssBinding> {
  const id = `oss_${nanoid(12)}`;
  await execute(
    "INSERT INTO oss_bindings (id, user_id, name, provider, endpoint, bucket, region, access_key_id, access_key_secret, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, binding.userId, binding.name, binding.provider, binding.endpoint, binding.bucket, binding.region ?? null, binding.accessKeyId, binding.accessKeySecret, false, now()]
  );
  return { id, userId: binding.userId, name: binding.name, provider: binding.provider, endpoint: binding.endpoint, bucket: binding.bucket, region: binding.region, accessKeyId: binding.accessKeyId, isDefault: false, createdAt: now() };
}

export async function deleteOssBinding(id: string): Promise<void> {
  await execute("DELETE FROM oss_bindings WHERE id = ?", [id]);
}

export async function setDefaultOssBinding(id: string): Promise<void> {
  await execute("UPDATE oss_bindings SET is_default = 0 WHERE is_default = 1");
  await execute("UPDATE oss_bindings SET is_default = 1 WHERE id = ?", [id]);
}

// ---------------------------------------------------------------------------
// Message audit
// ---------------------------------------------------------------------------

export async function getAuditMessages(opts: {
  page?: number; pageSize?: number; authorId?: string; kind?: string;
  search?: string; conversationId?: string; includeDeleted?: boolean;
}): Promise<{ items: any[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 50));
  const offset = (page - 1) * pageSize;
  const conditions: string[] = [];
  const params: any[] = [];
  if (opts.authorId) { conditions.push("m.author_id = ?"); params.push(opts.authorId); }
  if (opts.kind) { conditions.push("m.kind = ?"); params.push(opts.kind); }
  if (opts.search) { conditions.push("m.text LIKE ?"); params.push(`%${opts.search}%`); }
  if (opts.conversationId) { conditions.push("m.conversation_id = ?"); params.push(opts.conversationId); }
  if (!opts.includeDeleted) { conditions.push("m.deleted_at IS NULL"); }
  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const total = (await queryOne<{ c: number }>(`SELECT COUNT(*) AS c FROM messages m ${where}`, params))?.c ?? 0;
  const rows = await query<any>(
    `SELECT m.id, m.conversation_id, m.author_id, m.kind, m.text, m.card_id, m.reply_to_id, m.edited_at, m.created_at, m.deleted_at, m.deleted_by,
            u.display_name AS author_name, u.username AS author_username, u.avatar_url AS author_avatar_url,
            c.name AS conv_name, c.kind AS conv_kind
     FROM messages m
     LEFT JOIN users u ON u.id = m.author_id
     LEFT JOIN conversations c ON c.id = m.conversation_id
     ${where}
     ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  const msgIds = rows.map((r: any) => r.id);
  const attsMap = new Map<string, any[]>();
  if (msgIds.length > 0) {
    const ph = msgIds.map(() => "?").join(",");
    const atts = await query<any>(`SELECT * FROM attachments WHERE message_id IN (${ph})`, msgIds);
    for (const a of atts) {
      const list = attsMap.get(a.message_id) ?? [];
      list.push({ id: a.id, name: a.name, url: a.url, mimeType: a.mime_type, size: a.size, width: a.width ?? undefined, height: a.height ?? undefined, poster: a.poster ?? undefined });
      attsMap.set(a.message_id, list);
    }
  }
  const items = rows.map((r: any) => ({
    id: r.id, conversationId: r.conversation_id, authorId: r.author_id, kind: r.kind,
    text: r.text, cardId: r.card_id ?? undefined, replyToId: r.reply_to_id ?? undefined,
    editedAt: r.edited_at ?? undefined, createdAt: r.created_at, deleted: !!r.deleted_at,
    deletedBy: r.deleted_by ?? undefined,
    authorName: r.author_name ?? "未知", authorUsername: r.author_username,
    authorAvatarUrl: r.author_avatar_url ?? undefined,
    convName: r.conv_name ?? "未知会话", convKind: r.conv_kind,
    attachments: attsMap.get(r.id) ?? [],
  }));
  return { items, total };
}

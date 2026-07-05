import { t } from "@navo/shared";
import { type Request, type Response } from "express";
import { nanoid } from "nanoid";
import { store } from "./store.js";
import { query, queryOne, execute } from "./db.js";
import { translate, TARGET_LANGS } from "./translate.js";
import type { TranslationProvider } from "./translate.js";
import { requireAuth } from "./http.js";
import {
  requireAdmin,
  requirePermission,
  getAdminRole,
  grantAdminRole,
  removeAdminRole,
  logAuditAction,
  getSystemSettings,
  updateSystemSettings,
  banUser,
  unbanUser,
  isUserBanned,
  banChannel,
  unbanChannel,
  isChannelBanned,
  getDashboardStats,
  getAllUsers,
  getAllChannels,
  getAuditLogs,
  deleteUser,
  deleteChannel,
  deleteMessage,
  createNotification,
  updateNotification,
  deleteNotification,
  getAllNotifications,
  getNotification,
  getReports,
  handleReport,
  sendAdminNotify,
  getSensitiveWords,
  addSensitiveWords,
  deleteSensitiveWords,
  getOrganizations,
  createOrganization,
  deleteOrganization,
  setUserOrganization,
  getOrgMembers,
  getOrgPath,
  getPrivateNotifications,
  getUserOssBindings,
  getAllOssBindings,
  createOssBinding,
  deleteOssBinding,
  setDefaultOssBinding,
  getAuditMessages,
} from "./admin.js";
import { AI_USER_ID } from "@navo/shared";
import type {
  GrantAdminRoleRequest,
  BanUserRequest,
  UpdateSystemSettingsRequest,
  PublicUser,
} from "@navo/shared";

interface AuthedRequest extends Request {
  userId?: string;
}

export function setupAdminRoutes(app: any, getHub: () => any) {
  app.get("/api/admin/dashboard", requireAdmin, async (_req: AuthedRequest, res: Response) => {
    try {
      const stats = await getDashboardStats();
      res.json(stats);
    } catch (error) {
      console.error("Failed to get dashboard stats:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToGetStats") });
    }
  });

  app.get("/api/admin/me", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const adminRole = await getAdminRole(req.userId!);
      if (!adminRole) {
        res.status(404).json({ error: t("zh-CN", "server.notFound") });
        return;
      }
      res.json(adminRole);
    } catch (error) {
      console.error("Failed to get admin role:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToGetRole") });
    }
  });

  app.get("/api/admin/users/:userId/role", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const adminRole = await getAdminRole(userId);
      res.json(adminRole || { role: "user", permissions: [] });
    } catch (error) {
      console.error("Failed to get user role:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToGetRole") });
    }
  });

  app.get("/api/admin/users", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = req.query.search as string;
      const result = await getAllUsers(page, limit, search);
      res.json(result);
    } catch (error) {
      console.error("Failed to get users:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToGetUsers") });
    }
  });

  app.post("/api/admin/users/:userId/role", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const request: GrantAdminRoleRequest = req.body;
      const user = await store.findUserById(userId);
      if (!user) {
        res.status(404).json({ error: t("zh-CN", "server.userNotFound") });
        return;
      }
      const myRole = await getAdminRole(req.userId!);
      if (request.role === "super_admin" && myRole?.role !== "super_admin") {
        res.status(403).json({ error: t("zh-CN", "server.onlySuperAdminGrantSuperAdmin") });
        return;
      }
      const adminRole = await grantAdminRole(userId, req.userId!, request);
      res.json(adminRole);
    } catch (error) {
      console.error("Failed to grant admin role:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToGrantRole") });
    }
  });

  app.delete("/api/admin/users/:userId/role", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const targetRole = await getAdminRole(userId);
      if (targetRole?.role === "super_admin") {
        const myRole = await getAdminRole(req.userId!);
        if (myRole?.role !== "super_admin") {
          res.status(403).json({ error: t("zh-CN", "server.onlySuperAdminRevokeSuperAdmin") });
          return;
        }
      }
      await removeAdminRole(userId, req.userId!);
      res.json({ ok: true });
    } catch (error) {
      console.error("Failed to remove admin role:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToRevokeRole") });
    }
  });

  app.post("/api/admin/users/:userId/ban", requirePermission("users.ban"), async (req: AuthedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const request: BanUserRequest = req.body;
      const user = await store.findUserById(userId);
      if (!user) {
        res.status(404).json({ error: t("zh-CN", "server.userNotFound") });
        return;
      }
      const targetRole = await getAdminRole(userId);
      if (targetRole?.role === "super_admin") {
        res.status(403).json({ error: t("zh-CN", "server.cannotBlockSuperAdmin") });
        return;
      }
      await banUser(userId, req.userId!, request);
      res.json({ ok: true });
      const hub = getHub();
      if (hub) hub.notifyUserBanned(userId, request.reason);
    } catch (error) {
      console.error("Failed to ban user:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToBan") });
    }
  });

  app.post("/api/admin/users/:userId/unban", requirePermission("users.ban"), async (req: AuthedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      await unbanUser(userId, req.userId!);
      res.json({ ok: true });
    } catch (error) {
      console.error("Failed to unban user:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToUnban") });
    }
  });

  app.get("/api/admin/users/:userId/ban-status", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const banStatus = await isUserBanned(userId);
      res.json(banStatus);
    } catch (error) {
      console.error("Failed to check ban status:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToCheckBan") });
    }
  });

  app.delete("/api/admin/users/:userId", requirePermission("users.delete"), async (req: AuthedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const user = await store.findUserById(userId);
      if (!user) {
        res.status(404).json({ error: t("zh-CN", "server.userNotFound") });
        return;
      }
      const targetRole = await getAdminRole(userId);
      if (targetRole?.role === "super_admin") {
        res.status(403).json({ error: t("zh-CN", "server.cannotDeleteSuperAdmin") });
        return;
      }
      const friendships = await store.friendshipsFor(userId);
      const friendIds = friendships.filter((f) => f.status === "accepted").map((f) => f.userId);
      const userConversations = await store.conversationsForUser(userId);
      const dmConversations = userConversations.filter((c) => c.kind === "dm");

      await deleteUser(userId, req.userId!);
      res.json({ ok: true });

      const hub = getHub();
      if (hub) {
        for (const fid of friendIds) {
          hub.fanout([fid], { type: "friend:remove", userId });
        }
        for (const conv of dmConversations) {
          for (const mid of conv.memberIds) {
            if (mid !== userId) hub.notifyConversationRemove(mid, conv.id);
          }
        }
      }
    } catch (error) {
      console.error("Failed to delete user:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToDeleteUser") });
    }
  });

  app.get("/api/admin/channels", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = req.query.search as string;
      const result = await getAllChannels(page, limit, search);
      res.json(result);
    } catch (error) {
      console.error("Failed to get channels:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToGetChannels") });
    }
  });

  app.get("/api/admin/channels/:channelId", requirePermission("channels.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const channel = await store.findConversation(req.params.channelId);
      if (!channel) {
        res.status(404).json({ error: t("zh-CN", "server.channelNotFound") });
        return;
      }
      // Include full user data for all members
      const memberUsers: PublicUser[] = [];
      for (const uid of channel.memberIds) {
        const row = await store.findUserById(uid);
        if (row) memberUsers.push(store.publicUser(row));
      }
      res.json({ ...channel, memberUsers, members: (channel.members ?? []).map((m) => ({ ...m, user: memberUsers.find((u) => u.id === m.userId) })) });
    } catch (error) {
      console.error("Failed to get channel:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToGetChannels") });
    }
  });

  app.delete("/api/admin/channels/:channelId", requirePermission("channels.delete"), async (req: AuthedRequest, res: Response) => {
    try {
      const { channelId } = req.params;
      const channel = await store.findConversation(channelId);
      if (!channel) {
        res.status(404).json({ error: t("zh-CN", "server.channelNotFound") });
        return;
      }
      const memberIds = channel.memberIds ?? [];
      await deleteChannel(channelId, req.userId!);
      res.json({ ok: true });
      const hub = getHub();
      if (hub) {
        for (const uid of memberIds) hub.notifyConversationRemove(uid, channelId);
      }
    } catch (error) {
      console.error("Failed to delete channel:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToDeleteChannel") });
    }
  });

  app.delete("/api/admin/messages/:messageId", requirePermission("messages.delete"), async (req: AuthedRequest, res: Response) => {
    try {
      const { messageId } = req.params;
      const message = await store.findMessage(messageId);
      if (!message) {
        res.status(404).json({ error: t("zh-CN", "server.messageNotFound") });
        return;
      }
      await deleteMessage(messageId, req.userId!);
      res.json({ ok: true });
    } catch (error) {
      console.error("Failed to delete message:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToDeleteMessage") });
    }
  });

  app.get("/api/admin/settings", requirePermission("settings.manage"), async (_req: AuthedRequest, res: Response) => {
    try {
      const settings = await getSystemSettings();
      res.json(settings);
    } catch (error) {
      console.error("Failed to get settings:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToGetSettings") });
    }
  });

  app.put("/api/admin/settings", requirePermission("settings.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const request: UpdateSystemSettingsRequest = req.body;
      const settings = await updateSystemSettings(request);
      logAuditAction(req.userId!, "settings.update", "system", undefined, t("zh-CN", "server.auditUpdateSettings"));
      res.json(settings);
    } catch (error) {
      console.error("Failed to update settings:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToUpdateSettings") });
    }
  });

  // 验证码配置API
  app.get("/api/admin/captcha-config", requirePermission("settings.manage"), async (_req: AuthedRequest, res: Response) => {
    try {
      const settings = await getSystemSettings();
      res.json({
        enabled: settings.captchaEnabled,
        backendUrl: settings.captchaBackendUrl,
        frontendUrl: settings.captchaFrontendUrl,
        provider: settings.captchaProvider,
      });
    } catch (error) {
      console.error("Failed to get captcha config:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToGetCaptchaConfig") });
    }
  });

  app.put("/api/admin/captcha-config", requirePermission("settings.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const { enabled, backendUrl, frontendUrl, provider } = req.body;
      await updateSystemSettings({
        captchaEnabled: enabled,
        captchaBackendUrl: backendUrl,
        captchaFrontendUrl: frontendUrl,
        captchaProvider: provider,
      });
      logAuditAction(req.userId!, "settings.update", "system", undefined, t("zh-CN", "server.auditUpdateCaptchaConfig"));
      res.json({ ok: true });
    } catch (error) {
      console.error("Failed to update captcha config:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToUpdateCaptchaConfig") });
    }
  });

  // AI配置API
  app.get("/api/admin/ai-config", requirePermission("settings.manage"), async (_req: AuthedRequest, res: Response) => {
    try {
      const settings = await getSystemSettings();
      res.json({
        baseUrl: settings.aiBaseUrl,
        apiKey: settings.aiApiKey ? '***' : '',
        model: settings.aiModel,
        enabled: settings.aiEnabled,
        systemPrompt: settings.aiSystemPrompt || '',
        name: settings.aiName || 'Navo 助手',
        bio: settings.aiBio || '',
        avatarUrl: settings.aiAvatarUrl || '',
      });
    } catch (error) {
      console.error("Failed to get AI config:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToGetAiConfig") });
    }
  });

  app.put("/api/admin/ai-config", requirePermission("settings.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const { baseUrl, apiKey, model, enabled, systemPrompt, name, bio, avatarUrl } = req.body;
      const update: any = {
        aiBaseUrl: baseUrl,
        aiModel: model,
        aiEnabled: enabled,
      };
      if (apiKey && apiKey !== '***') {
        update.aiApiKey = apiKey;
      }
      if (systemPrompt !== undefined) update.aiSystemPrompt = systemPrompt;
      if (name !== undefined) update.aiName = name;
      if (bio !== undefined) update.aiBio = bio;
      if (avatarUrl !== undefined) update.aiAvatarUrl = avatarUrl;
      await updateSystemSettings(update);
      await store.ensureAiUser();
      const aiUserPatch: {
        displayName?: string;
        bio?: string;
        avatarUrl?: string;
      } = {};
      if (name !== undefined) aiUserPatch.displayName = name;
      if (bio !== undefined) aiUserPatch.bio = bio;
      if (avatarUrl !== undefined) aiUserPatch.avatarUrl = avatarUrl || undefined;
      if (Object.keys(aiUserPatch).length > 0) {
        await store.updateProfile(AI_USER_ID, aiUserPatch);
      }
      logAuditAction(req.userId!, "settings.update", "system", undefined, t("zh-CN", "server.auditUpdateAiConfig"));
      res.json({ ok: true });
    } catch (error) {
      console.error("Failed to update AI config:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToUpdateAiConfig") });
    }
  });

  app.post("/api/admin/ai-test", requirePermission("settings.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const { baseUrl, apiKey, model } = req.body;
      const start = Date.now();
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Hello" }],
          max_tokens: 10,
        }),
        signal: AbortSignal.timeout(10000),
      });
      
      const data = await response.json() as any;
      const latency = Date.now() - start;
      
      res.json({
        success: response.ok,
        latency,
        message: response.ok ? t("zh-CN", "server.aiConnectSuccess") : data.error?.message || t("zh-CN", "server.aiConnectFailed"),
      });
    } catch (error: any) {
      res.json({
        success: false,
        latency: 0,
        message: error.message || t("zh-CN", "server.aiConnectTimeout"),
      });
    }
  });

  app.get("/api/admin/audit-logs", requirePermission("audit.view"), async (req: AuthedRequest, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const filters = {
        userId: req.query.userId as string,
        action: req.query.action as string,
        targetType: req.query.targetType as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
      };
      const result = await getAuditLogs(page, limit, filters);
      res.json(result);
    } catch (error) {
      console.error("Failed to get audit logs:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToGetAuditLogs") });
    }
  });

  app.post("/api/admin/init", async (req: AuthedRequest, res: Response) => {
    try {
      const adminCount = await queryOne<{ count: number }>("SELECT COUNT(*) as count FROM admin_roles");
      if (adminCount && adminCount.count > 0) {
        res.status(400).json({ error: t("zh-CN", "server.adminAlreadyExists") });
        return;
      }
      const { userId, secret } = req.body;
      if (secret !== "navo-admin-init-2024") {
        res.status(403).json({ error: t("zh-CN", "server.adminInitKeyError") });
        return;
      }
      const user = await store.findUserById(userId);
      if (!user) {
        res.status(404).json({ error: t("zh-CN", "server.userNotFound") });
        return;
      }
      const adminRole = await grantAdminRole(userId, userId, {
        userId,
        role: "super_admin",
        note: t("zh-CN", "server.initialSuperAdmin"),
      });
      res.json(adminRole);
    } catch (error) {
      console.error("Failed to initialize admin:", error);
      res.status(500).json({ error: t("zh-CN", "server.adminInitFailed") });
    }
  });

  app.get("/api/admin/notifications", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const result = await getAllNotifications(page, limit);
      res.json(result);
    } catch (error) {
      console.error("Failed to get notifications:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToGetNotifications") });
    }
  });

  app.get("/api/admin/notifications/private", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const result = await getPrivateNotifications(page, limit);
      res.json(result);
    } catch (error) {
      console.error("Failed to get private notifications:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToGetNotifications") });
    }
  });

  app.post("/api/admin/notifications", requirePermission("settings.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const request = req.body;
      if (!request.title || !request.content) {
        res.status(400).json({ error: t("zh-CN", "server.titleContentRequired") });
        return;
      }
      const notification = await createNotification(req.userId!, request);
      res.json(notification);
    } catch (error) {
      console.error("Failed to create notification:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToCreateNotification") });
    }
  });

  app.put("/api/admin/notifications/:id", requirePermission("settings.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const notification = await updateNotification(req.params.id, req.body);
      if (!notification) {
        res.status(404).json({ error: t("zh-CN", "server.notFound") });
        return;
      }
      res.json(notification);
    } catch (error) {
      console.error("Failed to update notification:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToUpdateNotification") });
    }
  });

  app.delete("/api/admin/notifications/:id", requirePermission("settings.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const deleted = await deleteNotification(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: t("zh-CN", "server.notFound") });
        return;
      }
      const hub = getHub();
      if (hub) hub.fanoutToAll({ type: "notification:remove", notificationId: req.params.id });
      res.json({ ok: true });
    } catch (error) {
      console.error("Failed to delete notification:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToDeleteNotification") });
    }
  });

  app.post("/api/admin/notifications/:id/publish", requirePermission("settings.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const notification = await getNotification(req.params.id);
      if (!notification) {
        res.status(404).json({ error: t("zh-CN", "server.notFound") });
        return;
      }
      const hub = getHub();
      if (hub) hub.fanoutToAll({ type: "notification:new", notification });
      // 个推离线推送给所有用户
      import("./getui.js").then(({ pushToAllUsers }) => {
        void pushToAllUsers(notification.title, notification.content);
      }).catch(() => {});
      res.json({ ok: true });
    } catch (error) {
      console.error("Failed to publish notification:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToPublishNotification") });
    }
  });

  // Channel ban management
  app.post("/api/admin/channels/:channelId/ban", requirePermission("channels.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const { channelId } = req.params;
      const channel = await store.findConversation(channelId);
      if (!channel) {
        res.status(404).json({ error: t("zh-CN", "server.channelNotFound") });
        return;
      }
      const { reason } = req.body;
      await banChannel(channelId, req.userId!, reason);
      res.json({ ok: true });
    } catch (error) {
      console.error("Failed to ban channel:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToBanChannel") });
    }
  });

  app.post("/api/admin/channels/:channelId/unban", requirePermission("channels.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const { channelId } = req.params;
      await unbanChannel(channelId, req.userId!);
      res.json({ ok: true });
    } catch (error) {
      console.error("Failed to unban channel:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToUnbanChannel") });
    }
  });

  app.get("/api/admin/channels/:channelId/ban-status", requirePermission("channels.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const { channelId } = req.params;
      const banStatus = await isChannelBanned(channelId);
      res.json(banStatus);
    } catch (error) {
      console.error("Failed to check channel ban status:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToCheckChannelBan") });
    }
  });

  // ---- Reports ----
  app.get("/api/admin/reports", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const page = parseInt(String(req.query.page || "1"), 10);
      const limit = parseInt(String(req.query.limit || "20"), 10);
      const status = req.query.status as string | undefined;
      const result = await getReports(page, limit, status);
      res.json(result);
    } catch (error) {
      console.error("Failed to get reports:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToGetReports") });
    }
  });

  app.put("/api/admin/reports/:reportId", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const { reportId } = req.params;
      const { status, result: resultText } = req.body ?? {};
      if (!status || !resultText) {
        res.status(400).json({ error: t("zh-CN", "server.reportResultRequired") });
        return;
      }
      await handleReport(reportId, status, resultText, req.userId!);
      // Notify the reporter
      const report = await queryOne<any>("SELECT reporter_id FROM reports WHERE id = ?", [reportId]);
      if (report) {
        const statusLabel = status === "actioned" ? t("zh-CN", "server.reportStatusActioned") : status === "rejected" ? t("zh-CN", "server.reportStatusRejected") : t("zh-CN", "server.reportStatusReviewed");
        const { createNotification } = await import("./admin.js");
        await createNotification(
          req.userId!,
          { title: t("zh-CN", "server.reportNotificationTitle", { status: statusLabel }), content: t("zh-CN", "server.reportNotificationContent", { status: statusLabel, result: resultText }), targetUserId: report.reporter_id }
        );
        const hub = getHub();
        if (hub) {
          const updatedNotif = await import("./admin.js").then(m => m.getNotificationsForUser(report.reporter_id)).then(n => n[0]);
          if (updatedNotif) hub.sendToUser(report.reporter_id, { type: "notification:update", notification: updatedNotif });
        }
      }
      res.json({ ok: true });
    } catch (error) {
      console.error("Failed to handle report:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToHandleReport") });
    }
  });

  // Admin notify user via DM
  app.post("/api/admin/users/:userId/notify", requirePermission("users.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const { content } = req.body;
      if (!content?.trim()) { res.status(400).json({ error: t("zh-CN", "server.contentRequired") }); return; }
      await sendAdminNotify(req.params.userId, content.trim(), req.userId!);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // Set user org
  app.put("/api/admin/users/:userId/organization", requirePermission("users.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const { orgId, title } = req.body;
      await setUserOrganization(req.params.userId, orgId ?? null, title ?? null);
      logAuditAction(req.userId!, "user.update", "user", req.params.userId, t("zh-CN", "server.auditSetOrg", { orgId: orgId || "null", title: title || "null" }));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // Sensitive words
  app.get("/api/admin/sensitive-words", requirePermission("settings.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const result = await getSensitiveWords({
        page: parseInt(req.query.page as string) || 1,
        pageSize: parseInt(req.query.pageSize as string) || 50,
        search: req.query.search as string,
        policy: req.query.policy as string,
      });
      res.json(result);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post("/api/admin/sensitive-words", requirePermission("settings.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const { words, policy } = req.body;
      if (!words || !Array.isArray(words) || words.length === 0) { res.status(400).json({ error: t("zh-CN", "server.sensitiveWordsRequired") }); return; }
      const items = words.map((w: string) => ({ word: w.trim(), policy: policy || "block" }));
      await addSensitiveWords(items, req.userId!);
      logAuditAction(req.userId!, "sensitive.add", "system", undefined, t("zh-CN", "server.auditBatchAddSensitive", { count: words.length }));
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.delete("/api/admin/sensitive-words", requirePermission("settings.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: t("zh-CN", "server.idListRequired") }); return; }
      await deleteSensitiveWords(ids);
      logAuditAction(req.userId!, "sensitive.delete", "system", undefined, t("zh-CN", "server.auditBatchDeleteSensitive", { count: ids.length }));
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Organizations
  app.get("/api/admin/organizations", requirePermission("users.manage"), async (_req: AuthedRequest, res: Response) => {
    try { res.json(await getOrganizations()); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post("/api/admin/organizations", requirePermission("users.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const { name, parentId, description } = req.body;
      if (!name?.trim()) { res.status(400).json({ error: t("zh-CN", "server.orgNameRequired") }); return; }
      const org = await createOrganization(name.trim(), parentId, description || "", req.userId!);
      res.json(org);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.delete("/api/admin/organizations/:id", requirePermission("users.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      await deleteOrganization(req.params.id, req.userId!);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.get("/api/admin/organizations/:id/members", requirePermission("users.manage"), async (req: AuthedRequest, res: Response) => {
    try { res.json(await getOrgMembers(req.params.id)); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.get("/api/admin/organizations/:id/path", requirePermission("users.manage"), async (req: AuthedRequest, res: Response) => {
    try { res.json(await getOrgPath(req.params.id)); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // OSS bindings
  app.get("/api/admin/oss-bindings", requirePermission("users.manage"), async (_req: AuthedRequest, res: Response) => {
    try { res.json(await getAllOssBindings()); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.get("/api/admin/users/:userId/oss-bindings", requirePermission("users.manage"), async (req: AuthedRequest, res: Response) => {
    try { res.json(await getUserOssBindings(req.params.userId)); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.post("/api/admin/oss-bindings", requirePermission("users.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const binding = await createOssBinding({ ...req.body, userId: req.body.userId });
      res.json(binding);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.delete("/api/admin/oss-bindings/:id", requirePermission("users.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      await deleteOssBinding(req.params.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.put("/api/admin/oss-bindings/:id/default", requirePermission("users.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      await setDefaultOssBinding(req.params.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // Message audit
  app.get("/api/admin/messages", requirePermission("audit.view"), async (req: AuthedRequest, res: Response) => {
    try {
      const result = await getAuditMessages({
        page: parseInt(req.query.page as string) || 1,
        pageSize: parseInt(req.query.pageSize as string) || 50,
        authorId: req.query.authorId as string,
        kind: req.query.kind as string,
        search: req.query.search as string,
        conversationId: req.query.conversationId as string,
        includeDeleted: req.query.includeDeleted === "true",
      });
      res.json(result);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // ICE servers
  app.get("/api/admin/ice-config", requirePermission("settings.manage"), async (_req: AuthedRequest, res: Response) => {
    try {
      const settings = await getSystemSettings();
      const parseJsonArray = (s: string): any[] => {
        try { return JSON.parse(s); } catch { return []; }
      };
      res.json({
        stunServers: parseJsonArray(settings.iceStunUrls),
        turnServers: parseJsonArray(settings.iceTurnUrl),
      });
    } catch (error) {
      console.error("Failed to get ICE config:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToGetIceConfig") });
    }
  });

  app.put("/api/admin/ice-config", requirePermission("settings.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const { stunServers, turnServers } = req.body;
      await updateSystemSettings({
        iceStunUrls: JSON.stringify(stunServers || []),
        iceTurnUrl: JSON.stringify(turnServers || []),
      });
      logAuditAction(req.userId!, "settings.update", "system", undefined, t("zh-CN", "server.auditUpdateIceConfig"));
      res.json({ ok: true });
    } catch (error) {
      console.error("Failed to update ICE config:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToUpdateIceConfig") });
    }
  });

  // Admin channel management - bypass channel membership checks
  app.post("/api/admin/channels/:channelId/members", requirePermission("channels.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const { channelId } = req.params;
      const { userId } = req.body;
      if (!userId) {
        res.status(400).json({ error: "userId is required" });
        return;
      }
      const conv = await store.addMember(channelId, userId, req.userId!);
      if (!conv) {
        res.status(404).json({ error: t("zh-CN", "server.channelNotFound") });
        return;
      }
      logAuditAction(req.userId!, "channel.member.add", "channel" as const, channelId, t("zh-CN", "server.auditAddMember", { userId }));
      res.json(conv);
      const hub = getHub();
      if (hub) {
        hub.broadcastConversationUpdate(conv);
        hub.notifyConversationNew(userId, conv);
      }
    } catch (error) {
      console.error("Admin add channel member failed:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToAddMember") });
    }
  });

  app.post("/api/admin/channels/:channelId/transfer-owner", requirePermission("channels.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const { channelId } = req.params;
      const { userId } = req.body;
      if (!userId) {
        res.status(400).json({ error: "userId is required" });
        return;
      }
      const result = await store.setRole(channelId, req.userId!, userId, "owner");
      if (result.error) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      logAuditAction(req.userId!, "channel.owner.transfer", "channel" as const, channelId, t("zh-CN", "server.auditTransferOwner", { userId }));
      res.json(result.conversation);
      const hub = getHub();
      if (hub) {
        hub.broadcastConversationUpdate(result.conversation!);
      }
    } catch (error) {
      console.error("Admin transfer owner failed:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToTransferOwner") });
    }
  });

  // Admin: sticker pack management
  app.post("/api/admin/sticker-packs", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const { name } = req.body as { name: string };
      if (!name) { res.status(400).json({ error: t("zh-CN", "server.stickerPackNameRequired") }); return; }
      const pack = await store.createStickerPack(name, req.userId!);
      res.status(201).json(pack);
    } catch (error) {
      console.error("Admin create sticker pack failed:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToCreateStickerPack") });
    }
  });

  app.delete("/api/admin/sticker-packs/:id", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      await store.deleteStickerPack(req.params.id);
      res.json({ ok: true });
    } catch (error) {
      console.error("Admin delete sticker pack failed:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToDeleteStickerPack") });
    }
  });

  app.patch("/api/admin/sticker-packs/:id", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const { name } = req.body as { name: string };
      if (!name) { res.status(400).json({ error: t("zh-CN", "server.stickerPackNameRequired") }); return; }
      await store.updateStickerPack(req.params.id, name);
      res.json({ ok: true });
    } catch (error) {
      console.error("Admin update sticker pack failed:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToUpdateStickerPackName") });
    }
  });

  app.post("/api/admin/sticker-packs/:id/stickers", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const { name, fileUrl, mimeType } = req.body as { name: string; fileUrl: string; mimeType?: string };
      if (!name || !fileUrl) { res.status(400).json({ error: t("zh-CN", "server.missingRequiredParams") }); return; }
      const sticker = await store.addSticker(req.params.id, name, fileUrl, mimeType || "image/png");
      res.status(201).json(sticker);
    } catch (error) {
      console.error("Admin add sticker failed:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToAddSticker") });
    }
  });

  app.delete("/api/admin/sticker-packs/:id/stickers/:stickerId", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      await store.deleteSticker(req.params.stickerId);
      res.json({ ok: true });
    } catch (error) {
      console.error("Admin delete sticker failed:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToDeleteSticker") });
    }
  });

  app.patch("/api/admin/sticker-packs/:id/stickers/:stickerId", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const { name } = req.body as { name: string };
      if (!name) { res.status(400).json({ error: t("zh-CN", "server.stickerNameRequired") }); return; }
      await store.updateStickerName(req.params.stickerId, name);
      res.json({ ok: true });
    } catch (error) {
      console.error("Admin update sticker failed:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToUpdateStickerName") });
    }
  });

  // Translation config
  app.get("/api/admin/translation-config", requirePermission("settings.manage"), async (_req: AuthedRequest, res: Response) => {
    try {
      const settings = await getSystemSettings();
      res.json({
        provider: settings.translationProvider || "bing",
        deeplApiKey: settings.deeplApiKey || "",
        googleApiKey: settings.googleApiKey || "",
        bingApiKey: settings.bingApiKey || "",
      });
    } catch (error) {
      console.error("Failed to get translation config:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToGetSettings") });
    }
  });

  app.put("/api/admin/translation-config", requirePermission("settings.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const { provider, deeplApiKey, googleApiKey, bingApiKey } = req.body;
      await updateSystemSettings({ translationProvider: provider, deeplApiKey, googleApiKey, bingApiKey });
      logAuditAction(req.userId!, "settings.update", "system", undefined, "Update translation config");
      res.json({ ok: true });
    } catch (error) {
      console.error("Failed to update translation config:", error);
      res.status(500).json({ error: t("zh-CN", "server.failedToUpdateSettings") });
    }
  });

  app.post("/api/translate", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { text, targetLang } = req.body;
      if (!text || !targetLang) {
        res.status(400).json({ error: "Missing text or targetLang" });
        return;
      }
      if (!TARGET_LANGS.includes(targetLang)) {
        res.status(400).json({ error: `Unsupported target language: ${targetLang}` });
        return;
      }
      const settings = await getSystemSettings();
      const provider: TranslationProvider = (settings.translationProvider as TranslationProvider) || "bing";
      const apiKey = provider === "deepl" ? (settings.deeplApiKey || "") : provider === "google" ? (settings.googleApiKey || "") : provider === "bing" ? (settings.bingApiKey || "") : "";

      const result = await translate(text, targetLang, provider, apiKey);
      res.json({ result });
    } catch (error) {
      console.error("Translation error:", error);
      res.status(500).json({ error: (error as Error).message || "Translation failed" });
    }
  });

  // ── 个推/Getui 配置 ──

  app.get("/api/admin/getui-config", requirePermission("settings.manage"), async (_req: AuthedRequest, res: Response) => {
    try {
      const appId = await queryOne<{ value: string }>("SELECT value FROM system_settings WHERE `key`='getui_app_id'");
      const appKey = await queryOne<{ value: string }>("SELECT value FROM system_settings WHERE `key`='getui_app_key'");
      res.json({
        appId: appId?.value || "",
        appKey: appKey?.value || "",
        appSecret: "***",
        masterSecret: "***",
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get Getui config" });
    }
  });

  app.put("/api/admin/getui-config", requirePermission("settings.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const { appId, appKey, appSecret, masterSecret } = req.body;
      const now = new Date().toISOString();
      const updates: [string, string][] = [];
      if (appId !== undefined) updates.push(["getui_app_id", String(appId)]);
      if (appKey !== undefined) updates.push(["getui_app_key", String(appKey)]);
      if (appSecret !== undefined && appSecret !== "***") updates.push(["getui_app_secret", String(appSecret)]);
      if (masterSecret !== undefined && masterSecret !== "***") updates.push(["getui_master_secret", String(masterSecret)]);
      for (const [k, v] of updates) {
        await execute("INSERT INTO system_settings (`key`, value, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value=VALUES(value), updated_at=VALUES(updated_at)", [k, v, now]);
      }
      const { clearGetuiTokenCache } = await import("./getui.js");
      clearGetuiTokenCache();
      logAuditAction(req.userId!, "settings.update", "system", undefined, "Updated Getui config");
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update Getui config" });
    }
  });

  app.post("/api/admin/getui-test", requirePermission("settings.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const { pushToUsers } = await import("./getui.js");
      const result = await pushToUsers([req.userId!], "这是一条测试推送消息，如果收到则说明推送配置正确。", "test", "test_push_" + Date.now());
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message || "Test push failed" });
    }
  });

  app.get("/api/admin/push-tokens", requirePermission("settings.manage"), async (_req: AuthedRequest, res: Response) => {
    try {
      const { query } = await import("./db.js");
      const rows = await query<any>(
        `SELECT pt.user_id, pt.token, pt.created_at, u.username, u.display_name
         FROM push_tokens pt
         LEFT JOIN users u ON u.id = pt.user_id
         WHERE pt.provider='getui'
         ORDER BY pt.created_at DESC`
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Failed to get push tokens" });
    }
  });

  // ── 短信服务配置 ──

  app.get("/api/admin/sms-config", requirePermission("settings.manage"), async (_req: AuthedRequest, res: Response) => {
    try {
      const rows = await query<{ key: string; value: string }>(
        `SELECT \`key\`, value FROM system_settings WHERE \`key\` LIKE 'sms_%'`
      );
      const s: Record<string, string> = {};
      for (const r of rows) s[r.key] = r.value;
      res.json({
        provider: s.sms_provider || "none",
        sdkAppId: s.sms_sdk_app_id || "",
        accessKeyId: s.sms_access_key_id || "",
        accessKeySecret: s.sms_access_key_secret ? "***" : "",
        signName: s.sms_sign_name || "",
        templateCode: s.sms_template_code || "",
        region: s.sms_region || "",
        endpoint: s.sms_endpoint || "",
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get SMS config" });
    }
  });

  app.put("/api/admin/sms-config", requirePermission("settings.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const body = req.body as {
        provider?: string;
        sdkAppId?: string;
        accessKeyId?: string;
        accessKeySecret?: string;
        signName?: string;
        templateCode?: string;
        region?: string;
        endpoint?: string;
      };
      const now = new Date().toISOString();
      const updates: [string, string][] = [];
      if (body.provider !== undefined) updates.push(["sms_provider", String(body.provider)]);
      if (body.sdkAppId !== undefined) updates.push(["sms_sdk_app_id", String(body.sdkAppId)]);
      if (body.accessKeyId !== undefined) updates.push(["sms_access_key_id", String(body.accessKeyId)]);
      if (body.accessKeySecret !== undefined && body.accessKeySecret !== "***") {
        updates.push(["sms_access_key_secret", String(body.accessKeySecret)]);
      }
      if (body.signName !== undefined) updates.push(["sms_sign_name", String(body.signName)]);
      if (body.templateCode !== undefined) updates.push(["sms_template_code", String(body.templateCode)]);
      if (body.region !== undefined) updates.push(["sms_region", String(body.region)]);
      if (body.endpoint !== undefined) updates.push(["sms_endpoint", String(body.endpoint)]);
      for (const [k, v] of updates) {
        await execute(
          "INSERT INTO system_settings (`key`, value, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value=VALUES(value), updated_at=VALUES(updated_at)",
          [k, v, now]
        );
      }
      logAuditAction(req.userId!, "settings.update", "system", undefined, "Updated SMS config");
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update SMS config" });
    }
  });

  app.post("/api/admin/sms-test", requirePermission("settings.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const { phone } = req.body as { phone?: string };
      if (!phone) {
        res.status(400).json({ error: "Phone is required" });
        return;
      }
      const { sendSmsTest } = await import("./sms.js");
      const result = await sendSmsTest(phone);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message || "Test SMS failed" });
    }
  });

  // ── 邮件 SMTP 配置 ──

  app.get("/api/admin/email-config", requirePermission("settings.manage"), async (_req: AuthedRequest, res: Response) => {
    try {
      const rows = await query<{ key: string; value: string }>(
        `SELECT \`key\`, value FROM system_settings WHERE \`key\` LIKE 'smtp_%'`
      );
      const s: Record<string, string> = {};
      for (const r of rows) s[r.key] = r.value;
      res.json({
        host: s.smtp_host || "",
        port: parseInt(s.smtp_port || "465"),
        secure: s.smtp_secure !== "false",
        user: s.smtp_user || "",
        password: s.smtp_pass ? "***" : "",
        fromName: s.smtp_from_name || "",
        fromEmail: s.smtp_from_email || "",
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get email config" });
    }
  });

  app.put("/api/admin/email-config", requirePermission("settings.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const body = req.body as {
        host?: string;
        port?: number;
        secure?: boolean;
        user?: string;
        password?: string;
        fromName?: string;
        fromEmail?: string;
      };
      const now = new Date().toISOString();
      const updates: [string, string][] = [];
      if (body.host !== undefined) updates.push(["smtp_host", String(body.host)]);
      if (body.port !== undefined) updates.push(["smtp_port", String(body.port)]);
      if (body.secure !== undefined) updates.push(["smtp_secure", String(body.secure)]);
      if (body.user !== undefined) updates.push(["smtp_user", String(body.user)]);
      if (body.password !== undefined && body.password !== "***") {
        updates.push(["smtp_pass", String(body.password)]);
      }
      if (body.fromName !== undefined) updates.push(["smtp_from_name", String(body.fromName)]);
      if (body.fromEmail !== undefined) updates.push(["smtp_from_email", String(body.fromEmail)]);
      for (const [k, v] of updates) {
        await execute(
          "INSERT INTO system_settings (`key`, value, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value=VALUES(value), updated_at=VALUES(updated_at)",
          [k, v, now]
        );
      }
      const { reloadTransporter } = await import("./email.js");
      reloadTransporter();
      logAuditAction(req.userId!, "settings.update", "system", undefined, "Updated SMTP config");
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update email config" });
    }
  });

  app.post("/api/admin/email-test", requirePermission("settings.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const { email } = req.body as { email?: string };
      if (!email) {
        res.status(400).json({ error: "Email is required" });
        return;
      }
      const { sendEmail } = await import("./email.js");
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const ok = await sendEmail(email, "register_code", { code });
      if (ok) {
        res.json({ ok: true });
      } else {
        res.status(500).json({ ok: false, error: "Send failed" });
      }
    } catch (error) {
      res.status(500).json({ ok: false, error: (error as Error).message || "Test email failed" });
    }
  });

  // ── NSFW 图片审核配置 ──

  app.get("/api/admin/nsfw-config", requirePermission("settings.manage"), async (_req: AuthedRequest, res: Response) => {
    try {
      const rows = await query<{ key: string; value: string }>(
        `SELECT \`key\`, value FROM system_settings WHERE \`key\` IN ('nsfwEnabled', 'nsfwThreshold', 'nsfwApiUrl')`
      );
      const s: Record<string, string> = {};
      for (const r of rows) s[r.key] = r.value;
      res.json({
        nsfwEnabled: s.nsfwEnabled === "true",
        nsfwThreshold: parseFloat(s.nsfwThreshold || "0.6"),
        nsfwApiUrl: s.nsfwApiUrl || "",
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get NSFW config" });
    }
  });

  app.put("/api/admin/nsfw-config", requirePermission("settings.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const body = req.body as { nsfwEnabled?: boolean; nsfwThreshold?: number; nsfwApiUrl?: string };
      const now = new Date().toISOString();
      const updates: [string, string][] = [];
      if (body.nsfwEnabled !== undefined) updates.push(["nsfwEnabled", String(body.nsfwEnabled)]);
      if (body.nsfwThreshold !== undefined) {
        const v = Math.max(0, Math.min(1, body.nsfwThreshold));
        updates.push(["nsfwThreshold", String(v)]);
      }
      if (body.nsfwApiUrl !== undefined) updates.push(["nsfwApiUrl", body.nsfwApiUrl]);
      for (const [k, v] of updates) {
        await execute(
          "INSERT INTO system_settings (`key`, value, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value=VALUES(value), updated_at=VALUES(updated_at)",
          [k, v, now]
        );
      }
      // 清空 nsfw 模块缓存
      try { const { reloadNsfwConfig } = await import("./nsfw.js"); reloadNsfwConfig(); } catch {}
      logAuditAction(req.userId!, "settings.update", "system", undefined, "Updated NSFW config");
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update NSFW config" });
    }
  });

  // ── SSO 单点登录配置 ──

  app.get("/api/admin/sso-config", requirePermission("settings.manage"), async (_req: AuthedRequest, res: Response) => {
    try {
      const rows = await query<{ key: string; value: string }>(
        `SELECT \`key\`, value FROM system_settings WHERE \`key\` IN ('ssoEnabled', 'ssoCompanyName', 'ssoCompanyFormalName', 'ssoIconUrl', 'ssoAuthorizationEndpoint', 'ssoTokenEndpoint', 'ssoUserInfoEndpoint', 'ssoClientId', 'ssoClientSecret', 'ssoScopes')`
      );
      const s: Record<string, string> = {};
      for (const r of rows) s[r.key] = r.value;
      res.json({
        ssoEnabled: s.ssoEnabled === "true",
        ssoCompanyName: s.ssoCompanyName || "",
        ssoCompanyFormalName: s.ssoCompanyFormalName || "",
        ssoIconUrl: s.ssoIconUrl || "",
        ssoAuthorizationEndpoint: s.ssoAuthorizationEndpoint || "",
        ssoTokenEndpoint: s.ssoTokenEndpoint || "",
        ssoUserInfoEndpoint: s.ssoUserInfoEndpoint || "",
        ssoClientId: s.ssoClientId || "",
        ssoClientSecret: s.ssoClientSecret ? "***" : "",
        ssoScopes: s.ssoScopes || "openid profile email",
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get SSO config" });
    }
  });

  app.put("/api/admin/sso-config", requirePermission("settings.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const body = req.body as {
        ssoEnabled?: boolean;
        ssoCompanyName?: string;
        ssoCompanyFormalName?: string;
        ssoIconUrl?: string;
        ssoAuthorizationEndpoint?: string;
        ssoTokenEndpoint?: string;
        ssoUserInfoEndpoint?: string;
        ssoClientId?: string;
        ssoClientSecret?: string;
        ssoScopes?: string;
      };
      const now = new Date().toISOString();
      const updates: [string, string][] = [];
      if (body.ssoEnabled !== undefined) updates.push(["ssoEnabled", String(body.ssoEnabled)]);
      if (body.ssoCompanyName !== undefined) updates.push(["ssoCompanyName", String(body.ssoCompanyName)]);
      if (body.ssoCompanyFormalName !== undefined) updates.push(["ssoCompanyFormalName", String(body.ssoCompanyFormalName)]);
      if (body.ssoIconUrl !== undefined) updates.push(["ssoIconUrl", String(body.ssoIconUrl)]);
      if (body.ssoAuthorizationEndpoint !== undefined) updates.push(["ssoAuthorizationEndpoint", String(body.ssoAuthorizationEndpoint)]);
      if (body.ssoTokenEndpoint !== undefined) updates.push(["ssoTokenEndpoint", String(body.ssoTokenEndpoint)]);
      if (body.ssoUserInfoEndpoint !== undefined) updates.push(["ssoUserInfoEndpoint", String(body.ssoUserInfoEndpoint)]);
      if (body.ssoClientId !== undefined) updates.push(["ssoClientId", String(body.ssoClientId)]);
      if (body.ssoClientSecret !== undefined && body.ssoClientSecret !== "***") {
        updates.push(["ssoClientSecret", String(body.ssoClientSecret)]);
      }
      if (body.ssoScopes !== undefined) updates.push(["ssoScopes", String(body.ssoScopes)]);
      for (const [k, v] of updates) {
        await execute(
          "INSERT INTO system_settings (`key`, value, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value=VALUES(value), updated_at=VALUES(updated_at)",
          [k, v, now]
        );
      }
      logAuditAction(req.userId!, "settings.update", "system", undefined, "Updated SSO config");
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update SSO config" });
    }
  });

  // ── 邮箱白名单管理 ──

  app.get("/api/admin/email-whitelist", requirePermission("settings.manage"), async (_req: AuthedRequest, res: Response) => {
    try {
      const rows = await query<{ id: string; pattern: string; note: string | null; created_at: string }>(
        "SELECT id, pattern, note, created_at FROM email_whitelist ORDER BY created_at DESC",
      );
      res.json({ entries: rows });
    } catch (error) {
      res.status(500).json({ error: "Failed to get email whitelist" });
    }
  });

  app.post("/api/admin/email-whitelist", requirePermission("settings.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const { pattern, note } = req.body as { pattern?: string; note?: string };
      if (!pattern || !pattern.trim()) {
        res.status(400).json({ error: "Pattern is required" });
        return;
      }
      const normalized = pattern.trim().toLowerCase();
      const id = nanoid();
      const ts = new Date().toISOString();
      await execute(
        "INSERT INTO email_whitelist (id, pattern, note, created_by, created_at) VALUES (?, ?, ?, ?, ?)",
        [id, normalized, note?.trim() || null, req.userId!, ts],
      );
      logAuditAction(req.userId!, "settings.update", "system", undefined, `Added email whitelist: ${normalized}`);
      res.status(201).json({ id, pattern: normalized, note: note?.trim() || null, created_at: ts });
    } catch (error) {
      res.status(500).json({ error: "Failed to add email whitelist" });
    }
  });

  app.delete("/api/admin/email-whitelist/:id", requirePermission("settings.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const { id } = req.params;
      await execute("DELETE FROM email_whitelist WHERE id = ?", [id]);
      logAuditAction(req.userId!, "settings.update", "system", undefined, `Removed email whitelist: ${id}`);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove email whitelist" });
    }
  });

  // ── 手机号白名单管理 ──

  app.get("/api/admin/phone-whitelist", requirePermission("settings.manage"), async (_req: AuthedRequest, res: Response) => {
    try {
      const rows = await query<{ id: string; pattern: string; note: string | null; created_at: string }>(
        "SELECT id, pattern, note, created_at FROM phone_whitelist ORDER BY created_at DESC",
      );
      res.json({ entries: rows });
    } catch (error) {
      res.status(500).json({ error: "Failed to get phone whitelist" });
    }
  });

  app.post("/api/admin/phone-whitelist", requirePermission("settings.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const { pattern, note } = req.body as { pattern?: string; note?: string };
      if (!pattern || !pattern.trim()) {
        res.status(400).json({ error: "Pattern is required" });
        return;
      }
      const id = nanoid();
      const ts = new Date().toISOString();
      await execute(
        "INSERT INTO phone_whitelist (id, pattern, note, created_by, created_at) VALUES (?, ?, ?, ?, ?)",
        [id, pattern.trim(), note?.trim() || null, req.userId!, ts],
      );
      logAuditAction(req.userId!, "settings.update", "system", undefined, `Added phone whitelist: ${pattern.trim()}`);
      res.status(201).json({ id, pattern: pattern.trim(), note: note?.trim() || null, created_at: ts });
    } catch (error) {
      res.status(500).json({ error: "Failed to add phone whitelist" });
    }
  });

  app.delete("/api/admin/phone-whitelist/:id", requirePermission("settings.manage"), async (req: AuthedRequest, res: Response) => {
    try {
      const { id } = req.params;
      await execute("DELETE FROM phone_whitelist WHERE id = ?", [id]);
      logAuditAction(req.userId!, "settings.update", "system", undefined, `Removed phone whitelist: ${id}`);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove phone whitelist" });
    }
  });
}

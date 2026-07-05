import type {
  Attachment,
  AuthResponse,
  BootstrapData,
  ChangePasswordRequest,
  ChannelRole,
  Conversation,
  CreateChannelRequest,
  CreateDMRequest,
  DeleteAccountRequest,
  Friendship,
  Gender,
  ID,
  LoginRequest,
  Message,
  PublicUser,
  RegisterRequest,
  UpdateChannelRequest,
  UpdateProfileRequest,
  AdminUser,
  AuditLog,
  SystemSettings,
  AdminDashboardStats,
  GrantAdminRoleRequest,
  BanUserRequest,
  UpdateSystemSettingsRequest,
  Notification,
  NotificationWithRead,
  CreateNotificationRequest,
  UpdateNotificationRequest,
  SetSecondPasswordRequest,
  CaptchaConfig,
  AiConfig,
  IceConfig,
  TestAiRequest,
  TestAiResponse,
  Organization,
  OssBinding,
  AuditMessage,
  SensitiveWord,
  StickerPack,
  Sticker,
  SendVerificationCodeRequest,
  SendVerificationCodeResponse,
  ResetPasswordRequest,
  BindEmailRequest,
  BindPhoneRequest,
  ChangeEmailRequest,
  ChangePhoneRequest,
  UnbindEmailRequest,
  UnbindPhoneRequest,
} from "@navo/shared";
import { getT } from "./i18n";

const t = getT();

const TOKEN_KEY = "navo:im:token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function apiBase(): string {
  return import.meta.env.VITE_API_BASE ?? "";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const base = apiBase();
  const url = base ? `${base}${path}` : path;
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    let message = t("error.requestFailed", { status: res.status });
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  login: (body: LoginRequest) =>
    request<AuthResponse>("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
  register: (body: RegisterRequest) =>
    request<AuthResponse>("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),
  ssoLogin: () => request<AuthResponse>("/api/auth/sso", { method: "POST" }),
  ssoInitiate: () => request<{ authorizationUrl: string }>("/api/auth/sso/initiate", { method: "POST" }),
  sendVerificationCode: (body: SendVerificationCodeRequest) =>
    request<SendVerificationCodeResponse>("/api/auth/verification-code", { method: "POST", body: JSON.stringify(body) }),
  resetPassword: (body: ResetPasswordRequest) =>
    request<{ ok: true }>("/api/auth/reset-password", { method: "POST", body: JSON.stringify(body) }),
  me: () => request<PublicUser>("/api/me"),
  updateProfile: (body: UpdateProfileRequest) =>
    request<PublicUser>("/api/me", { method: "PATCH", body: JSON.stringify(body) }),
  changePassword: (body: ChangePasswordRequest) =>
    request<{ ok: true }>("/api/me/password", { method: "POST", body: JSON.stringify(body) }),
  bindEmail: (body: BindEmailRequest) =>
    request<{ ok: true; user: PublicUser }>("/api/me/email/bind", { method: "POST", body: JSON.stringify(body) }),
  changeEmail: (body: ChangeEmailRequest) =>
    request<{ ok: true; user: PublicUser }>("/api/me/email/change", { method: "POST", body: JSON.stringify(body) }),
  unbindEmail: (body: UnbindEmailRequest) =>
    request<{ ok: true; user: PublicUser }>("/api/me/email", { method: "DELETE", body: JSON.stringify(body) }),
  bindPhone: (body: BindPhoneRequest) =>
    request<{ ok: true; user: PublicUser }>("/api/me/phone/bind", { method: "POST", body: JSON.stringify(body) }),
  changePhone: (body: ChangePhoneRequest) =>
    request<{ ok: true; user: PublicUser }>("/api/me/phone/change", { method: "POST", body: JSON.stringify(body) }),
  unbindPhone: (body: UnbindPhoneRequest) =>
    request<{ ok: true; user: PublicUser }>("/api/me/phone", { method: "DELETE", body: JSON.stringify(body) }),
  // E2EE 会话
  startE2eeSession: (body: { conversationId: string; peerId: string; sessionId: string }) =>
    request<{ ok: true }>("/api/me/e2ee/sessions", { method: "POST", body: JSON.stringify(body) }),
  endE2eeSession: (body: { conversationId: string; sessionId: string; reason: string }) =>
    request<{ ok: true }>(`/api/me/e2ee/sessions/${body.conversationId}`, {
      method: "DELETE",
      body: JSON.stringify({ sessionId: body.sessionId, reason: body.reason }),
    }),
  // E2EE 预密钥包
  uploadE2eePrekey: (body: {
    identityKey: string;
    signedPreKey: string;
    signedPreKeySig: string;
    oneTimePreKeys: string[];
  }) => request<{ ok: true; uploadedOpk: number }>("/api/me/e2ee/prekey", {
    method: "PUT",
    body: JSON.stringify(body),
  }),
  getUserE2eePrekey: (userId: string) => request<{
    identityKey: string;
    signedPreKey: string;
    signedPreKeySig: string;
    oneTimePreKey: string | null;
    oneTimePreKeyId: number | null;
  } | null>(`/api/users/${userId}/e2ee/prekey`),
  deleteAccount: (body: DeleteAccountRequest) =>
    request<{ ok: true }>("/api/me", { method: "DELETE", body: JSON.stringify(body) }),
  // 二次密码相关
  setSecondPassword: (body: SetSecondPasswordRequest) =>
    request<{ ok: true }>("/api/me/second-password", { method: "POST", body: JSON.stringify(body) }),
  removeSecondPassword: (captchaToken?: string) =>
    request<{ ok: true }>("/api/me/second-password", { method: "DELETE", body: JSON.stringify({ captchaToken }) }),
  getSecondPasswordStatus: () =>
    request<{ has: boolean; hint: string | null }>("/api/me/second-password"),
  verifySecondPassword: (token: string, password: string) =>
    request<{ user: PublicUser }>("/api/auth/verify-second-password", { method: "POST", body: JSON.stringify({ token, password }) }),

  bootstrap: () => request<BootstrapData>("/api/bootstrap"),
  conversations: () => request<Conversation[]>("/api/conversations"),
  getConversation: (id: ID) => request<Conversation>(`/api/conversations/${id}`),
  messages: (conversationId: ID) =>
    request<Message[]>(`/api/conversations/${conversationId}/messages`),
  /**
   * Cursor-based paginated history. Returns at most `pageSize` messages in
   * ascending chronological order along with a `hasMore` flag indicating
   * whether earlier messages still exist before the returned page.
   *
   * - First page: omit `before` to fetch the most recent `pageSize` messages.
   * - Older pages: pass the ISO `createdAt` of the *oldest* currently-loaded
   *   message as `before` to fetch the next batch of strictly older messages.
   */
  messagesPage: (
    conversationId: ID,
    opts: { before?: string; pageSize?: number } = {},
  ) => {
    const params = new URLSearchParams();
    params.set("pageSize", String(opts.pageSize ?? 20));
    if (opts.before) params.set("before", opts.before);
    return request<{ items: Message[]; hasMore: boolean; total: number; pageSize: number }>(
      `/api/conversations/${conversationId}/messages?${params.toString()}`,
    );
  },
  /** Pull every message strictly newer than `since` (offline catch-up). */
  messagesSince: (conversationId: ID, since: string) =>
    request<{ items: Message[]; hasMore: boolean; total: number; pageSize: number }>(
      `/api/conversations/${conversationId}/messages?since=${encodeURIComponent(since)}`,
    ),
  clearHistory: (conversationId: ID) =>
    request<{ ok: true }>(`/api/conversations/${conversationId}/messages`, { method: "DELETE" }),
  pollResults: (conversationId: ID) =>
    request<Record<string, { results: import("@navo/shared").PollResult[]; totalVotes: number }>>(
      `/api/conversations/${conversationId}/poll-results`,
    ),

  getConversationBanStatus: (conversationId: ID) =>
    request<{ banned: boolean; reason?: string; type: "user" | "channel" }>(
      `/api/conversations/${conversationId}/ban-status`,
    ),

  searchMessages: (conversationId: ID, params: { q?: string; kind?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.kind) query.set("kind", params.kind);
    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    return request<{ items: any[]; total: number }>(
      `/api/conversations/${conversationId}/messages/search?${query.toString()}`,
    );
  },

  pinMessage: (conversationId: ID, messageId: ID) =>
    request<{ ok: true }>(`/api/conversations/${conversationId}/pin`, {
      method: "POST", body: JSON.stringify({ messageId }),
    }),

  unpinMessage: (conversationId: ID, messageId: ID) =>
    request<{ ok: true }>(`/api/conversations/${conversationId}/pin/${messageId}`, { method: "DELETE" }),

  getPinnedMessages: (conversationId: ID) =>
    request<{ items: Message[] }>(`/api/conversations/${conversationId}/pins`),

  getForwardedMessages: (forwardId: ID) =>
    request<{
      id: string; sourceConvId: string; sourceConvName: string; sourceConvKind: string;
      title: string; createdAt: string;
      items: Array<{
        messageId: string; authorId: string; authorName: string; kind: string;
        text: string; attachments: Attachment[]; createdAt: string;
      }>;
    }>(`/api/forwarded/${forwardId}`),

  createChannel: (body: CreateChannelRequest) =>
    request<Conversation>("/api/channels", { method: "POST", body: JSON.stringify(body) }),
  updateChannel: (channelId: ID, body: UpdateChannelRequest) =>
    request<Conversation>(`/api/channels/${channelId}`, { method: "PATCH", body: JSON.stringify(body) }),
  getPublicChannels: (search?: string) =>
    request<any[]>(`/api/channels/public${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  createDM: (body: CreateDMRequest) =>
    request<Conversation>("/api/dms", { method: "POST", body: JSON.stringify(body) }),

  addMember: (channelId: ID, userId: ID) =>
    request<Conversation>(`/api/channels/${channelId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),
  removeMember: (channelId: ID, userId: ID) =>
    request<Conversation>(`/api/channels/${channelId}/members/${userId}`, { method: "DELETE" }),
  setRole: (channelId: ID, userId: ID, role: ChannelRole) =>
    request<Conversation>(`/api/channels/${channelId}/role`, {
      method: "POST",
      body: JSON.stringify({ userId, role }),
    }),
  setMuted: (channelId: ID, userId: ID, muted: boolean) =>
    request<Conversation>(`/api/channels/${channelId}/mute`, {
      method: "POST",
      body: JSON.stringify({ userId, muted }),
    }),
  setBanned: (channelId: ID, userId: ID, banned: boolean) =>
    request<Conversation>(`/api/channels/${channelId}/ban`, {
      method: "POST",
      body: JSON.stringify({ userId, banned }),
    }),
  /** Voluntary leave (non-owner only). */
  leaveChannel: (channelId: ID) =>
    request<{ ok: true }>(`/api/channels/${channelId}/leave`, { method: "POST" }),
  /** Disband (owner only). Removes the channel for everyone. */
  disbandChannel: (channelId: ID) =>
    request<{ ok: true }>(`/api/channels/${channelId}`, { method: "DELETE" }),

  sendFriendRequest: (username: string, message?: string) =>
    request<{ status: "pending" | "accepted" }>("/api/friends/request", {
      method: "POST",
      body: JSON.stringify({ username, message }),
    }),
  searchUsers: (q: string) =>
    request<PublicUser[]>("/api/users/search?q=" + encodeURIComponent(q)),
  acceptFriendRequest: (requestId: ID) =>
    request<{ ok: true }>(`/api/friends/requests/${requestId}/accept`, { method: "POST" }),
  declineFriendRequest: (requestId: ID) =>
    request<{ ok: true }>(`/api/friends/requests/${requestId}/decline`, { method: "POST" }),
  removeFriend: (userId: ID) =>
    request<{ ok: true }>(`/api/friends/${userId}`, { method: "DELETE" }),
  blockUser: (userId: ID) =>
    request<{ ok: true }>(`/api/friends/${userId}/block`, { method: "POST" }),
  unblockUser: (userId: ID) =>
    request<{ ok: true }>(`/api/friends/${userId}/unblock`, { method: "POST" }),
  /** Get fresh friendship state for a specific user. */
  getFriendship: (userId: ID) => request<Friendship>(`/api/friends/${userId}`),
  /** Set friend note/remark. */
  setFriendNote: (userId: ID, note: string) =>
    request<{ ok: true }>(`/api/friends/${userId}/note`, { method: "PATCH", body: JSON.stringify({ note }) }),

  /** Get sticker packs with stickers. */
  getStickerPacks: () => request<(StickerPack & { stickers: Sticker[] })[]>("/api/sticker-packs"),

  upload: async (file: File, opts?: { poster?: string; e2eeConversationId?: string }): Promise<Attachment> => {
    const fd = new FormData();
    fd.append("file", file);
    if (opts?.poster) fd.append("poster", opts.poster);
    if (opts?.e2eeConversationId) fd.append("e2eeConversationId", opts.e2eeConversationId);
    return request<Attachment>("/api/upload", { method: "POST", body: fd });
  },

  // Admin API
  admin: {
    // Dashboard
    getDashboard: () => request<AdminDashboardStats>("/api/admin/dashboard"),
    
    // Current admin role
    getMyRole: () => request<AdminUser>("/api/admin/me"),
    
    // User management
    getUsers: (params?: { page?: number; limit?: number; search?: string }) => {
      const query = new URLSearchParams();
      if (params?.page) query.set("page", String(params.page));
      if (params?.limit) query.set("limit", String(params.limit));
      if (params?.search) query.set("search", params.search);
      return request<{ users: PublicUser[]; total: number; page: number; limit: number; totalPages: number }>(
        `/api/admin/users?${query.toString()}`
      );
    },
    grantRole: (userId: ID, body: GrantAdminRoleRequest) =>
      request<AdminUser>(`/api/admin/users/${userId}/role`, { method: "POST", body: JSON.stringify(body) }),
    getUserRole: (userId: ID) =>
      request<{ role: string; permissions: string[] } | null>(`/api/admin/users/${userId}/role`),
    removeRole: (userId: ID) =>
      request<{ ok: true }>(`/api/admin/users/${userId}/role`, { method: "DELETE" }),
    banUser: (userId: ID, body: BanUserRequest) =>
      request<{ ok: true }>(`/api/admin/users/${userId}/ban`, { method: "POST", body: JSON.stringify(body) }),
    unbanUser: (userId: ID) =>
      request<{ ok: true }>(`/api/admin/users/${userId}/unban`, { method: "POST" }),
    getBanStatus: (userId: ID) =>
      request<{ banned: boolean; reason?: string; expiresAt?: string }>(`/api/admin/users/${userId}/ban-status`),
    deleteUser: (userId: ID) =>
      request<{ ok: true }>(`/api/admin/users/${userId}`, { method: "DELETE" }),
    
    // Channel management
    getChannels: (params?: { page?: number; limit?: number; search?: string }) => {
      const query = new URLSearchParams();
      if (params?.page) query.set("page", String(params.page));
      if (params?.limit) query.set("limit", String(params.limit));
      if (params?.search) query.set("search", params.search);
      return request<{ channels: any[]; total: number; page: number; limit: number; totalPages: number }>(
        `/api/admin/channels?${query.toString()}`
      );
    },
    getChannel: (channelId: ID) =>
      request<Conversation>(`/api/admin/channels/${channelId}`),
    deleteChannel: (channelId: ID) =>
      request<{ ok: true }>(`/api/admin/channels/${channelId}`, { method: "DELETE" }),
    banChannel: (channelId: ID, body: { reason?: string }) =>
      request<{ ok: true }>(`/api/admin/channels/${channelId}/ban`, { method: "POST", body: JSON.stringify(body) }),
    unbanChannel: (channelId: ID) =>
      request<{ ok: true }>(`/api/admin/channels/${channelId}/unban`, { method: "POST" }),
    getChannelBanStatus: (channelId: ID) =>
      request<{ banned: boolean; reason?: string }>(`/api/admin/channels/${channelId}/ban-status`),
    
    // Message moderation
    deleteMessage: (messageId: ID) =>
      request<{ ok: true }>(`/api/admin/messages/${messageId}`, { method: "DELETE" }),
    
    // System settings
    getSettings: () => request<SystemSettings>("/api/admin/settings"),
    updateSettings: (body: UpdateSystemSettingsRequest) =>
      request<SystemSettings>("/api/admin/settings", { method: "PUT", body: JSON.stringify(body) }),
    
    // Audit logs
    getAuditLogs: (params?: { page?: number; limit?: number; userId?: string; action?: string; targetType?: string; startDate?: string; endDate?: string }) => {
      const query = new URLSearchParams();
      if (params?.page) query.set("page", String(params.page));
      if (params?.limit) query.set("limit", String(params.limit));
      if (params?.userId) query.set("userId", params.userId);
      if (params?.action) query.set("action", params.action);
      if (params?.targetType) query.set("targetType", params.targetType);
      if (params?.startDate) query.set("startDate", params.startDate);
      if (params?.endDate) query.set("endDate", params.endDate);
      return request<{ logs: (AuditLog & { username?: string; displayName?: string })[]; total: number; page: number; limit: number; totalPages: number }>(
        `/api/admin/audit-logs?${query.toString()}`
      );
    },
    
    // Initialize first admin
    initialize: (userId: ID, secret: string) =>
      request<AdminUser>("/api/admin/init", { method: "POST", body: JSON.stringify({ userId, secret }) }),

    // Notifications
    getNotifications: (params?: { page?: number; limit?: number }) => {
      const query = new URLSearchParams();
      if (params?.page) query.set("page", String(params.page));
      if (params?.limit) query.set("limit", String(params.limit));
      return request<{ items: Notification[]; total: number; page: number; limit: number }>(
        `/api/admin/notifications?${query.toString()}`
      );
    },
    getPrivateNotifications: (params?: { page?: number; limit?: number }) => {
      const query = new URLSearchParams();
      if (params?.page) query.set("page", String(params.page));
      if (params?.limit) query.set("limit", String(params.limit));
      return request<{ items: Notification[]; total: number; page: number; limit: number }>(
        `/api/admin/notifications/private?${query.toString()}`
      );
    },
    createNotification: (body: CreateNotificationRequest) =>
      request<Notification>("/api/admin/notifications", { method: "POST", body: JSON.stringify(body) }),
    updateNotification: (id: ID, body: UpdateNotificationRequest) =>
      request<Notification>(`/api/admin/notifications/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    deleteNotification: (id: ID) =>
      request<{ ok: true }>(`/api/admin/notifications/${id}`, { method: "DELETE" }),
    publishNotification: (id: ID) =>
      request<{ ok: true }>(`/api/admin/notifications/${id}/publish`, { method: "POST" }),
    
    // Captcha config
    getCaptchaConfig: () => request<CaptchaConfig>("/api/admin/captcha-config"),
    updateCaptchaConfig: (body: CaptchaConfig) =>
      request<{ ok: true }>("/api/admin/captcha-config", { method: "PUT", body: JSON.stringify(body) }),
    
    // AI config
    getAiConfig: () => request<AiConfig>("/api/admin/ai-config"),
    updateAiConfig: (body: AiConfig) =>
      request<{ ok: true }>("/api/admin/ai-config", { method: "PUT", body: JSON.stringify(body) }),
    testAi: (body: TestAiRequest) =>
      request<TestAiResponse>("/api/admin/ai-test", { method: "POST", body: JSON.stringify(body) }),

    // Getui push config
    getGetuiConfig: () => request<{ appId: string; appKey: string; appSecret: string; masterSecret: string }>("/api/admin/getui-config"),
    updateGetuiConfig: (body: { appId?: string; appKey?: string; appSecret?: string; masterSecret?: string }) =>
      request<{ ok: true }>("/api/admin/getui-config", { method: "PUT", body: JSON.stringify(body) }),
    testGetuiPush: () => request<{ total: number; success: number; failed: { cid: string; error: string }[]; configOk: boolean; tokenError?: string }>("/api/admin/getui-test", { method: "POST" }),
    getPushTokens: () => request<{ user_id: string; token: string; created_at: string; username: string; display_name: string }[]>("/api/admin/push-tokens"),

    // SMS config
    getSmsConfig: () => request<{
      provider: "tencent" | "aliyun" | "none";
      sdkAppId: string;
      accessKeyId: string;
      accessKeySecret: string;
      signName: string;
      templateCode: string;
      region: string;
      endpoint: string;
    }>("/api/admin/sms-config"),
    updateSmsConfig: (body: {
      provider?: "tencent" | "aliyun" | "none";
      sdkAppId?: string;
      accessKeyId?: string;
      accessKeySecret?: string;
      signName?: string;
      templateCode?: string;
      region?: string;
      endpoint?: string;
    }) => request<{ ok: true }>("/api/admin/sms-config", { method: "PUT", body: JSON.stringify(body) }),
    testSms: (body: { phone: string }) =>
      request<{ ok: boolean; requestId?: string; message?: string }>("/api/admin/sms-test", { method: "POST", body: JSON.stringify(body) }),

    // Email (SMTP) config
    getEmailConfig: () => request<{
      host: string;
      port: number;
      secure: boolean;
      user: string;
      password: string;
      fromName: string;
      fromEmail: string;
    }>("/api/admin/email-config"),
    updateEmailConfig: (body: {
      host?: string;
      port?: number;
      secure?: boolean;
      user?: string;
      password?: string;
      fromName?: string;
      fromEmail?: string;
    }) => request<{ ok: true }>("/api/admin/email-config", { method: "PUT", body: JSON.stringify(body) }),
    testEmail: (body: { email: string }) =>
      request<{ ok: boolean; error?: string }>("/api/admin/email-test", { method: "POST", body: JSON.stringify(body) }),

    // NSFW config
    getNsfwConfig: () => request<{ nsfwEnabled: boolean; nsfwThreshold: number }>("/api/admin/nsfw-config"),
    updateNsfwConfig: (body: { nsfwEnabled?: boolean; nsfwThreshold?: number }) =>
      request<{ ok: true }>("/api/admin/nsfw-config", { method: "PUT", body: JSON.stringify(body) }),

    // SSO config
    getSsoConfig: () => request<{
      ssoEnabled: boolean;
      ssoCompanyName: string;
      ssoCompanyFormalName: string;
      ssoIconUrl: string;
      ssoAuthorizationEndpoint: string;
      ssoTokenEndpoint: string;
      ssoUserInfoEndpoint: string;
      ssoClientId: string;
      ssoClientSecret: string;
      ssoScopes: string;
    }>("/api/admin/sso-config"),
    updateSsoConfig: (body: {
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
    }) => request<{ ok: true }>("/api/admin/sso-config", { method: "PUT", body: JSON.stringify(body) }),

    // 邮箱白名单
    getEmailWhitelist: () => request<{ entries: Array<{ id: string; pattern: string; note: string | null; created_at: string }> }>("/api/admin/email-whitelist"),
    addEmailWhitelist: (body: { pattern: string; note?: string }) =>
      request<{ id: string; pattern: string; note: string | null; created_at: string }>("/api/admin/email-whitelist", { method: "POST", body: JSON.stringify(body) }),
    removeEmailWhitelist: (id: string) =>
      request<{ ok: true }>(`/api/admin/email-whitelist/${id}`, { method: "DELETE" }),

    // 手机号白名单
    getPhoneWhitelist: () => request<{ entries: Array<{ id: string; pattern: string; note: string | null; created_at: string }> }>("/api/admin/phone-whitelist"),
    addPhoneWhitelist: (body: { pattern: string; note?: string }) =>
      request<{ id: string; pattern: string; note: string | null; created_at: string }>("/api/admin/phone-whitelist", { method: "POST", body: JSON.stringify(body) }),
    removePhoneWhitelist: (id: string) =>
      request<{ ok: true }>(`/api/admin/phone-whitelist/${id}`, { method: "DELETE" }),

    // Reports
    getReports: (params?: { page?: number; limit?: number; status?: string }) => {
      const query = new URLSearchParams();
      if (params?.page) query.set("page", String(params.page));
      if (params?.limit) query.set("limit", String(params.limit));
      if (params?.status) query.set("status", params.status);
      return request<{ items: any[]; total: number }>(`/api/admin/reports?${query.toString()}`);
    },
    handleReport: (reportId: string, body: { status: string; result: string }) =>
      request<{ ok: true }>(`/api/admin/reports/${reportId}`, { method: "PUT", body: JSON.stringify(body) }),

    // ICE server config
    getIceConfig: () => request<IceConfig>("/api/admin/ice-config"),
    updateIceConfig: (body: IceConfig) =>
      request<{ ok: true }>("/api/admin/ice-config", { method: "PUT", body: JSON.stringify(body) }),

    // Admin notify user via DM
    notifyUser: (userId: ID, content: string) =>
      request<{ ok: true }>(`/api/admin/users/${userId}/notify`, { method: "POST", body: JSON.stringify({ content }) }),

    // User organization
    setUserOrganization: (userId: ID, orgId: string | null, title: string | null) =>
      request<{ ok: true }>(`/api/admin/users/${userId}/organization`, { method: "PUT", body: JSON.stringify({ orgId, title }) }),

    // Sensitive words
    getSensitiveWords: (params?: { page?: number; pageSize?: number; search?: string; policy?: string }) => {
      const q = new URLSearchParams();
      if (params?.page) q.set("page", String(params.page));
      if (params?.pageSize) q.set("pageSize", String(params.pageSize));
      if (params?.search) q.set("search", params.search);
      if (params?.policy) q.set("policy", params.policy);
      return request<{ items: SensitiveWord[]; total: number }>(`/api/admin/sensitive-words?${q.toString()}`);
    },
    addSensitiveWords: (words: string[], policy: string) =>
      request<{ ok: true }>("/api/admin/sensitive-words", { method: "POST", body: JSON.stringify({ words, policy }) }),
    deleteSensitiveWords: (ids: string[]) =>
      request<{ ok: true }>("/api/admin/sensitive-words", { method: "DELETE", body: JSON.stringify({ ids }) }),

    // Organizations
    getOrganizations: () => request<Organization[]>("/api/admin/organizations"),
    createOrganization: (name: string, parentId?: string, description?: string) =>
      request<Organization>("/api/admin/organizations", { method: "POST", body: JSON.stringify({ name, parentId, description }) }),
    deleteOrganization: (id: string) =>
      request<{ ok: true }>(`/api/admin/organizations/${id}`, { method: "DELETE" }),
    getOrgMembers: (id: string) =>
      request<any[]>(`/api/admin/organizations/${id}/members`),
    getOrgPath: (id: string) =>
      request<{ id: string; name: string }[]>(`/api/admin/organizations/${id}/path`),

    // OSS bindings
    getAllOssBindings: () =>
      request<OssBinding[]>("/api/admin/oss-bindings"),
    getUserOssBindings: (userId: ID) =>
      request<OssBinding[]>(`/api/admin/users/${userId}/oss-bindings`),
    createOssBinding: (body: any) =>
      request<OssBinding>("/api/admin/oss-bindings", { method: "POST", body: JSON.stringify(body) }),
    deleteOssBinding: (id: string) =>
      request<{ ok: true }>(`/api/admin/oss-bindings/${id}`, { method: "DELETE" }),
    setDefaultOssBinding: (id: string) =>
      request<{ ok: true }>(`/api/admin/oss-bindings/${id}/default`, { method: "PUT" }),

    // Message audit
    getAuditMessages: (params?: { page?: number; pageSize?: number; authorId?: string; kind?: string; search?: string; conversationId?: string; includeDeleted?: boolean }) => {
      const q = new URLSearchParams();
      if (params?.page) q.set("page", String(params.page));
      if (params?.pageSize) q.set("pageSize", String(params.pageSize));
      if (params?.authorId) q.set("authorId", params.authorId);
      if (params?.kind) q.set("kind", params.kind);
      if (params?.search) q.set("search", params.search);
      if (params?.conversationId) q.set("conversationId", params.conversationId);
      if (params?.includeDeleted) q.set("includeDeleted", "true");
      return request<{ items: AuditMessage[]; total: number }>(`/api/admin/messages?${q.toString()}`);
    },

    // Admin channel management
    addChannelMember: (channelId: ID, userId: ID) =>
      request<Conversation>(`/api/admin/channels/${channelId}/members`, { method: "POST", body: JSON.stringify({ userId }) }),
    transferChannelOwner: (channelId: ID, userId: ID) =>
      request<Conversation>(`/api/admin/channels/${channelId}/transfer-owner`, { method: "POST", body: JSON.stringify({ userId }) }),

    // Admin sticker pack management
    createStickerPack: (name: string) =>
      request<StickerPack>("/api/admin/sticker-packs", { method: "POST", body: JSON.stringify({ name }) }),
    deleteStickerPack: (id: ID) =>
      request<{ ok: true }>(`/api/admin/sticker-packs/${id}`, { method: "DELETE" }),
    addSticker: (packId: ID, name: string, fileUrl: string, mimeType?: string) =>
      request<Sticker>(`/api/admin/sticker-packs/${packId}/stickers`, { method: "POST", body: JSON.stringify({ name, fileUrl, mimeType }) }),
    deleteSticker: (packId: ID, stickerId: ID) =>
      request<{ ok: true }>(`/api/admin/sticker-packs/${packId}/stickers/${stickerId}`, { method: "DELETE" }),
    updateStickerPack: (id: ID, name: string) =>
      request<{ ok: true }>(`/api/admin/sticker-packs/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
    updateSticker: (packId: ID, stickerId: ID, name: string) =>
      request<{ ok: true }>(`/api/admin/sticker-packs/${packId}/stickers/${stickerId}`, { method: "PATCH", body: JSON.stringify({ name }) }),

    // Translation config
    getTranslationConfig: () => request<{ provider: string; deeplApiKey: string; googleApiKey: string; bingApiKey: string }>("/api/admin/translation-config"),
    updateTranslationConfig: (body: { provider: string; deeplApiKey?: string; googleApiKey?: string }) =>
      request<{ ok: true }>("/api/admin/translation-config", { method: "PUT", body: JSON.stringify(body) }),
  },

  // User notifications
  getMyNotifications: () => request<NotificationWithRead[]>("/api/notifications"),
  markNotificationRead: (id: ID) =>
    request<{ ok: true }>(`/api/notifications/${id}/read`, { method: "POST" }),

  // Reports
  submitReport: (body: { targetType: string; targetId: string; reason: string; screenshotUrl?: string; captchaToken?: string }) =>
    request<any>("/api/reports", { method: "POST", body: JSON.stringify(body) }),

  // Translation
  translate: (body: { text: string; targetLang: string }) => request<{ result: string }>("/api/translate", { method: "POST", body: JSON.stringify(body) }),
};

export type { Gender };

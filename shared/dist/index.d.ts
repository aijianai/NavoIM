export type ID = string;
export type ISODate = string;
export type PresenceStatus = "online" | "away" | "busy" | "offline";
export type Gender = "unspecified" | "male" | "female" | "other";
export interface User {
    id: ID;
    username: string;
    displayName: string;
    avatarColor: string;
    avatarUrl?: string;
    bio: string;
    gender: Gender;
    status: PresenceStatus;
    lastSeen: ISODate;
    requireFriendApproval: boolean;
    email?: string;
    phone?: string;
    organizationId?: string;
    orgTitle?: string;
    language?: string;
}
/** Public-safe user (no auth fields ever leave the server). */
export type PublicUser = User;
export type ConversationKind = "dm" | "channel";
/** Role of a member within a channel. */
export type ChannelRole = "owner" | "admin" | "member";
/** System-wide admin roles (hierarchical: super_admin > admin > moderator > user) */
export type SystemRole = "super_admin" | "admin" | "moderator" | "user";
/** Admin permission flags */
export type AdminPermission = "users.manage" | "users.ban" | "users.delete" | "channels.manage" | "channels.delete" | "messages.moderate" | "messages.delete" | "settings.manage" | "audit.view" | "roles.manage";
/** Default permissions for each role */
export declare const ROLE_PERMISSIONS: Record<SystemRole, AdminPermission[]>;
/** Admin user record */
export interface AdminUser {
    id: ID;
    userId: ID;
    role: SystemRole;
    permissions: AdminPermission[];
    grantedBy?: ID;
    grantedAt: ISODate;
    expiresAt?: ISODate;
    note?: string;
}
/** Audit log entry */
export interface AuditLog {
    id: ID;
    userId: ID;
    action: string;
    targetType: "user" | "channel" | "message" | "system";
    targetId?: ID;
    details?: string;
    ipAddress?: string;
    createdAt: ISODate;
}
/** System settings */
export interface SystemSettings {
    siteName: string;
    siteDescription: string;
    allowRegistration: boolean;
    requireInviteCode: boolean;
    inviteCode?: string;
    maxFileSize: number;
    maxMessageLength: number;
    aiEnabled: boolean;
    maintenanceMode: boolean;
    maintenanceMessage?: string;
    requireSecondPassword: boolean;
    captchaEnabled: boolean;
    captchaBackendUrl: string;
    captchaFrontendUrl: string;
    captchaProvider: 'cap-pow' | 'cloudflare' | 'none';
    aiBaseUrl: string;
    aiApiKey: string;
    aiModel: string;
    aiSystemPrompt: string;
    aiName: string;
    aiBio: string;
    aiAvatarUrl: string;
    cdnFontsGoogleCssUrl: string;
    cdnVconsoleEnabled: boolean;
    iceStunUrls: string;
    iceTurnUrl: string;
    iceTurnUsername: string;
    iceTurnCredential: string;
    translationProvider: string;
    deeplApiKey: string;
    googleApiKey: string;
    bingApiKey: string;
    rateLimitMessageCount: number;
    rateLimitMessageWindow: number;
    rateLimitLoginMax: number;
    rateLimitLoginWindow: number;
    rateLimitRegisterMax: number;
    rateLimitRegisterWindow: number;
    rateLimitMaxAccountsPerIp: number;
    /** 「你还在吗？」每用户每会话在时间窗口内最多发送次数（默认 1） */
    rateLimitPresencePingMax: number;
    /** 「你还在吗？」频率限制时间窗口（秒，默认 30） */
    rateLimitPresencePingWindow: number;
    usernameRegistrationEnabled: boolean;
    emailRegistrationEnabled: boolean;
    phoneRegistrationEnabled: boolean;
    smsProvider: 'tencent' | 'aliyun' | 'none';
    smsSdkAppId: string;
    smsAccessKeyId: string;
    smsAccessKeySecret: string;
    smsSignName: string;
    smsTemplateCode: string;
    smsRegion: string;
    smsEndpoint: string;
}
export type TranslationProvider = "deepl" | "bing" | "google" | "bingReverse";
export interface TranslationConfig {
    provider: TranslationProvider;
    deeplApiKey: string;
    googleApiKey: string;
    bingApiKey: string;
}
/** 短信服务配置（对外接口；密钥在 GET 时掩码为 ***） */
export interface SmsConfig {
    provider: 'tencent' | 'aliyun' | 'none';
    /** 腾讯云 SMS 应用 ID */
    sdkAppId: string;
    /** 阿里云 AccessKeyId / 腾讯云 SecretId */
    accessKeyId: string;
    /** 阿里云 AccessKeySecret / 腾讯云 SecretKey */
    accessKeySecret: string;
    /** 短信签名 */
    signName: string;
    /** 短信模板 ID（阿里云 TemplateCode / 腾讯云 TemplateId） */
    templateCode: string;
    /** 阿里云地域，腾讯云忽略 */
    region: string;
    /** 短信 API 接入点（可选） */
    endpoint: string;
}
/** 短信测试请求 */
export interface SmsTestRequest {
    /** 测试接收号码（含国家码） */
    phone: string;
}
export interface ConversationMember {
    userId: ID;
    role: ChannelRole;
    muted: boolean;
    banned: boolean;
    joinedAt: ISODate;
}
export interface Conversation {
    id: ID;
    kind: ConversationKind;
    /** Channel-only fields */
    name?: string;
    topic?: string;
    announcement?: string;
    isPrivate?: boolean;
    icon?: string;
    avatarUrl?: string;
    muteAll?: boolean;
    membersCanInvite?: boolean;
    /** Membership */
    memberIds: ID[];
    members?: ConversationMember[];
    ownerId?: ID;
    createdAt: ISODate;
    /** Denormalized for list rendering */
    lastMessageId?: ID;
    lastMessageAt?: ISODate;
    pinned?: {
        messageId: ID;
        pinnedBy: ID;
        pinnedAt: ISODate;
    }[];
}
export type MessageKind = "text" | "image" | "file" | "system" | "ai" | "friendCard" | "channelCard" | "location" | "forwardedCard" | "poll" | "sticker" | "voice";
export interface PollOption {
    id: string;
    text: string;
}
export interface PollData {
    question: string;
    options: PollOption[];
    anonymous: boolean;
}
export interface PollVote {
    messageId: ID;
    userId: ID;
    optionId: string;
    createdAt: ISODate;
}
export interface PollResult {
    optionId: string;
    text: string;
    count: number;
    voters: {
        userId: ID;
        displayName: string;
    }[];
}
export interface Attachment {
    id: ID;
    name: string;
    url: string;
    mimeType: string;
    size: number;
    width?: number;
    height?: number;
    /** 音视频时长（秒）。音频由服务端在上传时通过 ffmpeg 提取。 */
    duration?: number;
    /** Inline data URL (or hosted URL) of a generated thumbnail — for video,
     *  this is the first frame; for images it's omitted. */
    poster?: string;
}
export interface Reaction {
    emoji: string;
    userIds: ID[];
}
export type MessageFormat = "plain" | "markdown";
export interface Message {
    id: ID;
    conversationId: ID;
    authorId: ID;
    kind: MessageKind;
    text: string;
    attachments: Attachment[];
    reactions: Reaction[];
    /** Content rendering format. "plain" renders text without Markdown parsing;
     *  "markdown" enables full Markdown rendering. Defaults to "plain" when absent. */
    format?: MessageFormat;
    cardId?: ID;
    replyToId?: ID;
    /** Populated by the server with the replied-to message's content. */
    replyTo?: {
        id: ID;
        text: string;
        authorId: ID;
        authorName: string;
        attachments: Attachment[];
        kind: MessageKind;
        cardId?: ID;
    };
    editedAt?: ISODate;
    createdAt: ISODate;
    /** For scheduled (delayed) messages — the target delivery time. */
    scheduledAt?: ISODate;
    pending?: boolean;
    /** Set on optimistic messages whose send was rejected (e.g. blocked DM). */
    failed?: boolean;
    /** Optional human-readable reason for a failed send. */
    failedReason?: string;
    /** True for recalled/deleted messages (still visible in audit). */
    deleted?: boolean;
    /** Sticker ID for sticker messages. */
    stickerId?: ID;
    /** E2EE 会话内的消息（仅本地 IndexedDB 可见，服务器不持久化文本）。 */
    e2ee?: boolean;
    /** E2EE 文件被自动清理（仅用于占位渲染）。 */
    e2eeCleaned?: boolean;
    /** 仅本地 IndexedDB 保存的 E2EE 明文，不同步到服务器、其他设备不可见。 */
    localPlaintext?: string;
}
export interface ForwardedMessageItem {
    messageId: string;
    authorId: ID;
    authorName: string;
    kind: MessageKind;
    text: string;
    attachments?: Attachment[];
    createdAt: ISODate;
}
export interface ForwardedMessage {
    id: ID;
    sourceConvId: ID;
    title: string;
    items: ForwardedMessageItem[];
    createdAt: ISODate;
}
export type FriendStatus = "pending" | "accepted" | "blocked" | "none";
/** A directed view of a friendship row, as seen by the current user. */
export interface Friendship {
    /** The other user in the relationship. */
    userId: ID;
    status: FriendStatus;
    /** For pending: did *I* send it ("outgoing") or receive it ("incoming"). */
    direction: "incoming" | "outgoing" | "none";
    /** For blocked: did *I* block them. */
    blockedByMe: boolean;
    createdAt: ISODate;
    /** User-set note/remark for this friend. */
    note?: string;
}
export interface FriendRequest {
    id: ID;
    fromUserId: ID;
    toUserId: ID;
    message: string;
    createdAt: ISODate;
}
/** What the client receives at login bootstrap. */
export interface BootstrapData {
    me: PublicUser;
    users: PublicUser[];
    conversations: Conversation[];
    friends: Friendship[];
    friendRequests: FriendRequest[];
    readMarkers: Record<ID, ID>;
    channelReadStates: Record<ID, Record<ID, {
        lastReadAt: ISODate;
        lastReadMessageId: ID;
    }>>;
    lastMessages: Record<ID, Message>;
    notifications: NotificationWithRead[];
}
export interface LoginRequest {
    username: string;
    password: string;
    captchaToken?: string;
}
/** 注册方式：用户名 / 邮箱 / 手机号 */
export type RegisterType = 'username' | 'email' | 'phone';
export interface RegisterRequest {
    /** 注册方式，决定必填字段 */
    type?: RegisterType;
    /** 用户名（所有方式必填，用户自填） */
    username: string;
    password: string;
    displayName: string;
    /** 邮箱注册时必填 */
    email?: string;
    /** 手机号注册时必填（含国家码，如 +8613800138000） */
    phone?: string;
    /** 邮箱/手机号注册时必填，6 位验证码 */
    code?: string;
    captchaToken?: string;
    inviteCode?: string;
}
/** 发送验证码请求 */
export interface SendVerificationCodeRequest {
    /** 目标地址：邮箱或手机号 */
    target: string;
    /** 目标类型 */
    type: 'email' | 'phone';
    /** 用途 */
    purpose: 'register' | 'bind_email' | 'bind_phone' | 'change_email' | 'change_phone' | 'reset_password';
    /** 人机验证 token：开启 captcha 时必填 */
    captchaToken?: string;
}
/** 发送验证码响应 */
export interface SendVerificationCodeResponse {
    ok: boolean;
    /** 验证码 TTL（秒） */
    ttl: number;
    /** 调试模式：在开发环境，配置缺失时直接返回生成的验证码 */
    debugCode?: string;
}
/** 通过验证码重置密码 */
export interface ResetPasswordRequest {
    target: string;
    type: 'email' | 'phone';
    code: string;
    newPassword: string;
    captchaToken?: string;
}
export interface AuthResponse {
    token: string;
    user: PublicUser;
    needSecondPassword?: boolean;
    secondPasswordHint?: string;
}
export interface SetSecondPasswordRequest {
    password: string;
    hint: string;
    captchaToken?: string;
}
export interface VerifySecondPasswordRequest {
    password: string;
}
export interface CaptchaConfig {
    enabled: boolean;
    backendUrl: string;
    frontendUrl: string;
    provider: 'cap-pow' | 'cloudflare' | 'none';
}
export interface AiConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
    enabled: boolean;
    systemPrompt: string;
    name: string;
    bio: string;
    avatarUrl: string;
}
export interface TestAiRequest {
    baseUrl: string;
    apiKey: string;
    model: string;
}
export interface TestAiResponse {
    success: boolean;
    latency: number;
    message: string;
}
export interface IceServer {
    url: string;
    username?: string;
    credential?: string;
}
export interface IceConfig {
    stunServers: IceServer[];
    turnServers: IceServer[];
}
export interface DeleteAccountRequest {
    password: string;
    captchaToken?: string;
}
export interface UpdateProfileRequest {
    displayName?: string;
    bio?: string;
    gender?: Gender;
    avatarUrl?: string;
    avatarColor?: string;
    requireFriendApproval?: boolean;
    language?: string;
}
export interface ChangePasswordRequest {
    currentPassword: string;
    newPassword: string;
    captchaToken?: string;
}
export interface BindEmailRequest {
    email: string;
    code: string;
}
export interface BindPhoneRequest {
    phone: string;
    code: string;
}
export interface ChangeEmailRequest {
    newEmail: string;
    code: string;
    password: string;
}
export interface ChangePhoneRequest {
    newPhone: string;
    code: string;
    password: string;
}
export interface UnbindEmailRequest {
    password: string;
}
export interface UnbindPhoneRequest {
    password: string;
}
export interface CreateChannelRequest {
    name: string;
    topic?: string;
    isPrivate?: boolean;
    icon?: string;
    memberIds?: ID[];
}
export interface UpdateChannelRequest {
    name?: string;
    topic?: string;
    announcement?: string;
    icon?: string;
    avatarUrl?: string;
    muteAll?: boolean;
    membersCanInvite?: boolean;
    isPrivate?: boolean;
}
export interface CreateDMRequest {
    userId: ID;
}
export interface SendMessageRequest {
    conversationId: ID;
    text: string;
    kind?: MessageKind;
    format?: MessageFormat;
    attachments?: Attachment[];
    cardId?: ID;
    replyToId?: ID;
    /** For forwardedCard: source conversation ID containing the original messages. */
    sourceConvId?: ID;
    /** For forwardedCard: ordered list of original message IDs to forward. */
    forwardMessageIds?: ID[];
    /** Captcha token for rate-limited retry. */
    captchaToken?: string;
    /** Sticker ID for sticker messages. */
    stickerId?: ID;
    /** ISO date string for scheduled (delayed) delivery — server holds until this time. */
    scheduledAt?: string;
    /** 标记为 E2EE 加密消息：服务器不持久化正文，仅 WS 中继。 */
    e2ee?: boolean;
    /** 附件关联的 E2EE 会话 ID（用于 E2EE 文件限时清理）。 */
    e2eeSessionId?: string;
}
export interface SendFriendRequestBody {
    username: string;
    message?: string;
}
export interface ChannelMemberActionBody {
    userId: ID;
}
export interface SetRoleBody {
    userId: ID;
    role: ChannelRole;
}
export interface SetMutedBody {
    userId: ID;
    muted: boolean;
}
export interface SetBannedBody {
    userId: ID;
    banned: boolean;
}
/** Client -> Server */
export type ClientEvent = {
    type: "auth";
    token: string;
} | {
    type: "message:send";
    payload: SendMessageRequest;
    clientId: string;
} | {
    type: "typing:start";
    conversationId: ID;
} | {
    type: "typing:stop";
    conversationId: ID;
} | {
    type: "presence:set";
    status: PresenceStatus;
} | {
    type: "reaction:toggle";
    messageId: ID;
    emoji: string;
} | {
    type: "read";
    conversationId: ID;
    messageId: ID;
} | {
    type: "message:recall";
    messageId: ID;
} | {
    type: "message:edit";
    messageId: ID;
    text: string;
} | {
    type: "call:invite";
    callId: ID;
    conversationId: ID;
    kind: CallKind;
} | {
    type: "call:accept";
    callId: ID;
} | {
    type: "call:reject";
    callId: ID;
} | {
    type: "call:cancel";
    callId: ID;
} | {
    type: "call:hangup";
    callId: ID;
} | {
    type: "call:offer";
    callId: ID;
    sdp: string;
} | {
    type: "call:answer";
    callId: ID;
    subscriberId: ID;
    publisherId: ID;
    sdp: string;
} | {
    type: "call:ice";
    callId: ID;
    candidate: RTCIceCandidateInit;
    target?: "upstream" | "downstream";
    subscriberId?: ID;
    publisherId?: ID;
} | {
    type: "call:subscribe";
    callId: ID;
    publisherId: ID;
    kind: CallTrackKind;
} | {
    type: "call:admin";
    callId: ID;
    action: "mute" | "unmute" | "ban";
    userId: ID;
} | {
    type: "call:query-active";
} | {
    type: "poll:vote";
    messageId: ID;
    optionId: string;
} | {
    type: "presence:ping";
    conversationId: ID;
} | {
    type: "presence:pong";
    conversationId: ID;
    pingId: ID;
    toUserId: ID;
};
/** Server -> Client */
export type ServerEvent = {
    type: "ready";
    data: BootstrapData;
} | {
    type: "error";
    message: string;
    code?: string;
    clientId?: string;
    conversationId?: ID;
} | {
    type: "captcha_required";
    message: string;
    clientId?: string;
    conversationId?: ID;
} | {
    type: "message:new";
    message: Message;
    clientId?: string;
} | {
    type: "message:update";
    message: Message;
} | {
    type: "message:scheduled";
    clientId: string;
    messageId: ID;
    scheduledAt: ISODate;
} | {
    type: "conversation:new";
    conversation: Conversation;
} | {
    type: "conversation:update";
    conversation: Conversation;
} | {
    type: "conversation:remove";
    conversationId: ID;
} | {
    type: "typing";
    conversationId: ID;
    userId: ID;
    isTyping: boolean;
} | {
    type: "presence";
    userId: ID;
    status: PresenceStatus;
    lastSeen: ISODate;
} | {
    type: "read";
    conversationId: ID;
    userId: ID;
    messageId: ID;
} | {
    type: "user:update";
    user: PublicUser;
} | {
    type: "friend:request";
    request: FriendRequest;
    from: PublicUser;
} | {
    type: "friend:update";
    friendship: Friendship;
    user: PublicUser;
} | {
    type: "friend:remove";
    userId: ID;
} | {
    type: "history:cleared";
    conversationId: ID;
} | {
    type: "call:incoming";
    call: Call;
} | {
    type: "call:accepted";
    callId: ID;
    byUserId: ID;
} | {
    type: "call:rejected";
    callId: ID;
    byUserId: ID;
} | {
    type: "call:cancelled";
    callId: ID;
} | {
    type: "call:hangup";
    callId: ID;
    byUserId: ID;
} | {
    type: "call:answer";
    callId: ID;
    fromUserId: ID;
    sdp: string;
} | {
    type: "call:downstream-offer";
    callId: ID;
    subscriberId: ID;
    publisherId: ID;
    kind: CallTrackKind;
    sdp: string;
} | {
    type: "call:ice";
    callId: ID;
    fromUserId: ID;
    candidate: RTCIceCandidateInit;
    target?: "upstream" | "downstream";
    subscriberId?: ID;
    publisherId?: ID;
    kind?: CallTrackKind;
} | {
    type: "call:peer-joined";
    callId: ID;
    userId: ID;
    kind: CallKind;
    publishing: CallTrackKind | null;
} | {
    type: "call:peer-left";
    callId: ID;
    userId: ID;
} | {
    type: "call:track-published";
    callId: ID;
    userId: ID;
    kind: CallTrackKind;
} | {
    type: "call:track-unpublished";
    callId: ID;
    userId: ID;
    kind: CallTrackKind;
} | {
    type: "call:admin-event";
    callId: ID;
    action: "mute" | "unmute" | "ban";
    userId: ID;
    byUserId: ID;
} | {
    type: "call:banned";
    callId: ID;
    userId: ID;
} | {
    type: "user:banned";
    reason?: string;
} | {
    type: "notification:new";
    notification: Notification;
} | {
    type: "notification:update";
    notification: Notification;
} | {
    type: "notification:remove";
    notificationId: ID;
} | {
    type: "call:active-calls";
    calls: ActiveCallInfo[];
} | {
    type: "poll:update";
    messageId: ID;
    conversationId: ID;
    results: PollResult[];
    totalVotes: number;
} | {
    type: "e2ee:started";
    conversationId: ID;
    peerId: ID;
    sessionId?: string;
} | {
    type: "e2ee:ended";
    conversationId: ID;
    peerId: ID;
    reason?: string;
} | {
    type: "presence:ping";
    conversationId: ID;
    fromUserId: ID;
    fromName: string;
    pingId: ID;
} | {
    type: "presence:pong";
    conversationId: ID;
    fromUserId: ID;
    pingId: ID;
};
export type CallKind = "audio" | "video";
/** Track kinds that can be relayed by the SFU. */
export type CallTrackKind = "camera" | "screen";
/**
 * In-flight voice/video call metadata — what's pushed to a callee as
 * `call:incoming`. The actual call state on each client owns its own
 * RTCPeerConnection; this struct is just rendezvous.
 */
export interface Call {
    id: ID;
    conversationId: ID;
    kind: CallKind;
    fromUserId: ID;
    /** ISO timestamp the call was initiated. */
    createdAt: ISODate;
}
export interface ActiveCallParticipant {
    userId: ID;
    publishing: CallTrackKind[];
    muted: boolean;
    banned: boolean;
}
export interface ActiveCallInfo {
    callId: ID;
    conversationId: ID;
    kind: CallKind;
    fromUserId: ID;
    createdAt: ISODate;
    participants: ActiveCallParticipant[];
}
export interface SensitiveWord {
    id: string;
    word: string;
    policy: "block" | "mask";
    createdBy?: string;
    createdAt: string;
}
export interface Organization {
    id: string;
    name: string;
    parentId?: string;
    description?: string;
    createdAt: string;
}
export interface OssBinding {
    id: string;
    userId: string;
    name: string;
    provider: string;
    endpoint: string;
    bucket: string;
    region?: string;
    accessKeyId: string;
    isDefault: boolean;
    createdAt: string;
}
export interface AuditMessage {
    id: ID;
    conversationId: ID;
    authorId: ID;
    kind: MessageKind;
    text: string;
    cardId?: ID;
    replyToId?: ID;
    editedAt?: ISODate;
    createdAt: ISODate;
    deleted: boolean;
    deletedBy?: string;
    authorName: string;
    authorUsername?: string;
    authorAvatarUrl?: string;
    convName: string;
    convKind?: string;
    attachments: Attachment[];
}
export declare const WS_AUTH_TIMEOUT_MS = 10000;
export declare const AI_USER_ID = "u_navo_ai";
export declare const MESSAGE_RECALL_WINDOW_MS: number;
/**
 * Offline message sync limits.
 *
 * INITIAL_PULL_MAX: no upper bound for the first connection after auth.
 * The client fetches all unsynchronized messages in one batch.
 *
 * RECONNECT_PULL_MAX: cap for subsequent reconnections.
 * Only the N most recent messages per conversation are pulled.
 */
export declare const RECONNECT_PULL_MAX = 30;
export type { Language, TranslationKey } from "./i18n.js";
export { t, LANGUAGES, detectBrowserLanguage, getLanguageLabel } from "./i18n.js";
export interface GrantAdminRoleRequest {
    userId: ID;
    role: SystemRole;
    permissions?: AdminPermission[];
    note?: string;
    expiresAt?: ISODate;
}
export interface UpdateAdminRoleRequest {
    role?: SystemRole;
    permissions?: AdminPermission[];
    note?: string;
    expiresAt?: ISODate;
}
export interface BanUserRequest {
    userId: ID;
    reason?: string;
    expiresAt?: ISODate;
}
export interface BanChannelRequest {
    reason?: string;
}
export interface UpdateSystemSettingsRequest {
    siteName?: string;
    siteDescription?: string;
    allowRegistration?: boolean;
    requireInviteCode?: boolean;
    inviteCode?: string;
    maxFileSize?: number;
    maxMessageLength?: number;
    aiEnabled?: boolean;
    maintenanceMode?: boolean;
    maintenanceMessage?: string;
    requireSecondPassword?: boolean;
    captchaEnabled?: boolean;
    captchaBackendUrl?: string;
    captchaFrontendUrl?: string;
    captchaProvider?: 'cap-pow' | 'cloudflare' | 'none';
    aiBaseUrl?: string;
    aiApiKey?: string;
    aiModel?: string;
    aiSystemPrompt?: string;
    aiName?: string;
    aiBio?: string;
    aiAvatarUrl?: string;
    cdnFontsGoogleCssUrl?: string;
    cdnVconsoleEnabled?: boolean;
    iceStunUrls?: string;
    iceTurnUrl?: string;
    iceTurnUsername?: string;
    iceTurnCredential?: string;
    translationProvider?: string;
    deeplApiKey?: string;
    googleApiKey?: string;
    bingApiKey?: string;
    rateLimitMessageCount?: number;
    rateLimitMessageWindow?: number;
    rateLimitLoginMax?: number;
    rateLimitLoginWindow?: number;
    rateLimitRegisterMax?: number;
    rateLimitRegisterWindow?: number;
    rateLimitMaxAccountsPerIp?: number;
    rateLimitPresencePingMax?: number;
    rateLimitPresencePingWindow?: number;
    usernameRegistrationEnabled?: boolean;
    emailRegistrationEnabled?: boolean;
    phoneRegistrationEnabled?: boolean;
    smsProvider?: 'tencent' | 'aliyun' | 'none';
    smsSdkAppId?: string;
    smsAccessKeyId?: string;
    smsAccessKeySecret?: string;
    smsSignName?: string;
    smsTemplateCode?: string;
    smsRegion?: string;
    smsEndpoint?: string;
}
export interface AdminUserListQuery {
    page?: number;
    limit?: number;
    search?: string;
    role?: SystemRole;
}
export interface AuditLogQuery {
    page?: number;
    limit?: number;
    userId?: ID;
    action?: string;
    targetType?: "user" | "channel" | "message" | "system";
    startDate?: ISODate;
    endDate?: ISODate;
}
export interface AdminDashboardStats {
    totalUsers: number;
    activeUsers: number;
    totalChannels: number;
    totalMessages: number;
    newUsersToday: number;
    newUsersThisWeek: number;
    messagesToday: number;
    messagesThisWeek: number;
}
export interface StickerPack {
    id: ID;
    name: string;
    createdAt: ISODate;
    createdBy: ID;
}
export interface Sticker {
    id: ID;
    packId: ID;
    name: string;
    fileUrl: string;
    mimeType: string;
    createdAt: ISODate;
}
export interface Notification {
    id: ID;
    title: string;
    content: string;
    imageUrl?: string;
    authorId: ID;
    createdAt: ISODate;
    updatedAt: ISODate;
    /** When set, this notification is private to the target user. Null = global. */
    targetUserId?: ID;
}
export interface NotificationWithRead extends Notification {
    read: boolean;
}
export interface CreateNotificationRequest {
    title: string;
    content: string;
    imageUrl?: string;
    targetUserId?: ID;
}
export interface UpdateNotificationRequest {
    title?: string;
    content?: string;
    imageUrl?: string;
}

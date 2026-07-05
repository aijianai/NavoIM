import { create } from "zustand";
import { loadAllMessages, saveAllMessages, saveConversationMessages, deleteConversationMessages } from "./msg-store";
import type {
  BootstrapData,
  Conversation,
  Friendship,
  FriendRequest,
  ID,
  Language,
  Message,
  NotificationWithRead,
  PollResult,
  PresenceStatus,
  PublicUser,
  ServerEvent,
} from "@navo/shared";
import { detectBrowserLanguage } from "@navo/shared";
import { notificationSound } from "./sound";
import { safeDateMs } from "./utils";
import { getAppState } from "./app-state";
import { cancelAutoReadTimer, cancelAllAutoReadTimers } from "./auto-read";

import { getT } from "./i18n";
/** Maps clientId -> timeout timer for pending messages. */
const t = getT();
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** 合并 E2EE 本地字段，防止服务端同步覆盖本地明文。 */
function preserveE2eeLocalFields(prev: Message | undefined, incoming: Message): Message {
  let next: Message = incoming;
  if (incoming.e2ee && incoming.text?.trim() && !incoming.localPlaintext) {
    next = { ...next, localPlaintext: incoming.text };
  }
  if (!prev) return next;
  if (prev.e2ee || prev.e2eeCleaned || prev.localPlaintext) {
    next = {
      ...next,
      e2ee: prev.e2ee ?? next.e2ee,
      e2eeCleaned: prev.e2eeCleaned ?? next.e2eeCleaned,
      localPlaintext: prev.localPlaintext ?? (prev.e2ee && prev.text?.trim() ? prev.text : next.localPlaintext),
    };
  }
  return next;
}

interface TypingState {
  [conversationId: string]: Set<ID>;
}

interface PollDraft {
  question: string;
  options: string[];
  anonymous: boolean;
}

type Theme = "light" | "dark";

interface ChatState {
  token: string | null;
  me: PublicUser | null;

  users: Record<ID, PublicUser>;
  conversations: Conversation[];
  conversationsById: Record<ID, Conversation>;
  selectedId: ID | null;

  friends: Friendship[];
  friendRequests: FriendRequest[];
  notifications: NotificationWithRead[];

  messagesByConv: Record<ID, Message[]>;
  /**
   * Pagination metadata per conversation for the on-demand history loader.
   * - `hasMore`: whether earlier messages exist on the server beyond what's
   *   currently loaded. Defaults to `true` until we've proven otherwise.
   * - `loadingOlder`: a request for an older page is in flight (drives the
   *   loading spinner at the top of the list).
   * - `error`: last load-older error, surfaced to the UI; cleared on retry/success.
   */
  historyMeta: Record<ID, { hasMore: boolean; loadingOlder: boolean; error?: string }>;

  ready: boolean;
  typing: TypingState;
  unread: Record<ID, number>;

  theme: Theme;
  memberPanelOpen: boolean;
  collapsed: Record<string, boolean>;
  pinnedIds: ID[];
  /** Conversation ids the user has "deleted" from their list (client-side
   *  hide). They re-appear automatically when a new message arrives. */
  hiddenConvIds: ID[];
  /** Per-conversation in-progress message draft, persisted across reloads.
   *  Cleared automatically on send. Used for the t("chat.draft") preview in the
   *  conversation list and for restoring the composer on conversation
   *  re-open. */
  drafts: Record<ID, string>;
  readMarkers: Record<ID, string>;
  channelReadStates: Record<ID, Record<ID, { lastReadAt: string; lastReadMessageId: ID }>>;
  lastMessages: Record<ID, Message>;
  /** Per-conversation sync anchor (ISO timestamp of the latest message pulled
   *  during reconnect). Used to fetch only newer messages on subsequent
   *  reconnections. Persisted to localStorage. */
  syncAnchors: Record<ID, string>;
  toast: { message: string; tone: "error" | "info"; id: number } | null;
  wsStatus: "connecting" | "connected" | "reconnecting" | "disconnected";
  /** Set when the user is banned — shows ban screen and blocks re-login. */
  banInfo: { banned: boolean; reason?: string } | null;
  /** ISO timestamp of when the user last opened the friend-requests inbox. */
  friendRequestsSeenAt: string | null;
  /** Poll results: messageId -> { results, totalVotes } */
  pollResults: Record<ID, { results: PollResult[]; totalVotes: number }>;

  language: Language;

  /** E2EE 会话状态：conversationId -> 是否处于端到端加密模式。 */
  e2eeByConversation: Record<ID, boolean>;
  setE2eeActive: (conversationId: ID, active: boolean) => void;
  markE2eeFilesCleaned: (conversationId: ID) => void;

  /** 对方发起的「你还在吗？」弹窗数据 */
  presencePing: {
    conversationId: ID;
    fromUserId: ID;
    fromName: string;
    pingId: ID;
  } | null;
  setPresencePing: (v: ChatState["presencePing"]) => void;
  clearPresencePing: () => void;

  captchaPending: {
    clientId: string;
    conversationId: ID;
    text: string;
    attachments?: any[];
    replyToId?: ID;
    forwardMessageIds?: ID[];
    sourceConvId?: ID;
    cardId?: ID;
    e2ee?: boolean;
  } | null;
  setCaptchaPending: (v: {
    clientId: string;
    conversationId: ID;
    text: string;
    attachments?: any[];
    replyToId?: ID;
    forwardMessageIds?: ID[];
    sourceConvId?: ID;
    cardId?: ID;
    e2ee?: boolean;
  } | null) => void;

  /** Poll draft state per conversation, persisted to localStorage. */
  pollDrafts: Record<ID, PollDraft>;
  setPollDraft: (conversationId: ID, draft: Partial<PollDraft>) => void;
  clearPollDraft: (conversationId: ID) => void;
  setPollResults: (results: Record<string, { results: PollResult[]; totalVotes: number }>) => void;

  /** Retry a failed message by re-sending it. */
  retryMessage: (messageId: string, conversationId: ID) => void;

  setToken: (t: string | null) => void;
  setTheme: (t: Theme) => void;
  setLanguage: (lang: Language) => void;

  /** 启动时从 IndexedDB 拉取消息并合并；首次启动会从 localStorage 迁移。 */
  hydrateMessagesFromIdb: () => Promise<void>;
  /** 单个会话的消息写回 IndexedDB。 */
  persistConversation: (conversationId: ID) => Promise<void>;
  /** 删除单个会话的本地缓存。 */
  removeConversationCache: (conversationId: ID) => Promise<void>;
  setWsStatus: (s: "connecting" | "connected" | "reconnecting" | "disconnected") => void;
  toggleMemberPanel: () => void;
  toggleCollapsed: (key: string) => void;
  togglePin: (conversationId: ID) => void;
  /** Hide a conversation from the list (client-only). It returns the moment a
   *  new message arrives, or when the user opens it again. */
  hideConversation: (conversationId: ID) => void;
  unhideConversation: (conversationId: ID) => void;
  setDraft: (conversationId: ID, text: string) => void;
  clearDraft: (conversationId: ID) => void;
  showToast: (message: string, tone?: "error" | "info") => void;
  dismissToast: () => void;
  upsertChannelReadState: (conversationId: ID, userId: ID, lastReadMessageId: ID) => void;
  /** Mark the friend-requests inbox as just-viewed (clears red dot). */
  markFriendRequestsSeen: () => void;
  /** Mark a notification as read locally and on the server. */
  markNotificationRead: (notificationId: ID) => void;
  /** Replace all notifications (used by refresh-on-open). */
  setNotifications: (notifications: NotificationWithRead[]) => void;
  /** Unread notification count (computed). */
  unreadNotificationCount: () => number;

  hydrate: (data: BootstrapData) => void;
  selectConversation: (id: ID | null) => void;
  /**
   * Strong "open this conversation now" intent — used by entry points outside
   * the conversation list (channel cards, friend cards, command palette, etc.).
   *
   * On desktop this behaves identically to `selectConversation`. On mobile,
   * `MobileShell` watches the bumped `openIntent` counter and switches its
   * navigation stack to the chat view, so users actually *see* the target
   * conversation instead of staying on whatever screen they were on.
   *
   * The counter (vs. a boolean flag) lets repeated opens of the *same*
   * conversation also re-trigger the view switch.
   */
  openConversation: (id: ID) => void;
  /** Monotonically incremented every time `openConversation` is called. */
  openIntent: number;

  setMessages: (conversationId: ID, msgs: Message[], hasMore?: boolean) => void;
  /** Prepend older messages (deduped) to the head of the list. */
  prependOlderMessages: (conversationId: ID, older: Message[], hasMore: boolean) => void;
  /** Append new messages without replacing existing ones (deduped by id).
   *  Used during reconnect pull to merge incremental messages. */
  appendMessages: (conversationId: ID, msgs: Message[], hasMore?: boolean) => void;
  setHistoryMeta: (
    conversationId: ID,
    patch: Partial<{ hasMore: boolean; loadingOlder: boolean; error?: string }>,
  ) => void;
  /** Update the sync anchor for a conversation (ISO timestamp of latest message). */
  setSyncAnchor: (conversationId: ID, anchor: string) => void;
  appendMessage: (msg: Message, fromClientId?: string) => void;
  patchMessage: (msg: Message) => void;

  setPresence: (userId: ID, status: PresenceStatus, lastSeen: string) => void;
  setTyping: (conversationId: ID, userId: ID, isTyping: boolean) => void;

  upsertUser: (user: PublicUser) => void;
  upsertConversation: (c: Conversation) => void;
  removeConversation: (id: ID) => void;
  clearConversationMessages: (id: ID) => void;

  upsertFriend: (f: Friendship, user?: PublicUser) => void;
  removeFriend: (userId: ID) => void;
  addFriendRequest: (r: FriendRequest, from?: PublicUser) => void;
  removeFriendRequest: (id: ID) => void;

  applyServerEvent: (event: ServerEvent, fromClientId?: string) => void;

  reset: () => void;
}

const THEME_KEY = "navo:im:theme";
const TOKEN_KEY = "navo:im:token";
const COLLAPSE_KEY = "navo:im:collapsed";
const PIN_KEY = "navo:im:pinned";
const SELECTED_KEY = "navo:im:selectedId";
const FRIEND_REQ_SEEN_KEY = "navo:im:friendRequestsSeenAt";
const HIDDEN_CONV_KEY = "navo:im:hiddenConversations";
const DRAFT_KEY = "navo:im:drafts";
const POLL_DRAFT_KEY = "navo:im:pollDrafts";
const POLL_RESULTS_KEY = "navo:im:pollResults";
const CONV_CACHE_KEY = "navo:im:conversations";
const MSG_CACHE_KEY = "navo:im:messages";
const READ_CACHE_KEY = "navo:im:readMarkers";
const CHANNEL_READ_CACHE_KEY = "navo:im:channelReadStates";
const SYNC_ANCHOR_KEY = "navo:im:syncAnchors";
const CACHE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

const PENDING_TIMEOUT_MS = 30_000; // 30 seconds — industry standard for message send timeout

const initialTheme: Theme =
  (localStorage.getItem(THEME_KEY) as Theme | null) ??
  (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

const LANG_KEY = "navo:im:language";
const initialLanguage: Language = (localStorage.getItem(LANG_KEY) as Language) || detectBrowserLanguage();

if (initialTheme === "dark") document.documentElement.classList.add("dark");

function loadCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

function loadPinned(): ID[] {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    return raw ? (JSON.parse(raw) as ID[]) : [];
  } catch {
    return [];
  }
}

function loadHiddenConvs(): ID[] {
  try {
    const raw = localStorage.getItem(HIDDEN_CONV_KEY);
    return raw ? (JSON.parse(raw) as ID[]) : [];
  } catch {
    return [];
  }
}

function loadDrafts(): Record<ID, string> {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Record<ID, string>) : {};
  } catch {
    return {};
  }
}

function loadPollDrafts(): Record<ID, PollDraft> {
  try {
    const raw = localStorage.getItem(POLL_DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Record<ID, PollDraft>) : {};
  } catch {
    return {};
  }
}

function loadPollResults(): Record<ID, { results: PollResult[]; totalVotes: number }> {
  try {
    const raw = localStorage.getItem(POLL_RESULTS_KEY);
    return raw ? (JSON.parse(raw) as Record<ID, { results: PollResult[]; totalVotes: number }>) : {};
  } catch {
    return {};
  }
}

function savePollResults(data: Record<ID, { results: PollResult[]; totalVotes: number }>) {
  try {
    localStorage.setItem(POLL_RESULTS_KEY, JSON.stringify(data));
  } catch { /* quota exceeded — ignore */ }
}

function loadReadCache(): Record<ID, string> | null {
  try {
    const raw = localStorage.getItem(READ_CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry<Record<ID, string>> = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_MAX_AGE_MS) return null;
    return entry.data;
  } catch { return null; }
}

function saveReadCache(data: Record<ID, string>) {
  try {
    localStorage.setItem(READ_CACHE_KEY, JSON.stringify({ ts: Date.now(), data } satisfies CacheEntry<Record<ID, string>>));
  } catch { /* ignore */ }
}

function loadChannelReadCache(): Record<ID, Record<ID, { lastReadAt: string; lastReadMessageId: ID }>> | null {
  try {
    const raw = localStorage.getItem(CHANNEL_READ_CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry<Record<ID, Record<ID, { lastReadAt: string; lastReadMessageId: ID }>>> = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_MAX_AGE_MS) return null;
    return entry.data;
  } catch { return null; }
}

function saveChannelReadCache(data: Record<ID, Record<ID, { lastReadAt: string; lastReadMessageId: ID }>>) {
  try {
    localStorage.setItem(CHANNEL_READ_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: data as any } satisfies CacheEntry<any>));
  } catch { /* ignore */ }
}

function loadSyncAnchors(): Record<ID, string> {
  try {
    const raw = localStorage.getItem(SYNC_ANCHOR_KEY);
    return raw ? (JSON.parse(raw) as Record<ID, string>) : {};
  } catch {
    return {};
  }
}

function saveSyncAnchors(data: Record<ID, string>) {
  try {
    localStorage.setItem(SYNC_ANCHOR_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

interface CacheEntry<T> { ts: number; data: T }

function loadConvCache(): Conversation[] | null {
  try {
    const raw = localStorage.getItem(CONV_CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry<Conversation[]> = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_MAX_AGE_MS) return null;
    return entry.data;
  } catch { return null; }
}

function saveConvCache(data: Conversation[]) {
  try {
    localStorage.setItem(CONV_CACHE_KEY, JSON.stringify({ ts: Date.now(), data } satisfies CacheEntry<Conversation[]>));
  } catch { /* ignore */ }
}

function loadMsgCacheSync(): Record<ID, Message[]> | null {
  // 同步回退：从旧版 localStorage 中读取，命中后由后续异步流程迁移到 IndexedDB
  try {
    const raw = localStorage.getItem(MSG_CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry<Record<ID, Message[]>> = JSON.parse(raw);
    return entry.data ?? null;
  } catch { return null; }
}

/** 把单个会话的消息写回 IndexedDB（高频路径）。 */
function persistConversationMessages(conversationId: ID, messages: Message[]) {
  try {
    void saveConversationMessages(conversationId, messages);
  } catch { /* ignore */ }
}

export const useChatStore = create<ChatState>((set, get) => ({
  token: localStorage.getItem(TOKEN_KEY),
  me: null,
  users: {},
  conversations: loadConvCache() ?? [],
  conversationsById: Object.fromEntries((loadConvCache() ?? []).map(c => [c.id, c])),
  selectedId: localStorage.getItem(SELECTED_KEY),
  friends: [],
  friendRequests: [],
  notifications: [],
      messagesByConv: loadMsgCacheSync() ?? {},
      historyMeta: {},
      ready: false,
  typing: {},
  unread: {},
  theme: initialTheme,
  memberPanelOpen: true,
  collapsed: loadCollapsed(),
  pinnedIds: loadPinned(),
  hiddenConvIds: loadHiddenConvs(),
  drafts: loadDrafts(),
  readMarkers: loadReadCache() ?? {},
  channelReadStates: loadChannelReadCache() ?? {},
  lastMessages: {},
  syncAnchors: loadSyncAnchors(),
  toast: null,
  wsStatus: "disconnected",
  banInfo: null,
  friendRequestsSeenAt: localStorage.getItem(FRIEND_REQ_SEEN_KEY),
  openIntent: 0,
  pollResults: loadPollResults(),
  captchaPending: null,
  presencePing: null,
  e2eeByConversation: {},
  pollDrafts: loadPollDrafts(),
  language: initialLanguage,

  setToken(t) {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
    set({ token: t });
  },

  /**
   * 启动时从 IndexedDB 拉取消息；与同步缓存合并后写回 IndexedDB。
   * 若 IndexedDB 为空且 localStorage 有旧数据，则自动迁移一次。
   */
  async hydrateMessagesFromIdb() {
    try {
      const fromIdb = await loadAllMessages();
      const fromLs = get().messagesByConv;
      // 合并：以 IndexedDB 为主，localStorage 仅补齐未迁移的会话
      const merged: Record<ID, Message[]> = { ...fromLs, ...fromIdb };
      // 对每个会话按 createdAt 升序、去重
      const cleaned: Record<ID, Message[]> = {};
      for (const [cid, list] of Object.entries(merged)) {
        const seen = new Set<string>();
        const sorted = [...(list ?? [])].sort((a, b) => safeDateMs(a.createdAt) - safeDateMs(b.createdAt));
        const uniq: Message[] = [];
        for (const m of sorted) {
          if (seen.has(m.id)) continue;
          seen.add(m.id);
          uniq.push(m);
        }
        cleaned[cid] = uniq;
      }
      set({ messagesByConv: cleaned });
      // 写回 IndexedDB（首次或更新）
      void saveAllMessages(cleaned);
      // 清空旧 localStorage 缓存
      try { localStorage.removeItem(MSG_CACHE_KEY); } catch { /* ignore */ }
    } catch {
      // IndexedDB 不可用时保留 localStorage 内存缓存
    }
  },

  /**
   * 单条会话消息写回 IndexedDB（高频路径：append / merge 时）。
   */
  async persistConversation(conversationId: ID) {
    const list = get().messagesByConv[conversationId];
    if (!list) return;
    try { await saveConversationMessages(conversationId, list); } catch { /* ignore */ }
  },

  /**
   * 删除某个会话的本地缓存（用户在 UI 上删除会话时调用）。
   */
  async removeConversationCache(conversationId: ID) {
    try { await deleteConversationMessages(conversationId); } catch { /* ignore */ }
    set({ messagesByConv: { ...get().messagesByConv, [conversationId]: [] } });
  },

  setTheme(t) {
    document.documentElement.classList.toggle("dark", t === "dark");
    localStorage.setItem(THEME_KEY, t);
    set({ theme: t });
  },

  setWsStatus(s) {
    set({ wsStatus: s });
  },

  setLanguage(lang) {
    localStorage.setItem(LANG_KEY, lang);
    set({ language: lang });
  },

  toggleMemberPanel() {
    set({ memberPanelOpen: !get().memberPanelOpen });
  },

  toggleCollapsed(key) {
    const next = { ...get().collapsed, [key]: !get().collapsed[key] };
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
    set({ collapsed: next });
  },

  togglePin(id) {
    const prev = get().pinnedIds;
    const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    localStorage.setItem(PIN_KEY, JSON.stringify(next));
    set({ pinnedIds: next });
  },

  hideConversation(id) {
    const prev = get().hiddenConvIds;
    if (prev.includes(id)) return;
    const next = [...prev, id];
    localStorage.setItem(HIDDEN_CONV_KEY, JSON.stringify(next));
    // If this conversation is currently open, deselect it so the chat view
    // collapses back to the empty state.
    const selectedId = get().selectedId === id ? null : get().selectedId;
    if (selectedId === null) localStorage.removeItem(SELECTED_KEY);
    set({ hiddenConvIds: next, selectedId });
  },

  unhideConversation(id) {
    const prev = get().hiddenConvIds;
    if (!prev.includes(id)) return;
    const next = prev.filter((x) => x !== id);
    localStorage.setItem(HIDDEN_CONV_KEY, JSON.stringify(next));
    set({ hiddenConvIds: next });
  },

  setDraft(id, text) {
    const drafts = { ...get().drafts };
    if (text.length === 0) {
      delete drafts[id];
    } else {
      drafts[id] = text;
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
    set({ drafts });
  },

  clearDraft(id) {
    const drafts = { ...get().drafts };
    if (!(id in drafts)) return;
    delete drafts[id];
    localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
    set({ drafts });
  },

  showToast(message, tone = "info") {
    set({ toast: { message, tone, id: Date.now() } });
  },

  dismissToast() {
    set({ toast: null });
  },

  markFriendRequestsSeen() {
    const ts = new Date().toISOString();
    localStorage.setItem(FRIEND_REQ_SEEN_KEY, ts);
    set({ friendRequestsSeenAt: ts });
  },

  markNotificationRead(notificationId) {
    // Optimistic local update
    const notifications = get().notifications.map((n) =>
      n.id === notificationId ? { ...n, read: true } : n
    );
    set({ notifications });
    // Fire-and-forget server call
    import("./api").then(({ api }) => {
      api.markNotificationRead(notificationId).catch(() => {});
    });
  },

  setNotifications(notifications) {
    set({ notifications });
  },

  unreadNotificationCount() {
    return get().notifications.filter((n) => !n.read).length;
  },

  // --- Poll drafts ---

  setPollDraft(conversationId, draft) {
    const prev = get().pollDrafts[conversationId] ?? { question: "", options: ["", ""], anonymous: false };
    const next = { ...get().pollDrafts, [conversationId]: { ...prev, ...draft } };
    localStorage.setItem(POLL_DRAFT_KEY, JSON.stringify(next));
    set({ pollDrafts: next });
  },

  clearPollDraft(conversationId) {
    const next = { ...get().pollDrafts };
    delete next[conversationId];
    localStorage.setItem(POLL_DRAFT_KEY, JSON.stringify(next));
    set({ pollDrafts: next });
  },

  setPollResults(results) {
    const next = { ...get().pollResults };
    for (const [msgId, r] of Object.entries(results)) {
      next[msgId] = r;
    }
    savePollResults(next);
    set({ pollResults: next });
  },

  setCaptchaPending(v) {
    set({ captchaPending: v });
  },

  setPresencePing(v) {
    set({ presencePing: v });
  },

  clearPresencePing() {
    set({ presencePing: null });
  },

  /** 开启 E2EE 会话；返回 session id。 */
  setE2eeActive(conversationId: ID, active: boolean) {
    const next = { ...get().e2eeByConversation, [conversationId]: active };
    if (!active) delete next[conversationId];
    set({ e2eeByConversation: next });
  },

  /**
   * 把一个会话内所有 E2EE 文件/图片/视频消息标记为已清理。
   * UI 渲染时显示 Navo 图标 + 红色"已被清理"提示。
   */
  markE2eeFilesCleaned(conversationId: ID) {
    const list = get().messagesByConv[conversationId];
    if (!list) return;
    let changed = false;
    const next = list.map((m) => {
      if (!m.e2ee) return m;
      if (m.kind === "image" || m.kind === "file" || m.kind === "voice") {
        if (!m.e2eeCleaned) {
          changed = true;
          return { ...m, e2eeCleaned: true };
        }
      }
      return m;
    });
    if (changed) {
      set({ messagesByConv: { ...get().messagesByConv, [conversationId]: next } });
      persistConversationMessages(conversationId, next);
    }
  },

  // --- Message retry ---

  retryMessage(messageId, conversationId) {
    const list = get().messagesByConv[conversationId];
    if (!list) return;
    const msg = list.find((m) => m.id === messageId);
    if (!msg || !msg.failed) return;
    const me = get().me;
    if (!me) return;
    // Generate new clientId for the retry
    const newClientId = "c_local_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    // Remove the old failed message and create a new optimistic one
    const filtered = list.filter((m) => m.id !== messageId);
    const optimistic: Message = {
      ...msg,
      id: newClientId,
      pending: true,
      failed: false,
      failedReason: undefined,
      createdAt: new Date().toISOString(),
    };
    set({
      messagesByConv: {
        ...get().messagesByConv,
        [conversationId]: [...filtered, optimistic],
      },
    });
    // Start the pending timeout
    const timer = setTimeout(() => {
      const currentList = get().messagesByConv[conversationId];
      if (currentList) {
        const updated = currentList.map((m) =>
          m.id === newClientId && m.pending ? { ...m, pending: false, failed: true, failedReason: t("chat.sendFailed") } : m,
        );
        set({ messagesByConv: { ...get().messagesByConv, [conversationId]: updated } });
      }
    }, PENDING_TIMEOUT_MS);
    pendingTimers.set(newClientId, timer);
    // Send via WebSocket
    import("./ws-client").then(({ wsClient }) => {
      const e2eeActive = get().e2eeByConversation[conversationId] === true;
      wsClient.send({
        type: "message:send",
        clientId: newClientId,
        payload: {
          conversationId,
          text: msg.text,
          attachments: msg.attachments,
          replyToId: msg.replyToId,
          kind: msg.kind === "poll" ? "poll" : undefined,
          e2ee: e2eeActive,
        },
      });
    });
  },

  upsertChannelReadState(conversationId, userId, lastReadMessageId) {
    const conv = get().conversationsById[conversationId];
    if (!conv) return;
    const list = get().messagesByConv[conversationId];
    const target = list?.find((m) => m.id === lastReadMessageId);
    const lastReadAt = target?.createdAt ?? new Date().toISOString();
    const prev = get().channelReadStates[conversationId] ?? {};
    const next = {
      ...get().channelReadStates,
      [conversationId]: { ...prev, [userId]: { lastReadAt, lastReadMessageId } },
    };
    set({ channelReadStates: next });
    saveChannelReadCache(next);
  },

  hydrate(data) {
    const usersById: Record<ID, PublicUser> = {};
    for (const u of data.users) usersById[u.id] = u;
    const conversationsById: Record<ID, Conversation> = {};
    for (const c of data.conversations) conversationsById[c.id] = c;
    // Validate selectedId: if it no longer exists in loaded conversations, reset it
    let selectedId = get().selectedId ?? data.conversations[0]?.id ?? null;
    if (selectedId && !conversationsById[selectedId]) {
      selectedId = data.conversations[0]?.id ?? null;
    }
    // Persist the corrected selection
    if (selectedId) localStorage.setItem(SELECTED_KEY, selectedId);
    else localStorage.removeItem(SELECTED_KEY);
    set({
      me: data.me,
      users: usersById,
      conversations: data.conversations,
      conversationsById,
      friends: data.friends,
      friendRequests: data.friendRequests,
      notifications: data.notifications ?? [],
      selectedId,
      readMarkers: data.readMarkers ?? {},
      channelReadStates: data.channelReadStates ?? {},
      lastMessages: data.lastMessages ?? {},
      ready: true,
      wsStatus: "connected",
      language: (data.me?.language as Language) || initialLanguage,
    });
    if (data.me?.language) {
      localStorage.setItem(LANG_KEY, data.me.language);
    }
    saveConvCache(data.conversations);
    const readData = data.readMarkers ?? {};
    const channelReadData = data.channelReadStates ?? {};
    saveReadCache(readData);
    saveChannelReadCache(channelReadData);
  },

  selectConversation(id) {
    const prevId = get().selectedId;
    if (id === null) {
      localStorage.removeItem(SELECTED_KEY);
      if (prevId) cancelAutoReadTimer(prevId);
      set({ selectedId: null });
      return;
    }
    if (prevId && prevId !== id) {
      cancelAutoReadTimer(prevId);
    }
    localStorage.setItem(SELECTED_KEY, id);
    set({ selectedId: id, unread: { ...get().unread, [id]: 0 } });
  },

  openConversation(id) {
    // Selecting first guarantees that any view bound to `selectedId` (e.g. the
    // desktop ChatView) immediately re-renders for the target conversation.
    // Bumping `openIntent` afterwards lets MobileShell promote the chat view
    // to the front of its navigation stack on the same render cycle.
    get().selectConversation(id);
    set({ openIntent: get().openIntent + 1 });
  },

  setMessages(conversationId, msgs, hasMore) {
    const meta = get().historyMeta[conversationId];
    set({
      messagesByConv: { ...get().messagesByConv, [conversationId]: msgs },
      historyMeta: {
        ...get().historyMeta,
        [conversationId]: {
          hasMore: hasMore ?? meta?.hasMore ?? false,
          loadingOlder: false,
          error: undefined,
        },
      },
    });
    persistConversationMessages(conversationId, msgs);
  },

  prependOlderMessages(conversationId, older, hasMore) {
    const existing = get().messagesByConv[conversationId] ?? [];
    // Dedupe by id — older page may overlap if a new message snuck in between
    // requests, or if the user retried after a transient failure.
    const seen = new Set(existing.map((m) => m.id));
    const fresh = older.filter((m) => !seen.has(m.id));
    const merged = fresh.length > 0 ? [...fresh, ...existing] : existing;
    set({
      messagesByConv: { ...get().messagesByConv, [conversationId]: merged },
      historyMeta: {
        ...get().historyMeta,
        [conversationId]: { hasMore, loadingOlder: false, error: undefined },
      },
    });
  },

  setHistoryMeta(conversationId, patch) {
    const prev = get().historyMeta[conversationId] ?? { hasMore: true, loadingOlder: false };
    set({
      historyMeta: {
        ...get().historyMeta,
        [conversationId]: { ...prev, ...patch },
      },
    });
  },

  appendMessages(conversationId, msgs, hasMore) {
    const existing = get().messagesByConv[conversationId] ?? [];
    const seen = new Set(existing.map((m) => m.id));
    // 关键：服务端拉取回来时，对已存在的消息保留本地 e2ee/e2eeCleaned 字段
    const mergedExisting = new Map(existing.map((m) => [m.id, m]));
    const fresh: Message[] = [];
    const updated: Message[] = [];
    for (const m of msgs) {
      if (seen.has(m.id)) {
        const prev = mergedExisting.get(m.id);
        if (prev && (prev.e2ee || prev.e2eeCleaned || prev.localPlaintext)) {
          updated.push(preserveE2eeLocalFields(prev, m));
        }
      } else {
        fresh.push(m);
      }
    }
    if (fresh.length === 0 && updated.length === 0) return;
    // 用 updated 替换 existing 中同 id 的项
    const updatedIds = new Set(updated.map((m) => m.id));
    const base = existing.map((m) => updatedIds.has(m.id) ? (updated.find((u) => u.id === m.id) ?? m) : m);
    const merged = [...base, ...fresh];
    const meta = get().historyMeta[conversationId];
    set({
      messagesByConv: { ...get().messagesByConv, [conversationId]: merged },
      historyMeta: {
        ...get().historyMeta,
        [conversationId]: {
          hasMore: hasMore ?? meta?.hasMore ?? false,
          loadingOlder: false,
          error: undefined,
        },
      },
    });
    persistConversationMessages(conversationId, merged);
  },

  setSyncAnchor(conversationId, anchor) {
    const next = { ...get().syncAnchors, [conversationId]: anchor };
    set({ syncAnchors: next });
    saveSyncAnchors(next);
  },

  appendMessage(msg, fromClientId) {
    const list = get().messagesByConv[msg.conversationId] ?? [];
    const wasPresent = list.some((m) => m.id === msg.id);
    let next: Message[];
    if (fromClientId) {
      // Optimistic update: replace the placeholder with the server-confirmed message
      const idx = list.findIndex((m) => m.id === fromClientId || m.id === msg.id);
      if (idx >= 0) {
        const timer = pendingTimers.get(fromClientId);
        if (timer) {
          clearTimeout(timer);
          pendingTimers.delete(fromClientId);
        }
        const prev = list[idx];
        const merged = preserveE2eeLocalFields(prev, msg);
        next = [...list.slice(0, idx), merged, ...list.slice(idx + 1)];
      } else {
        // New optimistic message — start the pending timeout
        next = [...list, msg];
        if (msg.pending) {
          const timer = setTimeout(() => {
            const currentList = get().messagesByConv[msg.conversationId];
            if (currentList) {
              const updated = currentList.map((m) =>
                m.id === fromClientId && m.pending ? { ...m, pending: false, failed: true, failedReason: t("chat.sendFailed") } : m,
              );
              set({ messagesByConv: { ...get().messagesByConv, [msg.conversationId]: updated } });
            }
          }, PENDING_TIMEOUT_MS);
          pendingTimers.set(fromClientId, timer);
        }
      }
    } else if (wasPresent) {
      const idx = list.findIndex((m) => m.id === msg.id);
      const prev = idx >= 0 ? list[idx] : undefined;
      const merged = preserveE2eeLocalFields(prev, msg);
      next = idx >= 0 ? [...list.slice(0, idx), merged, ...list.slice(idx + 1)] : [...list, merged];
    } else {
      next = [...list, preserveE2eeLocalFields(undefined, msg)];
    }
    const conv = get().conversationsById[msg.conversationId];
    const updatedConv = conv
      ? { ...conv, lastMessageId: msg.id, lastMessageAt: msg.createdAt }
      : undefined;
    const me = get().me;
    const isCurrent = get().selectedId === msg.conversationId;
    const isMe = me && msg.authorId === me.id;
    const unread = get().unread;
    // If the user had previously hidden this conversation but a fresh message
    // (from someone else) just arrived, bring it back. Self-sent messages do
    // NOT unhide — only true incoming traffic does.
    const hidden = get().hiddenConvIds;
    const wasHidden = hidden.includes(msg.conversationId);
    const shouldUnhide = wasHidden && !isMe && !msg.pending;
    if (shouldUnhide) {
      const nextHidden = hidden.filter((x) => x !== msg.conversationId);
      localStorage.setItem(HIDDEN_CONV_KEY, JSON.stringify(nextHidden));
    }
    set({
      messagesByConv: { ...get().messagesByConv, [msg.conversationId]: next },
      conversationsById: updatedConv
        ? { ...get().conversationsById, [msg.conversationId]: updatedConv }
        : get().conversationsById,
      conversations: updatedConv
        ? get().conversations.map((c) => (c.id === msg.conversationId ? updatedConv : c))
        : get().conversations,
      lastMessages: { ...get().lastMessages, [msg.conversationId]: msg },
      unread:
        !isCurrent && !isMe
          ? { ...unread, [msg.conversationId]: (unread[msg.conversationId] ?? 0) + 1 }
          : unread,
      hiddenConvIds: shouldUnhide ? hidden.filter((x) => x !== msg.conversationId) : hidden,
    });
    persistConversationMessages(msg.conversationId, next);
    if (updatedConv) saveConvCache(get().conversations);

    if (!isMe && !wasPresent && !msg.pending) {
      getAppState().then((active) => {
        if (!isCurrent || !active) {
          notificationSound.play();
          const author = get().users[msg.authorId];
          const snippet = msg.text?.replace(/\[emoji:[^\]]+\]/g, "") || `[${msg.kind}]`;
          if (author) {
            import("./notification").then(({ showNotification }) =>
              showNotification(author.displayName, snippet, {
                conversationId: msg.conversationId,
                messageId: msg.id,
              }),
            );
          }
        }
      });
    }
  },

  patchMessage(msg) {
    const list = get().messagesByConv[msg.conversationId];
    const lastMessages = get().lastMessages;
    const wasLast = lastMessages[msg.conversationId]?.id === msg.id;
    if (!list) {
      if (wasLast) set({ lastMessages: { ...lastMessages, [msg.conversationId]: msg } });
      return;
    }
    set({
      messagesByConv: {
        ...get().messagesByConv,
        [msg.conversationId]: list.map((m) => (m.id === msg.id ? msg : m)),
      },
      lastMessages: wasLast ? { ...lastMessages, [msg.conversationId]: msg } : lastMessages,
    });
  },

  setPresence(userId, status, lastSeen) {
    const u = get().users[userId];
    if (!u) return;
    set({ users: { ...get().users, [userId]: { ...u, status, lastSeen } } });
  },

  setTyping(conversationId, userId, isTyping) {
    const cur = get().typing[conversationId] ?? new Set<ID>();
    const next = new Set(cur);
    if (isTyping) next.add(userId);
    else next.delete(userId);
    set({ typing: { ...get().typing, [conversationId]: next } });
  },

  upsertUser(user) {
    set({ users: { ...get().users, [user.id]: user } });
    const me = get().me;
    if (me && me.id === user.id) {
      set({ me: user, language: (user.language as Language) || get().language });
      if (user.language) localStorage.setItem(LANG_KEY, user.language);
    }
  },

  upsertConversation(c) {
    const existing = get().conversationsById[c.id];
    const conversations = existing
      ? get().conversations.map((x) => (x.id === c.id ? c : x))
      : [c, ...get().conversations];
    set({
      conversations,
      conversationsById: { ...get().conversationsById, [c.id]: c },
    });
    saveConvCache(conversations);
  },

  removeConversation(id) {
    const conversationsById = { ...get().conversationsById };
    delete conversationsById[id];
    const messagesByConv = { ...get().messagesByConv };
    delete messagesByConv[id];
    const historyMeta = { ...get().historyMeta };
    delete historyMeta[id];
    const lastMessages = { ...get().lastMessages };
    delete lastMessages[id];
    set({
      conversations: get().conversations.filter((c) => c.id !== id),
      conversationsById,
      messagesByConv,
      historyMeta,
      lastMessages,
      selectedId: get().selectedId === id ? null : get().selectedId,
    });
    saveConvCache(get().conversations);
    try { void deleteConversationMessages(id); } catch { /* ignore */ }
  },

  clearConversationMessages(id) {
    set({
      messagesByConv: { ...get().messagesByConv, [id]: [] },
      historyMeta: { ...get().historyMeta, [id]: { hasMore: false, loadingOlder: false } },
    });
    try { void deleteConversationMessages(id); } catch { /* ignore */ }
  },

  upsertFriend(f, user) {
    if (user) get().upsertUser(user);
    const exists = get().friends.some((x) => x.userId === f.userId);
    set({
      friends: exists
        ? get().friends.map((x) => (x.userId === f.userId ? f : x))
        : [...get().friends, f],
    });
  },

  removeFriend(userId) {
    // Drop the friendship row.
    set({ friends: get().friends.filter((f) => f.userId !== userId) });
    // Per spec: deleting a friend must hide the DM with them from the list.
    // Server-side history is preserved (different concern); we only remove
    // the conversation entry from the client list and unselect if focused.
    const me = get().me;
    if (!me) return;
    const dms = get().conversations.filter(
      (c) => c.kind === "dm" && c.memberIds.includes(userId) && c.memberIds.includes(me.id),
    );
    if (dms.length === 0) return;
    const conversationsById = { ...get().conversationsById };
    const messagesByConv = { ...get().messagesByConv };
    const lastMessages = { ...get().lastMessages };
    for (const dm of dms) {
      delete conversationsById[dm.id];
      delete messagesByConv[dm.id];
      delete lastMessages[dm.id];
    }
    const removedIds = new Set(dms.map((c) => c.id));
    set({
      conversations: get().conversations.filter((c) => !removedIds.has(c.id)),
      conversationsById,
      messagesByConv,
      lastMessages,
      selectedId: removedIds.has(get().selectedId ?? "") ? null : get().selectedId,
    });
  },

  addFriendRequest(r, from) {
    if (from) get().upsertUser(from);
    const exists = get().friendRequests.some((x) => x.id === r.id);
    if (exists) return;
    localStorage.removeItem(FRIEND_REQ_SEEN_KEY);
    set({ friendRequests: [r, ...get().friendRequests], friendRequestsSeenAt: null });
    const name = from?.displayName || from?.username || "";
    get().showToast(t("friends.requestReceivedName", { name }), "info");
  },

  removeFriendRequest(id) {
    set({ friendRequests: get().friendRequests.filter((r) => r.id !== id) });
  },

  applyServerEvent(event, fromClientId) {
    switch (event.type) {
      case "ready":
        get().hydrate(event.data);
        set({ wsStatus: "connected" });
        break;
      case "message:new":
        get().appendMessage(event.message, event.clientId ?? fromClientId);
        break;
      case "message:scheduled": {
        // Clear the pending timer so the message doesn't get marked as failed
        const timer = pendingTimers.get(event.clientId);
        if (timer) {
          clearTimeout(timer);
          pendingTimers.delete(event.clientId);
        }
        // Replace optimistic message (clientId as id) with the real server message id
        // so the later delivery broadcast can find & update it by the server id.
        const convs = get().messagesByConv;
        for (const convId of Object.keys(convs)) {
          const list = convs[convId];
          const idx = list.findIndex((m) => m.id === event.clientId);
          if (idx >= 0) {
            const updated: Message = {
              ...list[idx],
              id: event.messageId,
              pending: true,
              scheduledAt: event.scheduledAt,
            };
            set({ messagesByConv: { ...convs, [convId]: [...list.slice(0, idx), updated, ...list.slice(idx + 1)] } });
            break;
          }
        }
        break;
      }
      case "message:update":
        get().patchMessage(event.message);
        break;
      case "conversation:new":
      case "conversation:update":
        get().upsertConversation(event.conversation);
        break;
      case "conversation:remove":
        get().removeConversation(event.conversationId);
        break;
      case "history:cleared":
        get().clearConversationMessages(event.conversationId);
        break;
      case "typing":
        get().setTyping(event.conversationId, event.userId, event.isTyping);
        break;
      case "presence":
        get().setPresence(event.userId, event.status, event.lastSeen);
        // E2EE：对方上线清除宽限期定时器，离线则启动 10 分钟宽限期
        import("./e2ee-manager.js").then((m) => {
          m.e2eeManager.onPresenceChange(event.userId, event.status !== "offline");
        }).catch(() => {});
        break;
      case "e2ee:started":
      case "e2ee:ended":
        import("./e2ee-manager.js").then((m) => {
          m.useE2eeStore.getState().handleWsEvent(event);
        }).catch(() => {});
        break;
      case "user:update":
        get().upsertUser(event.user);
        break;
      case "friend:request":
        get().addFriendRequest(event.request, event.from);
        break;
      case "friend:update":
        get().upsertFriend(event.friendship, event.user);
        break;
      case "friend:remove":
        get().removeFriend(event.userId);
        break;
      case "user:banned":
        set({ banInfo: { banned: true, reason: event.reason } });
        get().reset();
        break;
      case "read": {
        const me = get().me;
        if (event.userId !== me?.id) {
          const next = { ...get().readMarkers, [event.conversationId]: event.messageId };
          set({ readMarkers: next });
          saveReadCache(next);
          get().upsertChannelReadState(event.conversationId, event.userId, event.messageId);
        }
        break;
      }
      case "captcha_required":
        if (event.clientId && event.conversationId) {
          const list = get().messagesByConv[event.conversationId];
          let msgData: any = { clientId: event.clientId, conversationId: event.conversationId, text: "" };
          if (list) {
            const m = list.find((x) => x.id === event.clientId);
            if (m) {
              msgData.text = m.text;
              msgData.attachments = m.attachments;
              msgData.replyToId = m.replyToId;
              msgData.cardId = m.cardId;
            }
            const next = list.map((m) =>
              m.id === event.clientId
                ? { ...m, pending: false, failed: true, failedReason: t("error.captchaRequired") }
                : m,
            );
            set({
              messagesByConv: { ...get().messagesByConv, [event.conversationId]: next },
            });
          }
          // 保留 E2EE 模式标记
          if (get().e2eeByConversation[event.conversationId] === true) {
            msgData.e2ee = true;
          }
          get().setCaptchaPending(msgData);
        }
        get().showToast(event.message || t("server.captchaRequiredMsg"), "error");
        break;
      case "error":
        console.error("[store] server error:", event.message);
        // If the error refers to a specific optimistic send, flag that message
        // as failed (so the UI shows "未发送" instead of "正在发送").
        if (event.clientId && event.conversationId) {
          const list = get().messagesByConv[event.conversationId];
          if (list) {
            const next = list.map((m) =>
              m.id === event.clientId
                ? { ...m, pending: false, failed: true, failedReason: event.message }
                : m,
            );
            set({
              messagesByConv: { ...get().messagesByConv, [event.conversationId]: next },
            });
          }
        }
        get().showToast(event.message, "error");
        break;
      case "poll:update": {
        const next = {
          ...get().pollResults,
          [event.messageId]: { results: event.results, totalVotes: event.totalVotes },
        };
        savePollResults(next);
        set({ pollResults: next });
        break;
      }
      case "notification:new": {
        set({ notifications: [{ ...event.notification, read: false }, ...get().notifications] });
        getAppState().then((active) => {
          if (!active) {
            import("./notification").then(({ showNotification }) =>
              showNotification(
                event.notification.title,
                event.notification.content,
                { notificationId: event.notification.id },
              ),
            );
          }
        });
        break;
      }
      case "notification:update":
        set({
          notifications: get().notifications.map((n) =>
            n.id === event.notification.id ? { ...n, ...event.notification, read: n.read } : n
          ),
        });
        break;
      case "notification:remove":
        set({
          notifications: get().notifications.filter((n) => n.id !== event.notificationId),
        });
        break;
      case "presence:ping": {
        const me = get().me;
        if (!me || event.fromUserId === me.id) break;
        set({
          presencePing: {
            conversationId: event.conversationId,
            fromUserId: event.fromUserId,
            fromName: event.fromName,
            pingId: event.pingId,
          },
        });
        break;
      }
      case "presence:pong": {
        const user = get().users[event.fromUserId];
        const name = user?.displayName ?? event.fromUserId;
        get().showToast(t("chat.presencePongReceived", { name }), "info");
        break;
      }
    }
  },

  reset() {
    // Clear all pending message timers
    for (const timer of pendingTimers.values()) clearTimeout(timer);
    pendingTimers.clear();
    // 清除所有自动已读定时器
    cancelAllAutoReadTimers();
    set({
      token: null,
      me: null,
      users: {},
      conversations: [],
      conversationsById: {},
      selectedId: null,
      friends: [],
      friendRequests: [],
      notifications: [],
      messagesByConv: {},
      historyMeta: {},
      ready: false,
      wsStatus: "disconnected",
      typing: {},
      unread: {},
      readMarkers: {},
      channelReadStates: {},
      lastMessages: {},
      syncAnchors: {},
      drafts: {},
      toast: null,
      banInfo: null,
      pollResults: {},
      pollDrafts: {},
      presencePing: null,
    });
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(POLL_RESULTS_KEY);
    localStorage.removeItem(CONV_CACHE_KEY);
    localStorage.removeItem(MSG_CACHE_KEY);
    localStorage.removeItem(READ_CACHE_KEY);
    localStorage.removeItem(CHANNEL_READ_CACHE_KEY);
    localStorage.removeItem(SYNC_ANCHOR_KEY);
  },
}));

/**
 * Returns true when there is at least one *unseen* incoming friend request.
 * "Unseen" = received after the user last opened the friend-request inbox.
 * Per spec: opening the friend list alone does NOT clear it; only opening
 * the requests tab does.
 */
export function selectHasUnseenFriendRequests(s: ChatState): boolean {
  if (s.friendRequests.length === 0) return false;
  if (!s.friendRequestsSeenAt) return true;
  const seenAt = safeDateMs(s.friendRequestsSeenAt);
  return s.friendRequests.some((r) => safeDateMs(r.createdAt) > seenAt);
}

/**
 * Returns the set of user ids who currently have a pending incoming friend
 * request from us OR to us. Used to render a red dot on the specific
 * friend/conversation row that's awaiting action.
 */
/**
 * Returns the underlying friendRequests array (stable reference until store
 * updates). Consumers should derive a Set inside `useMemo` to avoid creating
 * new references on every render — returning a fresh Set from a Zustand
 * selector would cause infinite re-renders (React error #185).
 */
export function selectPendingRequesters(s: ChatState) {
  return s.friendRequests;
}

/** True if a given conversation has an unseen friend request bound to it. */
export function selectConvHasFriendRequest(
  s: ChatState,
  conversation: { kind: string; memberIds: ID[] },
): boolean {
  if (conversation.kind !== "dm") return false;
  if (s.friendRequests.length === 0) return false;
  const me = s.me?.id;
  if (!me) return false;
  const other = conversation.memberIds.find((id) => id !== me);
  if (!other) return false;
  return s.friendRequests.some((r) => r.fromUserId === other);
}

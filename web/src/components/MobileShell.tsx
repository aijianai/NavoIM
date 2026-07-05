import { useEffect, useMemo, useRef, useState } from "react";
import { Moon, Sun, Search, LogOut, Sparkles, Users, ArrowLeft, Plus, Settings, Pin, PinOff, Trash2, Shield, Bell, UserPlus, Compass } from "lucide-react";
import {
  useChatStore,
  selectHasUnseenFriendRequests,
  selectPendingRequesters,
} from "../lib/store";
import { ChatView } from "./ChatView";
import { FriendsView } from "./FriendsView";
import { ProfileSettings } from "./ProfileSettings";
import { ChannelManage } from "./ChannelManage";
import { UserCard } from "./UserCard";
import { CreateChannelView } from "./CreateChannelView";
import { DiscoverChannels } from "./DiscoverChannels";
import { AdminPanel } from "./AdminPanel";
import { NotificationView } from "./NotificationBell";
import { useUI } from "../lib/ui";
import { Avatar, GroupAvatar, PresenceDot } from "./Avatar";
import { cn, formatRelative, messageMentionsUser, messagePreview, normalizeEmojiTokens } from "../lib/utils";
import { EmojiText } from "./EmojiText";
import { api } from "../lib/api";
import type { Conversation, PublicUser } from "@navo/shared";
import { useT } from "../lib/i18n";

type MobileView =
  | { kind: "list" }
  | { kind: "chat" }
  | { kind: "friends" }
  | { kind: "settings" }
  | { kind: "admin" }
  | { kind: "createChannel" }
  | { kind: "explore" }
  | { kind: "notifications" }
  | { kind: "userDetail"; userId: string }
  | { kind: "channelManage"; channelId: string };

export function MobileShell() {
  const t = useT();
  const selectedId = useChatStore((s) => s.selectedId);
  const selectConversation = useChatStore((s) => s.selectConversation);
  const openIntent = useChatStore((s) => s.openIntent);
  const [stack, setStack] = useState<MobileView[]>(() => (selectedId ? [{ kind: "list" }, { kind: "chat" }] : [{ kind: "list" }]));

  const view = stack[stack.length - 1];
  const push = (v: MobileView) => setStack((s) => [...s, v]);
  const pop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

  const overlay = useUI((s) => s.overlay);
  const closeUi = useUI((s) => s.close);
  useEffect(() => {
    if (overlay.kind === "userCard") {
      push({ kind: "userDetail", userId: overlay.userId });
      closeUi();
    }
  }, [overlay]);

  const goChat = (id: string) => {
    selectConversation(id);
    setStack([{ kind: "list" }, { kind: "chat" }]);
  };

  // Global "open conversation" intent — fired from places that aren't on the
  // chat list (channel cards, friend cards, command palette). Whenever the
  // counter bumps, slam the stack to [list, chat] so the user actually sees
  // the conversation they asked to open. Skip the very first render (counter
  // starts at 0) so we don't clobber whatever view the user resumed into.
  const lastIntentRef = useRef(openIntent);
  useEffect(() => {
    if (openIntent === lastIntentRef.current) return;
    lastIntentRef.current = openIntent;
    if (useChatStore.getState().selectedId) {
      setStack([{ kind: "list" }, { kind: "chat" }]);
    }
  }, [openIntent]);

  if (view.kind === "chat" && selectedId) {
    return (
      <MobileChat
        onBack={pop}
        onOpenUser={(userId) => push({ kind: "userDetail", userId })}
        onManageChannel={(channelId) => push({ kind: "channelManage", channelId })}
      />
    );
  }

  if (view.kind === "friends") {
    return (
      <MobilePage title={t("nav.friends")} onBack={pop}>
        <FriendsView
          onOpenDM={(id) => goChat(id)}
          onOpenUser={(userId) => push({ kind: "userDetail", userId })}
        />
      </MobilePage>
    );
  }

  if (view.kind === "settings") {
    return (
      <MobilePage title={t("profile.title")} onBack={pop}>
        <ProfileSettings onClose={pop} />
      </MobilePage>
    );
  }

  if (view.kind === "createChannel") {
    return (
      <MobilePage title={t("channel.create")} onBack={pop}>
        <CreateChannelView onClose={pop} />
      </MobilePage>
    );
  }

  if (view.kind === "explore") {
    return (
      <DiscoverChannels onClose={pop} />
    );
  }

  if (view.kind === "notifications") {
    return (
      <MobilePage title={t("nav.notifications")} onBack={pop}>
        <NotificationView embedded onClose={pop} />
      </MobilePage>
    );
  }

  if (view.kind === "userDetail") {
    return <MobileUserDetail userId={view.userId} onBack={pop} onOpenDM={goChat} />;
  }

  if (view.kind === "channelManage") {
    return (
      <MobilePage title={t("channel.manage")} onBack={pop}>
        <ChannelManage conversationId={view.channelId} onClose={pop} />
      </MobilePage>
    );
  }

  if (view.kind === "admin") {
    return <AdminPanel onClose={pop} />;
  }

  return (
    <MobileList
      onOpenChat={goChat}
      onOpenFriends={() => push({ kind: "friends" })}
      onOpenSettings={() => push({ kind: "settings" })}
      onOpenAdmin={() => push({ kind: "admin" })}
      onOpenNotifications={() => push({ kind: "notifications" })}
      onCreateChannel={() => push({ kind: "createChannel" })}
      onExplore={() => push({ kind: "explore" })}
    />
  );
}

function MobilePage({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-x-0 top-0 flex flex-col overflow-hidden bg-app text-ink-primary" style={{ height: "var(--vh)" }}>
      <header className="flex shrink-0 items-center gap-2 border-b border-line-light/70 bg-surface/80 px-3 py-2 backdrop-blur-xl md:px-4 md:py-3">
        <button onClick={onBack} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-surface-soft">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-display text-lg font-semibold tracking-tight">{title}</h1>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

function MobileList({
  onOpenChat,
  onOpenFriends,
  onOpenSettings,
  onCreateChannel,
  onExplore,
  onOpenAdmin,
  onOpenNotifications,
}: {
  onOpenChat: (id: string) => void;
  onOpenFriends: () => void;
  onOpenSettings: () => void;
  onCreateChannel: () => void;
  onExplore: () => void;
  onOpenAdmin: () => void;
  onOpenNotifications: () => void;
}) {
  const t = useT();
  const conversations = useChatStore((s) => s.conversations);
  const users = useChatStore((s) => s.users);
  const me = useChatStore((s) => s.me);
  const unread = useChatStore((s) => s.unread);
  const lastMessages = useChatStore((s) => s.lastMessages);
  const drafts = useChatStore((s) => s.drafts);
  const friendRequests = useChatStore((s) => s.friendRequests);
  const hasUnseenReq = useChatStore(selectHasUnseenFriendRequests);
  const pendingRequestsList = useChatStore(selectPendingRequesters);
  const pendingRequesters = useMemo(() => {
    const set = new Set<string>();
    for (const r of pendingRequestsList) set.add(r.fromUserId);
    return set;
  }, [pendingRequestsList]);
  const theme = useChatStore((s) => s.theme);
  const setTheme = useChatStore((s) => s.setTheme);
  const reset = useChatStore((s) => s.reset);
  const upsertConversation = useChatStore((s) => s.upsertConversation);
  const selectConversation = useChatStore((s) => s.selectConversation);
  const pinnedIds = useChatStore((s) => s.pinnedIds);
  const togglePin = useChatStore((s) => s.togglePin);
  const hiddenConvIds = useChatStore((s) => s.hiddenConvIds);
  const hideConversation = useChatStore((s) => s.hideConversation);
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [adminRole, setAdminRole] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const unreadNotificationCount = useChatStore((s) => s.unreadNotificationCount());

  // 获取管理员角色
  useEffect(() => {
    api.admin.getMyRole()
      .then(setAdminRole)
      .catch(() => {});
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: Event) => {
      const target = e.target as Node | null;
      if (target && menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handler, true);
    window.addEventListener("touchstart", handler, true);
    return () => {
      window.removeEventListener("mousedown", handler, true);
      window.removeEventListener("touchstart", handler, true);
    };
  }, [menuOpen]);

  const visibleConversations = useMemo(() => {
    if (hiddenConvIds.length === 0) return conversations;
    const hidden = new Set(hiddenConvIds);
    return conversations.filter((c) => !hidden.has(c.id));
  }, [conversations, hiddenConvIds]);

  const term = q.trim().toLowerCase();
  const list = term
    ? visibleConversations.filter((c) => {
        if (c.kind === "channel") return c.name?.toLowerCase().includes(term);
        const otherId = me?.id ? c.memberIds.find((id) => id !== me?.id) : undefined;
        const o = otherId ? users[otherId] : undefined;
        return o && (o.displayName.toLowerCase().includes(term) || o.username.toLowerCase().includes(term));
      })
    : visibleConversations;

  // Split into pinned vs normal — pinned items render first with a separator.
  const pinnedSet = new Set(pinnedIds);
  const pinnedList = list
    .filter((c) => pinnedSet.has(c.id))
    .sort((a, b) => pinnedIds.indexOf(a.id) - pinnedIds.indexOf(b.id));
  const normalList = list.filter((c) => !pinnedSet.has(c.id));

  const globalUsers = term
    ? Object.values(users).filter((u) => {
        if (u.id === me?.id || u.username === "navo_ai") return false;
        const inConv = conversations.some((c) => c.memberIds.includes(u.id));
        if (inConv) return false;
        return u.displayName.toLowerCase().includes(term) || u.username.toLowerCase().includes(term);
      }).slice(0, 5)
    : [];

  async function startDM(userId: string) {
    const conv = await api.createDM({ userId });
    upsertConversation(conv);
    selectConversation(conv.id);
    onOpenChat(conv.id);
  }

  return (
    <div className="flex h-dvh flex-col bg-app text-ink-primary">
      <header className="flex items-center justify-between border-b border-line-light/70 bg-surface/80 px-3 py-2 backdrop-blur-xl md:px-4 md:py-3">
        <div className="flex items-center gap-2">
          <NavoMark className="h-8 w-8" />
          <span className="font-display text-lg font-semibold tracking-tight">Navo IM</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-surface-soft">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button onClick={onOpenSettings} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-surface-soft">
            <Settings className="h-4 w-4" />
          </button>
          <button onClick={reset} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-surface-soft">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="px-4 py-3">
        <div className="flex items-center gap-2 rounded-xl border border-line-light/70 bg-surface px-3 py-2">
          <Search className="h-4 w-4 text-ink-muted" />
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("common.search")}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-muted"
          />
        </div>
        <button
          onClick={onOpenFriends}
          className="relative mt-3 flex w-full items-center gap-2.5 rounded-xl border border-line-light/70 bg-surface px-3 py-2.5 text-sm"
        >
          <Users className="h-4 w-4 text-ocean" />
          <span className="flex-1 text-left">{t("nav.friends")}</span>
          {hasUnseenReq && friendRequests.length > 0 && (
            <span className="min-w-[18px] rounded-full bg-black dark:bg-white px-1 py-0.5 text-[10px] font-bold text-white dark:text-black shadow-md">
              {friendRequests.length > 99 ? "99+" : friendRequests.length}
            </span>
          )}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-24">
        {globalUsers.length > 0 && (
          <div className="mb-3">
            <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
              {t("chat.searchResults")} · {t("nav.contacts")}
            </div>
            {globalUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => startDM(u.id)}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-surface-soft"
              >
                <Avatar user={u} size="md" showPresence />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{u.displayName}</div>
                  <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
                    <PresenceDot status={u.status} pulse={false} className="!h-1.5 !w-1.5" />
                    @{u.username}
                  </div>
                </div>
                <span className="rounded-lg bg-brand-soft px-2 py-1 text-[11px] font-medium text-ocean">{t("friends.message")}</span>
              </button>
            ))}
          </div>
        )}
        {pinnedList.length > 0 && (
          <div className="mb-1 px-3 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted flex items-center gap-1.5">
            <Pin className="h-2.5 w-2.5" />
            {t("chat.pinned")}
          </div>
        )}
        {pinnedList.map((c) => (
          <MobileConvItem
            key={c.id}
            conversation={c}
            users={users}
            meId={me?.id}
            unread={unread[c.id] ?? 0}
            lastMessage={lastMessages[c.id]} draft={drafts[c.id]}
            pinned
            onTogglePin={() => togglePin(c.id)}
            onHide={() => hideConversation(c.id)}
            hasFriendRequest={
              c.kind === "dm" && !!c.memberIds.find((id) => id !== me?.id && pendingRequesters.has(id))
            }
            onClick={() => onOpenChat(c.id)}
          />
        ))}
        {pinnedList.length > 0 && normalList.length > 0 && (
          <div className="my-2 mx-3 h-px bg-line-light/70" />
        )}
        {normalList.map((c) => (
          <MobileConvItem
            key={c.id}
            conversation={c}
            users={users}
            meId={me?.id}
            unread={unread[c.id] ?? 0}
            lastMessage={lastMessages[c.id]} draft={drafts[c.id]}
            pinned={false}
            onTogglePin={() => togglePin(c.id)}
            onHide={() => hideConversation(c.id)}
            hasFriendRequest={
              c.kind === "dm" && !!c.memberIds.find((id) => id !== me?.id && pendingRequesters.has(id))
            }
            onClick={() => onOpenChat(c.id)}
          />
        ))}
      </div>

      {/* Telegram-style FAB menu */}
      <div className="absolute bottom-6 right-6" ref={menuRef}>
        {menuOpen && (
          <div className="absolute bottom-16 right-0 z-50 mb-2 min-w-[180px] rounded-2xl border border-line-light/70 bg-surface p-2 shadow-2xl animate-fade-in-up">
            <button
              onClick={() => { setMenuOpen(false); onOpenNotifications(); }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-soft"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ocean/15 text-ocean">
                <Bell className="h-4 w-4" />
              </span>
              <span className="text-sm font-medium text-ink-primary">{t("nav.notifications")}</span>
              {unreadNotificationCount > 0 && (
                <span className="ml-auto rounded-full bg-ocean px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                </span>
              )}
            </button>
            {adminRole && (
              <button
                onClick={() => { setMenuOpen(false); onOpenAdmin(); }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-soft"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-purple-500/15 text-purple-500">
                  <Shield className="h-4 w-4" />
                </span>
                <span className="text-sm font-medium text-ink-primary">{t("admin.dashboard")}</span>
              </button>
            )}
            <button
              onClick={() => { setMenuOpen(false); onExplore(); }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-soft"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal-500/15 text-teal-500">
                <Compass className="h-4 w-4" />
              </span>
              <span className="text-sm font-medium text-ink-primary">{t("channel.discover")}</span>
            </button>
            <button
              onClick={() => { setMenuOpen(false); onCreateChannel(); }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-soft"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-green-500/15 text-green-500">
                <UserPlus className="h-4 w-4" />
              </span>
              <span className="text-sm font-medium text-ink-primary">{t("channel.create")}</span>
            </button>
          </div>
        )}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="relative grid h-14 w-14 place-items-center rounded-2xl bg-brand-gradient text-white shadow-glow transition-transform active:scale-95"
        >
          <Plus className={cn("h-6 w-6 transition-transform", menuOpen && "rotate-45")} />
          {hasUnseenReq && (
            <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full bg-error text-[9px] font-bold text-white shadow-md ring-2 ring-white dark:ring-surface">
              {friendRequests.length > 99 ? "99+" : friendRequests.length}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

function MobileConvItem({
  conversation,
  users,
  meId,
  unread,
  lastMessage,
  draft,
  pinned,
  onTogglePin,
  onHide,
  hasFriendRequest,
  onClick,
}: {
  conversation: Conversation;
  users: Record<string, PublicUser>;
  meId: string | undefined;
  unread: number;
  lastMessage?: import("@navo/shared").Message;
  draft?: string;
  pinned?: boolean;
  onTogglePin?: () => void;
  onHide?: () => void;
  hasFriendRequest?: boolean;
  onClick: () => void;
}) {
  const t = useT();
  const isChannel = conversation.kind === "channel";
  const otherId = !isChannel && meId ? conversation.memberIds.find((id) => id !== meId) : undefined;
  const other = otherId ? users[otherId] : undefined;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef<boolean>(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menu) return;
    const handleDown = (e: Event) => {
      const target = e.target as Node | null;
      if (target && menuRef.current && menuRef.current.contains(target)) return;
      setMenu(null);
    };
    // Defer one frame so the same touchend that triggered the long-press
    // doesn't immediately close the menu via the synthesised tap.
    const id = window.setTimeout(() => {
      window.addEventListener("mousedown", handleDown, true);
      window.addEventListener("touchstart", handleDown, true);
      window.addEventListener("contextmenu", handleDown, true);
      window.addEventListener("scroll", () => setMenu(null), true);
    }, 0);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("mousedown", handleDown, true);
      window.removeEventListener("touchstart", handleDown, true);
      window.removeEventListener("contextmenu", handleDown, true);
    };
  }, [menu]);

  if (!isChannel && !other) return null;

  const previewText = lastMessage ? messagePreview(lastMessage, users) : "";
  const hasDraft = !!draft && draft.trim().length > 0;
  const draftPreview = hasDraft
    ? normalizeEmojiTokens(draft!)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80)
    : "";
  const previewAuthor = lastMessage && isChannel ? users[lastMessage.authorId] : undefined;
  const fallback = isChannel ? conversation.topic ?? t("admin.channels") : `@${other!.username}`;
  const meUser = meId ? users[meId] : undefined;
  // Channel preview badge: only when the latest message is from someone else
  // AND it addresses me. We track the most recent message so the badge is
  // always fresh (clears once the conversation catches up to a new message).
  const mentionedMe =
    isChannel &&
    !!lastMessage &&
    !!meUser &&
    lastMessage.authorId !== meId &&
    messageMentionsUser(lastMessage.text, meUser);
  const subtitle = hasDraft
    ? draftPreview
    : previewText
    ? previewAuthor
      ? `${previewAuthor.displayName}: ${previewText}`
      : previewText
    : fallback;

  function onTouchStart(e: React.TouchEvent) {
    longPressFiredRef.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    const t = e.touches[0];
    if (!t) return;
    const x = t.clientX;
    const y = t.clientY;
    longPressTimer.current = setTimeout(() => {
      longPressFiredRef.current = true;
      setMenu({ x, y });
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate?.(15);
        } catch {
          /* noop */
        }
      }
    }, 500);
  }
  function clearLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }
  function handleClick(e: React.MouseEvent) {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onClick();
  }
  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY });
  }

  return (
    <>
      <button
        onClick={handleClick}
        onContextMenu={onContextMenu}
        onTouchStart={onTouchStart}
        onTouchEnd={clearLongPress}
        onTouchMove={clearLongPress}
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors",
          pinned ? "bg-brand-soft/40 hover:bg-surface-soft" : "hover:bg-surface-soft",
        )}
      >
        {isChannel ? (
          <GroupAvatar
            name={conversation.name}
            conversationId={conversation.id}
            avatarUrl={conversation.avatarUrl}
            icon={conversation.icon}
            size="lg"
          />
        ) : (
          <div className="relative">
            <Avatar user={other!} size="lg" showPresence />
            {hasFriendRequest && (
              <span
                aria-label={t("friends.pendingRequest")}
                className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-error ring-2 ring-surface"
              />
            )}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium flex items-center gap-1.5">
              {isChannel ? conversation.name : other!.displayName}
              {pinned && <Pin className="h-3 w-3 shrink-0 text-ocean" />}
            </span>
            {conversation.lastMessageAt && (
              <span className="shrink-0 text-[11px] text-ink-muted">{formatRelative(conversation.lastMessageAt)}</span>
            )}
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <span
              className={cn(
                "truncate text-xs",
                hasDraft ? "text-danger" : "text-ink-muted",
              )}
            >
              {hasDraft && (
                <span className="mr-1 inline-block rounded bg-danger/15 px-1 text-[10px] font-semibold text-danger">
                  [{t("chat.draft")}]
                </span>
              )}
              {!hasDraft && mentionedMe && (
                <span className="mr-1 inline-block rounded bg-warning/20 px-1 text-[10px] font-semibold text-warning">
                  {t("message.mention")}
                </span>
              )}
              <EmojiText text={subtitle} />
            </span>
            {unread > 0 && (
              <span className="shrink-0 rounded-full bg-ocean px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </div>
        </div>
      </button>
      {menu && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[160px] rounded-xl border border-line-light/70 bg-surface p-1 shadow-2xl"
          style={{
            left: Math.min(menu.x, window.innerWidth - 180),
            top: Math.min(menu.y, window.innerHeight - (onHide ? 110 : 60)),
          }}
        >
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onTogglePin?.();
              setMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-primary hover:bg-surface-soft"
          >
            {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            {pinned ? t("chat.unpin") : t("chat.pinned")}
          </button>
          {onHide && (
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onHide();
                setMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger/10"
            >
              <Trash2 className="h-4 w-4" />
              {t("chat.deleteConversation")}
            </button>
          )}
        </div>
      )}
    </>
  );
}

function MobileChat({
  onBack,
  onOpenUser,
  onManageChannel,
}: {
  onBack: () => void;
  onOpenUser: (userId: string) => void;
  onManageChannel: (channelId: string) => void;
}) {
  const t = useT();
  const selectedId = useChatStore((s) => s.selectedId);
  const conversationsById = useChatStore((s) => s.conversationsById);
  const users = useChatStore((s) => s.users);
  const me = useChatStore((s) => s.me);
  const conversation = selectedId ? conversationsById[selectedId] : undefined;
  if (!conversation) return null;

  const otherId = conversation.kind === "dm" && me?.id ? conversation.memberIds.find((id) => id !== me?.id) : undefined;
  const other = otherId ? users[otherId] : undefined;
  const title = conversation.kind === "channel" ? conversation.name ?? t("nav.chat") : other?.displayName ?? t("chat.dm");

  return (
    <div className="fixed inset-x-0 top-0 flex flex-col overflow-hidden bg-app text-ink-primary" style={{ height: "var(--vh)" }}>
      <header className="flex shrink-0 items-center gap-1.5 border-b border-line-light/70 bg-surface/80 px-2 py-1 backdrop-blur-xl md:px-3 md:py-2.5">
        <button onClick={onBack} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg hover:bg-surface-soft md:h-9 md:w-9 md:rounded-xl">
          <ArrowLeft className="h-4 w-4 md:h-5 md:w-5" />
        </button>
        <button
          onClick={() => {
            if (conversation.kind === "channel") onManageChannel(conversation.id);
            else if (other) onOpenUser(other.id);
          }}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
                    {conversation.kind === "channel" ? (
            <GroupAvatar
              name={conversation.name}
              conversationId={conversation.id}
              avatarUrl={conversation.avatarUrl}
              icon={conversation.icon}
              size="md"
            />
          ) : other ? (
            <Avatar user={other} size="sm" showPresence />
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-display font-semibold tracking-tight">{title}</span>
              {other?.username === "navo_ai" && <Sparkles className="h-3 w-3 shrink-0 text-ocean" />}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
              {other && <PresenceDot status={other.status} pulse={false} />}
              <span className="truncate">
                {conversation.kind === "channel"
                  ? `${conversation.memberIds.length}${t("chat.members")}`
                  : other?.status === "online"
                  ? t("user.online")
                  : t("user.offline")}
              </span>
            </div>
          </div>
        </button>
      </header>
      <div className="min-h-0 flex-1">
        <ChatView onOpenUser={onOpenUser} compact />
      </div>
    </div>
  );
}

function MobileUserDetail({
  userId,
  onBack,
  onOpenDM,
}: {
  userId: string;
  onBack: () => void;
  onOpenDM: (conversationId: string) => void;
}) {
  const t = useT();
  const user = useChatStore((s) => s.users[userId]);
  if (!user) {
    return (
      <MobilePage title={t("nav.contacts")} onBack={onBack}>
        <div className="grid h-full place-items-center text-sm text-ink-muted">{t("server.userNotFound")}</div>
      </MobilePage>
    );
  }
  return (
    <MobilePage title={user.displayName} onBack={onBack}>
      <UserCard
        user={user}
        variant="page"
        onClose={onBack}
        onOpenDM={(id) => {
          onOpenDM(id);
        }}
      />
    </MobilePage>
  );
}

function NavoMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden>
      <defs>
        <linearGradient id="mob-nm-g" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#66B8FF" />
          <stop offset="0.5" stopColor="#2F7DFF" />
          <stop offset="1" stopColor="#8A6CFF" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#mob-nm-g)" />
      <path d="M16 46V18l16 18V18l16 18v10" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

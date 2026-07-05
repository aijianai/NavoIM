import { useEffect, useState } from "react";
import { Moon, Sun, Search, Users, Shield, Bell } from "lucide-react";
import { useChatStore, selectHasUnseenFriendRequests } from "../lib/store";
import { useUI } from "../lib/ui";
import { Sidebar } from "./Sidebar";
import { ChatView } from "./ChatView";
import { MemberPanel } from "./MemberPanel";
import { ProfileSettings } from "./ProfileSettings";
import { FriendsView } from "./FriendsView";
import { NotificationView } from "./NotificationBell";
import { CreateChannelView } from "./CreateChannelView";
import { DiscoverChannels } from "./DiscoverChannels";
import { ChannelManage } from "./ChannelManage";
import { AdminPanel } from "./AdminPanel";
import { ImageViewer } from "./ImageViewer";
import { UserCardPopover } from "./UserCardPopover";
import { Avatar } from "./Avatar";
import { api } from "../lib/api";
import { useT } from "../lib/i18n";

export function AppShell() {
  const theme = useChatStore((s) => s.theme);
  const setTheme = useChatStore((s) => s.setTheme);
  const me = useChatStore((s) => s.me);
  const memberPanelOpen = useChatStore((s) => s.memberPanelOpen);
  const selectedId = useChatStore((s) => s.selectedId);
  const hasUnseenReq = useChatStore(selectHasUnseenFriendRequests);
  const friendRequests = useChatStore((s) => s.friendRequests);
  const unreadNotificationCount = useChatStore((s) => s.unreadNotificationCount());

  const mainView = useUI((s) => s.mainView);
  const overlay = useUI((s) => s.overlay);
  const setMainView = useUI((s) => s.setMainView);
  const openFriends = useUI((s) => s.openFriends);
  const openProfile = useUI((s) => s.openProfile);
  const openNotifications = useUI((s) => s.openNotifications);
  const openCreateChannel = useUI((s) => s.openCreateChannel);
  const openExplore = useUI((s) => s.openExplore);
  const openChannelManage = useUI((s) => s.openChannelManage);
  const openUserCard = useUI((s) => s.openUserCard);
  const closeOverlay = useUI((s) => s.close);

  const t = useT();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminRole, setAdminRole] = useState<any>(null);

  useEffect(() => {
    api.admin.getMyRole()
      .then(setAdminRole)
      .catch(() => {});
  }, []);

  const handleToggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setPaletteOpen(false);
        closeOverlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeOverlay]);

  useEffect(() => {
    if (selectedId && mainView !== "chat") {
      setMainView("chat");
    }
  }, [selectedId]);

  const handleBackToChat = () => setMainView("chat");

  return (
    <div className="fixed inset-x-0 top-0 overflow-hidden bg-app text-ink-primary" style={{ height: "var(--vh)" }}>
      <div className="pointer-events-none fixed inset-0 opacity-60">
        <div className="aurora-bg" />
      </div>

      <div className="relative z-10 grid h-full min-h-0 grid-cols-[64px_300px_minmax(0,1fr)_auto] grid-rows-[minmax(0,1fr)]">
        <aside className="flex flex-col items-center justify-between border-r border-line-light/70 bg-surface/60 py-4 backdrop-blur-xl">
          <div className="flex flex-col items-center gap-3">
            <NavoMark className="h-9 w-9" />
            <RailDivider />
            <RailButton title={`${t("common.search")} (⌘K)`} onClick={() => setPaletteOpen(true)}>
              <Search className="h-4 w-4" />
            </RailButton>
            <RailButton title={t("nav.friends")} onClick={openFriends} dot={hasUnseenReq} count={friendRequests.length}>
              <Users className="h-4 w-4" />
            </RailButton>
            <RailButton title={t("nav.notifications")} onClick={openNotifications} dot={unreadNotificationCount > 0}>
              <Bell className="h-4 w-4" />
            </RailButton>
            {adminRole && (
              <RailButton title={t("admin.dashboard")} onClick={() => setAdminOpen(true)}>
                <Shield className="h-4 w-4" />
              </RailButton>
            )}
          </div>
          <div className="flex flex-col items-center gap-2">
            <RailButton
              title={theme === "dark" ? t("theme.light") : t("theme.dark")}
              onClick={handleToggleTheme}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </RailButton>
            {me && (
              <button
                title={t("profile.title")}
                onClick={openProfile}
                className="relative grid h-10 w-10 place-items-center rounded-xl transition-all hover:ring-2 hover:ring-ocean/50"
              >
                <Avatar user={me} size="sm" />
              </button>
            )}
          </div>
        </aside>

        <Sidebar
          onCreateChannel={openCreateChannel}
          onExplore={openExplore}
          onOpenFriends={openFriends}
          onOpenProfile={openProfile}
        />

        {mainView === "chat" && (
          <ChatView onOpenUser={(userId) => openUserCard(userId)} onManageChannel={() => selectedId && openChannelManage(selectedId)} />
        )}
        {mainView === "friends" && (
          <FriendsView onClose={handleBackToChat} embedded />
        )}
        {mainView === "profile" && (
          <ProfileSettings onClose={handleBackToChat} />
        )}
        {mainView === "notifications" && (
          <NotificationView onClose={handleBackToChat} />
        )}
        {mainView === "createChannel" && (
          <CreateChannelView onClose={handleBackToChat} />
        )}
        {mainView === "explore" && (
          <DiscoverChannels />
        )}

        {memberPanelOpen && selectedId && <MemberPanel />}
      </div>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}

      {overlay.kind === "channelManage" && (
        <ChannelManage conversationId={overlay.channelId} onClose={closeOverlay} />
      )}
      {overlay.kind === "userCard" && (
        <UserCardPopover userId={overlay.userId} onClose={closeOverlay} />
      )}

      {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}

      <ImageViewer />
    </div>
  );
}

function RailDivider() {
  return <div className="my-1 h-px w-7 bg-line-light/70" />;
}

function RailButton({
  title,
  onClick,
  children,
  dot,
  count,
}: {
  title: string;
  onClick?: () => void;
  children: React.ReactNode;
  dot?: boolean;
  count?: number;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="relative grid h-10 w-10 place-items-center rounded-xl text-ink-secondary transition-all hover:bg-surface-soft hover:text-ink-primary hover:shadow-soft"
    >
      {children}
      {dot && !(count ?? 0 > 0) && (
        <span
          aria-hidden
          className="absolute right-1 top-1 h-2 w-2 rounded-full bg-black dark:bg-white shadow-[0_0_0_2px_rgba(255,255,255,0.85)] dark:shadow-[0_0_0_2px_rgba(20,22,28,0.85)]"
        />
      )}
      {(count ?? 0) > 0 && (
        <span className="absolute -right-1 -top-1 min-w-[16px] rounded-full bg-black dark:bg-white px-1 py-0.5 text-[9px] font-bold text-white dark:text-black shadow-md ring-2 ring-white dark:ring-surface">
          {(count ?? 0) > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [q, setQ] = useState("");
  const conversations = useChatStore((s) => s.conversations);
  const users = useChatStore((s) => s.users);
  const me = useChatStore((s) => s.me);
  const selectConversation = useChatStore((s) => s.selectConversation);

  const term = q.trim().toLowerCase();
  const matches = !term
    ? conversations.slice(0, 8)
    : conversations
        .filter((c) => {
          if (c.kind === "channel") return c.name?.toLowerCase().includes(term);
          const otherId = me?.id ? c.memberIds.find((id) => id !== me?.id) : undefined;
          const other = otherId ? users[otherId] : undefined;
          return other?.displayName.toLowerCase().includes(term);
        })
        .slice(0, 8);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-surface-deep/40 px-4 pt-32 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-xl animate-fade-in-up rounded-2xl border border-line-light/70 bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line-light/70 px-4 py-3">
          <Search className="h-4 w-4 text-ink-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("appshell.jumpToPlaceholder")}
            className="flex-1 bg-transparent text-sm text-ink-primary outline-none placeholder:text-ink-muted"
          />
          <kbd className="rounded-md border border-line-light px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">ESC</kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto p-2">
          {matches.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-muted">{t("friends.searchNoResult")}</li>}
          {matches.map((c) => {
            const otherId = c.kind === "dm" && me?.id ? c.memberIds.find((id) => id !== me?.id) : undefined;
            const other = otherId ? users[otherId] : undefined;
            return (
              <li
                key={c.id}
                className="group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-surface-soft"
                onClick={() => {
                  selectConversation(c.id);
                  onClose();
                }}
              >
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-soft text-base">
                  {c.kind === "channel" ? c.icon ?? "#" : other?.displayName.slice(0, 1) ?? "·"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink-primary">
                    {c.kind === "channel" ? c.name : other?.displayName ?? t("common.unknown")}
                  </div>
                  <div className="truncate text-xs text-ink-muted">
                    {c.kind === "channel" ? c.topic ?? "" : `@${other?.username ?? ""}`}
                  </div>
                </div>
                <span className="text-[10px] uppercase tracking-widest text-ink-muted">
                  {c.kind === "channel" ? t("nav.chat") : t("chat.dm")}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function NavoMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden>
      <defs>
        <linearGradient id="rail-nm-g" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#66B8FF" />
          <stop offset="0.5" stopColor="#2F7DFF" />
          <stop offset="1" stopColor="#8A6CFF" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#rail-nm-g)" />
      <path
        d="M16 46V18l16 18V18l16 18v10"
        stroke="white"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

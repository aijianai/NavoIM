import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Hash, Pin, PinOff, Plus, Sparkles, Trash2, Users, Compass } from "lucide-react";
import {
  useChatStore,
  selectHasUnseenFriendRequests,
  selectPendingRequesters,
} from "../lib/store";
import { api } from "../lib/api";
import { Avatar, GroupAvatar, PresenceDot } from "./Avatar";
import { cn, formatRelative, messageMentionsUser, messagePreview, normalizeEmojiTokens } from "../lib/utils";
import { EmojiText } from "./EmojiText";
import type { Conversation, Message, PublicUser } from "@navo/shared";
import { useT } from "../lib/i18n";

interface SidebarProps {
  onCreateChannel: () => void;
  onExplore: () => void;
  onOpenFriends: () => void;
  onOpenProfile: () => void;
}

export function Sidebar({ onCreateChannel, onExplore, onOpenFriends, onOpenProfile }: SidebarProps) {
  const t = useT();
  const conversations = useChatStore((s) => s.conversations);
  const users = useChatStore((s) => s.users);
  const me = useChatStore((s) => s.me);
  const selectedId = useChatStore((s) => s.selectedId);
  const selectConversation = useChatStore((s) => s.selectConversation);
  const unread = useChatStore((s) => s.unread);
  const collapsed = useChatStore((s) => s.collapsed);
  const toggleCollapsed = useChatStore((s) => s.toggleCollapsed);
  const drafts = useChatStore((s) => s.drafts);
  const friendRequests = useChatStore((s) => s.friendRequests);
  const hasUnseenReq = useChatStore(selectHasUnseenFriendRequests);
  const pendingRequestsList = useChatStore(selectPendingRequesters);
  const pendingRequesters = useMemo(() => {
    const set = new Set<string>();
    for (const r of pendingRequestsList) set.add(r.fromUserId);
    return set;
  }, [pendingRequestsList]);
  const upsertConversation = useChatStore((s) => s.upsertConversation);
  const pinnedIds = useChatStore((s) => s.pinnedIds);
  const togglePin = useChatStore((s) => s.togglePin);
  const hiddenConvIds = useChatStore((s) => s.hiddenConvIds);
  const hideConversation = useChatStore((s) => s.hideConversation);
  const lastMessages = useChatStore((s) => s.lastMessages);

  const [q, setQ] = useState("");
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  // Close add menu on outside click
  useEffect(() => {
    if (!addMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [addMenuOpen]);

  const visibleConversations = useMemo(() => {
    if (hiddenConvIds.length === 0) return conversations;
    const hidden = new Set(hiddenConvIds);
    return conversations.filter((c) => !hidden.has(c.id));
  }, [conversations, hiddenConvIds]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return visibleConversations;
    return visibleConversations.filter((c) => {
      if (c.kind === "channel") return c.name?.toLowerCase().includes(t);
      const otherId = me?.id ? c.memberIds.find((id) => id !== me?.id) : undefined;
      const o = otherId ? users[otherId] : undefined;
      return o && (o.displayName.toLowerCase().includes(t) || o.username.toLowerCase().includes(t));
    });
  }, [q, conversations, users, me]);

  const channels = useMemo(() => {
    const list = filtered.filter((c) => c.kind === "channel");
    return splitPinned(list, pinnedIds);
  }, [filtered, pinnedIds]);
  const dms = useMemo(() => {
    const list = filtered.filter((c) => c.kind === "dm");
    return splitPinned(list, pinnedIds);
  }, [filtered, pinnedIds]);

  const globalUsers = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return Object.values(users).filter((u) => {
      if (u.id === me?.id || u.username === "navo_ai") return false;
      const inConv = conversations.some((c) => c.memberIds.includes(u.id));
      if (inConv) return false;
      return u.displayName.toLowerCase().includes(t) || u.username.toLowerCase().includes(t);
    }).slice(0, 5);
  }, [q, users, me, conversations]);

  async function startDM(userId: string) {
    const conv = await api.createDM({ userId });
    upsertConversation(conv);
    selectConversation(conv.id);
  }

  return (
    <aside className="flex h-full flex-col border-r border-line-light/70 bg-surface/60 backdrop-blur-xl">
      <div className="px-5 pb-3 pt-5">
        <div className="flex items-center justify-between">
          <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted">{t("chat.workspace")}</div>
          <div className="font-display text-lg font-semibold tracking-tight">Navo Studio</div>
          </div>
          {me && (
              <button onClick={onOpenProfile} title={t("nav.settings")} className="rounded-full transition-transform hover:scale-105">
              <Avatar user={me} size="sm" showPresence />
            </button>
          )}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <div className="relative flex-1">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("common.search")}
              className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:border-aqua focus:outline-none focus:ring-focus-aqua"
            />
          </div>
          <div className="relative" ref={addMenuRef}>
            <button
              onClick={() => setAddMenuOpen((v) => !v)}
              className="grid h-9 w-9 place-items-center rounded-xl bg-ocean text-white shadow-md transition-colors hover:bg-ocean/90"
              title={t("friends.add")}
            >
              <Plus className="h-4 w-4" />
            </button>
            {addMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl border border-line-light/70 bg-surface shadow-2xl">
                <button
                  onClick={() => { setAddMenuOpen(false); onExplore(); }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-ink-primary transition-colors hover:bg-surface-soft"
                >
                  <Compass className="h-4 w-4 text-ocean" /> {t("channel.discover")}
                </button>
                <button
                  onClick={() => { setAddMenuOpen(false); onCreateChannel(); }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-ink-primary transition-colors hover:bg-surface-soft"
                >
                  <Hash className="h-4 w-4 text-ocean" /> {t("channel.create")}
                </button>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={onOpenFriends}
          className="relative mt-3 flex w-full items-center gap-2.5 rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm text-ink-secondary transition-all hover:border-aqua hover:text-ink-primary"
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

      {globalUsers.length > 0 && (
        <div className="px-3 pb-2">
          <div className="mb-1 px-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">{t("chat.searchResults")} · {t("nav.contacts")}</div>
          {globalUsers.map((u) => (
            <button
              key={u.id}
              onClick={() => startDM(u.id)}
              className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-soft"
            >
              <Avatar user={u} size="xs" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-ink-primary">{u.displayName}</div>
                <div className="text-[10px] text-ink-muted">@{u.username}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <SectionHeader
          title={t("admin.channels")}
          count={channels.pinned.length + channels.normal.length}
          collapsed={!!collapsed.channels}
          onToggle={() => toggleCollapsed("channels")}
        />
        {!collapsed.channels && (
          <ul className="space-y-0.5">
            {channels.pinned.map((c) => (
              <ConversationItem
                key={c.id}
                conversation={c}
                users={users}
                meId={me?.id}
                selected={c.id === selectedId}
                onClick={() => selectConversation(c.id)}
                unread={unread[c.id] ?? 0}
                pinned
                onTogglePin={() => togglePin(c.id)}
                onHide={() => hideConversation(c.id)}
                hasFriendRequest={c.kind === "dm" && !!c.memberIds.find((id) => id !== me?.id && pendingRequesters.has(id))}
                lastMessage={lastMessages[c.id]} draft={drafts[c.id]}
              />
            ))}
            {channels.pinned.length > 0 && channels.normal.length > 0 && <PinDivider />}
            {channels.normal.map((c) => (
              <ConversationItem
                key={c.id}
                conversation={c}
                users={users}
                meId={me?.id}
                selected={c.id === selectedId}
                onClick={() => selectConversation(c.id)}
                unread={unread[c.id] ?? 0}
                pinned={false}
                onTogglePin={() => togglePin(c.id)}
                onHide={() => hideConversation(c.id)}
                hasFriendRequest={c.kind === "dm" && !!c.memberIds.find((id) => id !== me?.id && pendingRequesters.has(id))}
                lastMessage={lastMessages[c.id]} draft={drafts[c.id]}
              />
            ))}
            {channels.pinned.length === 0 && channels.normal.length === 0 && (
              <EmptyHint text={t("channel.noMatch")} />
            )}
          </ul>
        )}

        <SectionHeader
          title={t("chat.dm")}
          count={dms.pinned.length + dms.normal.length}
          collapsed={!!collapsed.dms}
          onToggle={() => toggleCollapsed("dms")}
          className="mt-5"
        />
        {!collapsed.dms && (
          <ul className="space-y-0.5">
            {dms.pinned.map((c) => (
              <ConversationItem
                key={c.id}
                conversation={c}
                users={users}
                meId={me?.id}
                selected={c.id === selectedId}
                onClick={() => selectConversation(c.id)}
                unread={unread[c.id] ?? 0}
                pinned
                onTogglePin={() => togglePin(c.id)}
                onHide={() => hideConversation(c.id)}
                hasFriendRequest={c.kind === "dm" && !!c.memberIds.find((id) => id !== me?.id && pendingRequesters.has(id))}
                lastMessage={lastMessages[c.id]} draft={drafts[c.id]}
              />
            ))}
            {dms.pinned.length > 0 && dms.normal.length > 0 && <PinDivider />}
            {dms.normal.map((c) => (
              <ConversationItem
                key={c.id}
                conversation={c}
                users={users}
                meId={me?.id}
                selected={c.id === selectedId}
                onClick={() => selectConversation(c.id)}
                unread={unread[c.id] ?? 0}
                pinned={false}
                onTogglePin={() => togglePin(c.id)}
                onHide={() => hideConversation(c.id)}
                hasFriendRequest={c.kind === "dm" && !!c.memberIds.find((id) => id !== me?.id && pendingRequesters.has(id))}
                lastMessage={lastMessages[c.id]} draft={drafts[c.id]}
              />
            ))}
            {dms.pinned.length === 0 && dms.normal.length === 0 && <EmptyHint text={t("chat.noDms")} />}
          </ul>
        )}
      </div>
    </aside>
  );
}

function SectionHeader({
  title,
  count,
  collapsed,
  onToggle,
  action,
  className,
}: {
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  action?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("mb-1.5 flex items-center justify-between px-2 pt-2", className)}>
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted transition-colors hover:text-ink-secondary"
      >
        <ChevronRight className={cn("h-3 w-3 transition-transform", !collapsed && "rotate-90")} />
        {title}
        <span className="rounded-full bg-surface-soft px-1.5 py-0.5 font-sans text-[10px] font-medium tracking-normal text-ink-secondary">
          {count}
        </span>
      </button>
      {action && (
        <button
          onClick={action}
          className="grid h-6 w-6 place-items-center rounded-md text-ink-muted hover:bg-surface-soft hover:text-ink-primary"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <li className="px-3 py-2 text-xs text-ink-muted">{text}</li>;
}

function PinDivider() {
  const t = useT();
  return (
    <li role="separator" aria-hidden className="px-3 py-1.5">
      <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-ink-muted">
        <Pin className="h-2.5 w-2.5" />
        <span>{t("chat.pinned")}</span>
        <div className="h-px flex-1 bg-line-light/70" />
      </div>
    </li>
  );
}

function splitPinned<T extends { id: string }>(
  list: T[],
  pinnedIds: string[],
): { pinned: T[]; normal: T[] } {
  if (pinnedIds.length === 0) return { pinned: [], normal: list };
  const pinnedSet = new Set(pinnedIds);
  const pinned: T[] = [];
  const normal: T[] = [];
  for (const c of list) {
    (pinnedSet.has(c.id) ? pinned : normal).push(c);
  }
  // Preserve user pin-order — pinned[] follows the order in pinnedIds.
  pinned.sort((a, b) => pinnedIds.indexOf(a.id) - pinnedIds.indexOf(b.id));
  return { pinned, normal };
}

function ConversationItem({
  conversation,
  users,
  meId,
  selected,
  onClick,
  unread,
  pinned,
  onTogglePin,
  onHide,
  hasFriendRequest,
  lastMessage,
  draft,
}: {
  conversation: Conversation;
  users: Record<string, PublicUser>;
  meId: string | undefined;
  selected: boolean;
  onClick: () => void;
  unread: number;
  pinned?: boolean;
  onTogglePin?: () => void;
  onHide?: () => void;
  hasFriendRequest?: boolean;
  lastMessage?: Message;
  draft?: string;
}) {
  const t = useT();
  const lastPreview = lastMessage ? messagePreview(lastMessage, users) : "";
  // If a draft exists, it trumps the last message preview — the user clearly
  // has unsent content that matters more than what was said earlier.
  const hasDraft = !!draft && draft.trim().length > 0;
  // Strip webp:xxx.webp markers so the preview text reads naturally. Each
  // webp emoji shows up as [表情] in the list.
  const draftPreview = hasDraft
    ? normalizeEmojiTokens(draft!)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80)
    : "";
  const previewText = hasDraft ? draftPreview : lastPreview;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickRef = useRef(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  function openMenuAt(x: number, y: number) {
    suppressClickRef.current = true;
    setMenu({ x, y });
  }
  function closeMenu() {
    setMenu(null);
  }

  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    openMenuAt(e.clientX, e.clientY);
  }
  function onTouchStart(e: React.TouchEvent) {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    const t = e.touches[0];
    if (!t) return;
    const x = t.clientX;
    const y = t.clientY;
    longPressTimer.current = setTimeout(() => {
      openMenuAt(x, y);
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
  function handleClickCapture(e: React.MouseEvent) {
    if (suppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressClickRef.current = false;
    }
  }

  useEffect(() => {
    if (!menu) return;
    const handleDown = (e: Event) => {
      const target = e.target as Node | null;
      if (target && menuRef.current && menuRef.current.contains(target)) return;
      closeMenu();
    };
    // Defer registration by one frame so the same touchend/mouseup that
    // produced the long-press doesn't immediately close the menu.
    const id = window.setTimeout(() => {
      window.addEventListener("mousedown", handleDown, true);
      window.addEventListener("touchstart", handleDown, true);
      window.addEventListener("contextmenu", handleDown, true);
      window.addEventListener("scroll", closeMenu, true);
    }, 0);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("mousedown", handleDown, true);
      window.removeEventListener("touchstart", handleDown, true);
      window.removeEventListener("contextmenu", handleDown, true);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [menu]);

  const handleTogglePin = () => {
    onTogglePin?.();
    closeMenu();
  };
  const handleHide = () => {
    onHide?.();
    closeMenu();
  };

  if (conversation.kind === "channel") {
    const author = lastMessage ? users[lastMessage.authorId] : undefined;
    const meUser = meId ? users[meId] : undefined;
    // In a channel, the *only* way to show the {t("message.mention")} tag is when:
    //  - the latest message is NOT mine, AND
    //  - it mentions me (display name / username / @@all).
    // We deliberately scope to the most recent message so the tag tracks the
    // most recent attention-grabber rather than going stale.
    const mentionedMe =
      !!lastMessage &&
      !!meUser &&
      lastMessage.authorId !== meId &&
      messageMentionsUser(lastMessage.text, meUser);
    const subtitle = hasDraft
      ? draftPreview
      : previewText
      ? author
        ? `${author.displayName}: ${previewText}`
        : previewText
      : conversation.topic ?? "";
    return (
      <li>
        <button
          onClick={onClick}
          onClickCapture={handleClickCapture}
          onContextMenu={onContextMenu}
          onTouchStart={onTouchStart}
          onTouchEnd={clearLongPress}
          onTouchMove={clearLongPress}
          className={cn(
            "group relative flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-all",
            selected
              ? "bg-brand-gradient text-white shadow-soft"
              : pinned
              ? "bg-brand-soft/40 text-ink-secondary hover:bg-surface-soft hover:text-ink-primary"
              : "text-ink-secondary hover:bg-surface-soft hover:text-ink-primary",
          )}
        >
          <GroupAvatar
            name={conversation.name}
            conversationId={conversation.id}
            avatarUrl={conversation.avatarUrl}
            icon={conversation.icon}
            size="sm"
            className={selected ? "ring-2 ring-white/30" : ""}
          />
          <div className="min-w-0 flex-1">
            <div className={cn("truncate font-medium", selected ? "text-white" : "text-ink-primary")}>
              {conversation.name}
            </div>
            {subtitle && (
              <div
                className={cn(
                  "truncate text-xs",
                  hasDraft
                    ? selected
                      ? "text-white"
                      : "text-danger"
                    : selected
                    ? "text-white/80"
                    : "text-ink-muted",
                )}
              >
                {hasDraft && (
                  <span className={cn("mr-1 inline-block rounded px-1 text-[10px] font-semibold",
                    selected ? "bg-white/25 text-white" : "bg-danger/15 text-danger")}>
                    [{t("chat.draft")}]
                  </span>
                )}
                {!hasDraft && mentionedMe && (
                  <span className={cn("mr-1 inline-block rounded px-1 text-[10px] font-semibold",
                    selected ? "bg-white/25 text-white" : "bg-warning/20 text-warning")}>
                    {t("message.mention")}
                  </span>
                )}
                <EmojiText text={subtitle} />
              </div>
            )}
          </div>
          {pinned && <Pin className={cn("h-3 w-3 shrink-0", selected ? "text-white/70" : "text-ocean")} />}
          {unread > 0 && (
            <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              selected ? "bg-white/20 text-white" : "bg-ocean text-white")}>
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
        {menu && <ConvMenu x={menu.x} y={menu.y} pinned={!!pinned} onTogglePin={handleTogglePin} onHide={handleHide} menuRef={menuRef} />}
      </li>
    );
  }

  const otherId = meId ? conversation.memberIds.find((id) => id !== meId) : undefined;
  const other = otherId ? users[otherId] : undefined;
  if (!other) return null;
  const isAI = other.username === "navo_ai";

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  }

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onClickCapture={handleClickCapture}
        onKeyDown={handleKeyDown}
        onContextMenu={onContextMenu}
        onTouchStart={onTouchStart}
        onTouchEnd={clearLongPress}
        onTouchMove={clearLongPress}
        className={cn(
          "group relative flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-all",
          selected
            ? "bg-brand-gradient text-white shadow-soft"
            : pinned
            ? "bg-brand-soft/40 text-ink-secondary hover:bg-surface-soft hover:text-ink-primary"
            : "text-ink-secondary hover:bg-surface-soft hover:text-ink-primary",
        )}
      >
        <div className="relative">
          <Avatar user={other} size="sm" />
          {hasFriendRequest && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-error ring-2 ring-surface" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={cn("truncate font-medium", selected ? "text-white" : "text-ink-primary")}>
              {other.displayName}
            </span>
            {isAI && <Sparkles className={cn("h-3 w-3 shrink-0", selected ? "text-aqua" : "text-ocean")} />}
          </div>
          <div
            className={cn(
              "truncate text-xs",
              hasDraft
                ? selected
                  ? "text-white"
                  : "text-danger"
                : selected
                ? "text-white/80"
                : "text-ink-muted",
            )}
          >
            {hasDraft && (
              <>
                <span className={cn("mr-1 inline-block rounded px-1 text-[10px] font-semibold",
                  selected ? "bg-white/25 text-white" : "bg-danger/15 text-danger")}>
                  [{t("chat.draft")}]
                </span>
                <EmojiText text={draftPreview} />
              </>
            )}
            {!hasDraft && (previewText
              ? <EmojiText text={previewText} />
              : conversation.lastMessageAt
              ? formatRelative(conversation.lastMessageAt)
              : `@${other.username}`)}
          </div>
        </div>
        {pinned && <Pin className={cn("h-3 w-3 shrink-0", selected ? "text-white/70" : "text-ocean")} />}
        <PresenceDot status={other.status} className={cn("shrink-0", selected && "ring-2 ring-white/40")} />
        {unread > 0 && (
          <span className={cn("absolute right-2 top-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
            selected ? "bg-white/20 text-white" : "bg-ocean text-white")}>
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </div>
      {menu && <ConvMenu x={menu.x} y={menu.y} pinned={!!pinned} onTogglePin={handleTogglePin} onHide={handleHide} menuRef={menuRef} />}
    </li>
  );
}

function ConvMenu({
  x,
  y,
  pinned,
  onTogglePin,
  onHide,
  menuRef,
}: {
  x: number;
  y: number;
  pinned: boolean;
  onTogglePin: () => void;
  onHide?: () => void;
  menuRef: React.RefObject<HTMLDivElement>;
}) {
  const t = useT();
  const itemHeight = 40;
  const items = 1 + (onHide ? 1 : 0);
  const estHeight = items * itemHeight + 12;
  return (
    <div
      ref={menuRef}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-50 min-w-[160px] rounded-xl border border-line-light/70 bg-surface p-1 shadow-2xl"
      style={{
        left: Math.min(x, window.innerWidth - 180),
        top: Math.min(y, window.innerHeight - estHeight - 8),
      }}
    >
      <button
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onTogglePin();
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
          }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger/10"
        >
          <Trash2 className="h-4 w-4" />
          {t("chat.deleteConversation")}
        </button>
      )}
    </div>
  );
}

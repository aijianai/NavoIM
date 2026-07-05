import { useState, useEffect } from "react";
import {
  UserPlus,
  Search,
  Check,
  X,
  MessageSquare,
  Ban,
  ShieldOff,
  UserMinus,
  Inbox,
  Trash2,
  Pencil,
  PencilOff,
} from "lucide-react";
import { useChatStore } from "../lib/store";
import { api } from "../lib/api";
import { Avatar, PresenceDot } from "./Avatar";
import { cn, formatRelative } from "../lib/utils";
import { useT } from "../lib/i18n";
import type { Friendship, PublicUser } from "@navo/shared";

interface FriendsViewProps {
  onClose?: () => void;
  onOpenDM?: (conversationId: string) => void;
  onOpenUser?: (userId: string) => void;
  embedded?: boolean;
}

type Tab = "friends" | "requests" | "add";

export function FriendsView({ onClose, onOpenDM, embedded = false }: FriendsViewProps) {
  const t = useT();
  const friends = useChatStore((s) => s.friends);
  const friendRequests = useChatStore((s) => s.friendRequests);
  const users = useChatStore((s) => s.users);
  const markFriendRequestsSeen = useChatStore((s) => s.markFriendRequestsSeen);

  const [tab, setTab] = useState<Tab>("friends");

  useEffect(() => {
    if (tab === "requests") markFriendRequestsSeen();
  }, [tab, markFriendRequestsSeen]);

  const accepted = friends.filter((f) => f.status === "accepted");
  const blockedOnly = friends.filter((f) => f.status === "blocked" && f.blockedByMe);
  const pendingOut = friends.filter((f) => f.status === "pending" && f.direction === "outgoing");

  const reqCount = friendRequests.length;

  return (
    <div className={cn("flex h-full flex-col bg-app", embedded ? "" : "")}>
      <header className="flex items-center justify-between border-b border-line-light/70 bg-surface/60 px-5 py-4 backdrop-blur-xl">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted">contacts</div>
          <h1 className="font-display text-xl font-semibold tracking-tight">{t("friends.title")}</h1>
        </div>
        {onClose && (
          <button onClick={onClose} className="btn-ghost" title={t("common.close")}>
            <X className="h-4 w-4" />
          </button>
        )}
      </header>

      <div className="flex gap-1 border-b border-line-light/70 px-3 py-2">
        <TabButton active={tab === "friends"} onClick={() => setTab("friends")} label={`${t("friends.tab.friends")} ${accepted.length}`} />
        <TabButton
          active={tab === "requests"}
          onClick={() => setTab("requests")}
          label={t("friends.tab.requests")}
          badge={reqCount > 0 ? reqCount : undefined}
        />
        <TabButton active={tab === "add"} onClick={() => setTab("add")} label={t("friends.tab.add")} icon={<UserPlus className="h-3.5 w-3.5" />} />
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {tab === "friends" && (
          <FriendsList
            accepted={accepted}
            blocked={blockedOnly}
            pendingOut={pendingOut}
            users={users}
            onOpenDM={onOpenDM}
          />
        )}
        {tab === "requests" && <RequestsInbox />}
        {tab === "add" && <AddFriend />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  badge,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-brand-gradient text-white shadow-soft" : "text-ink-secondary hover:bg-surface-soft hover:text-ink-primary",
      )}
    >
      {icon}
      {label}
      {badge !== undefined && (
        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", active ? "bg-white/20" : "bg-black dark:bg-white text-white dark:text-black")}>
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

function FriendsList({
  accepted,
  blocked,
  pendingOut,
  users,
  onOpenDM,
}: {
  accepted: Friendship[];
  blocked: Friendship[];
  pendingOut: Friendship[];
  users: Record<string, PublicUser>;
  onOpenDM?: (conversationId: string) => void;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const upsertConversation = useChatStore((s) => s.upsertConversation);
  const selectConversation = useChatStore((s) => s.selectConversation);
  const [busy, setBusy] = useState<string | null>(null);

  const term = q.trim().toLowerCase();
  const filtered = accepted.filter((f) => {
    const u = users[f.userId];
    return u && (!term || u.displayName.toLowerCase().includes(term) || u.username.toLowerCase().includes(term));
  });

  async function openDM(userId: string) {
    setBusy(userId);
    try {
      const conv = await api.createDM({ userId });
      upsertConversation(conv);
      selectConversation(conv.id);
      onOpenDM?.(conv.id);
    } finally {
      setBusy(null);
    }
  }

  async function unblock(userId: string) {
    setBusy(userId);
    try {
      await api.unblockUser(userId);
      try {
        const fresh = await api.getFriendship(userId);
        if (fresh.status === "none") {
          useChatStore.getState().removeFriend(userId);
        } else {
          useChatStore.getState().upsertFriend(fresh);
        }
      } catch {
        const existing = useChatStore.getState().friends.find((f) => f.userId === userId);
        if (existing) {
          useChatStore.getState().upsertFriend({ ...existing, blockedByMe: false });
        }
      }
    } finally {
      setBusy(null);
    }
  }

  if (accepted.length === 0 && blocked.length === 0 && pendingOut.length === 0) {
    return <EmptyState icon={<UserPlus className="h-6 w-6" />} title={t("friends.empty")} hint={t("friends.addHint")} />;
  }

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("friends.searchPlaceholder")}
          className="w-full rounded-xl border border-line-light/70 bg-surface py-2 pl-9 pr-3 text-sm text-ink-primary placeholder:text-ink-muted focus:border-aqua focus:outline-none focus:ring-focus-aqua"
        />
      </div>

      {pendingOut.length > 0 && (
        <Section title={`${t("friends.waitingAccept")} ${pendingOut.length}`}>
          {pendingOut.map((f) => {
            const u = users[f.userId];
            if (!u) return null;
            return (
              <div key={f.userId} className="flex items-center gap-3 rounded-xl px-2 py-2">
                <Avatar user={u} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{u.displayName}</div>
                  <div className="truncate text-[11px] text-ink-muted">{t("friends.requestSent")}</div>
                </div>
                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">{t("friends.pending")}</span>
              </div>
            );
          })}
        </Section>
      )}

      <Section title={`${t("friends.title")} · ${filtered.length}`}>
        {filtered.length === 0 && <div className="px-2 py-2 text-xs text-ink-muted">{t("friends.noMatch")}</div>}
        {filtered.map((f) => {
          const u = users[f.userId];
          if (!u) return null;
          const isBlocked = f.blockedByMe;
          return <FriendRow key={f.userId} f={f} u={u} isBlocked={isBlocked} onOpenDM={openDM} busy={busy} />;
        })}
      </Section>

      {blocked.length > 0 && (
        <Section title={`${t("friends.blocked")} · ${blocked.length}`}>
          {blocked.map((f) => {
            const u = users[f.userId];
            if (!u) return null;
            return (
              <div key={f.userId} className="flex items-center gap-3 rounded-xl px-2 py-2">
                <Avatar user={u} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink-secondary">{u.displayName}</div>
                  <div className="truncate text-[11px] text-ink-muted">{t("friends.blocked")}</div>
                </div>
                <button
                  onClick={() => unblock(u.id)}
                  disabled={busy === u.id}
                  className="flex items-center gap-1 rounded-lg border border-line-light px-2 py-1 text-[11px] font-medium text-ink-secondary hover:border-aqua hover:text-ink-primary disabled:opacity-50"
                >
                  <ShieldOff className="h-3 w-3" /> {t("friends.unblockUser")}
                </button>
              </div>
            );
          })}
        </Section>
      )}
    </div>
  );
}

function RequestsInbox() {
  const t = useT();
  const friendRequests = useChatStore((s) => s.friendRequests);
  const users = useChatStore((s) => s.users);
  const [busy, setBusy] = useState<string | null>(null);

  async function accept(id: string) {
    setBusy(id);
    try {
      await api.acceptFriendRequest(id);
      useChatStore.getState().removeFriendRequest(id);
    } finally {
      setBusy(null);
    }
  }

  async function decline(id: string) {
    setBusy(id);
    try {
      await api.declineFriendRequest(id);
      useChatStore.getState().removeFriendRequest(id);
    } finally {
      setBusy(null);
    }
  }

  if (friendRequests.length === 0) {
    return <EmptyState icon={<Inbox className="h-6 w-6" />} title={t("friends.noRequests")} hint={t("friends.requestHint")} />;
  }

  return (
    <div className="space-y-2">
      {friendRequests.map((r) => {
        const u = users[r.fromUserId];
        return (
          <div key={r.id} className="rounded-2xl border border-line-light/70 bg-surface p-3">
            <div className="flex items-center gap-3">
              {u ? <Avatar user={u} size="md" /> : <div className="h-10 w-10 rounded-full bg-surface-soft" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink-primary">{u?.displayName ?? t("common.unknown")}</div>
                <div className="truncate text-[11px] text-ink-muted">@{u?.username ?? r.fromUserId}</div>
              </div>
              <span className="text-[11px] text-ink-muted">{formatRelative(r.createdAt)}</span>
            </div>
            {r.message && (
              <div className="mt-2 rounded-xl bg-surface-soft px-3 py-2 text-sm text-ink-secondary">{r.message}</div>
            )}
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => accept(r.id)}
                disabled={busy === r.id}
                className="btn-primary flex-1 py-2 text-sm"
              >
                <Check className="h-4 w-4" /> {t("friends.accept")}
              </button>
              <button
                onClick={() => decline(r.id)}
                disabled={busy === r.id}
                className="btn-ghost flex-1 border border-line-light py-2 text-sm"
              >
                <X className="h-4 w-4" /> {t("friends.decline")}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AddFriend() {
  const t = useT();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pendingUser, setPendingUser] = useState<{ userId: string; username: string; displayName: string } | null>(null);
  const [message, setMessage] = useState("");

  const friends = useChatStore((s) => s.friends);

  const friendMap = Object.fromEntries(friends.map((f) => [f.userId, f]));

  function getStatus(userId: string): "none" | "friends" | "pending" | "blocked" {
    const f = friendMap[userId];
    if (!f) return "none";
    if (f.status === "accepted") return "friends";
    if (f.status === "blocked" && f.blockedByMe) return "blocked";
    if (f.status === "pending" && f.direction === "outgoing") return "pending";
    return "none";
  }

  useEffect(() => {
    const term = q.trim();
    if (!term) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const users = await api.searchUsers(term);
        setResults(users);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  function openModal(userId: string, username: string, displayName: string) {
    setPendingUser({ userId, username, displayName });
    setMessage("");
    setResult(null);
  }

  function closeModal() {
    setPendingUser(null);
    setMessage("");
  }

  async function submitRequest() {
    if (!pendingUser) return;
    setBusy(pendingUser.userId);
    setResult(null);
    try {
      const res = await api.sendFriendRequest(pendingUser.username, message.trim() || undefined);
      useChatStore.getState().upsertFriend({
        userId: pendingUser.userId,
        status: res.status,
        direction: "outgoing",
        blockedByMe: false,
        createdAt: new Date().toISOString(),
      });
      setResult({
        kind: "ok",
        text: res.status === "accepted" ? t("friends.alreadyFriends") : t("friends.requestSent"),
      });
      closeModal();
    } catch (err) {
      setResult({ kind: "err", text: err instanceof Error ? err.message : t("friends.sendFailed") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("friends.searchUserPlaceholder")}
          className="w-full rounded-xl border border-line-light/70 bg-surface py-2.5 pl-9 pr-3 text-sm text-ink-primary placeholder:text-ink-muted focus:border-aqua focus:outline-none focus:ring-focus-aqua"
          autoComplete="off"
        />
      </div>

      {result && (
        <div
          className={cn(
            "rounded-xl px-3 py-2 text-sm",
            result.kind === "ok"
              ? "border border-success/40 bg-success/10 text-success"
              : "border border-error/40 bg-error/10 text-error",
          )}
        >
          {result.text}
        </div>
      )}

      {loading && (
        <div className="py-4 text-center text-sm text-ink-muted">{t("friends.searching")}</div>
      )}

      {!loading && q.trim() && results.length === 0 && (
        <div className="py-8 text-center text-sm text-ink-muted">{t("friends.searchNoResult")}</div>
      )}

      {results.length > 0 && (
        <div className="space-y-1">
          {results.map((u) => {
            const status = getStatus(u.id);
            const isBusy = busy === u.id;
            return (
              <div
                key={u.id}
                className="flex items-center gap-3 rounded-xl border border-line-light/70 bg-surface px-3 py-2.5 hover:bg-surface-soft"
              >
                <Avatar user={u} size="sm" showPresence />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink-primary">{u.displayName}</div>
                  <div className="truncate text-[11px] text-ink-muted">@{u.username}</div>
                </div>
                {status === "friends" && (
                  <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success">{t("friends.alreadyAdded")}</span>
                )}
                {status === "pending" && (
                  <span className="rounded-full bg-warning/15 px-3 py-1 text-xs font-medium text-warning">{t("friends.pending")}</span>
                )}
                {status === "blocked" && (
                  <span className="rounded-full bg-ink-muted/15 px-3 py-1 text-xs font-medium text-ink-muted">{t("friends.blocked")}</span>
                )}
                {status === "none" && (
                  <button
                    onClick={() => openModal(u.id, u.username, u.displayName)}
                    disabled={isBusy}
                    className="rounded-lg bg-brand-gradient px-3 py-1.5 text-xs font-medium text-white shadow-soft hover:shadow-glow disabled:opacity-50"
                  >
                    {isBusy ? "…" : t("friends.add")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!q.trim() && (
        <div className="py-8 text-center">
          <UserPlus className="mx-auto mb-2 h-6 w-6 text-ink-muted" />
          <div className="text-sm text-ink-muted">{t("friends.addHint")}</div>
        </div>
      )}

      {pendingUser && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-line-light/70 bg-surface p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-ocean" />
                <span className="font-display text-base font-semibold">{t("friends.addFriend")}</span>
              </div>
              <button onClick={closeModal} className="btn-ghost p-1">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-1 text-xs text-ink-muted">{t("friends.addFriend")} <span className="font-medium text-ink-secondary">@{pendingUser.username}</span> {t("friends.asFriend")}</div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("friends.notePlaceholder")}
              rows={3}
              className="input-base mt-2 w-full resize-none"
              autoFocus
            />
            <div className="mt-3 flex gap-2">
              <button onClick={closeModal} className="btn-ghost flex-1 border border-line-light py-2 text-sm">
                {t("common.cancel")}
              </button>
              <button
                onClick={submitRequest}
                disabled={busy === pendingUser.userId}
                className="btn-primary flex-1"
              >
                {busy === pendingUser.userId ? t("friends.searching") : t("friends.sendRequest")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FriendRow({ f, u, isBlocked, onOpenDM, busy }: { f: Friendship; u: PublicUser; isBlocked: boolean; onOpenDM: (id: string) => void; busy: string | null }) {
  const t = useT();
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState(f.note ?? "");
  const [saving, setSaving] = useState(false);
  const upsertConversation = useChatStore((s) => s.upsertConversation);
  const selectConversation = useChatStore((s) => s.selectConversation);
  const conversations = useChatStore((s) => s.conversations);

  async function saveNote() {
    setSaving(true);
    try {
      await api.setFriendNote(f.userId, noteText);
      useChatStore.getState().upsertFriend({ ...f, note: noteText });
    } catch { /* ignore */ }
    setSaving(false);
    setEditingNote(false);
  }

  async function openDm() {
    const conv = await api.createDM({ userId: u.id });
    upsertConversation(conv);
    selectConversation(conv.id);
    onOpenDM(conv.id);
  }

  async function remove() {
    await api.removeFriend(f.userId);
    useChatStore.getState().removeFriend(f.userId);
  }

  async function block() {
    await api.blockUser(f.userId);
    const existing = useChatStore.getState().friends.find((x) => x.userId === f.userId);
    useChatStore.getState().upsertFriend({
      userId: f.userId,
      status: existing?.status ?? "accepted",
      direction: existing?.direction ?? "none",
      blockedByMe: true,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });
  }

  async function unblock() {
    await api.unblockUser(f.userId);
    const fresh = await api.getFriendship(f.userId);
    if (fresh.status === "none") {
      useChatStore.getState().removeFriend(f.userId);
    } else {
      useChatStore.getState().upsertFriend(fresh);
    }
  }

  async function clearHistory() {
    const conv = conversations.find((c) => c.kind === "dm" && c.memberIds.includes(f.userId) && c.memberIds.length === 2);
    if (conv) await api.clearHistory(conv.id);
  }

  return (
    <div key={f.userId} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-soft cursor-pointer" onClick={openDm}>
      <Avatar user={u} size="sm" showPresence />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-ink-primary">{u.displayName}</span>
          {isBlocked && (
            <span className="rounded-full bg-danger/15 px-1.5 py-0.5 text-[9px] font-medium text-danger">{t("friends.blocked")}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
          <PresenceDot status={u.status} pulse={false} className="!h-1.5 !w-1.5" />
          {u.status === "online" ? t("user.online") : `${t("user.lastSeen")} ${formatRelative(u.lastSeen)}`}
        </div>
        {f.note && !editingNote && (
          <div className="mt-0.5 truncate text-[11px] text-ink-secondary">{t("friends.note")}{f.note}</div>
        )}
        {editingNote && (
          <div className="mt-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder={t("friends.notePlaceholder")}
              className="flex-1 rounded-md border border-line-light bg-surface px-2 py-0.5 text-[11px] text-ink-primary outline-none focus:border-aqua"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") saveNote(); if (e.key === "Escape") { setNoteText(f.note ?? ""); setEditingNote(false); } }}
              disabled={saving}
            />
            <button onClick={saveNote} disabled={saving} className="text-aqua hover:text-ocean" title={t("friends.saveNote")}>
              <Check className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => { setNoteText(f.note ?? ""); setEditingNote(false); }} className="text-ink-muted hover:text-ink-primary" title={t("common.cancel")}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
        <IconAction title={t("friends.message")} onClick={openDm} disabled={busy === u.id}>
          <MessageSquare className="h-4 w-4" />
        </IconAction>
        <IconAction title={editingNote ? t("common.close") : t("friends.editNote")} onClick={() => { setEditingNote(!editingNote); if (!editingNote) setNoteText(f.note ?? ""); }} disabled={busy === u.id}>
          {editingNote ? <PencilOff className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
        </IconAction>
        <IconAction title={t("friends.clearHistory")} onClick={clearHistory} disabled={busy === u.id}>
          <Trash2 className="h-4 w-4" />
        </IconAction>
        {isBlocked ? (
          <IconAction title={t("friends.unblockUser")} onClick={unblock} disabled={busy === u.id}>
            <ShieldOff className="h-4 w-4" />
          </IconAction>
        ) : (
          <IconAction title={t("friends.blockUser")} onClick={block} disabled={busy === u.id}>
            <Ban className="h-4 w-4" />
          </IconAction>
        )}
        <IconAction title={t("friends.removeFriend")} danger onClick={remove} disabled={busy === u.id}>
          <UserMinus className="h-4 w-4" />
        </IconAction>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function IconAction({
  title,
  onClick,
  children,
  danger,
  disabled,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-lg transition-colors disabled:opacity-50",
        danger
          ? "text-ink-muted hover:bg-error/10 hover:text-error"
          : "text-ink-muted hover:bg-surface-soft hover:text-ink-primary",
      )}
    >
      {children}
    </button>
  );
}

function EmptyState({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="grid place-items-center py-16 text-center">
      <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-ocean">{icon}</div>
      <div className="font-display text-base font-semibold text-ink-primary">{title}</div>
      <div className="mt-1 max-w-xs text-sm text-ink-muted">{hint}</div>
    </div>
  );
}

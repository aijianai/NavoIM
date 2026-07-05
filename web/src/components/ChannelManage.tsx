import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Hash,
  Lock,
  Megaphone,
  Camera,
  UserPlus,
  Crown,
  ShieldCheck,
  Shield,
  ShieldOff,
  MicOff,
  Mic,
  Ban,
  UserMinus,
  Check,
  LogOut,
  Trash2,
  Flag,
  MoreHorizontal,
} from "lucide-react";
import { useChatStore } from "../lib/store";
import { useT } from "../lib/i18n";
import { api } from "../lib/api";
import { Avatar } from "./Avatar";
import { DraggableToggle } from "./DraggableToggle";
import { cn } from "../lib/utils";
import { useUI } from "../lib/ui";
import { ReportModal } from "./ReportModal";
import type { ChannelRole, Conversation, ConversationMember, PublicUser } from "@navo/shared";

interface ChannelManageProps {
  conversationId: string;
  onClose: () => void;
}

export function ChannelManage({ conversationId, onClose }: ChannelManageProps) {
  const t = useT();
  const conv = useChatStore((s) => s.conversationsById[conversationId]);
  const users = useChatStore((s) => s.users);
  const me = useChatStore((s) => s.me);
  const friends = useChatStore((s) => s.friends);
  const upsertConversation = useChatStore((s) => s.upsertConversation);

  const [tab, setTab] = useState<"info" | "members" | "add" | "banned">("info");
  const [error, setError] = useState<string | null>(null);

  // Fetch fresh conversation data on mount to get latest members
  useEffect(() => {
    api.getConversation(conversationId).then((c) => {
      if (c.kind === "channel") upsertConversation(c);
    }).catch(() => {});
  }, [conversationId, upsertConversation]);

  if (!conv || conv.kind !== "channel" || !me) return null;

  const myRole: ChannelRole =
    conv.members?.find((m) => m.userId === me.id)?.role ?? "member";
  const canManage = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";
  const bannedCount = (conv.members?.filter((m) => m.banned).length ?? 0);

  async function apply(fn: () => Promise<Conversation>) {
    setError(null);
    try {
      const updated = await fn();
      upsertConversation(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknown"));
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-surface-deep/50 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line-light/70 bg-surface shadow-2xl"
      >
        <div className="pointer-events-none absolute -right-24 -top-24 h-60 w-60 rounded-full bg-brand-gradient opacity-20 blur-3xl" />

        <header className="flex items-center justify-between border-b border-line-light/70 px-6 py-4">
          <div className="flex items-center gap-3">
            <ChannelAvatar conv={conv} />
            <div>
              <div className="font-display text-lg font-semibold tracking-tight">{conv.name}</div>
              <div className="text-[11px] text-ink-muted">
                {conv.isPrivate ? t("channel.private") : t("channel.public")} · {conv.memberIds.length}{t("chat.members")}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex gap-1 border-b border-line-light/70 px-4 pt-2">
          <TabButton active={tab === "info"} onClick={() => setTab("info")}>
            {t("channel.info")}
          </TabButton>
          <TabButton active={tab === "members"} onClick={() => setTab("members")}>
            {t("member.member")} · {conv.memberIds.length}
          </TabButton>
          {canManage && (
            <TabButton active={tab === "add"} onClick={() => setTab("add")}>
              {t("channel.addMember")}
            </TabButton>
          )}
          {canManage && bannedCount > 0 && (
            <TabButton active={tab === "banned"} onClick={() => setTab("banned")}>
              {t("channel.banned")} · {bannedCount}
            </TabButton>
          )}
        </div>

        {error && (
          <div className="mx-6 mt-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {tab === "info" && (
            <InfoTab conv={conv} canManage={canManage} isOwner={isOwner} apply={apply} onClose={onClose} />
          )}
          {tab === "members" && (
            <MembersTab conv={conv} users={users} meId={me.id} myRole={myRole} apply={apply} />
          )}
          {tab === "add" && canManage && (
            <AddTab conv={conv} users={users} friends={friends} apply={apply} />
          )}
          {tab === "banned" && canManage && (
            <BannedTab conv={conv} users={users} apply={apply} />
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-t-xl px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "border-b-2 border-ocean text-ink-primary"
          : "text-ink-muted hover:text-ink-secondary",
      )}
    >
      {children}
    </button>
  );
}

function ChannelAvatar({ conv }: { conv: Conversation }) {
  if (conv.avatarUrl) {
    return <img src={conv.avatarUrl} alt={conv.name} className="h-11 w-11 rounded-2xl object-cover" />;
  }
  return (
    <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-soft text-xl">
      {conv.icon ?? (conv.isPrivate ? <Lock className="h-5 w-5" /> : <Hash className="h-5 w-5" />)}
    </div>
  );
}

function InfoTab({
  conv,
  canManage,
  isOwner,
  apply,
  onClose,
}: {
  conv: Conversation;
  canManage: boolean;
  isOwner: boolean;
  apply: (fn: () => Promise<Conversation>) => Promise<void>;
  onClose: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(conv.name ?? "");
  const [topic, setTopic] = useState(conv.topic ?? "");
  const [announcement, setAnnouncement] = useState(conv.announcement ?? "");
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState<null | "leave" | "disband">(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const removeConversation = useChatStore((s) => s.removeConversation);
  const showToast = useChatStore((s) => s.showToast);

  async function uploadAvatar(file: File) {
    setUploading(true);
    try {
      const att = await api.upload(file);
      await apply(() => api.updateChannel(conv.id, { avatarUrl: att.url }));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    await apply(() =>
      api.updateChannel(conv.id, { name: name.trim(), topic: topic.trim(), announcement: announcement.trim() }),
    );
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  }

  async function leave() {
    setBusy(true);
    setErr(null);
    try {
      await api.leaveChannel(conv.id);
      removeConversation(conv.id);
      showToast(t("channel.leaveSuccess"), "info");
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("common.unknown"));
    } finally {
      setBusy(false);
    }
  }

  async function disband() {
    setBusy(true);
    setErr(null);
    try {
      await api.disbandChannel(conv.id);
      removeConversation(conv.id);
      showToast(t("channel.disbandSuccess"), "info");
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("common.unknown"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="relative">
          <ChannelAvatar conv={conv} />
          {canManage && (
            <label className="absolute -bottom-1 -right-1 grid h-6 w-6 cursor-pointer place-items-center rounded-full bg-ocean text-white shadow-soft">
              <Camera className="h-3 w-3" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => e.target.files?.[0] && void uploadAvatar(e.target.files[0])}
              />
            </label>
          )}
        </div>
        <div className="text-xs text-ink-muted">
          {uploading ? t("common.loading") : canManage ? t("channel.changeAvatar") : t("channel.avatar")}
        </div>
      </div>

      <Field label={t("channel.nameRequired")}>
        <input
          className="input-base"
          value={name}
          disabled={!canManage}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      <Field label={t("channel.description")}>
        <input
          className="input-base"
          value={topic}
          disabled={!canManage}
          onChange={(e) => setTopic(e.target.value)}
        />
      </Field>

      <Field label={<span className="inline-flex items-center gap-1"><Megaphone className="h-3.5 w-3.5" /> {t("channel.announcement")}</span>}>
        <textarea
          className="input-base min-h-[80px] resize-none"
          value={announcement}
          disabled={!canManage}
          placeholder={canManage ? t("channel.announcementPlaceholder") : t("channel.noAnnouncement")}
          onChange={(e) => setAnnouncement(e.target.value)}
        />
      </Field>

      {canManage && (
        <div className="flex items-center justify-between rounded-xl border border-line-light bg-surface-soft/40 p-3">
          <div>
            <div className="text-sm font-medium">{t("channel.muteAll")}</div>
            <div className="text-xs text-ink-muted">{t("channel.muteAllDesc")}</div>
          </div>
          <DraggableToggle
            on={!!conv.muteAll}
            onChange={(v) => void apply(() => api.updateChannel(conv.id, { muteAll: v }))}
          />
        </div>
      )}

      {canManage && (
        <div className="flex items-center justify-between rounded-xl border border-line-light bg-surface-soft/40 p-3">
          <div>
            <div className="text-sm font-medium">{t("channel.allowInvite")}</div>
            <div className="text-xs text-ink-muted">{t("channel.allowInviteDesc")}</div>
          </div>
          <DraggableToggle
            on={!!conv.membersCanInvite}
            onChange={(v) => void apply(() => api.updateChannel(conv.id, { membersCanInvite: v }))}
          />
        </div>
      )}

      {canManage && (
        <div className="flex items-center justify-between rounded-xl border border-line-light bg-surface-soft/40 p-3">
          <div>
            <div className="text-sm font-medium">{t("channel.makePublic")}</div>
            <div className="text-xs text-ink-muted">{t("channel.makePublicDesc")}</div>
          </div>
          <DraggableToggle
            on={!conv.isPrivate}
            onChange={(v) => void apply(() => api.updateChannel(conv.id, { isPrivate: !v }))}
          />
        </div>
      )}

      {canManage && (
        <button onClick={save} className="btn-primary w-full">
          {saved ? (
            <>
              <Check className="h-4 w-4" /> {t("common.saved")}
            </>
          ) : (
            t("channel.saveInfo")
          )}
        </button>
      )}
      {!isOwner && canManage && (
        <p className="text-center text-[11px] text-ink-muted">{t("channel.adminCanEdit")}</p>
      )}

      {/* Danger zone — leave (members/admins) or disband (owner only). */}
      <div className="mt-2 border-t border-line-light/70 pt-4">
        {err && (
          <div className="mb-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {err}
          </div>
        )}
        {isOwner ? (
          <button
            onClick={() => setConfirm("disband")}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-danger/40 px-4 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> {t("channel.disband")}
          </button>
        ) : (
          <button
            onClick={() => setConfirm("leave")}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-line-light px-4 py-2 text-sm font-medium text-ink-secondary transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" /> {t("channel.leave")}
          </button>
        )}
        {isOwner && (
          <p className="mt-2 text-center text-[11px] text-ink-muted">{t("channel.ownerCannotLeave")}</p>
        )}
      </div>

      {!isOwner && (
        <button
          onClick={() => setReportOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-line-light px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-danger/40 hover:text-danger"
        >
          <Flag className="h-4 w-4" /> {t("message.report")} {t("admin.channels")}
        </button>
      )}

      {confirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
          onClick={() => !busy && setConfirm(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-line-light/70 bg-surface p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-display text-base font-semibold">
              {confirm === "leave" ? t("channel.leaveConfirm") : t("channel.disbandConfirm")}
            </div>
            <div className="mt-2 text-sm text-ink-secondary">
              {confirm === "leave"
                ? t("channel.leaveDesc")
                : t("channel.disbandDesc")}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirm(null)}
                disabled={busy}
                className="btn-ghost flex-1 border border-line-light py-2 text-sm"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => (confirm === "leave" ? void leave() : void disband())}
                disabled={busy}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-white",
                  confirm === "disband" ? "bg-danger" : "bg-brand-gradient",
                )}
              >
                {busy ? t("common.loading") : t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {reportOpen && (
        <ReportModal
          targetType="channel"
          targetId={conv.id}
          targetName={conv.name ?? t("admin.channels")}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}

function MembersTab({
  conv,
  users,
  meId,
  myRole,
  apply,
}: {
  conv: Conversation;
  users: Record<string, PublicUser>;
  meId: string;
  myRole: ChannelRole;
  apply: (fn: () => Promise<Conversation>) => Promise<void>;
}) {
  const members: ConversationMember[] = useMemo(() => {
    if (conv.members && conv.members.length > 0) return conv.members;
    return conv.memberIds.map((id) => ({ userId: id, role: "member" as ChannelRole, muted: false, banned: false, joinedAt: conv.createdAt }));
  }, [conv]);

  const order = { owner: 0, admin: 1, member: 2 };
  const sorted = [...members].sort((a, b) => order[a.role] - order[b.role]);

  return (
    <ul className="space-y-1">
      {sorted.map((m) => {
        const u = users[m.userId];
        if (!u) return null;
        return (
          <MemberRow
            key={m.userId}
            member={m}
            user={u}
            isSelf={m.userId === meId}
            myRole={myRole}
            channelId={conv.id}
            apply={apply}
          />
        );
      })}
    </ul>
  );
}

function MemberRow({
  member,
  user,
  isSelf,
  myRole,
  channelId,
  apply,
}: {
  member: ConversationMember;
  user: PublicUser;
  isSelf: boolean;
  myRole: ChannelRole;
  channelId: string;
  apply: (fn: () => Promise<Conversation>) => Promise<void>;
}) {
  const canManageThis =
    !isSelf &&
    member.role !== "owner" &&
    (myRole === "owner" || (myRole === "admin" && member.role === "member"));
  const canSetAdmin = myRole === "owner" && member.role !== "owner" && !isSelf;
  const canTransferOwner = myRole === "owner" && member.role !== "owner" && !isSelf;
  const t = useT();
  const openUserCard = useUI((s) => s.openUserCard);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  function closeMenu() { setMenuOpen(false); }

  const hasActions = canSetAdmin || canTransferOwner || canManageThis;

  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-soft">
      <button onClick={() => openUserCard(user.id)} className="shrink-0 rounded-full transition-opacity hover:opacity-80">
        <Avatar user={user} size="sm" showPresence />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{user.displayName}</span>
          <RoleBadge role={member.role} />
          {member.muted && <MicOff className="h-3 w-3 text-warning" />}
        </div>
        <div className="truncate text-[11px] text-ink-muted">@{user.username}</div>
      </div>

      {/* ─── Desktop: inline action buttons ────────────────────── */}
      <div className="hidden md:flex items-center gap-1">
        {canSetAdmin && (
          <IconAction
            title={member.role === "admin" ? t("channel.cancelAdmin") : t("channel.setAdmin")}
            onClick={() =>
              void apply(() =>
                api.setRole(channelId, user.id, member.role === "admin" ? "member" : "admin"),
              )
            }
          >
            {member.role === "admin" ? <Shield className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
          </IconAction>
        )}
        {canTransferOwner && (
          <IconAction
            title={t("channel.transferOwner")}
            onClick={() =>
              void apply(() => api.setRole(channelId, user.id, "owner"))
            }
          >
            <Crown className="h-4 w-4 text-warning" />
          </IconAction>
        )}
        {canManageThis && (
          <>
            <IconAction
              title={member.muted ? t("channel.unmute") : t("channel.mute")}
              onClick={() => void apply(() => api.setMuted(channelId, user.id, !member.muted))}
            >
              {member.muted ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            </IconAction>
            <IconAction
              title={t("channel.removeMember")}
              onClick={() => void apply(() => api.removeMember(channelId, user.id))}
            >
              <UserMinus className="h-4 w-4" />
            </IconAction>
            <IconAction
              title={t("admin.banUser")}
              danger
              onClick={() => void apply(() => api.setBanned(channelId, user.id, true))}
            >
              <Ban className="h-4 w-4" />
            </IconAction>
          </>
        )}
      </div>

      {/* ─── Mobile: three-dot menu ────────────────────────────── */}
      {hasActions && (
        <div className="relative flex md:hidden">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-soft hover:text-ink-primary"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
          {menuOpen && (
            <div
              ref={menuRef}
              className="absolute right-0 top-9 z-50 min-w-[150px] overflow-hidden rounded-xl border border-line-light/70 bg-surface py-1 shadow-2xl"
            >
              {canSetAdmin && (
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink-primary hover:bg-surface-soft"
                  onClick={() => {
                    closeMenu();
                    void apply(() =>
                      api.setRole(channelId, user.id, member.role === "admin" ? "member" : "admin"),
                    );
                  }}
                >
                  {member.role === "admin" ? <Shield className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                  {member.role === "admin" ? t("channel.cancelAdmin") : t("channel.setAdmin")}
                </button>
              )}
              {canTransferOwner && (
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-warning hover:bg-surface-soft"
                  onClick={() => {
                    closeMenu();
                    void apply(() => api.setRole(channelId, user.id, "owner"));
                  }}
                >
                  <Crown className="h-4 w-4" />
                  {t("channel.transferOwner")}
                </button>
              )}
              {canManageThis && (
                <>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink-primary hover:bg-surface-soft"
                    onClick={() => {
                      closeMenu();
                      void apply(() => api.setMuted(channelId, user.id, !member.muted));
                    }}
                  >
                    {member.muted ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                    {member.muted ? t("channel.unmute") : t("channel.mute")}
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink-primary hover:bg-surface-soft"
                    onClick={() => {
                      closeMenu();
                      void apply(() => api.removeMember(channelId, user.id));
                    }}
                  >
                    <UserMinus className="h-4 w-4" />
                    {t("channel.removeMember")}
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-surface-soft"
                    onClick={() => {
                      closeMenu();
                      void apply(() => api.setBanned(channelId, user.id, true));
                    }}
                  >
                    <Ban className="h-4 w-4" />
                    {t("admin.banUser")}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function RoleBadge({ role }: { role: ChannelRole }) {
  const t = useT();
  if (role === "member") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
        role === "owner" ? "bg-warning/15 text-warning" : "bg-ocean/15 text-ocean",
      )}
    >
      {role === "owner" ? <Crown className="h-2.5 w-2.5" /> : <ShieldCheck className="h-2.5 w-2.5" />}
      {role === "owner" ? t("member.owner") : t("member.admin")}
    </span>
  );
}

function AddTab({
  conv,
  users,
  friends,
  apply,
}: {
  conv: Conversation;
  users: Record<string, PublicUser>;
  friends: { userId: string; status: string }[];
  apply: (fn: () => Promise<Conversation>) => Promise<void>;
}) {
  const t = useT();
  const openUserCard = useUI((s) => s.openUserCard);
  const [q, setQ] = useState("");
  const candidates = useMemo(() => {
    const memberSet = new Set(conv.memberIds);
    const friendIds = new Set(friends.filter((f) => f.status === "accepted").map((f) => f.userId));
    const list = Object.values(users).filter(
      (u) => friendIds.has(u.id) && !memberSet.has(u.id) && u.username !== "navo_ai",
    );
    const ql = q.trim().toLowerCase();
    return ql
      ? list.filter((u) => u.displayName.toLowerCase().includes(ql) || u.username.toLowerCase().includes(ql))
      : list;
  }, [conv, users, friends, q]);

  return (
    <div className="space-y-3">
      <input
        className="input-base"
        placeholder={t("friends.searchPlaceholder")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <ul className="space-y-1">
        {candidates.length === 0 && (
          <li className="py-6 text-center text-sm text-ink-muted">
            {q.trim() ? t("friends.noMatch") : t("channel.noFriendToAdd")}
          </li>
        )}
        {candidates.map((u) => (
          <li key={u.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-soft">
            <button onClick={() => openUserCard(u.id)} className="shrink-0 rounded-full transition-opacity hover:opacity-80">
              <Avatar user={u} size="sm" showPresence />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{u.displayName}</div>
              <div className="truncate text-[11px] text-ink-muted">@{u.username}</div>
            </div>
            <button
              onClick={() => void apply(() => api.addMember(conv.id, u.id))}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-gradient px-3 py-1.5 text-xs font-medium text-white shadow-soft hover:shadow-glow"
            >
              <UserPlus className="h-3.5 w-3.5" /> {t("friends.add")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BannedTab({
  conv,
  users,
  apply,
}: {
  conv: Conversation;
  users: Record<string, PublicUser>;
  apply: (fn: () => Promise<Conversation>) => Promise<void>;
}) {
  const t = useT();
  const openUserCard = useUI((s) => s.openUserCard);
  const banned = (conv.members ?? []).filter((m) => m.banned);
  return (
    <ul className="space-y-1">
      {banned.length === 0 && <li className="py-6 text-center text-sm text-ink-muted">{t("friends.blocked")}</li>}
      {banned.map((m) => {
        const u = users[m.userId];
        if (!u) return null;
        return (
          <li key={m.userId} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-soft">
            <button onClick={() => openUserCard(u.id)} className="shrink-0 rounded-full transition-opacity hover:opacity-80">
              <Avatar user={u} size="sm" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink-primary">{u.displayName}</div>
              <div className="truncate text-[11px] text-ink-muted">@{u.username}</div>
            </div>
            <button
              onClick={() => void apply(() => api.setBanned(conv.id, u.id, false))}
              className="inline-flex items-center gap-1 rounded-lg border border-line-light px-3 py-1.5 text-xs font-medium text-ink-secondary hover:border-aqua hover:text-ink-primary"
            >
              <ShieldOff className="h-3.5 w-3.5" /> {t("channel.unban")}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">
        {label}
      </span>
      {children}
    </label>
  );
}

function IconAction({
  title,
  onClick,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-lg transition-colors",
        danger
          ? "text-danger hover:bg-danger/10"
          : "text-ink-muted hover:bg-surface-soft hover:text-ink-primary",
      )}
    >
      {children}
    </button>
  );
}

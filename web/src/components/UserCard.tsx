import { useEffect, useState } from "react";
import { MessageSquare, UserPlus, UserMinus, Ban, ShieldOff, Check, Flag } from "lucide-react";
import { useChatStore } from "../lib/store";
import { useT } from "../lib/i18n";
import { api } from "../lib/api";
import { Avatar, PresenceDot } from "./Avatar";
import { cn, formatRelative } from "../lib/utils";
import { getOrgDisplayPath } from "../lib/org-cache";
import { ReportModal } from "./ReportModal";
import type { Friendship, PublicUser } from "@navo/shared";

interface UserCardProps {
  user: PublicUser;
  onClose?: () => void;
  onOpenDM?: (conversationId: string) => void;
  variant?: "popover" | "page";
}

export function UserCard({ user, onClose, onOpenDM, variant = "popover" }: UserCardProps) {
  const t = useT();
  const me = useChatStore((s) => s.me);
  const friends = useChatStore((s) => s.friends);
  const upsertFriend = useChatStore((s) => s.upsertFriend);
  const removeFriend = useChatStore((s) => s.removeFriend);
  const upsertConversation = useChatStore((s) => s.upsertConversation);
  const selectConversation = useChatStore((s) => s.selectConversation);

  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [orgName, setOrgName] = useState<string | null>(null);

  const isSelf = me?.id === user.id;
  const isAI = user.username === "navo_ai";
  // The store value is the source of truth; it auto-updates on friend:update WS events.
  const friendship: Friendship | undefined = friends.find((f) => f.userId === user.id);

  // Always refresh friendship state when the page opens so the block button
  // reflects the latest server-side reality (not stale local state).
  useEffect(() => {
    if (isSelf || isAI) return;
    let cancelled = false;
    api
      .getFriendship(user.id)
      .then((fresh) => {
        if (cancelled) return;
        // status='none' means there is no relationship row. Drop any stale
        // local entry so the UI reverts to the "add friend" state.
        if (fresh.status === "none") {
          const existing = useChatStore.getState().friends.find((f) => f.userId === user.id);
          if (existing) removeFriend(user.id);
          return;
        }
        upsertFriend(fresh);
      })
      .catch(() => {
        /* offline / 401 — keep local state */
      });
    return () => {
      cancelled = true;
    };
  }, [user.id, isSelf, isAI, upsertFriend, removeFriend]);

  useEffect(() => {
    if (!user.organizationId) { setOrgName(null); return; }
    let cancelled = false;
    getOrgDisplayPath(user.organizationId).then((name) => {
      if (!cancelled) setOrgName(name);
    });
    return () => { cancelled = true; };
  }, [user.organizationId]);

  async function run(action: () => Promise<unknown>, successNote?: string) {
    setBusy(true);
    setNote(null);
    try {
      await action();
      if (successNote) setNote(successNote);
    } catch (e) {
      setNote(e instanceof Error ? e.message : t("common.unknown"));
    } finally {
      setBusy(false);
    }
  }

  async function openDM() {
    const conv = await api.createDM({ userId: user.id });
    upsertConversation(conv);
    selectConversation(conv.id);
    onOpenDM?.(conv.id);
    onClose?.();
  }

  const isPage = variant === "page";

  return (
    <div
      className={cn(
        "overflow-hidden bg-surface",
        isPage ? "h-full" : "w-80 rounded-2xl border border-line-light/70 shadow-2xl",
      )}
    >
      {/* Gradient header */}
      <div className="relative h-24 bg-brand-gradient">
        <div className="pointer-events-none absolute inset-0 opacity-40 mix-blend-overlay" style={coverNoise} />
      </div>

      <div className="px-5 pb-5">
        <div className="-mt-10 mb-3 flex items-end justify-between">
          <Avatar user={user} size="xl" ring showPresence />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-display text-xl font-semibold tracking-tight">{user.displayName}</h3>
          {orgName && <OrgBadge name={orgName} title={user.orgTitle} />}
          {isAI && (
            <span className="rounded-full border border-aqua/40 bg-aqua/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ocean">
              AI
            </span>
          )}
        </div>
        <div className="text-sm text-ink-muted">@{user.username}</div>

        {user.email && <div className="mt-1 text-xs text-ink-muted">{user.email}</div>}

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Tag>
            <PresenceDot status={user.status} pulse={false} className="!h-1.5 !w-1.5" />
            {statusLabel(t, user.status)}
          </Tag>
          <Tag>{t("user.gender")} · {genderLabel(t, user.gender)}</Tag>
          {user.status !== "online" && <Tag>{t("user.lastSeen")} {formatRelative(user.lastSeen)}</Tag>}
        </div>

        {user.bio && <p className="mt-3 text-sm leading-relaxed text-ink-secondary">{user.bio}</p>}

        {note && (
          <div className="mt-3 rounded-lg border border-line-light bg-surface-soft px-3 py-2 text-xs text-ink-secondary">
            {note}
          </div>
        )}

        {!isSelf && (
          <div className="mt-4 space-y-2">
            <button onClick={openDM} disabled={busy} className="btn-primary w-full">
              <MessageSquare className="h-4 w-4" />
              {t("friends.message")}
            </button>

            {!isAI && (
              <div className="grid grid-cols-2 gap-2">
                {friendship?.status === "accepted" ? (
                  <button
                    onClick={() => run(() => api.removeFriend(user.id), t("friends.removed"))}
                    disabled={busy}
                    className="btn-ghost border border-line-light"
                  >
                    <UserMinus className="h-4 w-4" /> {t("friends.removeFriend")}
                  </button>
                ) : friendship?.direction === "outgoing" ? (
                  <button disabled className="btn-ghost border border-line-light opacity-70">
                    <Check className="h-4 w-4" /> {t("friends.requestSent")}
                  </button>
                ) : friendship?.direction === "incoming" ? (
                  <button
                    onClick={() =>
                      run(async () => {
                        const reqId = useChatStore
                          .getState()
                          .friendRequests.find((r) => r.fromUserId === user.id)?.id;
                        if (reqId) await api.acceptFriendRequest(reqId);
                      }, t("friends.accepted"))
                    }
                    disabled={busy}
                    className="btn-primary"
                  >
                    <Check className="h-4 w-4" /> {t("friends.accept")}
                  </button>
                ) : (
                  <button
                    onClick={() =>
                      run(async () => {
                        const r = await api.sendFriendRequest(user.username);
                        return r;
                      }, t("friends.requestSent"))
                    }
                    disabled={busy}
                    className="btn-ghost border border-line-light"
                  >
                    <UserPlus className="h-4 w-4" /> {t("friends.addFriend")}
                  </button>
                )}

                {friendship?.blockedByMe ? (
                  <button
                    onClick={() =>
                      run(async () => {
                        await api.unblockUser(user.id);
                        const fresh = await api.getFriendship(user.id);
                        if (fresh.status === "none") {
                          removeFriend(user.id);
                        } else {
                          upsertFriend(fresh);
                        }
                      }, t("friends.unblocked"))
                    }
                    disabled={busy}
                    className="btn-ghost border border-line-light"
                  >
                    <ShieldOff className="h-4 w-4" /> {t("friends.unblockUser")}
                  </button>
                ) : (
                  <button
                    onClick={() =>
                      run(async () => {
                        await api.blockUser(user.id);
                        const existing = useChatStore
                          .getState()
                          .friends.find((f) => f.userId === user.id);
                        upsertFriend({
                          userId: user.id,
                          status: existing?.status ?? "blocked",
                          direction: existing?.direction ?? "none",
                          blockedByMe: true,
                          createdAt: existing?.createdAt ?? new Date().toISOString(),
                        });
                      }, t("friends.blocked"))
                    }
                    disabled={busy}
                    className="btn-ghost border border-danger/40 text-danger hover:bg-danger/10"
                  >
                    <Ban className="h-4 w-4" /> {t("friends.blockUser")}
                  </button>
                )}
              </div>
            )}

            <button
              onClick={() => setReportOpen(true)}
              disabled={busy}
              className="btn-ghost w-full border border-danger/40 text-danger hover:bg-danger/10"
            >
              <Flag className="h-4 w-4" /> {t("message.report")}{t("nav.contacts")}
            </button>
          </div>
        )}
      </div>

      {reportOpen && (
        <ReportModal
          targetType="user"
          targetId={user.id}
          targetName={user.displayName}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}

const ORG_GRADIENTS = [
  "from-pink-500 to-rose-500",
  "from-purple-500 to-indigo-500",
  "from-blue-500 to-cyan-500",
  "from-teal-500 to-emerald-500",
  "from-orange-500 to-amber-500",
  "from-fuchsia-500 to-pink-500",
  "from-violet-500 to-purple-500",
  "from-sky-500 to-blue-500",
];

function OrgBadge({ name, title }: { name: string; title?: string }) {
  const idx = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const gradient = ORG_GRADIENTS[idx % ORG_GRADIENTS.length];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-gradient-to-r ${gradient} px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm`}>
      {name}{title ? ` · ${title}` : ""}
    </span>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-soft px-2.5 py-1 text-ink-secondary">
      {children}
    </span>
  );
}

const STATUS_KEYS: Record<string, string> = {
  online: "user.online",
  away: "user.away",
  busy: "user.busy",
  offline: "user.offline",
};

function statusLabel(t: (key: any) => string, status: string) {
  return t(STATUS_KEYS[status] ?? "common.unknown");
}

const GENDER_KEYS: Record<string, string> = {
  male: "user.gender.male",
  female: "user.gender.female",
  other: "user.gender.other",
  unspecified: "user.gender.unspecified",
};

function genderLabel(t: (key: any) => string, gender: string) {
  return t(GENDER_KEYS[gender] ?? "user.notSet");
}

const coverNoise: React.CSSProperties = {
  background:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.08 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
};

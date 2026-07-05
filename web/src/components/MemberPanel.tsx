import { useMemo, useState } from "react";
import { Hash, Lock, UserPlus, X } from "lucide-react";
import { useChatStore } from "../lib/store";
import { api } from "../lib/api";
import { Avatar, PresenceDot } from "./Avatar";
import { cn, formatRelative } from "../lib/utils";
import { useT } from "../lib/i18n";

export function MemberPanel() {
  const t = useT();
  const selectedId = useChatStore((s) => s.selectedId);
  const conversationsById = useChatStore((s) => s.conversationsById);
  const users = useChatStore((s) => s.users);
  const me = useChatStore((s) => s.me);
  const friends = useChatStore((s) => s.friends);
  const toggleMemberPanel = useChatStore((s) => s.toggleMemberPanel);
  const upsertConversation = useChatStore((s) => s.upsertConversation);

  const conv = selectedId ? conversationsById[selectedId] : undefined;
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const memberList = useMemo(() => {
    if (!conv) return [];
    return conv.memberIds.map((id) => users[id]).filter(Boolean);
  }, [conv, users]);

  const candidates = useMemo(() => {
    if (!conv) return [];
    const friendIds = new Set(
      friends.filter((f) => f.status === "accepted").map((f) => f.userId),
    );
    return Object.values(users)
      .filter((u) => friendIds.has(u.id) && !conv.memberIds.includes(u.id) && u.username !== "navo_ai")
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [conv, users, friends]);

  if (!conv) return null;

  const isChannel = conv.kind === "channel";

  async function addMember(userId: string) {
    if (!conv) return;
    setBusy(userId);
    try {
      const updated = await api.addMember(conv.id, userId);
      upsertConversation(updated);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <aside className="hidden h-full w-80 flex-col border-l border-line-light/70 bg-surface/60 backdrop-blur-xl xl:flex">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">{t("member.detail")}</div>
        <button onClick={toggleMemberPanel} className="text-ink-muted hover:text-ink-primary">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-5 pb-4">
        {isChannel ? (
          <ChannelHeader conv={conv} />
        ) : (
          <DMHeader otherId={me?.id ? conv.memberIds.find((id) => id !== me?.id) : undefined} />
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-6">
        <div className="mb-2 flex items-center justify-between px-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
            {t("member.member")} · {memberList.length}
          </div>
          {isChannel && (
            <button
              onClick={() => setAdding((v) => !v)}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-xs",
                adding ? "bg-surface-soft text-ink-primary" : "text-ink-muted hover:bg-surface-soft hover:text-ink-primary",
              )}
            >
              <UserPlus className="h-3.5 w-3.5" />
              {t("common.submit")}
            </button>
          )}
        </div>

        {adding && (
          <div className="mb-3 rounded-2xl border border-line-light/70 bg-surface p-2">
            <div className="mb-1 px-2 text-[10px] uppercase tracking-[0.18em] text-ink-muted">{t("friends.title")}</div>
            {candidates.length === 0 ? (
              <div className="px-2 py-2 text-xs text-ink-muted">{t("friends.noneToInvite")}</div>
            ) : (
              <ul className="max-h-56 space-y-0.5 overflow-y-auto">
                {candidates.map((u) => (
                  <li key={u.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-surface-soft">
                    <Avatar user={u} size="xs" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{u.displayName}</div>
                      <div className="truncate text-[10px] text-ink-muted">@{u.username}</div>
                    </div>
                    <button
                      onClick={() => addMember(u.id)}
                      disabled={busy === u.id}
                      className="rounded-md bg-brand-gradient px-2 py-0.5 text-[11px] font-medium text-white shadow-soft hover:shadow-glow disabled:opacity-50"
                    >
                      {busy === u.id ? t("common.loading") : t("common.submit")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <ul className="space-y-0.5">
          {memberList.map((u) => (
            <li key={u.id} className="flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-surface-soft">
              <Avatar user={u} size="sm" showPresence />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-ink-primary">{u.displayName}</span>
                  {u.id === me?.id && (
                    <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] text-ocean">{t("message.you")}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
                  <PresenceDot status={u.status} pulse={false} className="!h-1.5 !w-1.5" />
                  {u.status === "online" ? t("user.online") : `${t("user.lastSeen")} ${formatRelative(u.lastSeen)}`}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

function ChannelHeader({ conv }: { conv: ReturnType<typeof useChatStore.getState>["conversationsById"][string] }) {
    const t = useT();
  return (
    <div className="rounded-2xl border border-line-light/70 bg-surface p-4">
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-2xl">
          {conv.icon ?? (conv.isPrivate ? <Lock className="h-5 w-5" /> : <Hash className="h-5 w-5" />)}
        </div>
        <div className="min-w-0">
          <div className="font-display text-base font-semibold tracking-tight">{conv.name}</div>
          <div className="text-[11px] text-ink-muted">
            {conv.isPrivate ? t("channel.private") : t("channel.public")} · {t("common.createdAt")} {formatRelative(conv.createdAt)}
          </div>
        </div>
      </div>
      {conv.topic && <div className="mt-3 text-sm text-ink-secondary">{conv.topic}</div>}
    </div>
  );
}

function DMHeader({ otherId }: { otherId?: string }) {
  const u = useChatStore((s) => (otherId ? s.users[otherId] : undefined));
  if (!u) return null;
  return (
    <div className="rounded-2xl border border-line-light/70 bg-surface p-5 text-center">
      <div className="mx-auto mb-3 w-fit">
        <Avatar user={u} size="xl" showPresence />
      </div>
      <div className="font-display text-lg font-semibold tracking-tight">{u.displayName}</div>
      <div className="text-xs text-ink-muted">@{u.username}</div>
      {u.bio && <div className="mt-3 text-sm text-ink-secondary">{u.bio}</div>}
    </div>
  );
}

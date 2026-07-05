import { useState } from "react";
import { Hash, Lock, Check } from "lucide-react";
import { useChatStore } from "../lib/store";
import { api } from "../lib/api";
import { Avatar } from "./Avatar";
import { cn } from "../lib/utils";
import { useT } from "../lib/i18n";

const ICON_OPTIONS = ["💬", "🛠️", "🎨", "🚀", "✨", "🌊", "🔥", "📌", "💡", "🎯", "📣", "🧭"];

export function CreateChannelView({ onClose }: { onClose: () => void }) {
  const t = useT();
  const users = useChatStore((s) => s.users);
  const me = useChatStore((s) => s.me);
  const friends = useChatStore((s) => s.friends);
  const upsertConversation = useChatStore((s) => s.upsertConversation);
  const selectConversation = useChatStore((s) => s.selectConversation);

  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [icon, setIcon] = useState(ICON_OPTIONS[0]);
  const [isPrivate, setPrivate] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = Object.values(users).filter(
    (u) => u.id !== me?.id && u.username !== "navo_ai" && friends.some((f) => f.userId === u.id && f.status === "accepted"),
  );

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError(t("channel.nameRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const conv = await api.createChannel({
        name: name.trim(),
        topic: topic.trim(),
        icon,
        isPrivate,
        memberIds: Array.from(selected),
      });
      upsertConversation(conv);
      selectConversation(conv.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.unknown"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4 pt-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-secondary">{t("channel.name")}</label>
          <div className="flex items-center gap-2 rounded-xl border border-line-light bg-surface px-3 py-2 focus-within:border-aqua focus-within:ring-focus-aqua">
            {isPrivate ? <Lock className="h-4 w-4 text-ink-muted" /> : <Hash className="h-4 w-4 text-ink-muted" />}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("channel.namePlaceholder")}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-muted"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-secondary">{t("channel.description")} ({t("common.cancel")})</label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={t("channel.descriptionPlaceholder")}
            className="input-base"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-secondary">{t("channel.icon")}</label>
          <div className="flex flex-wrap gap-1.5">
            {ICON_OPTIONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setIcon(e)}
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-xl border text-base transition-all",
                  icon === e ? "border-aqua bg-aqua/10 shadow-glow" : "border-line-light bg-surface hover:bg-surface-soft",
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-3 rounded-xl border border-line-light bg-surface p-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setPrivate(e.target.checked)}
            className="h-4 w-4 accent-ocean"
          />
          <div>
            <div className="text-sm font-medium">{t("channel.private")}</div>
            <div className="text-xs text-ink-muted">{t("channel.privateDesc")}</div>
          </div>
        </label>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-medium text-ink-secondary">{t("channel.inviteMember")}</label>
            <span className="text-[11px] text-ink-muted">{selected.size} {t("common.selected")}</span>
          </div>
          <div className="max-h-44 overflow-y-auto rounded-xl border border-line-light bg-surface p-1">
            {candidates.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-ink-muted">{t("friends.noneToInvite")}</div>
            )}
            {candidates.map((u) => {
              const on = selected.has(u.id);
              return (
                <button
                  type="button"
                  key={u.id}
                  onClick={() => toggle(u.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                    on ? "bg-brand-soft" : "hover:bg-surface-soft",
                  )}
                >
                  <Avatar user={u} size="xs" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{u.displayName}</div>
                    <div className="truncate text-[11px] text-ink-muted">@{u.username}</div>
                  </div>
                  <span
                    className={cn(
                      "grid h-5 w-5 place-items-center rounded-full border",
                      on ? "border-ocean bg-ocean text-white" : "border-line-light",
                    )}
                  >
                    {on && <Check className="h-3 w-3" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        )}
      </div>

      <div className="shrink-0 border-t border-line-light/70 bg-surface px-4 py-3">
        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? t("common.loading") : t("channel.create")}
        </button>
      </div>
    </form>
  );
}

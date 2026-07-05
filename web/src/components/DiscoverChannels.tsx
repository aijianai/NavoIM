import { useEffect, useState } from "react";
import { Search, Users, Hash, UserPlus, RefreshCw, Globe, ChevronLeft, X, Crown } from "lucide-react";
import { api } from "../lib/api";
import { useChatStore } from "../lib/store";
import { useUI } from "../lib/ui";
import { useChatStore as useStore } from "../lib/store";
import { useT } from "../lib/i18n";

interface PublicChannel {
  id: string;
  name: string;
  topic?: string;
  icon?: string;
  avatarUrl?: string;
  memberCount: number;
  ownerId: string;
  ownerName: string;
  joined: boolean;
}

export function DiscoverChannels({ onClose }: { onClose?: () => void }) {
  const t = useT();
  const [channels, setChannels] = useState<PublicChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [infoChannel, setInfoChannel] = useState<PublicChannel | null>(null);
  const upsertConversation = useChatStore((s) => s.upsertConversation);
  const closeUi = useUI((s) => s.close);
  const handleClose = onClose || closeUi;

  async function load() {
    setLoading(true);
    try {
      const r = await api.getPublicChannels(search || undefined);
      setChannels(r);
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 400);
    return () => clearTimeout(timer);
  }, [search]);

  async function joinChannel(channel: PublicChannel) {
    try {
      const conv = await api.addMember(channel.id, useStore.getState().me!.id);
      upsertConversation(conv);
      setChannels((prev) => prev.map((c) => c.id === channel.id ? { ...c, joined: true } : c));
      setInfoChannel(null);
    } catch (e) {
      console.error("join failed", e);
    }
  }

  return (
    <div className="flex h-full flex-col bg-app">
      <header className="flex items-center gap-3 border-b border-line-light/70 bg-surface/60 px-4 py-3 backdrop-blur-xl">
        <button onClick={handleClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-soft">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h1 className="font-display text-lg font-semibold">{t("channel.discover")}</h1>
      </header>

      <div className="relative mx-4 mt-3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("common.search")}
          className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 pl-9 text-sm outline-none focus:border-aqua"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-ocean" />
          </div>
        ) : channels.length === 0 ? (
          <div className="py-12 text-center text-sm text-ink-muted">{t("common.noData")}</div>
        ) : (
          <div className="space-y-2">
            {channels.map((ch) => (
              <div
                key={ch.id}
                onClick={() => setInfoChannel(ch)}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-line-light/70 bg-surface px-4 py-3 transition-colors hover:bg-surface-soft"
              >
                {ch.avatarUrl ? (
                  <img src={ch.avatarUrl} alt="" className="h-10 w-10 rounded-xl object-cover" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean/10 text-lg">
                    {ch.icon || <Hash className="h-5 w-5 text-ocean" />}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{ch.name}</span>
                    <Globe className="h-3 w-3 shrink-0 text-ink-muted" />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-ink-muted">
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{ch.memberCount}</span>
                    {ch.topic && <span className="truncate">{ch.topic}</span>}
                  </div>
                </div>
                {ch.joined ? (
                  <span className="text-xs text-success">{t("channel.joined")}</span>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); joinChannel(ch); }}
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-ocean px-3 py-1.5 text-xs font-medium text-white hover:bg-ocean/90"
                  >
                    <UserPlus className="h-3 w-3" /> {t("channel.join")}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {infoChannel && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-surface-deep/50 px-4 backdrop-blur-sm"
          onClick={() => setInfoChannel(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-line-light/70 bg-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                {infoChannel.avatarUrl ? (
                  <img src={infoChannel.avatarUrl} alt="" className="h-14 w-14 rounded-xl object-cover" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-ocean/10 text-2xl">
                    {infoChannel.icon || <Hash className="h-6 w-6 text-ocean" />}
                  </div>
                )}
                <div>
                  <div className="font-semibold text-lg">{infoChannel.name}</div>
                  <div className="text-xs text-ink-muted flex items-center gap-1">
                    <Globe className="h-3 w-3" /> {t("channel.public")}
                  </div>
                </div>
              </div>
              <button onClick={() => setInfoChannel(null)} className="text-ink-muted hover:text-ink-primary">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Users className="h-4 w-4 text-ink-muted" />
                <span>{t("channel.memberCount", { count: infoChannel.memberCount })}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Crown className="h-4 w-4 text-ink-muted" />
                <span>{infoChannel.ownerName}</span>
              </div>
              {infoChannel.topic && (
                <div className="rounded-xl bg-surface-soft p-3 text-sm text-ink-secondary">
                  {infoChannel.topic}
                </div>
              )}
            </div>

            <div className="mt-5">
              {infoChannel.joined ? (
                <div className="text-center text-sm text-success">{t("channel.alreadyJoined")}</div>
              ) : (
                <button
                  onClick={() => joinChannel(infoChannel)}
                  className="w-full rounded-xl bg-ocean py-2.5 text-sm font-medium text-white hover:bg-ocean/90"
                >
                  {t("channel.joinChannel")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

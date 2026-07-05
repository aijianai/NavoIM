import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X, MapPin, Loader2, ChevronDown } from "lucide-react";
import { api } from "../lib/api";
import { Avatar } from "./Avatar";
import { cn, formatTime, isImage, resolveAttachmentUrl } from "../lib/utils";
import { useT, getT } from "../lib/i18n";
import type { Message, PublicUser } from "@navo/shared";

const t = getT();
interface MessageSearchProps {
  conversationId: string;
  conversationName: string;
  onClose: () => void;
  onJumpToMessage: (messageId: string) => void;
}

interface SearchResult extends Message {
  authorName: string;
  authorAvatarUrl?: string;
}

const TYPE_FILTERS = [
  { label: t("media.all"), kind: undefined },
  { label: t("media.text"), kind: "text" },
  { label: t("media.image"), kind: "image" },
  { label: t("media.file"), kind: "file" },
  { label: t("media.location"), kind: "location" },
  { label: t("media.video"), kind: "video" },
  { label: t("media.audio"), kind: "audio" },
] as const;

export function MessageSearch({ conversationId, conversationName, onClose, onJumpToMessage }: MessageSearchProps) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [activeKind, setActiveKind] = useState<string | undefined>(undefined);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ messageId: string; x: number; y: number } | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const LIMIT = 20;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      void fetchResults(1, true);
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query, activeKind]);

  const fetchResults = useCallback(async (p: number, replace: boolean) => {
    if (!query.trim() && !activeKind) {
      setResults([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    try {
      const res = await api.searchMessages(conversationId, {
        q: query.trim() || undefined,
        kind: activeKind,
        page: p,
        limit: LIMIT,
      });
      if (replace) {
        setResults(res.items as SearchResult[]);
      } else {
        setResults((prev) => [...prev, ...(res.items as SearchResult[])]);
      }
      setTotal(res.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [conversationId, query, activeKind]);

  function handleLoadMore() {
    const nextPage = page + 1;
    setPage(nextPage);
    void fetchResults(nextPage, false);
  }

  function handleClick(messageId: string) {
    onJumpToMessage(messageId);
    onClose();
  }

  function handleContextMenu(e: React.MouseEvent, messageId: string) {
    e.preventDefault();
    setContextMenu({ messageId, x: e.clientX, y: e.clientY });
  }

  function handleContextAction(messageId: string) {
    setContextMenu(null);
    onJumpToMessage(messageId);
    onClose();
  }

  useEffect(() => {
    function close() { setContextMenu(null); }
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  function getPreview(msg: SearchResult): string {
    if (msg.kind === "image") return t("message.card.image");
    if (msg.kind === "file") return t("message.card.file");
    if (msg.kind === "location") return t("message.card.location");
    if (msg.kind === "poll") return t("message.card.poll");
    if (msg.kind === "forwardedCard") return t("message.card.forwarded");
    if (msg.kind === "friendCard") return t("message.card.friend");
    if (msg.kind === "channelCard") return t("message.card.channel");
    if (msg.kind === "system") return t("message.card.system");
    return msg.text.slice(0, 100);
  }

  function renderThumbnail(msg: SearchResult) {
    if (msg.kind === "image" || msg.kind === "file") {
      const img = msg.attachments?.find((a) => isImage(a.mimeType));
      if (img) {
        return (
          <img
            src={resolveAttachmentUrl(img.poster || img.url)}
            alt={img.name}
            className="h-10 w-10 shrink-0 rounded-md object-cover"
          />
        );
      }
      if (msg.kind === "file" && msg.attachments?.length > 0) {
        const a = msg.attachments[0];
        return (
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-brand-soft text-[10px] text-ocean">
            {a.name.split(".").pop()?.toUpperCase().slice(0, 4) ?? "FILE"}
          </div>
        );
      }
    }
    if (msg.kind === "location") {
      return (
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-ocean/10">
          <MapPin className="h-4 w-4 text-ocean" />
        </div>
      );
    }
    return null;
  }

  const content = (
    <div className={cn(
      "flex flex-col bg-surface",
      "fixed inset-0 z-[200] md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border md:border-line-light/70 md:shadow-2xl md:w-[min(90vw,520px)] md:max-h-[80vh]",
    )}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line-light/70 px-4 py-3">
        <h2 className="truncate text-sm font-semibold text-ink-primary">{t("chat.searchMessage")} - {conversationName}</h2>
        <button onClick={onClose} className="rounded-lg p-1 text-ink-muted hover:bg-surface-soft">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Search input */}
      <div className="border-b border-line-light/70 px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("common.search")}
            className="w-full rounded-xl border border-line-light bg-surface-soft py-2 pl-9 pr-3 text-sm text-ink-primary placeholder:text-ink-muted outline-none ring-focus-aqua"
          />
        </div>
        {/* Type filter buttons */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => setActiveKind(f.kind)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                activeKind === f.kind
                  ? "bg-brand-gradient text-white"
                  : "bg-surface-soft text-ink-secondary hover:bg-line-light/50",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {loading && results.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
          </div>
        )}
        {!loading && results.length === 0 && (query.trim() || activeKind) && (
          <div className="py-12 text-center text-sm text-ink-muted">{t("common.noData")}</div>
        )}
        {!loading && results.length === 0 && !query.trim() && !activeKind && (
          <div className="py-12 text-center text-sm text-ink-muted">{t("chat.searchMessage")}</div>
        )}
        {results.map((msg) => {
          const thumb = renderThumbnail(msg);
          return (
            <div
              key={msg.id}
              onClick={() => handleClick(msg.id)}
              onContextMenu={(e) => handleContextMenu(e, msg.id)}
              className="flex cursor-pointer items-start gap-3 border-b border-line-light/50 px-4 py-3 hover:bg-surface-soft transition-colors"
            >
              {thumb ?? (
                <Avatar
                  user={{ id: msg.authorId, displayName: msg.authorName, avatarUrl: msg.authorAvatarUrl, avatarColor: "#999", username: "", bio: "", gender: "unspecified", status: "offline", lastSeen: "", requireFriendApproval: false } as PublicUser}
                  size="sm"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs font-medium text-ink-primary">{msg.authorName}</span>
                  <span className="shrink-0 text-[10px] text-ink-muted">{formatTime(msg.createdAt)}</span>
                </div>
                <div className="mt-0.5 truncate text-xs text-ink-secondary">{getPreview(msg)}</div>
              </div>
            </div>
          );
        })}
        {results.length > 0 && results.length < total && (
          <button
            onClick={handleLoadMore}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 py-3 text-sm text-ocean hover:bg-surface-soft disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
            {t("chat.loadMore")}
          </button>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-[300] min-w-[140px] rounded-xl border border-line-light/70 bg-surface p-1.5 shadow-2xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => setContextMenu(null)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-primary hover:bg-surface-soft"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={() => handleContextAction(contextMenu.messageId)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-primary hover:bg-surface-soft"
          >
            {t("messageSearch.viewInChat")}
          </button>
        </div>
      )}
    </div>
  );

  return content;
}

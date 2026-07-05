import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Search, X, FileText, Image, File, Video, MapPin, BarChart3, Bot,
  ArrowRight, Clock, Loader2, ChevronDown, MessageSquare, Download, Eye,
} from "lucide-react";
import { useChatStore } from "../lib/store";
import { cn, formatTime, downloadAttachment, resolveAttachmentUrl } from "../lib/utils";
import { useViewer } from "../lib/viewer";
import { useT } from "../lib/i18n";
import type { Message, TranslationKey } from "@navo/shared";

interface MediaBrowserProps {
  conversationId: string;
  isMobile?: boolean;
  onClose: () => void;
  onJumpToMessage: (messageId: string) => void;
}

interface FilterOption {
  key: string;
  label: string;
  icon: typeof Search;
}

const FILTERS: FilterOption[] = [
  { key: "", label: "media.all", icon: Search },
  { key: "image", label: "media.image", icon: Image },
  { key: "file", label: "media.file", icon: File },
  { key: "video", label: "media.video", icon: Video },
  { key: "location", label: "media.location", icon: MapPin },
  { key: "poll", label: "media.poll", icon: BarChart3 },
  { key: "text", label: "media.text", icon: FileText },
  { key: "ai", label: "media.ai", icon: Bot },
];

export function MediaBrowser({ conversationId, isMobile, onClose, onJumpToMessage }: MediaBrowserProps) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [results, setResults] = useState<Message[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [offset, setOffset] = useState(0);
  const [selectedMsg, setSelectedMsg] = useState<Message | null>(null);
  const [menuMsg, setMenuMsg] = useState<Message | null>(null);
  const LIMIT = 30;

  const doSearch = useCallback(async (newOffset = 0) => {
    setLoading(true);
    setOffset(newOffset);
    try {
      // searchMessages was removed from the API — return empty results
      const items: Message[] = [];
      if (newOffset === 0) {
        setResults(items);
      } else {
        setResults((prev) => [...prev, ...items]);
      }
      setTotal(0);
      setHasSearched(true);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [conversationId, query, kind]);

  // Auto-search on kind change
  useEffect(() => {
    if (kind || query) {
      doSearch(0);
    } else {
      setResults([]);
      setTotal(0);
      setHasSearched(false);
    }
  }, [kind]);

  useEffect(() => {
    setResults([]);
    setTotal(0);
    setOffset(0);
    setHasSearched(false);
    setSelectedMsg(null);
  }, [query, kind]);

  const handleSearch = () => doSearch(0);
  const loadMore = () => doSearch(offset + LIMIT);

  const content = (
    <div className={cn("flex flex-col", isMobile ? "h-full" : "max-h-[80vh]")}>
      {/* Search input */}
      <div className="flex items-center gap-2 border-b border-line-light/70 px-4 py-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder={t("common.search")}
            className="w-full rounded-xl border border-line-light/70 bg-surface-soft py-2 pl-9 pr-3 text-sm outline-none focus:border-ocean"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loading}
          className="rounded-xl bg-ocean px-4 py-2 text-sm font-medium text-white hover:bg-ocean/90 disabled:opacity-50"
        >
          {t("common.search")}
        </button>
        <button onClick={onClose} className="btn-ghost">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Type filters */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-line-light/70 px-4 py-2.5">
        {FILTERS.map((f) => {
          const Icon = f.icon;
          return (
            <button
              key={f.key}
              onClick={() => setKind(f.key)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                kind === f.key
                  ? "bg-ocean text-white"
                  : "bg-surface-soft text-ink-secondary hover:bg-line-light/50",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
               {t(f.label as TranslationKey)}
            </button>
          );
        })}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {loading && results.length === 0 ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-ocean" />
          </div>
        ) : !hasSearched ? (
          <div className="flex flex-col items-center py-16 text-ink-muted">
            <Search className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">{t("media.searchHint")}</p>
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-ink-muted">
            <MessageSquare className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">{t("common.noData")}</p>
          </div>
        ) : (
          <div>
            {selectedMsg ? (
              <MediaPreview message={selectedMsg} onBack={() => setSelectedMsg(null)} onJump={onJumpToMessage} />
            ) : (
              <div className="divide-y divide-line-light/30">
                {results.map((msg) => (
                  <MediaItem
                    key={msg.id}
                    message={msg}
                    onSelect={() => setSelectedMsg(msg)}
                    onJump={() => onJumpToMessage(msg.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenuMsg(menuMsg?.id === msg.id ? null : msg);
                    }}
                    showMenu={menuMsg?.id === msg.id}
                    onMenuClose={() => setMenuMsg(null)}
                    onPreview={() => setSelectedMsg(msg)}
                  />
                ))}
                {results.length < total && (
                  <div className="flex justify-center py-4">
                    <button
                      onClick={loadMore}
                      disabled={loading}
                      className="flex items-center gap-1 text-sm text-ocean hover:underline"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
                      {t("chat.loadMore")} ({results.length}/{total})
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-[80] flex flex-col bg-app">
        {content}
      </div>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-surface-deep/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-line-light/70 bg-surface shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>,
    document.body,
  );
}

function MediaItem({
  message,
  onSelect,
  onJump,
  onContextMenu,
  showMenu,
  onMenuClose,
  onPreview,
}: {
  message: Message;
  onSelect: () => void;
  onJump: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  showMenu: boolean;
  onMenuClose: () => void;
  onPreview: () => void;
}) {
  const t = useT();
  const users = useChatStore((s) => s.users);
  const author = users[message.authorId];

  const isLocation = message.kind === "location";
  const isPoll = message.kind === "poll";

  const thumbnailUrl = message.attachments?.find((a) => a.mimeType.startsWith("image/"))?.url;
  const videoPoster = message.attachments?.find((a) => a.mimeType.startsWith("video/"))?.poster;

  return (
    <div
      className="group relative cursor-pointer px-4 py-3 hover:bg-surface-soft/50"
      onClick={onSelect}
      onContextMenu={onContextMenu}
    >
      <div className="flex items-start gap-3">
        {/* Thumbnail */}
        {thumbnailUrl && (
          <img src={resolveAttachmentUrl(thumbnailUrl)} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
        )}
        {videoPoster && (
          <div className="relative h-16 w-16 shrink-0">
            <img src={resolveAttachmentUrl(videoPoster)} alt="" className="h-full w-full rounded-lg object-cover" />
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/30">
              <Video className="h-5 w-5 text-white" />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            <Clock className="h-3 w-3" />
            <span>{formatTime(message.createdAt)}</span>
            {author && <span className="text-ink-secondary">{author.displayName}</span>}
          </div>
          <p className="mt-1 text-sm text-ink-primary line-clamp-2">
            {message.text || (message.attachments?.length ? `[${message.attachments[0].name}]` : t("message.card.empty"))}
          </p>
          {message.attachments?.map((att) => (
            <div key={att.id} className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
              {att.mimeType.startsWith("image/") && <Image className="h-3 w-3" />}
              {att.mimeType.startsWith("video/") && <Video className="h-3 w-3" />}
              {!att.mimeType.startsWith("image/") && !att.mimeType.startsWith("video/") && <File className="h-3 w-3" />}
              <span className="truncate">{att.name}</span>
            </div>
          ))}
          {isLocation && (
            <div className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
              <MapPin className="h-3 w-3" />
              <span>{t("media.location")}</span>
            </div>
          )}
          {isPoll && (
            <div className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
              <BarChart3 className="h-3 w-3" />
              <span>{t("media.poll")}</span>
            </div>
          )}
        </div>

        {/* Jump button */}
        <button
          onClick={(e) => { e.stopPropagation(); onJump(); }}
          className="shrink-0 rounded-lg p-1.5 text-ink-muted opacity-0 group-hover:opacity-100 hover:bg-ocean/10 hover:text-ocean"
          title={t("media.jumpToMessage")}
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {/* Context menu */}
      {showMenu && (
        <div
          className="absolute right-4 top-12 z-10 rounded-xl border border-line-light/70 bg-surface py-1 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { onMenuClose(); onPreview(); }}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-surface-soft"
          >
            <Eye className="h-4 w-4" />
            {t("media.preview")}
          </button>
          <button
            onClick={() => { onMenuClose(); onJump(); }}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-surface-soft"
          >
            <ArrowRight className="h-4 w-4" />
            {t("media.jumpToMessage")}
          </button>
        </div>
      )}
    </div>
  );
}

function MediaPreview({
  message,
  onBack,
  onJump,
}: {
  message: Message;
  onBack: () => void;
  onJump: (id: string) => void;
}) {
  const t = useT();
  const users = useChatStore((s) => s.users);
  const author = users[message.authorId];
  const { show } = useViewer();

  return (
    <div className="p-4">
      <button
        onClick={onBack}
        className="mb-3 flex items-center gap-1 text-sm text-ocean hover:underline"
      >
        <ArrowRight className="h-4 w-4 rotate-180" />
        {t("media.backToResults")}
      </button>
      <div className="rounded-xl border border-line-light/70 bg-surface-soft p-4">
        <div className="mb-2 flex items-center gap-2 text-xs text-ink-muted">
          <Clock className="h-3 w-3" />
          <span>{formatTime(message.createdAt)}</span>
          {author && <span className="text-ink-secondary">{author.displayName}</span>}
          <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium uppercase">{message.kind}</span>
        </div>
        {message.text && (
          <p className="whitespace-pre-wrap text-sm text-ink-primary">{message.text}</p>
        )}
        {message.attachments?.map((att) => (
          <div key={att.id} className="mt-2">
            {att.mimeType?.startsWith("image/") ? (
              <img
                src={resolveAttachmentUrl(att.url)}
                alt={att.name}
                className="max-h-60 cursor-pointer rounded-lg object-contain"
                onClick={() => show([{ url: resolveAttachmentUrl(att.url), name: att.name }], 0)}
              />
            ) : att.mimeType?.startsWith("video/") ? (
              <div
                className="relative max-h-60 cursor-pointer overflow-hidden rounded-lg"
                onClick={() => show([{ url: resolveAttachmentUrl(att.url), name: att.name }], 0)}
              >
                {att.poster ? (
                  <img src={resolveAttachmentUrl(att.poster)} alt={att.name} className="max-h-60 object-contain" />
                ) : (
                  <video src={resolveAttachmentUrl(att.url)} className="max-h-60 object-contain" />
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Video className="h-8 w-8 text-white" />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-line-light/70 px-3 py-2 text-sm">
                <File className="h-4 w-4 text-ocean" />
                <a href={resolveAttachmentUrl(att.url)} target="_blank" rel="noopener noreferrer" className="text-ocean hover:underline">{att.name}</a>
              </div>
            )}
          </div>
        ))}
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => onJump(message.id)}
            className="rounded-xl bg-ocean/10 px-4 py-2 text-sm text-ocean hover:bg-ocean/20"
          >
            <ArrowRight className="mr-1 inline h-3.5 w-3.5" />
            {t("media.jumpToMessage")}
          </button>
          {message.attachments?.length === 1 && (
            <button
              onClick={() => downloadAttachment(resolveAttachmentUrl(message.attachments[0].url), message.attachments[0].name)}
              className="rounded-xl bg-surface px-4 py-2 text-sm text-ink-secondary hover:bg-surface-soft"
            >
              <Download className="mr-1 inline h-3.5 w-3.5" />
              {t("media.download")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

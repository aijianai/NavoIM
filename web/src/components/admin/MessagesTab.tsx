import { useState, useEffect } from "react";
import { Search, ChevronLeft, ChevronRight, Loader2, Eye, EyeOff, FileText, MapPin, Vote, User } from "lucide-react";
import { useT, getT } from "../../lib/i18n";
import { api } from "../../lib/api";
import { cn, isImage, isVideo, formatTime, resolveAttachmentUrl } from "../../lib/utils";
import { toast } from "./shared";
import type { AuditMessage } from "@navo/shared";

const t = getT();
const KINDS = [
  { value: "", label: t("media.all") },
  { value: "text", label: t("media.text") },
  { value: "image", label: t("media.image") },
  { value: "file", label: t("media.file") },
  { value: "video", label: t("media.video") },
  { value: "system", label: t("admin.system") },
  { value: "poll", label: t("admin.poll") },
  { value: "friendCard", label: t("message.card.friend") },
  { value: "channelCard", label: t("message.card.channel") },
  { value: "location", label: t("media.location") },
  { value: "forwardedCard", label: t("admin.forwarded") },
];

export function MessagesTab() {
  const t = useT();
  const [items, setItems] = useState<AuditMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [authorId, setAuthorId] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetch = async (p = page) => {
    setLoading(true);
    try {
      const res = await api.admin.getAuditMessages({
        page: p, pageSize: 50,
        search: search || undefined,
        kind: kind || undefined,
        authorId: authorId || undefined,
        includeDeleted: includeDeleted || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(1); setPage(1); }, [search, kind, authorId, includeDeleted]);

  const handlePage = (p: number) => { setPage(p); fetch(p); };

  const totalPages = Math.ceil(total / 50);

  const renderContent = (msg: AuditMessage) => {
    if (msg.deleted) {
      return <span className="text-red-400/70 italic line-through">{msg.text}</span>;
    }
    if (msg.kind === "location") {
      try {
        const loc = JSON.parse(msg.text);
        return <span><MapPin className="inline h-3 w-3 mr-1 text-red-400" />{loc.name || loc.address || `${loc.latitude}, ${loc.longitude}`}</span>;
      } catch { return msg.text; }
    }
    if (msg.kind === "poll") {
      try {
        const poll = JSON.parse(msg.text);
        return <span><Vote className="inline h-3 w-3 mr-1 text-blue-400" />{t("message.card.poll")} {poll.question}</span>;
      } catch { return msg.text; }
    }
    if (msg.kind === "friendCard" || msg.kind === "channelCard") {
      return <span><User className="inline h-3 w-3 mr-1 text-green-400" />{msg.kind === "friendCard" ? t("message.card.friend") : t("message.card.channel")}</span>;
    }
    if (msg.attachments.length > 0) {
      const img = msg.attachments.find((a) => isImage(a.mimeType));
      const vid = msg.attachments.find((a) => isVideo(a.mimeType));
      if (img) return <div className="flex items-center gap-2"><img src={resolveAttachmentUrl(img.url)} alt="" className="h-8 w-8 rounded object-cover" /><span className="truncate">{msg.text?.trim() || t("message.card.image")}</span></div>;
      if (vid) return <div className="flex items-center gap-2">{vid.poster ? <img src={resolveAttachmentUrl(vid.poster)} alt="" className="h-8 w-8 rounded object-cover" /> : <FileText className="h-5 w-5 shrink-0 text-ink-muted" />}<span className="truncate">{msg.text?.trim() || t("message.card.video")}</span></div>;
      return <div className="flex items-center gap-2"><FileText className="h-5 w-5 shrink-0 text-ink-muted" /><span className="truncate">{t("message.card.file")} {msg.attachments[0].name}</span></div>;
    }
    return <span className="truncate">{msg.text}</span>;
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">{t("admin.messageAudit")}</h2>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t("admin.searchMessagePlaceholder")}
            className="w-full rounded-xl border border-line-light/70 bg-surface py-2 pl-10 pr-3 text-sm outline-none focus:border-aqua"
          />
        </div>
        <select value={kind} onChange={(e) => setKind(e.target.value)}
          className="rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua">
          {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
        <input value={authorId} onChange={(e) => setAuthorId(e.target.value)}
          placeholder={t("admin.userIdFilter")}
          className="w-36 rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
        />
        <button onClick={() => setIncludeDeleted(!includeDeleted)}
          className={cn("flex items-center gap-1 rounded-xl px-3 py-2 text-sm transition-colors", includeDeleted ? "bg-red-400/10 text-red-400" : "bg-surface-soft text-ink-muted hover:text-ink-primary")}>
          {includeDeleted ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {t("common.delete")}
        </button>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-line-light/70 bg-surface overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-ink-muted" /></div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-sm text-ink-muted">{t("common.noData")}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-light/70 text-ink-muted">
                <th className="px-3 py-2 text-left">{t("admin.oss.user")}</th>
                <th className="px-3 py-2 text-left">{t("admin.conversation")}</th>
                <th className="px-3 py-2 text-left">{t("admin.type")}</th>
                <th className="px-3 py-2 text-left">{t("admin.content")}</th>
                <th className="px-3 py-2 text-left">{t("common.time")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((msg) => (
                <tr key={msg.id} className={cn("border-b border-line-light/30 hover:bg-surface-soft", msg.deleted && "bg-red-400/5")}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {msg.authorAvatarUrl ? <img src={resolveAttachmentUrl(msg.authorAvatarUrl)} alt="" className="h-6 w-6 rounded-full object-cover" /> : <div className="h-6 w-6 rounded-full bg-brand-soft" />}
                      <div>
                        <div className="text-ink-primary">{msg.authorName}</div>
                        <div className="text-[10px] text-ink-muted">@{msg.authorUsername}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-ink-muted text-xs">{msg.convName}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="rounded-full bg-surface-soft px-2 py-0.5 text-xs text-ink-muted">{KINDS.find(k => k.value === msg.kind)?.label || msg.kind}</span>
                  </td>
                  <td className="px-3 py-2 max-w-[300px]">
                    {renderContent(msg)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-ink-muted">{formatTime(msg.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button onClick={() => handlePage(page - 1)} disabled={page <= 1} className="rounded-xl p-2 text-ink-muted hover:bg-surface-soft disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-ink-muted">{page} / {totalPages} ({t("admin.totalCount", { count: total })})</span>
          <button onClick={() => handlePage(page + 1)} disabled={page >= totalPages} className="rounded-xl p-2 text-ink-muted hover:bg-surface-soft disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}

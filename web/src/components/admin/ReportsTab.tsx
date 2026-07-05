import { useEffect, useState } from "react";
import { CheckCircle, XCircle, Clock, Eye, Loader2 } from "lucide-react";
import { api } from "../../lib/api";
import { useT, getT } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { toast } from "./shared";

const t = getT();
interface ReportItem {
  id: string;
  reporter_id: string;
  reporter_name?: string;
  reporter_username?: string;
  reporter_avatar?: string;
  targetType: string;
  targetId: string;
  target_name?: string;
  target_username?: string;
  target_avatar?: string;
  message_text?: string;
  message_created_at?: string;
  reason: string;
  screenshotUrl?: string;
  status: string;
  result?: string;
  handledBy?: string;
  created_at: string;
  updated_at: string;
}

const TARGET_LABELS: Record<string, string> = {
  user: t("nav.contacts"),
  channel: t("admin.channels"),
  message: t("admin.messages"),
};

function formatTime(ts?: string) {
  if (!ts) return t("common.unknown");
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return t("common.unknown");
    return d.toLocaleString("zh-CN");
  } catch {
    return t("common.unknown");
  }
}

export function ReportsTab() {
  const t = useT();
  const STATUS_LABELS: Record<string, { label: string; color: string; icon: typeof Clock }> = {
    pending: { label: t("admin.report.pending"), color: "text-yellow-500", icon: Clock },
    reviewed: { label: t("admin.report.reviewed"), color: "text-blue-500", icon: Eye },
    actioned: { label: t("server.reportStatusActioned"), color: "text-green-500", icon: CheckCircle },
    rejected: { label: t("server.reportStatusRejected"), color: "text-ink-muted", icon: XCircle },
  };
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [detail, setDetail] = useState<ReportItem | null>(null);
  const [handleResult, setHandleResult] = useState("");
  const [handleBusy, setHandleBusy] = useState(false);

  async function fetchReports(p: number, status?: string) {
    setLoading(true);
    try {
      const res = await api.admin.getReports({ page: p, limit: 20, status });
      setReports(res.items);
      setTotal(res.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchReports(page, statusFilter);
  }, [page, statusFilter]);

  async function handleAction(status: "actioned" | "rejected") {
    if (!detail || !handleResult.trim()) return;
    setHandleBusy(true);
    try {
      await api.admin.handleReport(detail.id, { status, result: handleResult.trim() });
      toast(status === "actioned" ? t("admin.report.processed") : t("admin.report.rejected"));
      setDetail(null);
      setHandleResult("");
      void fetchReports(page, statusFilter);
    } catch {
      toast(t("common.unknown"), "error");
    } finally {
      setHandleBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">{t("admin.reports")}</h2>
        <span className="text-sm text-ink-muted">{t("admin.totalCount", { count: total })}</span>
      </div>

      <div className="flex gap-2">
        {[undefined, "pending", "actioned", "rejected"].map((s) => (
          <button
            key={s ?? "all"}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              statusFilter === s ? "bg-ocean text-white" : "bg-surface-soft text-ink-secondary hover:bg-line-light/50",
            )}
          >
            {s === undefined ? t("media.all") : STATUS_LABELS[s]?.label ?? s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
        </div>
      ) : reports.length === 0 ? (
        <div className="py-12 text-center text-sm text-ink-muted">{t("admin.noReports")}</div>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => {
            const st = STATUS_LABELS[r.status] ?? STATUS_LABELS.pending;
            const Icon = st.icon;
            return (
              <button
                key={r.id}
                onClick={() => setDetail(r)}
                className="w-full rounded-xl border border-line-light/70 bg-surface-soft p-4 text-left transition-colors hover:bg-line-light/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink-primary">
                        {TARGET_LABELS[r.targetType] ?? r.targetType}
                      </span>
                      <span className={cn("flex items-center gap-1 text-xs", st.color)}>
                        <Icon className="h-3 w-3" />
                        {st.label}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
                      <span>{t("admin.report.reporter")}: {r.reporter_name ?? r.reporter_username ?? t("common.unknown")}</span>
                      <span>·</span>
                      <span>{formatTime(r.created_at)}</span>
                    </div>
                    <div className="mt-1 text-xs text-ink-secondary line-clamp-2">{r.reason}</div>
                  </div>
                  {r.screenshotUrl && (
                    <img src={r.screenshotUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {total > 20 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="btn-ghost border border-line-light px-3 py-1 text-xs"
          >
           {t("admin.previousPage")} 
          </button>
          <span className="text-xs text-ink-muted">{t("admin.page", { page })}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={reports.length < 20}
            className="btn-ghost border border-line-light px-3 py-1 text-xs"
          >
           {t("admin.nextPage")} 
          </button>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm" onClick={() => setDetail(null)}>
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-line-light/70 bg-surface p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold">{t("admin.reportDetail")}</h3>
              <button onClick={() => setDetail(null)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-soft">
                <XCircle className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm">
              {/* 举报时间 */}
              <div className="rounded-xl bg-surface-soft p-3">
                <div className="text-xs text-ink-muted">{t("admin.reportTime")}</div>
                <div className="mt-1 text-sm">{formatTime(detail.created_at)}</div>
              </div>

              {/* 举报者信息 */}
              <div className="rounded-xl bg-surface-soft p-3">
                <div className="text-xs font-medium text-ink-muted mb-2">{t("admin.report.reporter")}</div>
                <div className="flex items-center gap-3">
                  {detail.reporter_avatar ? (
                    <img src={detail.reporter_avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-ocean/20 text-sm font-semibold text-ocean">
                      {(detail.reporter_name ?? detail.reporter_username ?? "?").slice(0, 1)}
                    </div>
                  )}
                  <div>
                    <div className="font-medium text-ink-primary">{detail.reporter_name ?? t("common.unknown")}</div>
                    <div className="text-xs text-ink-muted">@{detail.reporter_username ?? "unknown"} · ID: {detail.reporter_id}</div>
                  </div>
                </div>
              </div>

              {/* 被举报目标 */}
              <div className="rounded-xl bg-surface-soft p-3">
                <div className="text-xs font-medium text-ink-muted mb-2">{t("admin.reportTarget")}{TARGET_LABELS[detail.targetType] ?? detail.targetType}</div>
                {detail.targetType === "message" ? (
                  <div className="space-y-2">
                    {detail.target_name && (
                      <div className="flex items-center gap-3">
                        {detail.target_avatar ? (
                          <img src={detail.target_avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <div className="grid h-8 w-8 place-items-center rounded-full bg-purple-500/20 text-xs font-semibold text-purple-500">
                            {(detail.target_name ?? "?").slice(0, 1)}
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-ink-primary">{detail.target_name}</div>
                          <div className="text-xs text-ink-muted">@{detail.target_username ?? "unknown"}</div>
                        </div>
                      </div>
                    )}
                    {detail.message_text && (
                      <div className="rounded-lg bg-surface p-2 text-xs text-ink-secondary border border-line-light/50">
                        "{detail.message_text}"
                      </div>
                    )}
                    {detail.message_created_at && (
                      <div className="text-[10px] text-ink-muted">{t("admin.report.messageTime")} {formatTime(detail.message_created_at)}</div>
                    )}
                    <div className="text-[10px] text-ink-muted">{t("admin.report.messageId")} {detail.targetId}</div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {detail.target_name && (
                      <div className="flex items-center gap-2">
                        {detail.target_avatar ? (
                          <img src={detail.target_avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <div className="grid h-8 w-8 place-items-center rounded-full bg-purple-500/20 text-xs font-semibold text-purple-500">
                            {(detail.target_name ?? "?").slice(0, 1)}
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-ink-primary">{detail.target_name}</div>
                          <div className="text-xs text-ink-muted">@{detail.target_username ?? "unknown"}</div>
                        </div>
                      </div>
                    )}
                    <div className="text-xs text-ink-muted">ID: {detail.targetId}</div>
                  </div>
                )}
              </div>

              {/* 举报理由 */}
              <div className="rounded-xl bg-surface-soft p-3">
                <div className="text-xs font-medium text-ink-muted mb-1">{t("admin.reportReason")}</div>
                <p className="text-sm text-ink-primary whitespace-pre-wrap">{detail.reason}</p>
              </div>

              {/* 截图 */}
              {detail.screenshotUrl && (
                <div className="rounded-xl bg-surface-soft p-3">
                  <div className="text-xs font-medium text-ink-muted mb-2">{t("admin.reportScreenshot")}</div>
                  <img src={detail.screenshotUrl} alt="" className="w-full rounded-lg object-cover max-h-64" />
                </div>
              )}

              {/* 处理结果 */}
              {detail.result && (
                <div className="rounded-xl bg-surface-soft p-3">
                  <div className="text-xs font-medium text-ink-muted mb-1">{t("admin.reportResult")}</div>
                  <p className="text-sm text-ink-secondary">{detail.result}</p>
                </div>
              )}
            </div>

            {detail.status === "pending" && (
              <div className="mt-4 space-y-3 border-t border-line-light/70 pt-4">
                <textarea
                  value={handleResult}
                  onChange={(e) => setHandleResult(e.target.value)}
                  placeholder={t("admin.reportResultPlaceholder")}
                  className="input-base min-h-[80px] resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => void handleAction("rejected")}
                    disabled={handleBusy || !handleResult.trim()}
                    className="btn-ghost flex-1 border border-line-light py-2 text-sm"
                  >
                    {t("admin.report.rejected")}
                  </button>
                  <button
                    onClick={() => void handleAction("actioned")}
                    disabled={handleBusy || !handleResult.trim()}
                    className="btn-primary flex-1"
                  >
                    {handleBusy ? t("common.loading") : t("common.confirm")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

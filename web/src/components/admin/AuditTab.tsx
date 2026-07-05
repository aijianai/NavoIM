import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
} from "lucide-react";
import { api } from "../../lib/api";
import { useT } from "../../lib/i18n";
import { ACTION_LABELS, InfoRow } from "./shared";

export function AuditTab() {
    const t = useT();
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    action: "",
    startDate: "",
    endDate: "",
  });
  const [detailLog, setDetailLog] = useState<any | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.admin.getAuditLogs({
        page,
        limit: 30,
        ...filters,
      });
      setLogs(r.logs);
      setTotal(r.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold md:text-xl">
        {t("admin.auditLog")}
      </h2>

      <div className="flex flex-wrap gap-3 rounded-2xl border border-line-light/70 bg-surface-soft p-3">
        <select
          value={filters.action}
          onChange={(e) =>
            setFilters({ ...filters, action: e.target.value })
          }
          className="rounded-xl border border-line-light/70 bg-surface px-3 py-1.5 text-sm outline-none"
        >
          <option value="">{t("admin.allOperations")}</option>
          <option value="admin.grant">{t("admin.grantAdmin")}</option>
          <option value="admin.revoke">{t("admin.revokeAdmin")}</option>
          <option value="user.ban">{t("admin.banUser")}</option>
          <option value="user.unban">{t("admin.unbanUser")}</option>
          <option value="user.delete">{t("admin.deleteUser")}</option>
          <option value="channel.delete">{t("admin.deleteChannel")}</option>
          <option value="message.delete">{t("admin.deleteMessage")}</option>
          <option value="settings.update">{t("admin.updateSettings")}</option>
        </select>
        <input
          type="date"
          value={filters.startDate}
          onChange={(e) =>
            setFilters({ ...filters, startDate: e.target.value })
          }
          className="rounded-xl border border-line-light/70 bg-surface px-3 py-1.5 text-sm outline-none"
        />
        <input
          type="date"
          value={filters.endDate}
          onChange={(e) =>
            setFilters({ ...filters, endDate: e.target.value })
          }
          className="rounded-xl border border-line-light/70 bg-surface px-3 py-1.5 text-sm outline-none"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-ocean" />
        </div>
      ) : (
        <div className="rounded-2xl border border-line-light/70 bg-surface-soft overflow-x-auto">
          <table className="w-full min-w-[500px]">
            <thead>
              <tr className="border-b border-line-light/70 text-left text-sm text-ink-muted">
                <th className="p-3 md:p-4">{t("common.time")}</th>
                <th className="p-3 md:p-4">{t("admin.operator")}</th>
                <th className="p-3 md:p-4">{t("admin.operations")}</th>
                <th className="p-3 md:p-4 hidden md:table-cell">{t("common.detail")}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr
                  key={l.id}
                  className="border-b border-line-light/50 last:border-0 cursor-pointer hover:bg-surface/50"
                  onClick={() => setDetailLog(l)}
                >
                  <td className="p-3 md:p-4 text-sm text-ink-muted">
                    {new Date(l.createdAt).toLocaleString()}
                  </td>
                  <td className="p-3 md:p-4 text-sm">
                    {l.displayName || l.username}
                  </td>
                  <td className="p-3 md:p-4">
                    <span className="rounded-lg bg-surface px-2 py-0.5 text-xs">
                      {ACTION_LABELS[l.action] || l.action}
                    </span>
                  </td>
                  <td className="p-3 md:p-4 text-sm text-ink-muted hidden md:table-cell">
                    {l.details || l.targetType}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-ink-muted">
        <span>{t("admin.totalCount", { count: total })}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="rounded-lg p-1 hover:bg-surface-soft disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[4rem] text-center">
            {page} / {Math.ceil(total / 30) || 1}
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page >= Math.ceil(total / 30)}
            className="rounded-lg p-1 hover:bg-surface-soft disabled:opacity-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {detailLog && (
        <AuditDetailModal log={detailLog} onClose={() => setDetailLog(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit detail modal
// ---------------------------------------------------------------------------

function AuditDetailModal({
  log,
  onClose,
}: {
  log: any;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-surface-deep/50 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-line-light/70 bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">{t("admin.auditLog")}{t("common.detail")}</h3>
          <button
            onClick={onClose}
            className="text-ink-muted hover:text-ink-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <InfoRow label={t("common.unknown")}>
            <span className="font-mono text-xs">{log.id}</span>
          </InfoRow>
          <InfoRow label={t("common.unknown")}>
            <span>{new Date(log.createdAt).toLocaleString()}</span>
          </InfoRow>
          <InfoRow label={t("common.unknown")}>
            <span>{log.displayName || log.username || log.userId}</span>
          </InfoRow>
          <InfoRow label={t("common.unknown")}>
            <span className="rounded-lg bg-surface px-2 py-0.5 text-xs">
              {ACTION_LABELS[log.action] || log.action}
            </span>
          </InfoRow>
          <InfoRow label={t("common.unknown")}>
            <span>{log.targetType}</span>
          </InfoRow>
          {log.targetId && (
            <InfoRow label={t("common.unknown")}>
              <span className="font-mono text-xs">{log.targetId}</span>
            </InfoRow>
          )}
          {log.details && (
            <div className="border-b border-line-light/50 pb-2">
              <div className="mb-1 text-xs text-ink-muted">{t("member.detail")}</div>
              <div className="rounded-xl bg-surface p-3 text-xs text-ink-secondary whitespace-pre-wrap break-all">
                {log.details}
              </div>
            </div>
          )}
          {log.ipAddress && (
            <InfoRow label={t("common.unknown")}>
              <span className="font-mono text-xs">{log.ipAddress}</span>
            </InfoRow>
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-xl bg-surface-soft px-4 py-2 text-sm text-ink-secondary hover:bg-surface"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

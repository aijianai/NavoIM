import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { api } from "../../lib/api";
import { useT } from "../../lib/i18n";
import { toast } from "./shared";
import type { Notification } from "@navo/shared";

const PAGE_SIZE = 20;

export function PrivateNotificationsTab() {
  const t = useT();
  const [items, setItems] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetch = async (p = page) => {
    setLoading(true);
    try {
      const res = await api.admin.getPrivateNotifications({ page: p, limit: PAGE_SIZE });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">{t("admin.notification.privateTitle")}</h2>
      <p className="text-sm text-ink-muted">{t("admin.notification.privateDesc")}</p>

      <div className="rounded-2xl border border-line-light/70 bg-surface overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-ink-muted" /></div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-sm text-ink-muted">{t("admin.notification.privateEmpty")}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-light/70 text-ink-muted">
                <th className="px-3 py-2 text-left">{t("server.titleContentRequired")}</th>
                <th className="px-3 py-2 text-left">{t("server.contentRequired")}</th>
                <th className="px-3 py-2 text-left">{t("admin.notification.targetUser")}</th>
                <th className="px-3 py-2 text-left">{t("admin.notification.sendTime")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((n) => (
                <tr key={n.id} className="border-b border-line-light/30 hover:bg-surface-soft">
                  <td className="px-3 py-2 font-medium text-ink-primary">{n.title}</td>
                  <td className="px-3 py-2 text-ink-muted max-w-[300px] truncate">{n.content}</td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-muted">{n.targetUserId?.slice(0, 16)}...</td>
                  <td className="px-3 py-2 text-ink-muted text-xs">{new Date(n.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button onClick={() => { const p = page - 1; setPage(p); fetch(p); }} disabled={page <= 1} className="rounded-xl p-2 text-ink-muted hover:bg-surface-soft disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-ink-muted">{page} / {totalPages}</span>
          <button onClick={() => { const p = page + 1; setPage(p); fetch(p); }} disabled={page >= totalPages} className="rounded-xl p-2 text-ink-muted hover:bg-surface-soft disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}

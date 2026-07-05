import { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "../../lib/api";
import { useT } from "../../lib/i18n";
import { toast } from "./shared";

export function NotificationsTab({
  openConfirm,
}: {
  openConfirm: (title: string, message: string, variant: "default" | "danger" | "warning", onConfirm: () => void) => void;
}) {
  const t = useT();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formImageUrl, setFormImageUrl] = useState("");
  const [formSaving, setFormSaving] = useState(false);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.admin.getNotifications({ page, limit: 10 });
      setNotifications(result.items);
      setTotal(result.total);
    } catch (e) {
      toast(e instanceof Error ? e.message : t("common.loadFailed"), "error");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  function startCreate() {
    setEditItem(null);
    setFormTitle("");
    setFormContent("");
    setFormImageUrl("");
    setCreating(true);
  }

  function startEdit(item: any) {
    setEditItem(item);
    setFormTitle(item.title);
    setFormContent(item.content);
    setFormImageUrl(item.imageUrl || "");
    setCreating(true);
  }

  async function handleSave() {
    if (!formTitle.trim() || !formContent.trim()) {
      toast(t("server.titleContentRequired"), "error");
      return;
    }
    setFormSaving(true);
    try {
      if (editItem) {
        await api.admin.updateNotification(editItem.id, {
          title: formTitle.trim(),
          content: formContent.trim(),
          imageUrl: formImageUrl.trim() || undefined,
        });
        toast(t("common.saveSuccess"));
      } else {
        await api.admin.createNotification({
          title: formTitle.trim(),
          content: formContent.trim(),
          imageUrl: formImageUrl.trim() || undefined,
        });
        toast(t("common.saveSuccess"));
      }
      setCreating(false);
      loadNotifications();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("common.unknown"), "error");
    } finally {
      setFormSaving(false);
    }
  }

  async function handlePublish(id: string) {
    try {
      await api.admin.publishNotification(id);
        toast(t("admin.notification.published"));
        loadNotifications();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("common.unknown"), "error");
    }
  }

  function handleDelete(id: string) {
    openConfirm(t("admin.deleteNotification"), t("admin.confirmDeleteNotification"), "danger", async () => {
      try {
        await api.admin.deleteNotification(id);
        toast(t("admin.deleteSuccess"));
        loadNotifications();
      } catch (e) {
        toast(e instanceof Error ? e.message : t("admin.deleteFailed"), "error");
      }
    });
  }

  const totalPages = Math.ceil(total / 10);

  if (creating || editItem) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">
            {editItem ? t("admin.editNotification") : t("admin.createNotification")}
          </h2>
          <button
            onClick={() => { setCreating(false); setEditItem(null); }}
            className="rounded-xl bg-surface-soft px-4 py-2 text-sm text-ink-secondary hover:bg-surface"
          >
            {t("common.cancel")}
          </button>
        </div>

        <div className="space-y-4 rounded-2xl border border-line-light/70 bg-surface p-6">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">
              {t("server.titleContentRequired")}
            </span>
            <input
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder={t("admin.notificationTitle")}
              className="w-full rounded-xl border border-line-light/70 bg-surface-soft px-3 py-2.5 text-sm text-ink-primary outline-none focus:border-ocean transition-colors"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">
              {t("server.contentRequired")} <span className="text-ink-muted">({t("admin.markdownSupported")})</span>
            </span>
            <textarea
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              placeholder={t("admin.notificationContentPlaceholder")}
              rows={8}
              className="w-full rounded-xl border border-line-light/70 bg-surface-soft px-3 py-2.5 text-sm text-ink-primary outline-none focus:border-ocean transition-colors resize-none font-mono"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">
              {t("admin.imageUrl")} <span className="text-ink-muted">({t("common.optional")})</span>
            </span>
            <input
              value={formImageUrl}
              onChange={(e) => setFormImageUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="w-full rounded-xl border border-line-light/70 bg-surface-soft px-3 py-2.5 text-sm text-ink-primary outline-none focus:border-ocean transition-colors"
            />
          </label>

          {formImageUrl && (
            <div>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">
                {t("admin.imagePreview")}
              </span>
              <img src={formImageUrl} alt="" className="max-h-40 rounded-lg object-cover" />
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setCreating(false); setEditItem(null); }}
              className="rounded-xl border border-line-light/70 bg-surface-soft px-4 py-2 text-sm text-ink-secondary hover:bg-surface"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleSave}
              disabled={formSaving}
              className="rounded-xl bg-ocean px-6 py-2.5 text-sm font-medium text-white hover:bg-ocean/90 disabled:opacity-50"
            >
              {formSaving ? t("common.saving") : editItem ? t("common.save") : t("common.submit")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold md:text-xl">
          {t("notification.title")}
          <span className="ml-2 text-sm font-normal text-ink-muted">({t("admin.totalCount", { count: total })})</span>
        </h2>
        <button
          onClick={startCreate}
          className="rounded-xl bg-ocean px-4 py-2 text-sm font-medium text-white hover:bg-ocean/90"
        >
          {t("admin.publishNotification")}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-ocean" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="py-12 text-center text-sm text-ink-muted">{t("admin.noNotifications")}</div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <div
              key={n.id}
              className="rounded-2xl border border-line-light/70 bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-ink-primary">{n.title}</h3>
                  <p className="mt-1 text-xs text-ink-muted line-clamp-2">{n.content}</p>
                  {n.imageUrl && (
                    <img src={n.imageUrl} alt="" className="mt-2 max-h-20 rounded-lg object-cover" />
                  )}
                  <div className="mt-2 text-[11px] text-ink-muted">
                    {new Date(n.createdAt).toLocaleString("zh-CN")}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handlePublish(n.id)}
                    className="rounded-lg bg-ocean/10 px-3 py-1.5 text-xs font-medium text-ocean hover:bg-ocean/20"
                    title={t("admin.publishToAll")}
                  >
                    {t("admin.notification.published")}
                  </button>
                  <button
                    onClick={() => startEdit(n)}
                    className="rounded-lg bg-surface-soft px-3 py-1.5 text-xs text-ink-secondary hover:bg-line-light/50"
                  >
                    {t("common.edit")}
                  </button>
                  <button
                    onClick={() => handleDelete(n.id)}
                    className="rounded-lg bg-red-400/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-400/20"
                  >
                    {t("common.delete")}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg bg-surface-soft px-3 py-1.5 text-xs text-ink-secondary disabled:opacity-50"
          >
           {t("admin.previousPage")} 
          </button>
          <span className="text-xs text-ink-muted">{page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg bg-surface-soft px-3 py-1.5 text-xs text-ink-secondary disabled:opacity-50"
          >
           {t("admin.nextPage")} 
          </button>
        </div>
      )}
    </div>
  );
}

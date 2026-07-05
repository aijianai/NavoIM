import { useState, useEffect } from "react";
import { Trash2, Plus, Loader2, X } from "lucide-react";
import { api } from "../../lib/api";
import { useT, getT } from "../../lib/i18n";
import { toast } from "./shared";
import type { OssBinding } from "@navo/shared";

const t = getT();
const PROVIDERS = [
  { value: "aliyun", label: t("admin.oss.aliyun") },
  { value: "minio", label: "MinIO" },
  { value: "s3", label: "AWS S3" },
  { value: "tencent", label: t("admin.oss.tencent") },
  { value: "qiniu", label: t("admin.oss.qiniu") },
  { value: "huawei", label: t("admin.oss.huawei") },
];

export function OssTab() {
  const t = useT();
  const [items, setItems] = useState<OssBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);

  const [form, setForm] = useState({
    userId: "",
    name: "",
    provider: "aliyun",
    endpoint: "",
    bucket: "",
    region: "",
    accessKeyId: "",
    accessKeySecret: "",
  });

  const fetch = async () => {
    setLoading(true);
    try {
      const data = await api.admin.getAllOssBindings();
      setItems(data);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm(t("admin.oss.confirmDelete"))) return;
    try {
      await api.admin.deleteOssBinding(id);
      toast(t("common.deleted"));
      fetch();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await api.admin.setDefaultOssBinding(id);
      toast(t("admin.oss.setDefaultSuccess"));
      fetch();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const handleAdd = async () => {
    if (!form.userId || !form.name || !form.endpoint || !form.bucket || !form.accessKeyId || !form.accessKeySecret) {
      toast(t("admin.oss.fillRequired"), "error");
      return;
    }
    setAdding(true);
    try {
      await api.admin.createOssBinding(form);
      toast(t("admin.oss.created"));
      setShowAdd(false);
      setForm({ userId: "", name: "", provider: "aliyun", endpoint: "", bucket: "", region: "", accessKeyId: "", accessKeySecret: "" });
      fetch();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{t("admin.oss.bindings")}</h2>
        <button onClick={() => setShowAdd(true)} className="btn-primary px-4 py-1.5 text-sm">
          <Plus className="inline h-4 w-4 mr-1" />{t("admin.oss.addBinding")}
        </button>
      </div>

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAdd(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-line-light/70 bg-surface p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold">{t("admin.oss.addBinding")}</h3>
              <button onClick={() => setShowAdd(false)} className="text-ink-muted hover:text-ink-primary"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-ink-muted mb-1">{t("nav.contacts")} ID *</label>
                <input value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}
                  placeholder={t("admin.oss.userIdPlaceholder")} className="w-full rounded-xl border border-line-light/70 bg-surface-soft px-3 py-2 text-sm outline-none focus:border-aqua" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-ink-muted mb-1">{t("admin.oss.name")} *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={t("admin.oss.namePlaceholder")} className="w-full rounded-xl border border-line-light/70 bg-surface-soft px-3 py-2 text-sm outline-none focus:border-aqua" />
              </div>
              <div>
                <label className="block text-xs text-ink-muted mb-1">{t("admin.oss.provider")} *</label>
                <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}
                  className="w-full rounded-xl border border-line-light/70 bg-surface-soft px-3 py-2 text-sm outline-none focus:border-aqua">
                  {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-ink-muted mb-1">{t("admin.oss.region")}</label>
                <input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}
                  placeholder={t("admin.oss.endpointPlaceholder")} className="w-full rounded-xl border border-line-light/70 bg-surface-soft px-3 py-2 text-sm outline-none focus:border-aqua" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-ink-muted mb-1">Endpoint *</label>
                <input value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
                  placeholder={t("admin.oss.urlPlaceholder")} className="w-full rounded-xl border border-line-light/70 bg-surface-soft px-3 py-2 text-sm outline-none focus:border-aqua" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-ink-muted mb-1">Bucket *</label>
                <input value={form.bucket} onChange={(e) => setForm({ ...form, bucket: e.target.value })}
                  placeholder={t("admin.oss.bucketPlaceholder")} className="w-full rounded-xl border border-line-light/70 bg-surface-soft px-3 py-2 text-sm outline-none focus:border-aqua" />
              </div>
              <div>
                <label className="block text-xs text-ink-muted mb-1">Access Key ID *</label>
                <input value={form.accessKeyId} onChange={(e) => setForm({ ...form, accessKeyId: e.target.value })}
                  className="w-full rounded-xl border border-line-light/70 bg-surface-soft px-3 py-2 text-sm outline-none focus:border-aqua" />
              </div>
              <div>
                <label className="block text-xs text-ink-muted mb-1">Access Key Secret *</label>
                <input value={form.accessKeySecret} onChange={(e) => setForm({ ...form, accessKeySecret: e.target.value })}
                  type="password" className="w-full rounded-xl border border-line-light/70 bg-surface-soft px-3 py-2 text-sm outline-none focus:border-aqua" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowAdd(false)} className="rounded-xl px-4 py-2 text-sm text-ink-muted hover:bg-surface-soft">{t("common.cancel")}</button>
              <button onClick={handleAdd} disabled={adding} className="btn-primary px-4 py-2 text-sm">
                {adding ? <Loader2 className="inline h-4 w-4 animate-spin mr-1" /> : null}
                {t("common.submit")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-line-light/70 bg-surface overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-ink-muted" /></div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-sm text-ink-muted">{t("common.noData")}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-light/70 text-ink-muted">
                <th className="px-3 py-2 text-left">{t("admin.oss.name")}</th>
                <th className="px-3 py-2 text-left">{t("admin.oss.provider")}</th>
                <th className="px-3 py-2 text-left">Bucket</th>
                <th className="px-3 py-2 text-left">Endpoint</th>
                <th className="px-3 py-2 text-left">{t("admin.oss.user")}</th>
                <th className="px-3 py-2 text-left">{t("admin.oss.isDefault")}</th>
                <th className="px-3 py-2 text-left">{t("admin.addTime")}</th>
                <th className="w-16 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id} className="border-b border-line-light/30 hover:bg-surface-soft">
                  <td className="px-3 py-2 font-medium text-ink-primary">{b.name}</td>
                  <td className="px-3 py-2">{PROVIDERS.find((p) => p.value === b.provider)?.label || b.provider}</td>
                  <td className="px-3 py-2 font-mono text-ink-primary">{b.bucket}</td>
                  <td className="px-3 py-2 text-ink-muted text-xs max-w-[200px] truncate">{b.endpoint}</td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-muted">{b.userId.slice(0, 12)}...</td>
                  <td className="px-3 py-2">{b.isDefault ? <span className="text-green-500 text-xs">{t("admin.oss.isDefault")}</span> : <button onClick={() => handleSetDefault(b.id)} className="text-ink-muted hover:text-ocean text-xs">{t("admin.oss.setDefault")}</button>}</td>
                  <td className="px-3 py-2 text-ink-muted text-xs">{new Date(b.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => handleDelete(b.id)} className="text-ink-muted hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

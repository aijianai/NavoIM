import { useState, useEffect } from "react";
import { Search, Trash2, Plus, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { api } from "../../lib/api";
import { toast } from "./shared";
import type { SensitiveWord } from "@navo/shared";

import { useT } from "../../lib/i18n";
const PAGE_SIZE = 50;

export function SensitiveWordsTab() {
    const t = useT();
  const [items, setItems] = useState<SensitiveWord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [batchInput, setBatchInput] = useState("");
  const [policy, setPolicy] = useState<"block" | "mask">("block");
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetch = async (p = page) => {
    setLoading(true);
    try {
      const res = await api.admin.getSensitiveWords({ page: p, pageSize: PAGE_SIZE, search: search || undefined });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(1); setPage(1); }, [search]);

  const handlePage = (p: number) => { setPage(p); fetch(p); };

  const handleAdd = async () => {
    const words = batchInput.split("\n").map((w) => w.trim()).filter(Boolean);
    if (words.length === 0) { toast(t("admin.sensitive.inputRequired")); return; }
    setAdding(true);
    try {
      await api.admin.addSensitiveWords(words, policy);
      toast(t("admin.sensitive.added", { count: words.length }));
      setBatchInput("");
      fetch(page);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (ids: string[]) => {
    if (!confirm(t("admin.sensitive.confirmDelete", { count: ids.length }))) return;
    try {
      await api.admin.deleteSensitiveWords(ids);
      toast(t("admin.sensitive.deleted", { count: ids.length }));
      setSelected(new Set());
      fetch(page);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i) => i.id)));
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">{t("admin.sensitiveWords")}</h2>

      {/* Add batch */}
      <div className="rounded-2xl border border-line-light/70 bg-surface p-4 space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-ink-primary">{t("admin.sensitivePolicy")}</span>
          <select value={policy} onChange={(e) => setPolicy(e.target.value as "block" | "mask")}
            className="rounded-xl border border-line-light/70 bg-surface px-3 py-1.5 text-sm outline-none focus:border-aqua">
            <option value="block">{t("admin.sensitive.block")}</option>
            <option value="mask">{t("admin.sensitive.mask")}</option>
          </select>
        </div>
        <textarea value={batchInput} onChange={(e) => setBatchInput(e.target.value)}
          placeholder={t("admin.sensitive.batchPlaceholder")}
          rows={5}
          className="w-full rounded-xl border border-line-light/70 bg-surface-soft px-3 py-2 text-sm outline-none focus:border-aqua resize-none"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-muted">{t("admin.sensitive.wordCount", { count: batchInput.split("\n").filter(Boolean).length })}</span>
          <button onClick={handleAdd} disabled={adding || !batchInput.trim()}
            className="btn-primary px-4 py-1.5 text-sm">
            {adding ? <Loader2 className="inline h-4 w-4 animate-spin mr-1" /> : <Plus className="inline h-4 w-4 mr-1" />}
            {t("admin.sensitive.batchAdd")}
          </button>
        </div>
      </div>

      {/* Search + batch delete */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.search")}
            className="w-full rounded-xl border border-line-light/70 bg-surface py-2 pl-10 pr-3 text-sm outline-none focus:border-aqua"
          />
        </div>
        {selected.size > 0 && (
          <button onClick={() => handleDelete(Array.from(selected))}
            className="rounded-xl bg-red-400/10 px-3 py-2 text-sm text-red-400 hover:bg-red-400/20">
            <Trash2 className="inline h-4 w-4 mr-1" />{t("common.delete")} ({selected.size})
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-line-light/70 bg-surface overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-ink-muted" /></div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-sm text-ink-muted">{t("admin.noData")}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-light/70 text-ink-muted">
                <th className="w-10 px-3 py-2"><input type="checkbox" checked={selected.size === items.length && items.length > 0} onChange={toggleAll} className="rounded" /></th>
                <th className="px-3 py-2 text-left">{t("admin.sensitiveWords")}</th>
                <th className="px-3 py-2 text-left">{t("admin.sensitivePolicy")}</th>
                <th className="px-3 py-2 text-left">{t("admin.addTime")}</th>
                <th className="w-16 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((w) => (
                <tr key={w.id} className="border-b border-line-light/30 hover:bg-surface-soft">
                  <td className="px-3 py-2"><input type="checkbox" checked={selected.has(w.id)} onChange={() => toggleSelect(w.id)} className="rounded" /></td>
                  <td className="px-3 py-2 font-mono text-ink-primary">{w.word}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${w.policy === "block" ? "bg-red-400/10 text-red-400" : "bg-yellow-400/10 text-yellow-400"}`}>
                      {w.policy === "block" ? t("admin.sensitive.block") : t("admin.sensitive.mask")}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-ink-muted text-xs">{new Date(w.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => handleDelete([w.id])} className="text-ink-muted hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                  </td>
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
          <span className="text-ink-muted">{page} / {totalPages}</span>
          <button onClick={() => handlePage(page + 1)} disabled={page >= totalPages} className="rounded-xl p-2 text-ink-muted hover:bg-surface-soft disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}

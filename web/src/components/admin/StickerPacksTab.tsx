import { useState, useEffect } from "react";
import { Plus, Trash2, X, Loader2, Image, Upload, Pencil, Check, XCircle } from "lucide-react";
import { api } from "../../lib/api";
import { cn } from "../../lib/utils";
import { toast } from "./shared";

import { useT } from "../../lib/i18n";
interface StickerPack {
  id: string;
  name: string;
  createdAt: string;
  createdBy: string;
  stickers: Sticker[];
}

interface Sticker {
  id: string;
  packId: string;
  name: string;
  fileUrl: string;
  mimeType: string;
  createdAt: string;
}

export function StickerPacksTab() {
    const t = useT();
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPackName, setNewPackName] = useState("");
  const [creating, setCreating] = useState(false);
  const [uploadingPack, setUploadingPack] = useState<string | null>(null);
  const [editingPack, setEditingPack] = useState<string | null>(null);
  const [editingPackName, setEditingPackName] = useState("");
  const [editingSticker, setEditingSticker] = useState<string | null>(null);
  const [editingStickerName, setEditingStickerName] = useState("");

  const loadPacks = async () => {
    setLoading(true);
    try {
      const data = await api.getStickerPacks();
      setPacks(data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { void loadPacks(); }, []);

  const createPack = async () => {
    if (!newPackName.trim()) { toast(t("admin.sticker.nameRequired")); return; }
    setCreating(true);
    try {
      await api.admin.createStickerPack(newPackName.trim());
      setNewPackName("");
      toast(t("admin.sticker.createSuccess"), "success");
      void loadPacks();
    } catch { toast(t("common.unknown")); }
    setCreating(false);
  };

  const deletePack = async (id: string) => {
    try {
      await api.admin.deleteStickerPack(id);
      toast(t("admin.sticker.deleteSuccess"), "success");
      void loadPacks();
    } catch { toast(t("admin.deleteFailed")); }
  };

  const startEditPack = (pack: StickerPack) => {
    setEditingPack(pack.id);
    setEditingPackName(pack.name);
  };

  const savePackName = async (id: string) => {
    if (!editingPackName.trim()) return;
    try {
      await api.admin.updateStickerPack(id, editingPackName.trim());
      toast(t("common.saved"), "success");
      void loadPacks();
    } catch { toast(t("common.unknown")); }
    setEditingPack(null);
  };

  const cancelEditPack = () => setEditingPack(null);

  const handleUpload = async (packId: string, files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploadingPack(packId);
    let okCount = 0;
    let failCount = 0;
    try {
      for (const file of list) {
        try {
          const attachment = await api.upload(file);
          const name = file.name.replace(/\.[^/.]+$/, "");
          await api.admin.addSticker(packId, name, attachment.url, attachment.mimeType);
          okCount++;
        } catch {
          failCount++;
        }
      }
      if (okCount > 0) {
        toast(
          failCount > 0
            ? `${okCount} ${t("admin.sticker.uploadSuccess")} (${failCount} ${t("admin.sticker.uploadFailed") || "failed"})`
            : `${okCount} ${t("admin.sticker.uploadSuccess")}`,
          failCount > 0 ? "error" : "success",
        );
      } else {
        toast(t("error.uploadFailed"), "error");
      }
      void loadPacks();
    } finally {
      setUploadingPack(null);
    }
  };

  const deleteSticker = async (packId: string, stickerId: string) => {
    try {
      await api.admin.deleteSticker(packId, stickerId);
      void loadPacks();
    } catch { toast(t("admin.deleteFailed")); }
  };

  const startEditSticker = (sticker: Sticker) => {
    setEditingSticker(sticker.id);
    setEditingStickerName(sticker.name);
  };

  const saveStickerName = async (packId: string, stickerId: string) => {
    if (!editingStickerName.trim()) return;
    try {
      await api.admin.updateSticker(packId, stickerId, editingStickerName.trim());
      toast(t("common.saved"), "success");
      void loadPacks();
    } catch { toast(t("common.unknown")); }
    setEditingSticker(null);
  };

  const cancelEditSticker = () => setEditingSticker(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink-primary">{t("admin.stickerPacks")}</h2>
      </div>

      {/* Create pack */}
      <div className="flex items-center gap-2">
        <input
          value={newPackName}
          onChange={(e) => setNewPackName(e.target.value)}
          placeholder={t("admin.sticker.namePlaceholder")}
          className="input-base flex-1"
          onKeyDown={(e) => { if (e.key === "Enter") createPack(); }}
        />
        <button onClick={createPack} disabled={creating} className="btn-primary flex items-center gap-1.5">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {t("common.submit")}
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-sm text-ink-secondary">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      )}

      {!loading && packs.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-sm text-ink-muted">
          <Image className="h-10 w-10" />
          <span>{t("admin.sticker.noPacksHint")}</span>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {packs.map((pack) => (
          <div key={pack.id} className="rounded-xl border border-line-light/70 bg-surface p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              {editingPack === pack.id ? (
                <div className="flex flex-1 items-center gap-1">
                  <input
                    value={editingPackName}
                    onChange={(e) => setEditingPackName(e.target.value)}
                    className="input-base flex-1 text-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") savePackName(pack.id);
                      if (e.key === "Escape") cancelEditPack();
                    }}
                  />
                  <button onClick={() => savePackName(pack.id)} className="text-aqua hover:text-aqua/80" title={t("common.save")}>
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={cancelEditPack} className="text-ink-muted hover:text-ink-primary" title={t("common.cancel")}>
                    <XCircle className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <h3 className="flex items-center gap-1.5 font-medium text-ink-primary">
                    {pack.name}
                    <button onClick={() => startEditPack(pack)} className="text-ink-muted hover:text-aqua" title={t("admin.sticker.editName")}>
                      <Pencil className="h-3 w-3" />
                    </button>
                  </h3>
                  <button onClick={() => deletePack(pack.id)} className="text-ink-muted hover:text-danger" title={t("admin.sticker.deleteSticker")}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>

            {/* Sticker grid */}
            <div className="mb-3 grid grid-cols-4 gap-2">
              {pack.stickers.map((st) => (
                <div key={st.id} className="group relative">
                  <div className="aspect-square overflow-hidden rounded-lg bg-surface-soft">
                    <img src={st.fileUrl} alt={st.name} className="h-full w-full object-contain p-1" />
                  </div>
                  <div className="absolute -right-1 -top-1 flex gap-0.5">
                    <button
                      onClick={() => startEditSticker(st)}
                      className="hidden rounded-full bg-surface-soft p-0.5 text-ink-muted shadow hover:text-aqua group-hover:block"
                      title={t("admin.sticker.editName")}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => deleteSticker(pack.id, st.id)}
                      className="hidden rounded-full bg-danger p-0.5 text-white shadow group-hover:block"
                      title={t("common.delete")}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  {editingSticker === st.id ? (
                    <div className="mt-0.5 flex items-center gap-0.5">
                      <input
                        value={editingStickerName}
                        onChange={(e) => setEditingStickerName(e.target.value)}
                        className="w-full rounded border border-line-light px-1 py-0.5 text-[10px]"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveStickerName(pack.id, st.id);
                          if (e.key === "Escape") cancelEditSticker();
                        }}
                      />
                      <button onClick={() => saveStickerName(pack.id, st.id)} className="shrink-0 text-aqua" title={t("common.save")}>
                        <Check className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="mt-0.5 truncate text-center text-[10px] text-ink-muted">{st.name}</div>
                  )}
                </div>
              ))}
            </div>

            {/* Upload */}
            <label className={cn(
              "flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line-light py-2 text-xs text-ink-secondary hover:border-aqua hover:text-aqua",
              uploadingPack === pack.id && "opacity-50 pointer-events-none",
            )}>
              {uploadingPack === pack.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {uploadingPack === pack.id ? t("common.loading") : t("admin.sticker.addEmoji")}
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    void handleUpload(pack.id, e.target.files);
                  }
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

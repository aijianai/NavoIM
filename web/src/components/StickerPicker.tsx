import { useState, useEffect } from "react";
import { Loader2, Image, Search } from "lucide-react";
import { api } from "../lib/api";
import { cn } from "../lib/utils";
import { useT } from "../lib/i18n";

interface StickerPack {
  id: string;
  name: string;
  stickers: { id: string; name: string; fileUrl: string; mimeType: string }[];
}

interface StickerPickerProps {
  onSelect: (stickerId: string, fileUrl: string) => void;
}

export function StickerPicker({ onSelect }: StickerPickerProps) {
  const t = useT();
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePack, setActivePack] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.getStickerPacks().then((data) => {
      setPacks(data);
      if (data.length > 0) setActivePack(data[0].id);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const activePackData = packs.find((p) => p.id === activePack);

  const q = search.trim().toLowerCase();

  const filteredStickers = q
    ? packs.flatMap((p) =>
        p.stickers
          .filter((s) => s.name.toLowerCase().includes(q))
          .map((s) => ({ ...s, packName: p.name })),
      )
    : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
      </div>
    );
  }

  if (packs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-sm text-ink-muted">
        <Image className="h-8 w-8" />
        <span>{t("sticker.empty")}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Search */}
      <div className="relative border-b border-line-light/70 px-2 py-1.5">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("sticker.searchPlaceholder")}
          className="w-full rounded-lg border border-line-light/60 bg-surface-soft py-1 pl-7 pr-2 text-xs text-ink-primary placeholder:text-ink-muted focus:border-aqua focus:outline-none"
        />
      </div>

      {q ? (
        /* Search results: show across all packs */
        <div className="grid grid-cols-4 gap-2 overflow-y-auto p-3 max-h-60">
          {filteredStickers.length === 0 && (
            <div className="col-span-4 py-6 text-center text-xs text-ink-muted">{t("sticker.noMatch")}</div>
          )}
          {filteredStickers.map((st) => (
            <button
              key={st.id}
              onClick={() => onSelect(st.id, st.fileUrl)}
              className="group flex flex-col items-center gap-1 rounded-lg p-1 hover:bg-surface-soft transition-colors"
            >
              <div className="aspect-square w-full overflow-hidden rounded-lg bg-surface-soft">
                <img src={st.fileUrl} alt={st.name} className="h-full w-full object-contain p-1" />
              </div>
              <span className="truncate text-[10px] text-ink-muted w-full text-center">{st.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          {/* Tab bar */}
          <div className="flex gap-1 border-b border-line-light/70 px-2 py-1.5 overflow-x-auto">
            {packs.map((p) => (
              <button
                key={p.id}
                onClick={() => setActivePack(p.id)}
                className={cn(
                  "shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                  activePack === p.id
                    ? "bg-ocean/10 text-ocean"
                    : "text-ink-secondary hover:bg-surface-soft hover:text-ink-primary",
                )}
              >
                {p.name}
              </button>
            ))}
          </div>

          {/* Sticker grid */}
          <div className="grid grid-cols-4 gap-2 overflow-y-auto p-3 max-h-60">
            {activePackData?.stickers.map((st) => (
              <button
                key={st.id}
                onClick={() => onSelect(st.id, st.fileUrl)}
                className="group flex flex-col items-center gap-1 rounded-lg p-1 hover:bg-surface-soft transition-colors"
              >
                <div className="aspect-square w-full overflow-hidden rounded-lg bg-surface-soft">
                  <img src={st.fileUrl} alt={st.name} className="h-full w-full object-contain p-1" />
                </div>
                <span className="truncate text-[10px] text-ink-muted w-full text-center">{st.name}</span>
              </button>
            ))}
            {activePackData?.stickers.length === 0 && (
              <div className="col-span-4 py-6 text-center text-xs text-ink-muted">{t("sticker.noEmoji")}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

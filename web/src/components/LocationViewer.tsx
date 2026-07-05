import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink, MapPin } from "lucide-react";
import { useViewer } from "../lib/viewer";
import { useT } from "../lib/i18n";

const AMAP_KEY = "ee95e52bf08006f63fd29bcfbcf21df0";

/**
 * Click a location card → opens this viewer.
 * Shows a static AMap thumbnail (no JS SDK needed) with a "open in AMap"
 * button that launches the official site in a new tab.
 */
export function LocationViewer() {
  const open = useViewer((s) => s.locationOpen);
  const loc = useViewer((s) => s.location);
  const close = useViewer((s) => s.closeLocation);
  const t = useT();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const staticMap = loc
    ? `https://restapi.amap.com/v3/staticmap?location=${loc.longitude},${loc.latitude}&zoom=15&size=900*540&markers=mid,,A:${loc.longitude},${loc.latitude}&key=${AMAP_KEY}`
    : "";
  const amapUrl = loc
    ? `https://uri.amap.com/marker?position=${loc.longitude},${loc.latitude}&name=${encodeURIComponent(loc.name ?? loc.address ?? t("media.location"))}`
    : "";

  return createPortal(
    <AnimatePresence>
      {open && loc && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
          onClick={close}
        >
          <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
            <a
              href={amapUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              title={t("location.openInAmap")}
            >
              <ExternalLink className="h-5 w-5" />
            </a>
            <button
              onClick={close}
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              title={t("common.close")}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl"
          >
            <div className="relative aspect-[5/3] w-full bg-surface-soft">
              {staticMap ? (
                <img
                  src={staticMap}
                  alt={loc.name ?? t("location.mapPreview")}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="grid h-full place-items-center text-ink-muted">{t("location.noPreview")}</div>
              )}
            </div>
            <div className="space-y-1 px-5 py-4">
              <div className="flex items-center gap-2 text-ink-primary">
                <MapPin className="h-4 w-4 text-ocean" />
                <span className="truncate text-sm font-semibold">{loc.name ?? t("media.location")}</span>
              </div>
              {loc.address && <div className="truncate text-xs text-ink-muted">{loc.address}</div>}
              <div className="pt-1 text-[11px] text-ink-muted">
                {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

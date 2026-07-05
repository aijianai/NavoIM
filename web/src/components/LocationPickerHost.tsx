import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useIsMobile } from "../lib/useIsMobile";
import { useLocationPicker } from "../lib/location-picker";
import { LocationPickerBody } from "./LocationPicker";
import { useT } from "../lib/i18n";

/**
 * Mount point for the location picker. Renders as:
 *  - a centered modal on desktop
 *  - a full-screen overlay on mobile (so it gets its own back-stack
 *    behavior and is keyboard-friendly on small viewports)
 */
export function LocationPickerHost() {
  const open = useLocationPicker((s) => s.open);
  const close = useLocationPicker((s) => s.closePicker);
  const isMobile = useIsMobile();
  const t = useT();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className={
            isMobile
              ? "fixed inset-0 z-[120] flex flex-col bg-app"
              : "fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
          }
        >
          {isMobile ? (
            <div className="relative flex h-full w-full flex-col bg-app">
              <div className="flex shrink-0 items-center justify-between border-b border-line-light/70 bg-surface px-4 py-3">
                <div className="font-display text-base font-semibold">{t("location.selectTitle")}</div>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-full p-1.5 text-ink-muted hover:bg-surface-soft"
                  aria-label={t("common.close")}
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <LocationPickerBody embedded onClose={close} />
              </div>
            </div>
          ) : (
            <div
              onClick={(e) => {
                if (e.target === e.currentTarget) close();
              }}
              className="w-full max-w-2xl"
            >
              <motion.div
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.96, opacity: 0 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="flex max-h-[88vh] flex-col overflow-hidden rounded-2xl border border-line-light/70 bg-surface shadow-2xl"
              >
                <div className="flex shrink-0 items-center justify-between border-b border-line-light/70 bg-surface-soft/60 px-5 py-3">
                  <div className="font-display text-base font-semibold">{t("location.selectTitle")}</div>
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-full p-1.5 text-ink-muted hover:bg-surface-soft"
                    aria-label={t("common.close")}
                  >
                    ✕
                  </button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <LocationPickerBody onClose={close} />
                </div>
              </motion.div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

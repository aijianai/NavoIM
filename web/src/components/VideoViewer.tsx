import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useViewer } from "../lib/viewer";
import { downloadAttachment, resolveAttachmentUrl } from "../lib/utils";
import { useT } from "../lib/i18n";

export function VideoViewer() {
  const open = useViewer((s) => s.videoOpen);
  const videos = useViewer((s) => s.videos);
  const index = useViewer((s) => s.videoIndex);
  const close = useViewer((s) => s.closeVideo);
  const next = useViewer((s) => s.nextVideo);
  const prev = useViewer((s) => s.prevVideo);
  const t = useT();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, next, prev]);

  useEffect(() => {
    if (open && videoRef.current) {
      videoRef.current.currentTime = 0;
      void videoRef.current.play().catch(() => {
        /* autoplay may be blocked until user interaction */
      });
    }
  }, [open, index]);

  const current = videos[index];

  return createPortal(
    <AnimatePresence>
      {open && current && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md"
          onClick={close}
        >
          <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                void downloadAttachment(resolveAttachmentUrl(current.url), current.name);
              }}
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              title={t("media.download")}
            >
              <Download className="h-5 w-5" />
            </button>
            <button
              onClick={close}
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              title={t("common.close")}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {videos.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  prev();
                }}
                className="absolute left-4 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  next();
                }}
                className="absolute right-4 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          <motion.video
            key={current.url}
            ref={videoRef}
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            src={resolveAttachmentUrl(current.url)}
            controls
            autoPlay
            playsInline
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88vh] max-w-[92vw] rounded-lg shadow-2xl"
          />

          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-4 py-1.5 text-sm text-white/90 backdrop-blur">
            {current.name}
            {videos.length > 1 && (
              <span className="ml-2 text-white/60">
                {index + 1} / {videos.length}
              </span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

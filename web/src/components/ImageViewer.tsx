import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { useViewer } from "../lib/viewer";
import { useT } from "../lib/i18n";
import { downloadAttachment, resolveAttachmentUrl } from "../lib/utils";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

export function ImageViewer() {
  const open = useViewer((s) => s.open);
  const images = useViewer((s) => s.images);
  const index = useViewer((s) => s.index);
  const close = useViewer((s) => s.close);
  const next = useViewer((s) => s.next);
  const prev = useViewer((s) => s.prev);
  const t = useT();

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 重置 zoom/pan when image changes
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [index, open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP));
      if (e.key === "-" || e.key === "_") setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP));
      if (e.key === "0") { setZoom(1); setPan({ x: 0, y: 0 }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, next, prev]);

  // 滚轮缩放
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom((z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z + delta)));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (zoom <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }, [zoom, pan]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging || !dragStart.current) return;
    e.preventDefault();
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({ x: dragStart.current.px + dx, y: dragStart.current.py + dy });
  }, [isDragging]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    setIsDragging(false);
    dragStart.current = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }, []);

  const current = images[index];

  const zoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP));
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP));
  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  return createPortal(
    <AnimatePresence>
      {open && current && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md"
          onClick={() => { if (!isDragging) close(); }}
        >
          <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); zoomOut(); }}
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-40"
              title={t("media.zoomOut")}
              disabled={zoom <= ZOOM_MIN}
            >
              <ZoomOut className="h-5 w-5" />
            </button>
            <span className="grid h-10 min-w-[3rem] place-items-center rounded-full bg-white/10 px-2 text-sm text-white">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); zoomIn(); }}
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-40"
              title={t("media.zoomIn")}
              disabled={zoom >= ZOOM_MAX}
            >
              <ZoomIn className="h-5 w-5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); reset(); }}
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              title={t("media.zoomReset")}
            >
              <RotateCcw className="h-5 w-5" />
            </button>
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

          {images.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  prev();
                }}
                className="absolute left-4 z-10 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
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

          <div
            ref={containerRef}
            className="flex h-full w-full items-center justify-center overflow-hidden"
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onClick={(e) => e.stopPropagation()}
            style={{ cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default" }}
          >
            <motion.img
              key={current.url}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              src={resolveAttachmentUrl(current.url)}
              alt={current.name}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              className="max-h-[88vh] max-w-[92vw] rounded-lg object-contain shadow-2xl select-none"
              style={{
                transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                transition: isDragging ? "none" : "transform 0.2s ease-out",
              }}
            />
          </div>

          <div className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-white/10 px-4 py-1.5 text-sm text-white/90 backdrop-blur">
            {current.name}
            {images.length > 1 && (
              <span className="ml-2 text-white/60">
                {index + 1} / {images.length}
              </span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

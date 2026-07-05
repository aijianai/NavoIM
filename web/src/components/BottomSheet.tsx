import { useCallback, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "../lib/utils";

const SHEET_SPRING = { type: "spring" as const, damping: 32, stiffness: 380, mass: 0.85 };
const BACKDROP_FADE = { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const };
const DISMISS_DRAG_PX = 96;
const DISMISS_VELOCITY = 720;

export interface BottomSheetProps {
  /** 是否显示 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 标题 */
  title?: ReactNode;
  /** 是否显示顶部拖拽条（移动端） */
  showHandle?: boolean;
  /** 是否显示关闭按钮 */
  showClose?: boolean;
  /** 桌面端最大宽度 class */
  desktopMaxWidth?: string;
  /** 内容区额外 class */
  bodyClassName?: string;
  children: ReactNode;
}

/**
 * 通用底部抽屉：移动端自底部滑入，内容可滚动；标题区可拖拽关闭。
 */
export function BottomSheet({
  open,
  onClose,
  title,
  showHandle = true,
  showClose = true,
  desktopMaxWidth = "md:max-w-md",
  bodyClassName,
  children,
}: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const onDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      if (info.offset.y > DISMISS_DRAG_PX || info.velocity.y > DISMISS_VELOCITY) {
        onClose();
      }
    },
    [onClose],
  );

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[200] flex flex-col justify-end md:items-center md:justify-center md:p-4">
          <motion.button
            type="button"
            aria-label="close"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={BACKDROP_FADE}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ y: "100%", opacity: 0.85 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0.6 }}
            transition={SHEET_SPRING}
            className={cn(
              "relative flex max-h-[min(88vh,720px)] w-full flex-col bg-surface shadow-2xl",
              "rounded-t-[1.25rem] pb-[env(safe-area-inset-bottom)]",
              "md:max-h-[80vh] md:flex-none md:rounded-2xl",
              desktopMaxWidth,
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.42 }}
              onDragEnd={onDragEnd}
              className="shrink-0 cursor-grab active:cursor-grabbing touch-none"
            >
              {showHandle && (
                <div className="flex justify-center bg-surface pt-2.5 pb-1 md:hidden">
                  <div className="h-1 w-10 rounded-full bg-line-light/90" />
                </div>
              )}
              {(title || showClose) && (
                <div className="flex items-center justify-between border-b border-line-light px-4 py-3">
                  <div className="text-base font-semibold text-ink-primary">{title}</div>
                  {showClose && (
                    <button
                      type="button"
                      onClick={onClose}
                      className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink-primary"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  )}
                </div>
              )}
            </motion.div>
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y",
                bodyClassName ?? "p-4",
              )}
            >
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

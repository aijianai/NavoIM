import { useRef, useEffect, useCallback, useState } from "react";
import { cn } from "../lib/utils";

const TRACK_W = 36;
const THUMB_W = 16;
const PADDING = 2;
const OFF_POS = PADDING;
const ON_POS = TRACK_W - THUMB_W - PADDING;
const DRAG_THRESHOLD = 3;
const ANIM_DURATION = 200;

interface DraggableToggleProps {
  on: boolean;
  onChange: (on: boolean) => void;
  className?: string;
  disabled?: boolean;
}

export function DraggableToggle({
  on,
  onChange,
  className,
  disabled = false,
}: DraggableToggleProps) {
  const trackRef = useRef<HTMLButtonElement>(null);

  // ─── ref 保存最新值，避免 document 级别监听器中的闭包过期 ──
  const isDraggingRef = useRef(false);
  const dragXRef = useRef(on ? ON_POS : OFF_POS);
  const onRef = useRef(on);
  const disabledRef = useRef(disabled);
  const onChangeRef = useRef(onChange);

  // ─── state 驱动 UI 更新 ────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);
  const [dragX, setDragX] = useState(on ? ON_POS : OFF_POS);

  // 拖拽偏移量
  const dragStartOffset = useRef(0);
  const dragStartX = useRef(0);
  const hasDragged = useRef(false);

  // 动画锁
  const isAnimating = useRef(false);
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── 保持 ref 与 props/state 同步 ──────────────────────────
  onRef.current = on;
  disabledRef.current = disabled;
  onChangeRef.current = onChange;
  dragXRef.current = dragX;

  const targetPos = on ? ON_POS : OFF_POS;

  // 外部 on 变化时同步滑块位置
  useEffect(() => {
    if (!isDragging) {
      setDragX(targetPos);
    }
  }, [isDragging, targetPos]);

  // 动画结束后校准位置
  useEffect(() => {
    if (isDragging) return;
    const timer = setTimeout(() => {
      setDragX(targetPos);
    }, ANIM_DURATION + 16);
    return () => clearTimeout(timer);
  }, [isDragging, targetPos]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (animTimer.current) clearTimeout(animTimer.current);
    };
  }, []);

  // 动画锁
  const lockAnimation = useCallback(() => {
    isAnimating.current = true;
    if (animTimer.current) clearTimeout(animTimer.current);
    animTimer.current = setTimeout(() => {
      isAnimating.current = false;
    }, ANIM_DURATION);
  }, []);

  // ─── 拖拽逻辑（通过 ref 读取最新值）─────────────────────────

  const handleDragMove = useCallback((clientX: number) => {
    if (!isDraggingRef.current || !trackRef.current) return;

    if (!hasDragged.current) {
      if (Math.abs(clientX - dragStartX.current) >= DRAG_THRESHOLD) {
        hasDragged.current = true;
        const track = trackRef.current;
        const trackRect = track.getBoundingClientRect();
        const cursorInTrack = clientX - trackRect.left;
        dragStartOffset.current = cursorInTrack - dragXRef.current;
      }
    }

    if (!hasDragged.current) return;

    const trackRect = trackRef.current.getBoundingClientRect();
    const cursorInTrack = clientX - trackRect.left;
    const rawX = cursorInTrack - dragStartOffset.current;
    const newX = Math.max(OFF_POS, Math.min(ON_POS, rawX));
    dragXRef.current = newX;
    setDragX(newX);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);

    if (hasDragged.current) {
      const threshold = (OFF_POS + ON_POS) / 2;
      const shouldBeOn = dragXRef.current >= threshold;
      if (shouldBeOn !== onRef.current) {
        lockAnimation();
        onChangeRef.current(shouldBeOn);
      }
    } else {
      lockAnimation();
      onChangeRef.current(!onRef.current);
    }
  }, [lockAnimation]);

  // ─── 通过 ref 包装，确保 document 监听器始终调用最新版 ────
  const handleDragMoveRef = useRef(handleDragMove);
  handleDragMoveRef.current = handleDragMove;

  const handleDragEndRef = useRef(handleDragEnd);
  handleDragEndRef.current = handleDragEnd;

  // ─── Mouse ─────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (disabledRef.current || isAnimating.current) return;

    dragStartX.current = e.clientX;
    hasDragged.current = false;
    isDraggingRef.current = true;
    setIsDragging(true);

    const onMove = (ev: MouseEvent) => handleDragMoveRef.current(ev.clientX);
    const onUp = () => {
      handleDragEndRef.current();
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  // ─── Touch ─────────────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (disabledRef.current || isAnimating.current) return;

    dragStartX.current = e.touches[0].clientX;
    hasDragged.current = false;
    isDraggingRef.current = true;
    setIsDragging(true);

    const onMove = (ev: TouchEvent) => handleDragMoveRef.current(ev.touches[0].clientX);
    const onEnd = () => {
      handleDragEndRef.current();
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
    };
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
  }, []);

  // ─── Keyboard ──────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabledRef.current || isAnimating.current) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      lockAnimation();
      onChangeRef.current(!onRef.current);
    }
  }, [lockAnimation]);

  return (
    <button
      ref={trackRef}
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      className={cn(
        "relative h-5 w-9 flex-shrink-0 rounded-full overflow-hidden",
        "transition-colors duration-200 ease-in-out",
        on ? "bg-ocean" : "bg-neutral-400",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onKeyDown={handleKeyDown}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0 h-4 w-4 rounded-full bg-white shadow-sm",
          "will-change-transform",
          isDragging
            ? ""
            : "transition-transform duration-200 ease-in-out"
        )}
        style={{ transform: `translateX(${dragX}px)` }}
      />
    </button>
  );
}
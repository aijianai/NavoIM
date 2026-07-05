import { useState, useRef, useCallback, useEffect, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useT } from "../lib/i18n";

interface PatternLockInputProps {
  value: number[];
  onChange: (value: number[]) => void;
  minPoints?: number;
  error?: string;
  disabled?: boolean;
  label?: string;
  size?: number;
}

interface Point {
  x: number;
  y: number;
}

// 3x3 grid positions (1-9)
const GRID_POSITIONS: Record<number, Point> = {
  1: { x: 0, y: 0 },
  2: { x: 1, y: 0 },
  3: { x: 2, y: 0 },
  4: { x: 0, y: 1 },
  5: { x: 1, y: 1 },
  6: { x: 2, y: 1 },
  7: { x: 0, y: 2 },
  8: { x: 1, y: 2 },
  9: { x: 2, y: 2 },
};

function getPointFromPosition(
  x: number,
  y: number,
  containerRect: DOMRect,
  gap: number
): number | null {
  const cellSize = (containerRect.width - gap * 2) / 3;
  const col = Math.floor(x / (cellSize + gap));
  const row = Math.floor(y / (cellSize + gap));

  if (col < 0 || col > 2 || row < 0 || row > 2) return null;

  // Check if we're close enough to the center of the cell
  const centerX = col * (cellSize + gap) + cellSize / 2;
  const centerY = row * (cellSize + gap) + cellSize / 2;
  const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);

  if (distance > cellSize * 0.7) return null;

  return row * 3 + col + 1;
}

export const PatternLockInput = memo(function PatternLockInput({
  value: _value,
  onChange,
  minPoints = 6,
  error,
  disabled = false,
  label,
  size = 280,
}: PatternLockInputProps) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [selectedPoints, setSelectedPoints] = useState<number[]>([]);
  const [animatingPoint, setAnimatingPoint] = useState<number | null>(null);

  // Sync internal state when value prop changes (e.g. switching from input to confirm)
  useEffect(() => {
    setSelectedPoints(_value ?? []);
  }, [_value]);

  const gap = 20;
  const largeDotSize = 32;

  // Get touch/mouse position relative to container
  const getPosition = useCallback(
    (e: React.TouchEvent | React.MouseEvent | TouchEvent | MouseEvent): Point | null => {
      if (!containerRef.current) return null;
      const rect = containerRef.current.getBoundingClientRect();
      let clientX: number, clientY: number;

      if ("touches" in e) {
        if (e.touches.length === 0) return null;
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    },
    []
  );

  const handleStart = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      const pos = getPosition(e);
      if (!pos || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const point = getPointFromPosition(pos.x, pos.y, rect, gap);

      if (point && !selectedPoints.includes(point)) {
        setIsDrawing(true);
        setSelectedPoints([point]);
        setCurrentPoint(pos);
        setAnimatingPoint(point);
        setTimeout(() => setAnimatingPoint(null), 200);
      }
    },
    [disabled, getPosition, selectedPoints]
  );

  const handleMove = useCallback(
    (e: React.TouchEvent | React.MouseEvent | TouchEvent | MouseEvent) => {
      if (!isDrawing || disabled || !containerRef.current) return;
      e.preventDefault();

      let clientX: number, clientY: number;
      if ("touches" in e) {
        if (e.touches.length === 0) return;
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      setCurrentPoint({ x, y });

      const point = getPointFromPosition(x, y, rect, gap);
      if (point && !selectedPoints.includes(point)) {
        setSelectedPoints((prev) => [...prev, point]);
        setAnimatingPoint(point);
        setTimeout(() => setAnimatingPoint(null), 200);
      }
    },
    [isDrawing, disabled, selectedPoints]
  );

  const handleEnd = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    setCurrentPoint(null);

    // Validate minimum points
    if (selectedPoints.length < minPoints) {
      // Clear after a short delay to show the pattern
      setTimeout(() => setSelectedPoints([]), 500);
      return;
    }

    onChange(selectedPoints);
  }, [isDrawing, selectedPoints, minPoints, onChange]);

  // Global event listeners for mouse/touch
  useEffect(() => {
    if (!isDrawing) return;

    const handleMouseMove = (e: MouseEvent) => handleMove(e);
    const handleMouseUp = () => handleEnd();
    const handleTouchMove = (e: TouchEvent) => handleMove(e);
    const handleTouchEnd = () => handleEnd();

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isDrawing, handleMove, handleEnd]);

  const clearPattern = useCallback(() => {
    setSelectedPoints([]);
    setCurrentPoint(null);
    setIsDrawing(false);
  }, []);

  // Render the pattern lines
  const renderLines = () => {
    if (selectedPoints.length < 2) return null;

    const lines = [];
    for (let i = 0; i < selectedPoints.length - 1; i++) {
      const from = GRID_POSITIONS[selectedPoints[i]];
      const to = GRID_POSITIONS[selectedPoints[i + 1]];
      const x1 = from.x * ((size - gap * 2) / 3) + gap + (size - gap * 2) / 6;
      const y1 = from.y * ((size - gap * 2) / 3) + gap + (size - gap * 2) / 6;
      const x2 = to.x * ((size - gap * 2) / 3) + gap + (size - gap * 2) / 6;
      const y2 = to.y * ((size - gap * 2) / 3) + gap + (size - gap * 2) / 6;

      lines.push(
        <line
          key={`line-${i}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="rgb(var(--brand-2))"
          strokeWidth="4"
          strokeLinecap="round"
          opacity={0.8}
        />
      );
    }

    // Line to current touch position
    if (isDrawing && currentPoint && selectedPoints.length > 0) {
      const lastPoint = GRID_POSITIONS[selectedPoints[selectedPoints.length - 1]];
      const x1 = lastPoint.x * ((size - gap * 2) / 3) + gap + (size - gap * 2) / 6;
      const y1 = lastPoint.y * ((size - gap * 2) / 3) + gap + (size - gap * 2) / 6;

      lines.push(
        <line
          key="line-current"
          x1={x1}
          y1={y1}
          x2={currentPoint.x}
          y2={currentPoint.y}
          stroke="rgb(var(--brand-2))"
          strokeWidth="4"
          strokeLinecap="round"
          opacity={0.5}
        />
      );
    }

    return lines;
  };

  // Render dots
  const renderDots = () => {
    const dots = [];
    const cellSize = (size - gap * 2) / 3;

    for (let i = 1; i <= 9; i++) {
      const pos = GRID_POSITIONS[i];
      const x = pos.x * (cellSize + gap) + gap + cellSize / 2;
      const y = pos.y * (cellSize + gap) + gap + cellSize / 2;
      const isSelected = selectedPoints.includes(i);
      const isAnimating = animatingPoint === i;

      dots.push(
        <motion.g key={i}>
          {/* Outer glow for selected */}
          {isSelected && (
            <motion.circle
              cx={x}
              cy={y}
              r={largeDotSize / 2 + 4}
              fill="none"
              stroke="rgb(var(--brand-2))"
              strokeWidth="2"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 0.3, scale: 1 }}
              transition={{ duration: 0.2 }}
            />
          )}

          {/* Main dot */}
          <motion.circle
            cx={x}
            cy={y}
            fill={
              isSelected
                ? "rgb(var(--brand-2))"
                : "rgb(var(--surface))"
            }
            stroke={
              isSelected
                ? "rgb(var(--brand-2))"
                : "rgb(var(--line-light))"
            }
            strokeWidth={isSelected ? 0 : 2}
            initial={false}
            animate={{
              r: isAnimating
                ? largeDotSize / 2 + 4
                : isSelected
                  ? largeDotSize / 2
                  : 10,
            }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          />

          {/* Inner highlight for selected */}
          {isSelected && (
            <motion.circle
              cx={x}
              cy={y}
              r={6}
              fill="white"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
            />
          )}
        </motion.g>
      );
    }

    return dots;
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {label && (
        <label className="text-sm font-medium text-ink-secondary">{label}</label>
      )}

      <div
        ref={containerRef}
        className="relative select-none touch-none"
        style={{ width: size, height: size }}
        onMouseDown={handleStart}
        onTouchStart={handleStart}
      >
        <svg
          width={size}
          height={size}
          className="absolute inset-0"
          style={{ pointerEvents: "none" }}
        >
          {renderLines()}
          {renderDots()}
        </svg>
      </div>

      {/* Points count indicator */}
      <div className="flex items-center gap-2 text-sm text-ink-secondary">
        <span>
          {selectedPoints.length} / {minPoints}+ {t("patternLock.points")}
        </span>
        {selectedPoints.length > 0 && !disabled && (
          <button
            type="button"
            onClick={clearPattern}
            className="text-ocean hover:text-ocean/80 transition-colors"
          >
            {t("common.retry")}
          </button>
        )}
      </div>

      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="text-sm text-danger text-center"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

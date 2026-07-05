import { useState, useCallback, useEffect, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

import { useT } from "../lib/i18n";
interface NumberPadInputProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  error?: string;
  disabled?: boolean;
  label?: string;
}

const NUMBERS = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
];

export const NumberPadInput = memo(function NumberPadInput({
  value,
  onChange,
  maxLength = 6,
  error,
  disabled = false,
  label,
}: NumberPadInputProps) {
    const t = useT();
  const [focused, setFocused] = useState(false);

  const handleNumberClick = useCallback(
    (num: number) => {
      if (disabled || value.length >= maxLength) return;
      onChange(value + num.toString());
    },
    [value, onChange, maxLength, disabled]
  );

  const handleDelete = useCallback(() => {
    if (disabled || value.length === 0) return;
    onChange(value.slice(0, -1));
  }, [value, onChange, disabled]);

  const handleClear = useCallback(() => {
    if (disabled) return;
    onChange("");
  }, [onChange, disabled]);

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (disabled) return;
      if (e.key >= "0" && e.key <= "9") {
        handleNumberClick(parseInt(e.key, 10));
      } else if (e.key === "Backspace") {
        handleDelete();
      } else if (e.key === "Escape") {
        handleClear();
      }
    };

    if (focused) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [focused, handleNumberClick, handleDelete, handleClear, disabled]);

  return (
    <div className="flex flex-col items-center gap-4">
      {label && (
        <label className="text-sm font-medium text-ink-secondary">{label}</label>
      )}

      {/* Password dots */}
      <div className="flex gap-3 items-center justify-center h-10">
        {Array.from({ length: maxLength }).map((_, i) => (
          <motion.div
            key={i}
            initial={false}
            animate={{
              scale: i < value.length ? 1 : 0.8,
              backgroundColor:
                i < value.length
                  ? "rgb(var(--brand-2))"
                  : "rgb(var(--line-light))",
            }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className={cn(
              "w-3.5 h-3.5 rounded-full transition-colors",
              i < value.length && "shadow-[0_0_8px_rgba(47,125,255,0.4)]"
            )}
          />
        ))}
      </div>

      {/* Number pad */}
      <div
        className="grid grid-cols-3 gap-3 w-full max-w-[240px]"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        {NUMBERS.flat().map((num) => (
          <motion.button
            key={num}
            type="button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleNumberClick(num)}
            disabled={disabled || value.length >= maxLength}
            className={cn(
              "h-16 rounded-2xl flex items-center justify-center",
              "text-2xl font-semibold text-ink-primary",
              "bg-surface border border-line-light",
              "hover:bg-surface-soft hover:border-aqua/50",
              "active:bg-aqua/10",
              "transition-all duration-150",
              "focus:outline-none focus:ring-2 focus:ring-aqua/50",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "select-none cursor-pointer"
            )}
          >
            {num}
          </motion.button>
        ))}

        {/* Bottom row: Clear, 0, Delete */}
        <motion.button
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleClear}
          disabled={disabled || value.length === 0}
          className={cn(
            "h-16 rounded-2xl flex items-center justify-center",
            "text-sm font-medium text-ink-secondary",
            "bg-surface border border-line-light",
            "hover:bg-surface-soft hover:border-aqua/50",
            "active:bg-aqua/10",
            "transition-all duration-150",
            "focus:outline-none focus:ring-2 focus:ring-aqua/50",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "select-none cursor-pointer"
          )}
        >
          {t("common.close")}
        </motion.button>

        <motion.button
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => handleNumberClick(0)}
          disabled={disabled || value.length >= maxLength}
          className={cn(
            "h-16 rounded-2xl flex items-center justify-center",
            "text-2xl font-semibold text-ink-primary",
            "bg-surface border border-line-light",
            "hover:bg-surface-soft hover:border-aqua/50",
            "active:bg-aqua/10",
            "transition-all duration-150",
            "focus:outline-none focus:ring-2 focus:ring-aqua/50",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "select-none cursor-pointer"
          )}
        >
          0
        </motion.button>

        <motion.button
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleDelete}
          disabled={disabled || value.length === 0}
          className={cn(
            "h-16 rounded-2xl flex items-center justify-center",
            "text-ink-secondary",
            "bg-surface border border-line-light",
            "hover:bg-surface-soft hover:border-danger/50 hover:text-danger",
            "active:bg-danger/10",
            "transition-all duration-150",
            "focus:outline-none focus:ring-2 focus:ring-aqua/50",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "select-none cursor-pointer"
          )}
        >
          <Delete className="w-5 h-5" />
        </motion.button>
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

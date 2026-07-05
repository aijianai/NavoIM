import { useState, useEffect, useRef } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { cn } from "../lib/utils";
import { useT } from "../lib/i18n";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "danger" | "warning";
  showInput?: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
  inputValue?: string;
  onInputValueChange?: (value: string) => void;
  onConfirm: (inputValue?: string) => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmText,
  cancelText,
  variant = "default",
  showInput = false,
  inputLabel,
  inputPlaceholder,
  inputValue: controlledValue,
  inputPlaceholder: _ph,
  inputValue: _iv,
  onInputValueChange,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const t = useT();
  const resolvedConfirmText = confirmText ?? t("common.confirm");
  const resolvedCancelText = cancelText ?? t("common.cancel");
  const [localValue, setLocalValue] = useState(controlledValue ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && showInput) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    if (open) setLocalValue(controlledValue ?? "");
  }, [open, showInput, controlledValue]);

  if (!open) return null;

  const iconMap = {
    default: null,
    danger: <Trash2 className="h-6 w-6 text-red-500" />,
    warning: <AlertTriangle className="h-6 w-6 text-yellow-500" />,
  };

  const btnMap = {
    default: "bg-ocean hover:bg-ocean/90",
    danger: "bg-red-500 hover:bg-red-600",
    warning: "bg-yellow-500 hover:bg-yellow-600",
  };

  const value = controlledValue !== undefined ? controlledValue : localValue;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-line-light/70 bg-surface p-6 shadow-2xl">
        <div className="mb-4 flex items-start gap-3">
          {iconMap[variant] && (
            <div className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              variant === "danger" && "bg-red-500/10",
              variant === "warning" && "bg-yellow-500/10",
              variant === "default" && "bg-ocean/10",
            )}>
              {iconMap[variant]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-lg font-semibold text-ink-primary">{title}</h3>
            <p className="mt-1 text-sm text-ink-secondary leading-relaxed">{message}</p>
          </div>
          <button onClick={onCancel} className="shrink-0 rounded-lg p-1 text-ink-muted hover:text-ink-primary transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {showInput && (
          <div className="mb-4">
            {inputLabel && (
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">
                {inputLabel}
              </label>
            )}
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => {
                setLocalValue(e.target.value);
                onInputValueChange?.(e.target.value);
              }}
              placeholder={inputPlaceholder}
              className="w-full rounded-xl border border-line-light/70 bg-surface-soft px-3 py-2.5 text-sm text-ink-primary outline-none focus:border-aqua transition-colors"
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-xl border border-line-light/70 bg-surface-soft px-4 py-2 text-sm font-medium text-ink-secondary hover:bg-line-light/50 transition-colors"
          >
            {resolvedCancelText}
          </button>
          <button
            onClick={() => onConfirm(value)}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-medium text-white transition-colors",
              btnMap[variant],
            )}
          >
            {resolvedConfirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

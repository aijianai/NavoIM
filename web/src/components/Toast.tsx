import { useEffect } from "react";
import { useChatStore } from "../lib/store";
import { cn } from "../lib/utils";

const TOAST_DURATION_MS = 3000;

export function Toast() {
  const toast = useChatStore((s) => s.toast);
  const dismissToast = useChatStore((s) => s.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(dismissToast, TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast, dismissToast]);

  if (!toast) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[200] flex justify-center px-4">
      <div
        role="alert"
        onClick={dismissToast}
        className={cn(
          "pointer-events-auto max-w-md cursor-pointer rounded-2xl border px-4 py-2.5 text-sm shadow-2xl backdrop-blur-xl transition-all",
          toast.tone === "error"
            ? "border-danger/50 bg-danger/15 text-danger"
            : "border-line-light/70 bg-surface text-ink-primary",
        )}
      >
        {toast.message}
      </div>
    </div>
  );
}

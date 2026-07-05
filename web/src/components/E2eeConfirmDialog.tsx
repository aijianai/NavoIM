import { ShieldCheck, X, AlertTriangle } from "lucide-react";
import { useT } from "../lib/i18n";

export function E2eeConfirmDialog({
  peerName,
  onCancel,
  onConfirm,
}: {
  peerName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-line-light/70 bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line-light/70 px-5 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-ocean" />
            <h3 className="font-display text-lg font-semibold text-ink-primary">{t("e2ee.dialogTitle")}</h3>
          </div>
          <button
            onClick={onCancel}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-soft hover:text-ink-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4 text-sm text-ink-secondary">
          <p className="leading-relaxed">
            {t("e2ee.intro", { peer: peerName })}
          </p>
          <div className="rounded-xl border border-warning/40 bg-warning/5 p-3 text-xs text-ink-primary">
            <div className="mb-1.5 flex items-center gap-1.5 font-medium text-warning">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t("e2ee.warningsTitle")}
            </div>
            <ul className="list-disc space-y-1 pl-4">
              <li>{t("e2ee.warningBothOnline")}</li>
              <li>{t("e2ee.warningNoServerHistory")}</li>
              <li>{t("e2ee.warningFilesAutoDelete")}</li>
              <li>{t("e2ee.warningOffline10min")}</li>
            </ul>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line-light/70 bg-surface-soft px-5 py-3">
          <button
            onClick={onCancel}
            className="rounded-xl border border-line-light/70 bg-surface px-4 py-2 text-sm text-ink-primary hover:bg-surface-soft"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 rounded-xl bg-ocean px-4 py-2 text-sm font-medium text-white hover:bg-ocean/90"
          >
            <ShieldCheck className="h-4 w-4" />
            {t("e2ee.enable")}
          </button>
        </div>
      </div>
    </div>
  );
}

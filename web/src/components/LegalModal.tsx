import { X } from "lucide-react";
import { useT } from "../lib/i18n";

type LegalKind = "terms" | "privacy";

/** 用户协议 / 隐私政策弹窗 */
export function LegalModal({ kind, onClose }: { kind: LegalKind; onClose: () => void }) {
  const t = useT();
  const title = kind === "terms" ? t("login.termsOfService") : t("login.privacyPolicy");
  const body = kind === "terms" ? t("login.termsContent") : t("login.privacyContent");

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-line-light/70 bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line-light/70 px-5 py-4">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-alt">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 text-sm leading-relaxed text-ink-primary whitespace-pre-wrap">
          {body}
        </div>
        <div className="border-t border-line-light/70 px-5 py-3">
          <button type="button" onClick={onClose} className="btn-primary w-full">
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

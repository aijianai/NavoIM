import { useEffect, useState } from "react";
import { Github, Globe, Star, X } from "lucide-react";
import { useT } from "../lib/i18n";
import { openUrl } from "../lib/browser";

const OSS_PROMO_KEY = "navo:im:ossPromoDismissed";
const GITHUB_REPO_URL = "https://github.com/aijianai/NavoIM";
const DEMO_SITE_URL = "https://navo.airoe.cn";

/** 首次访问时提示用户关注 GitHub 开源仓库。 */
export function OpenSourcePromoModal() {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(OSS_PROMO_KEY)) {
        setOpen(true);
      }
    } catch {
      setOpen(true);
    }
  }, []);

  function dismiss(): void {
    try {
      localStorage.setItem(OSS_PROMO_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  function openGitHub(): void {
    openUrl(GITHUB_REPO_URL);
    dismiss();
  }

  function openDemo(): void {
    openUrl(DEMO_SITE_URL);
    dismiss();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={dismiss} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="oss-promo-title"
        className="relative z-10 w-full max-w-md rounded-2xl border border-line-light/70 bg-surface p-6 shadow-2xl animate-fade-in"
      >
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-4 top-4 rounded-lg p-1 text-ink-muted hover:bg-surface-soft hover:text-ink-primary"
          aria-label={t("common.close")}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-ocean/10">
          <Github className="h-6 w-6 text-ocean" />
        </div>

        <h2 id="oss-promo-title" className="font-display text-xl font-semibold text-ink-primary">
          {t("app.ossPromo.title")}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
          {t("app.ossPromo.message")}
        </p>

        <div className="mt-4 space-y-2 rounded-xl border border-line-light/60 bg-surface-soft/80 px-4 py-3 text-xs text-ink-muted">
          <div className="flex items-start gap-2">
            <Github className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-ocean hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {GITHUB_REPO_URL}
            </a>
          </div>
          <div className="flex items-start gap-2">
            <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <a
              href={DEMO_SITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-ocean hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {DEMO_SITE_URL}
            </a>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={openGitHub} className="btn-primary flex flex-1 items-center justify-center gap-2 px-4 py-2.5">
            <Star className="h-4 w-4" />
            {t("app.ossPromo.star")}
          </button>
          <button
            type="button"
            onClick={openDemo}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line-light/70 bg-surface-soft px-4 py-2.5 text-sm font-medium text-ink-primary hover:bg-line-light/40"
          >
            <Globe className="h-4 w-4" />
            {t("app.ossPromo.demo")}
          </button>
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="mt-3 w-full text-center text-xs text-ink-muted hover:text-ink-secondary"
        >
          {t("app.ossPromo.dismiss")}
        </button>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { X, Camera, Loader2, AlertTriangle } from "lucide-react";
import { api } from "../lib/api";
import { useChatStore } from "../lib/store";
import { loadCaptchaScript, getCaptchaApiEndpoint } from "../lib/captcha-config";
import { useT } from "../lib/i18n";
import { apiFetch } from "../lib/utils";

interface ReportModalProps {
  targetType: "user" | "channel" | "message";
  targetId: string;
  targetName: string;
  onClose: () => void;
}

export function ReportModal({ targetType, targetId, targetName, onClose }: ReportModalProps) {
  const t = useT();
  const [reason, setReason] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const showToast = useChatStore((s) => s.showToast);

  useEffect(() => {
    // Check if captcha is enabled
    apiFetch("/api/system/captcha-config")
      .then((r) => r.json())
      .then((data) => {
        if (data.captchaEnabled && data.captchaProvider !== "none") {
          setCaptchaEnabled(true);
          loadCaptchaScript(data.captchaFrontendUrl);
        }
      })
      .catch(() => {});
  }, []);

  async function handleScreenshotUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const att = await api.upload(file);
      setScreenshot(att.url);
    } catch {
      setError(t("error.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    if (!reason.trim()) {
      setError(t("report.reasonRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.submitReport({
        targetType,
        targetId,
        reason: reason.trim(),
        screenshotUrl: screenshot ?? undefined,
        captchaToken: (window as any).__reportCaptchaToken ?? undefined,
      });
      setSuccess(true);
      showToast(t("report.submitted"), "info");
      setTimeout(onClose, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknown"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-line-light/70 bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-danger" />
            <h2 className="font-display text-base font-semibold">{t("report.title")}</h2>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-soft">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-1 text-xs text-ink-muted">
          {t("report.type")}{targetType === "user" ? t("nav.contacts") : targetType === "channel" ? t("admin.channels") : t("admin.messages")} · {targetName}
        </div>

        {success ? (
          <div className="py-8 text-center">
            <div className="text-sm font-medium text-green-500">{t("report.submitted")}</div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-secondary">{t("report.reason")} *</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("report.reasonPlaceholder")}
                className="input-base min-h-[100px] resize-none"
                maxLength={500}
              />
              <div className="mt-1 text-right text-[10px] text-ink-muted">{reason.length}/500</div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-secondary">{t("report.screenshot")} ({t("common.cancel")})</label>
              {screenshot ? (
                <div className="relative">
                  <img src={screenshot} alt={t("report.screenshot")} className="max-h-40 w-full rounded-lg object-cover" />
                  <button
                    onClick={() => setScreenshot(null)}
                    className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-black/50 text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line-light bg-surface-soft py-6 text-ink-muted hover:border-aqua">
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                  <span className="text-xs">{uploading ? t("common.loading") : t("report.uploadScreenshot")}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleScreenshotUpload} disabled={uploading} />
                </label>
              )}
            </div>

            {captchaEnabled && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-secondary">{t("profile.captcha")}</label>
                <div
                  className="cap-widget"
                  data-sitekey={getCaptchaApiEndpoint()}
                  data-callback="onReportCaptcha"
                />
                <script
                  dangerouslySetInnerHTML={{
                    __html: `(function(){window.onReportCaptcha=function(t){document.dispatchEvent(new CustomEvent('report-captcha',{detail:t}))}})()`,
                  }}
                />
                <script
                  dangerouslySetInnerHTML={{
                    __html: `document.addEventListener('report-captcha',function(e){window.__reportCaptchaToken=e.detail})`,
                  }}
                />
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
            )}

            <div className="flex gap-2">
              <button onClick={onClose} className="btn-ghost flex-1 border border-line-light py-2 text-sm">
                {t("common.cancel")}
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !reason.trim()}
                className="btn-primary flex-1"
              >
                {submitting ? t("common.submitting") : t("report.submit")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

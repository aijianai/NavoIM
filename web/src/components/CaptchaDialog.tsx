import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { useChatStore } from "../lib/store";
import { loadCaptchaConfig, loadCaptchaScript, getCaptchaConfig, getCaptchaApiEndpoint } from "../lib/captcha-config";
import { wsClient } from "../lib/ws-client";
import { useT } from "../lib/i18n";

export function CaptchaDialog() {
  const t = useT();
  const captchaPending = useChatStore((s) => s.captchaPending);
  const setCaptchaPending = useChatStore((s) => s.setCaptchaPending);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [apiEndpoint, setApiEndpoint] = useState("");

  useEffect(() => {
    if (!captchaPending) return;
    setToken(null);
    setLoading(true);
    let cancelled = false;

    loadCaptchaConfig().then(() => {
      if (cancelled) return;
      const cfg = getCaptchaConfig();
      setApiEndpoint(getCaptchaApiEndpoint());
      if (!cfg.enabled || cfg.provider === "none") {
        setLoading(false);
        return;
      }
      loadCaptchaScript(cfg.frontendUrl);
      const checkWidget = setInterval(() => {
        if (cancelled) return;
        const existing = document.querySelector("cap-widget#cap-message");
        if (existing) {
          clearInterval(checkWidget);
          setLoading(false);
          const handler = (e: Event) => {
            const detail = (e as CustomEvent<{ token?: string }>).detail;
            if (detail?.token) setToken(detail.token);
          };
          existing.addEventListener("solve", handler);
          return () => existing.removeEventListener("solve", handler);
        }
      }, 200);
      return () => {
        clearInterval(checkWidget);
        const el = document.querySelector("cap-widget#cap-message");
        if (el) el.remove();
      };
    });

    return () => { cancelled = true; };
  }, [captchaPending]);

  useEffect(() => {
    if (!token || !captchaPending || sending) return;
    setSending(true);
    const payload: any = {
      conversationId: captchaPending.conversationId,
      text: captchaPending.text,
      captchaToken: token,
    };
    // 保留 E2EE 模式标记
    if (captchaPending.e2ee) payload.e2ee = true;
    if (captchaPending.attachments?.length) payload.attachments = captchaPending.attachments;
    if (captchaPending.replyToId) payload.replyToId = captchaPending.replyToId;
    if (captchaPending.forwardMessageIds?.length) payload.forwardMessageIds = captchaPending.forwardMessageIds;
    if (captchaPending.sourceConvId) payload.sourceConvId = captchaPending.sourceConvId;
    if (captchaPending.cardId) payload.cardId = captchaPending.cardId;
    const cid = captchaPending.clientId;
    wsClient.send({ type: "message:send", clientId: cid, payload });
    setCaptchaPending(null);
  }, [token, captchaPending, sending, setCaptchaPending]);

  if (!captchaPending) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-2xl border border-line-light/70 bg-surface p-6 shadow-2xl">
        <button
          onClick={() => { setCaptchaPending(null); }}
          className="absolute right-4 top-4 text-ink-secondary hover:text-ink-primary"
        >
          <X className="h-4 w-4" />
        </button>
        <h3 className="mb-1 font-display text-lg font-semibold text-ink-primary">{t("captcha.title")}</h3>
        <p className="mb-4 text-sm text-ink-secondary">{t("captcha.desc")}</p>
        <div className="flex justify-center">
          {loading && (
            <div className="flex items-center gap-2 py-8 text-sm text-ink-secondary">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("captcha.loading")}
            </div>
          )}
          <cap-widget id="cap-message" data-cap-api-endpoint={apiEndpoint} style={{ display: loading ? "none" : "block" }} />
        </div>
      </div>
    </div>
  );
}

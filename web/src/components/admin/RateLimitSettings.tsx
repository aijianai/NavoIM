import { useEffect, useState } from "react";
import { api as rawApi } from "../../lib/api";
import { Loader2, Save } from "lucide-react";
import { useT } from "../../lib/i18n";

const api = rawApi as any;

interface RateLimitForm {
  rateLimitMessageCount: number;
  rateLimitMessageWindow: number;
  rateLimitLoginMax: number;
  rateLimitLoginWindow: number;
  rateLimitRegisterMax: number;
  rateLimitRegisterWindow: number;
  rateLimitMaxAccountsPerIp: number;
  rateLimitPresencePingMax: number;
  rateLimitPresencePingWindow: number;
}

export function RateLimitSettings() {
  const t = useT();
  const [form, setForm] = useState<RateLimitForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api.admin.getSettings().then((settings: any) => {
      setForm({
        rateLimitMessageCount: settings.rateLimitMessageCount ?? 60,
        rateLimitMessageWindow: settings.rateLimitMessageWindow ?? 60,
        rateLimitLoginMax: settings.rateLimitLoginMax ?? 10,
        rateLimitLoginWindow: settings.rateLimitLoginWindow ?? 900,
        rateLimitRegisterMax: settings.rateLimitRegisterMax ?? 5,
        rateLimitRegisterWindow: settings.rateLimitRegisterWindow ?? 3600,
        rateLimitMaxAccountsPerIp: settings.rateLimitMaxAccountsPerIp ?? 3,
        rateLimitPresencePingMax: settings.rateLimitPresencePingMax ?? 1,
        rateLimitPresencePingWindow: settings.rateLimitPresencePingWindow ?? 30,
      });
    });
  }, []);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setSuccess(false);
    try {
      await api.admin.updateSettings(form);
      setSuccess(true);
    } catch (e) {
      alert(t("common.unknown"));
    } finally {
      setSaving(false);
    }
  };

  if (!form) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    );
  }

  const field = (label: string, key: keyof RateLimitForm, suffix: string, desc: string) => (
    <div className="flex items-center justify-between rounded-xl bg-surface-soft px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="mt-0.5 text-xs text-ink-muted">{desc}</div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          className="w-20 rounded-lg border border-line-light/70 bg-surface px-2 py-1.5 text-right text-sm outline-none focus:border-ocean"
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: Math.max(1, parseInt(e.target.value) || 1) })}
        />
        <span className="text-xs text-ink-muted w-12">{suffix}</span>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold">{t("admin.rateLimiting")}</h2>
        <p className="mt-1 text-sm text-ink-muted">{t("admin.rateLimit.desc")}</p>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-ink-secondary">{t("admin.rateLimit.message")}</h3>
        {field(t("admin.rateLimit.maxMessages"), "rateLimitMessageCount", t("admin.rateLimit.perMinute"), t("admin.rateLimit.captchaHint"))}
        {field(t("admin.rateLimit.window"), "rateLimitMessageWindow", t("admin.rateLimit.seconds"), t("admin.rateLimit.windowDesc"))}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-ink-secondary">{t("admin.rateLimit.login")}</h3>
        {field(t("admin.rateLimit.maxLogins"), "rateLimitLoginMax", t("admin.rateLimit.times"), t("admin.rateLimit.overLimit"))}
        {field(t("admin.rateLimit.window"), "rateLimitLoginWindow", t("admin.rateLimit.seconds"), t("admin.rateLimit.windowDesc"))}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-ink-secondary">{t("admin.rateLimit.registration")}</h3>
        {field(t("admin.rateLimit.maxRegistrations"), "rateLimitRegisterMax", t("admin.rateLimit.times"), t("admin.rateLimit.overLimit"))}
        {field(t("admin.rateLimit.window"), "rateLimitRegisterWindow", t("admin.rateLimit.seconds"), t("admin.rateLimit.windowDesc"))}
        {field(t("admin.rateLimit.maxAccountsPerIp"), "rateLimitMaxAccountsPerIp", t("admin.rateLimit.count"), t("admin.rateLimit.overLimit"))}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-ink-secondary">{t("admin.rateLimit.presencePing")}</h3>
        {field(t("admin.rateLimit.presencePingMax"), "rateLimitPresencePingMax", t("admin.rateLimit.times"), t("admin.rateLimit.presencePingDesc"))}
        {field(t("admin.rateLimit.presencePingWindow"), "rateLimitPresencePingWindow", t("admin.rateLimit.seconds"), t("admin.rateLimit.windowDesc"))}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? t("common.saving") : t("common.save")}
        </button>
        {success && <span className="text-sm text-success">✓ {t("common.saved")}</span>}
      </div>
    </div>
  );
}

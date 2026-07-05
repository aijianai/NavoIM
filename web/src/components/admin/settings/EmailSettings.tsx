import { useState } from "react";
import { api } from "../../../lib/api";
import { Sec, Field, Switch } from "../shared";
import { useT } from "../../../lib/i18n";

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromName: string;
  fromEmail: string;
}

export function EmailSettings({
  emailConfig,
  setEmailConfig,
}: {
  emailConfig: EmailConfig;
  setEmailConfig: (c: EmailConfig) => void;
}) {
  const t = useT();
  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.admin.testEmail({ email: testEmail });
      setTestResult({ ok: res.ok, message: res.ok ? t("adminSettings.emailTestSuccess") : res.error || t("adminSettings.emailTestFailed") });
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : t("adminSettings.emailTestFailed") });
    } finally {
      setTesting(false);
    }
  };

  const isConfigured = !!(emailConfig.host && emailConfig.user && emailConfig.fromEmail);

  return (
    <Sec title={t("adminSettings.email")}>
      <Field label={t("adminSettings.smtpHost")}>
        <input
          type="text"
          value={emailConfig.host}
          onChange={(e) => setEmailConfig({ ...emailConfig, host: e.target.value })}
          placeholder="smtp.example.com"
          className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t("adminSettings.smtpPort")}>
          <input
            type="number"
            min={1}
            max={65535}
            value={emailConfig.port}
            onChange={(e) => setEmailConfig({ ...emailConfig, port: parseInt(e.target.value) || 465 })}
            placeholder="465"
            className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
          />
        </Field>
        <Field label={t("adminSettings.smtpSecure")}>
          <div className="h-10 flex items-center">
            <Switch
              checked={emailConfig.secure}
              onChange={(v) => setEmailConfig({ ...emailConfig, secure: v })}
              label={emailConfig.secure ? t("adminSettings.smtpSsl") : t("adminSettings.smtpStartTls")}
            />
          </div>
        </Field>
      </div>

      <Field label={t("adminSettings.smtpUser")}>
        <input
          type="text"
          value={emailConfig.user}
          onChange={(e) => setEmailConfig({ ...emailConfig, user: e.target.value })}
          placeholder="noreply@example.com"
          className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
        />
        <div className="mt-1 text-xs text-ink-muted">{t("adminSettings.smtpUserDesc")}</div>
      </Field>

      <Field label={t("adminSettings.smtpPassword")}>
        <input
          type="password"
          value={emailConfig.password}
          onChange={(e) => setEmailConfig({ ...emailConfig, password: e.target.value })}
          placeholder="••••••••"
          className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
        />
        <div className="mt-1 text-xs text-ink-muted">{t("adminSettings.smtpPasswordDesc")}</div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t("adminSettings.smtpFromName")}>
          <input
            type="text"
            value={emailConfig.fromName}
            onChange={(e) => setEmailConfig({ ...emailConfig, fromName: e.target.value })}
            placeholder="Navo IM"
            className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
          />
        </Field>
        <Field label={t("adminSettings.smtpFromEmail")}>
          <input
            type="email"
            value={emailConfig.fromEmail}
            onChange={(e) => setEmailConfig({ ...emailConfig, fromEmail: e.target.value })}
            placeholder="noreply@example.com"
            className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
          />
        </Field>
      </div>

      <div className="rounded-xl border border-line-light/60 bg-surface-soft px-3 py-2 text-xs text-ink-muted">
        {isConfigured ? (
          <span className="text-green-600 dark:text-green-400">✓ {t("adminSettings.emailConfigured")}</span>
        ) : (
          <span className="text-yellow-600 dark:text-yellow-400">⚠ {t("adminSettings.emailNotConfigured")}</span>
        )}
      </div>

      <Field label={t("adminSettings.emailTest")}>
        <div className="flex items-center gap-2">
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder={t("adminSettings.emailTestPlaceholder")}
            className="flex-1 rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
          />
          <button
            onClick={handleTest}
            disabled={testing || !testEmail || !isConfigured}
            className="shrink-0 rounded-xl bg-ocean px-4 py-2 text-sm font-medium text-white hover:bg-ocean/90 disabled:opacity-50"
          >
            {testing ? t("common.loading") : t("adminSettings.emailTest")}
          </button>
        </div>
        {testResult && (
          <div className={`mt-2 text-sm ${testResult.ok ? "text-green-500" : "text-red-500"}`}>
            {testResult.message}
          </div>
        )}
      </Field>
    </Sec>
  );
}

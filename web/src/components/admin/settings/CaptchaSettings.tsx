import type { CaptchaConfig } from "@navo/shared";
import { Sec, Field, Switch } from "../shared";
import { useT } from "../../../lib/i18n";

export function CaptchaSettings({
  captchaConfig,
  setCaptchaConfig,
}: {
  captchaConfig: CaptchaConfig;
  setCaptchaConfig: (c: CaptchaConfig) => void;
}) {
  const t = useT();
  return (
    <Sec title={t("captcha.title")}>
      <Field label={t("adminSettings.captcha")}>
        <Switch
          checked={captchaConfig.enabled}
          onChange={(v) => setCaptchaConfig({ ...captchaConfig, enabled: v })}
          label={t("adminSettings.enableCaptcha")}
        />
      </Field>
      {captchaConfig.enabled && (
        <>
          <Field label={t("adminSettings.captchaProvider")}>
            <select
              value={captchaConfig.provider}
              onChange={(e) =>
                setCaptchaConfig({ ...captchaConfig, provider: e.target.value as any })
              }
              className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
            >
              <option value="cap-pow">Cap-Pow</option>
              <option value="cloudflare">CloudFlare Turnstile</option>
              <option value="none">{t("adminSettings.notEnabled")}</option>
            </select>
          </Field>
          {captchaConfig.provider === 'cap-pow' && (
            <>
              <Field label={t("adminSettings.captchaBackend")}>
                <input
                  type="text"
                  value={captchaConfig.backendUrl}
                  onChange={(e) =>
                    setCaptchaConfig({ ...captchaConfig, backendUrl: e.target.value })
                  }
                  placeholder="https://captcha.example.com/api"
                  className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
                />
              </Field>
              <Field label={t("adminSettings.captchaFrontend")}>
                <input
                  type="text"
                  value={captchaConfig.frontendUrl}
                  onChange={(e) =>
                    setCaptchaConfig({ ...captchaConfig, frontendUrl: e.target.value })
                  }
                  placeholder="https://captcha.example.com"
                  className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
                />
              </Field>
            </>
          )}
          {captchaConfig.provider === 'cloudflare' && (
            <Field label="CloudFlare Site Key">
              <input
                type="text"
                value={captchaConfig.backendUrl}
                onChange={(e) =>
                  setCaptchaConfig({ ...captchaConfig, backendUrl: e.target.value })
                }
                placeholder={t("admin.ai.apiKeyPlaceholder")}
                className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
              />
            </Field>
          )}
        </>
      )}
    </Sec>
  );
}

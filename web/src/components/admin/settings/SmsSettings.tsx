import { useState } from "react";
import { api } from "../../../lib/api";
import { Sec, Field } from "../shared";
import { useT } from "../../../lib/i18n";

export interface SmsConfig {
  provider: "tencent" | "aliyun" | "none";
  sdkAppId: string;
  accessKeyId: string;
  accessKeySecret: string;
  signName: string;
  templateCode: string;
  region: string;
  endpoint: string;
}

export function SmsSettings({
  smsConfig,
  setSmsConfig,
}: {
  smsConfig: SmsConfig;
  setSmsConfig: (c: SmsConfig) => void;
}) {
  const t = useT();
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.admin.testSms({ phone: testPhone });
      setTestResult({ ok: res.ok, message: res.requestId ? `RequestId: ${res.requestId}` : res.message || "" });
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : t("adminSettings.smsTestFailed") });
    } finally {
      setTesting(false);
    }
  };

  const isTencent = smsConfig.provider === "tencent";
  const isAliyun = smsConfig.provider === "aliyun";

  return (
    <Sec title={t("adminSettings.sms")}>
      <Field label={t("adminSettings.smsProvider")}>
        <select
          value={smsConfig.provider}
          onChange={(e) =>
            setSmsConfig({ ...smsConfig, provider: e.target.value as SmsConfig["provider"] })
          }
          className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
        >
          <option value="none">{t("adminSettings.smsProviderNone")}</option>
          <option value="tencent">{t("adminSettings.smsProviderTencent")}</option>
          <option value="aliyun">{t("adminSettings.smsProviderAliyun")}</option>
        </select>
      </Field>

      {smsConfig.provider !== "none" && (
        <>
          {isTencent && (
            <Field label={t("adminSettings.smsSdkAppId")}>
              <input
                type="text"
                value={smsConfig.sdkAppId}
                onChange={(e) => setSmsConfig({ ...smsConfig, sdkAppId: e.target.value })}
                placeholder="1400006666"
                className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
              />
              <div className="mt-1 text-xs text-ink-muted">{t("adminSettings.smsSdkAppIdDesc")}</div>
            </Field>
          )}

          <Field label={t("adminSettings.smsAccessKeyId")}>
            <input
              type="text"
              value={smsConfig.accessKeyId}
              onChange={(e) => setSmsConfig({ ...smsConfig, accessKeyId: e.target.value })}
              placeholder={isTencent ? "AKIDxxxxxxxxxxxxxxxxxxxx" : "LTAIxxxxxxxxxxxxxxxx"}
              className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
            />
            <div className="mt-1 text-xs text-ink-muted">{t("adminSettings.smsAccessKeyIdDesc")}</div>
          </Field>

          <Field label={t("adminSettings.smsAccessKeySecret")}>
            <input
              type="password"
              value={smsConfig.accessKeySecret}
              onChange={(e) => setSmsConfig({ ...smsConfig, accessKeySecret: e.target.value })}
              placeholder="••••••••"
              className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
            />
            <div className="mt-1 text-xs text-ink-muted">{t("adminSettings.smsAccessKeySecretDesc")}</div>
          </Field>

          <Field label={t("adminSettings.smsSignName")}>
            <input
              type="text"
              value={smsConfig.signName}
              onChange={(e) => setSmsConfig({ ...smsConfig, signName: e.target.value })}
              placeholder={isTencent ? "腾讯云" : "阿里云"}
              className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
            />
            <div className="mt-1 text-xs text-ink-muted">{t("adminSettings.smsSignNameDesc")}</div>
          </Field>

          <Field label={t("adminSettings.smsTemplateCode")}>
            <input
              type="text"
              value={smsConfig.templateCode}
              onChange={(e) => setSmsConfig({ ...smsConfig, templateCode: e.target.value })}
              placeholder={isTencent ? "449739" : "SMS_15495xxxx"}
              className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
            />
            <div className="mt-1 text-xs text-ink-muted">{t("adminSettings.smsTemplateCodeDesc")}</div>
          </Field>

          {isAliyun && (
            <Field label={t("adminSettings.smsRegion")}>
              <input
                type="text"
                value={smsConfig.region}
                onChange={(e) => setSmsConfig({ ...smsConfig, region: e.target.value })}
                placeholder="cn-hangzhou"
                className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
              />
              <div className="mt-1 text-xs text-ink-muted">{t("adminSettings.smsRegionDesc")}</div>
            </Field>
          )}

          <Field label={t("adminSettings.smsEndpoint")}>
            <input
              type="text"
              value={smsConfig.endpoint}
              onChange={(e) => setSmsConfig({ ...smsConfig, endpoint: e.target.value })}
              placeholder={isTencent ? "sms.tencentcloudapi.com" : "dysmsapi.aliyuncs.com"}
              className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
            />
            <div className="mt-1 text-xs text-ink-muted">{t("adminSettings.smsEndpointDesc")}</div>
          </Field>

          <Field label={t("adminSettings.smsTest")}>
            <div className="flex items-center gap-2">
              <input
                type="tel"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder={t("adminSettings.smsTestPlaceholder")}
                className="flex-1 rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
              />
              <button
                onClick={handleTest}
                disabled={testing || !testPhone}
                className="rounded-xl bg-ocean px-4 py-2 text-sm font-medium text-white hover:bg-ocean/90 disabled:opacity-50"
              >
                {testing ? t("common.loading") : t("adminSettings.smsTest")}
              </button>
            </div>
            {testResult && (
              <div className={`mt-2 text-sm ${testResult.ok ? "text-green-500" : "text-red-500"}`}>
                {testResult.ok ? t("adminSettings.smsTestSuccess") : `${t("adminSettings.smsTestFailed")}: ${testResult.message}`}
              </div>
            )}
          </Field>
        </>
      )}
    </Sec>
  );
}

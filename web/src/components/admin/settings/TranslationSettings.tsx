import { useState } from "react";
import { api } from "../../../lib/api";
import { Sec, Field } from "../shared";

import { useT } from "../../../lib/i18n";

interface TranslationConfig {
  provider: string;
  deeplApiKey: string;
  googleApiKey: string;
  bingApiKey: string;
}

export function TranslationSettings({
  translationConfig,
  setTranslationConfig,
}: {
  translationConfig: TranslationConfig;
  setTranslationConfig: (c: TranslationConfig) => void;
}) {
  const t = useT();
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.translate({ text: "Hello, world!", targetLang: "zh-CN" });
      setTestResult(res.result);
    } catch (e) {
      setTestResult(
        (t("translation.testFailed") || "Test failed") + ": " + (e instanceof Error ? e.message : ""),
      );
    } finally {
      setTesting(false);
    }
  };

  return (
    <Sec title={t("translation.settings")}>
      <Field label={t("translation.provider")}>
        <select
          value={translationConfig.provider}
          onChange={(e) =>
            setTranslationConfig({ ...translationConfig, provider: e.target.value })
          }
          className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
        >
          <option value="deepl">{t("translation.deepl")}</option>
          <option value="bing">{t("translation.bing")}</option>
          <option value="google">{t("translation.google")}</option>
          <option value="bingReverse">{t("translation.bingReverse")}</option>
        </select>
      </Field>

      {["deepl", "google", "bing"].includes(translationConfig.provider) && (
        <Field label={t("translation.apiKey")}>
          <input
            type="password"
            value={
              translationConfig.provider === "deepl"
                ? translationConfig.deeplApiKey
                : translationConfig.provider === "google"
                ? translationConfig.googleApiKey
                : translationConfig.bingApiKey
            }
            onChange={(e) =>
              setTranslationConfig({
                ...translationConfig,
                [translationConfig.provider === "deepl" ? "deeplApiKey" : translationConfig.provider === "google" ? "googleApiKey" : "bingApiKey"]:
                  e.target.value,
              })
            }
            placeholder={t("translation.apiKey")}
            className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
          />
        </Field>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={handleTest}
          disabled={testing}
          className="rounded-xl bg-ocean px-4 py-2 text-sm font-medium text-white hover:bg-ocean/90 disabled:opacity-50"
        >
          {testing ? t("common.loading") : t("adminSettings.testConnection")}
        </button>
        {testResult && (
          <span className="text-sm text-ink-secondary">{testResult}</span>
        )}
      </div>
    </Sec>
  );
}

import { useState } from "react";
import { api } from "../../../lib/api";
import { Sec, Field, Switch } from "../shared";

import { useT } from "../../../lib/i18n";
interface AiConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  name: string;
  bio: string;
  avatarUrl: string;
}

export function AiSettings({
  aiConfig,
  setAiConfig,
}: {
  aiConfig: AiConfig;
  setAiConfig: (c: AiConfig) => void;
}) {
  const t = useT();
  const [testingAi, setTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{
    success: boolean;
    message: string;
    latency: number;
  } | null>(null);

  const handleTestAi = async () => {
    setTestingAi(true);
    setAiTestResult(null);
    try {
      const result = await api.admin.testAi({
        baseUrl: aiConfig.baseUrl,
        apiKey: aiConfig.apiKey,
        model: aiConfig.model,
      });
      setAiTestResult(result);
    } catch (e) {
      setAiTestResult({
        success: false,
        message: e instanceof Error ? e.message : t("admin.ai.testFailed"),
        latency: 0,
      });
    } finally {
      setTestingAi(false);
    }
  };

  return (
    <Sec title={t("adminSettings.ai")}>
      <Field label={t("admin.ai.assistant")}>
        <Switch
          checked={aiConfig.enabled}
          onChange={(v) => setAiConfig({ ...aiConfig, enabled: v })}
          label={t("admin.ai.enable")}
        />
      </Field>
      {aiConfig.enabled && (
        <>
          <Field label={t("admin.ai.apiUrl")}>
            <input
              type="text"
              value={aiConfig.baseUrl}
              onChange={(e) =>
                setAiConfig({ ...aiConfig, baseUrl: e.target.value })
              }
              placeholder="https://api.openai.com/v1"
              className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
            />
            <div className="mt-1 text-xs text-ink-muted">{t("admin.ai.apiDesc")}</div>
          </Field>
          <Field label={t("admin.ai.apiKey")}>
            <input
              type="password"
              value={aiConfig.apiKey}
              onChange={(e) =>
                setAiConfig({ ...aiConfig, apiKey: e.target.value })
              }
              placeholder={t("admin.ai.apiKeyPlaceholder")}
              className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
            />
          </Field>
          <Field label={t("admin.ai.model")}>
            <input
              type="text"
              value={aiConfig.model}
              onChange={(e) =>
                setAiConfig({ ...aiConfig, model: e.target.value })
              }
              placeholder="gpt-3.5-turbo"
              className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
            />
          </Field>

          <Field label={t("admin.ai.name")}>
            <input
              type="text"
              value={aiConfig.name}
              onChange={(e) =>
                setAiConfig({ ...aiConfig, name: e.target.value })
              }
              placeholder="Navo 助手"
              className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
            />
          </Field>

          <Field label={t("admin.ai.bio")}>
            <textarea
              value={aiConfig.bio}
              onChange={(e) =>
                setAiConfig({ ...aiConfig, bio: e.target.value })
              }
              placeholder="你的专属聊天助手..."
              rows={3}
              className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
            />
          </Field>

          <Field label={t("admin.ai.avatarUrl")}>
            <input
              type="text"
              value={aiConfig.avatarUrl}
              onChange={(e) =>
                setAiConfig({ ...aiConfig, avatarUrl: e.target.value })
              }
              placeholder="https://example.com/avatar.png"
              className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
            />
          </Field>

          <Field label={t("admin.ai.systemPrompt")}>
            <textarea
              value={aiConfig.systemPrompt}
              onChange={(e) =>
                setAiConfig({ ...aiConfig, systemPrompt: e.target.value })
              }
              placeholder={t("adminSettings.aiApiDesc")}
              rows={6}
              className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua font-mono"
            />
            <div className="mt-1 text-xs text-ink-muted">{t("adminSettings.aiApiDesc")}</div>
          </Field>

          <div className="flex items-center gap-2">
            <button
              onClick={handleTestAi}
              disabled={testingAi}
              className="rounded-xl bg-ocean px-4 py-2 text-sm font-medium text-white hover:bg-ocean/90 disabled:opacity-50"
            >
              {testingAi ? t("common.loading") : t("admin.ai.testConnection")}
            </button>
            {aiTestResult && (
              <span className={`text-sm ${aiTestResult.success ? 'text-green-500' : 'text-red-500'}`}>
                {aiTestResult.message} ({aiTestResult.latency}ms)
              </span>
            )}
          </div>
        </>
      )}
    </Sec>
  );
}

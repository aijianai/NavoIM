import { useT } from "../../../lib/i18n";
import { Sec, Field } from "../shared";

export interface NsfwConfig {
  nsfwEnabled: boolean;
  nsfwThreshold: number;
}

/** NSFW 审核设置：开关 + 拒绝阈值（内置 nsfwjs，无需外部 API）。 */
export function NsfwSettings({
  nsfwConfig,
  setNsfwConfig,
}: {
  nsfwConfig: NsfwConfig;
  setNsfwConfig: (c: NsfwConfig) => void;
}) {
  const t = useT();
  const pct = Math.round(nsfwConfig.nsfwThreshold * 100);

  return (
    <Sec title={t("adminSettings.nsfw")}>
      <Field label={t("adminSettings.nsfwEnable")}>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={nsfwConfig.nsfwEnabled}
            onChange={(e) => setNsfwConfig({ ...nsfwConfig, nsfwEnabled: e.target.checked })}
            className="h-4 w-4 rounded border-line-light text-ocean focus:ring-ocean"
          />
          <span className="text-sm text-ink-primary">{t("adminSettings.nsfwEnableDesc")}</span>
        </label>
      </Field>
      <Field label={t("adminSettings.nsfwThreshold")}>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={pct}
            disabled={!nsfwConfig.nsfwEnabled}
            onChange={(e) =>
              setNsfwConfig({
                ...nsfwConfig,
                nsfwThreshold: Number(e.target.value) / 100,
              })
            }
            className="flex-1 accent-ocean disabled:opacity-40"
          />
          <span className="w-12 text-right text-sm tabular-nums text-ink-muted">{pct}%</span>
        </div>
        <div className="mt-1 text-xs text-ink-muted">{t("adminSettings.nsfwThresholdDesc")}</div>
        <div className="mt-1 text-xs text-ink-muted">{t("adminSettings.nsfwBuiltinDesc")}</div>
      </Field>
    </Sec>
  );
}

import { Sec, Field, Switch } from "../shared";

import { useT } from "../../../lib/i18n";
interface CdnConfig {
  fontsGoogleCssUrl: string;
  vconsoleEnabled: boolean;
}

export function CdnSettings({
  cdnConfig,
  setCdnConfig,
}: {
  cdnConfig: CdnConfig;
  setCdnConfig: (c: CdnConfig) => void;
}) {
  const t = useT();
  return (
    <Sec title={t("adminSettings.cdn")}>
      <Field label={"Google Fonts CSS URL"}>
        <input
          type="text"
          value={cdnConfig.fontsGoogleCssUrl}
          onChange={(e) =>
            setCdnConfig({ ...cdnConfig, fontsGoogleCssUrl: e.target.value })
          }
          placeholder={t("adminSettings.cdnGoogleFontsPlaceholder")}
          className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
        />
        <div className="mt-1 text-xs text-ink-muted">
          {t("adminSettings.cdnGoogleFontsExample")}
        </div>
      </Field>
      <Field label={t("adminSettings.vconsole")}>
        <Switch
          checked={cdnConfig.vconsoleEnabled}
          onChange={(v) => setCdnConfig({ ...cdnConfig, vconsoleEnabled: v })}
          label={t("adminSettings.vconsoleDesc")}
        />
      </Field>
    </Sec>
  );
}

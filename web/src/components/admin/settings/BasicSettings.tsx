import type { SystemSettings } from "@navo/shared";
import { Sec, Field } from "../shared";
import { useT } from "../../../lib/i18n";

export function BasicSettings({
  settings,
  setSettings,
}: {
  settings: SystemSettings;
  setSettings: (s: SystemSettings) => void;
}) {
  const t = useT();
  return (
    <Sec title={t("settings")}>
      <Field label={t("adminSettings.siteName")}>
        <input
          value={settings.siteName}
          onChange={(e) =>
            setSettings({ ...settings, siteName: e.target.value })
          }
          className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
        />
      </Field>
      <Field label={t("adminSettings.siteDesc")}>
        <input
          value={settings.siteDescription}
          onChange={(e) =>
            setSettings({ ...settings, siteDescription: e.target.value })
          }
          className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
        />
      </Field>
    </Sec>
  );
}

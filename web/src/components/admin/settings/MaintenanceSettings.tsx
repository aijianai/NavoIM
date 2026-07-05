import type { SystemSettings } from "@navo/shared";
import { Sec, Field, Switch } from "../shared";
import { useT } from "../../../lib/i18n";

export function MaintenanceSettings({
  settings,
  setSettings,
}: {
  settings: SystemSettings;
  setSettings: (s: SystemSettings) => void;
}) {
  const t = useT();
  return (
    <Sec title={t("login.maintenance")}>
      <Field label={t("login.maintenance")}>
        <Switch
          checked={settings.maintenanceMode}
          onChange={(v) => setSettings({ ...settings, maintenanceMode: v })}
          label={t("adminSettings.enableMaintenance")}
        />
      </Field>
      {settings.maintenanceMode && (
        <Field label={t("adminSettings.maintenanceMessage")}>
          <textarea
            value={settings.maintenanceMessage || ""}
            onChange={(e) =>
              setSettings({
                ...settings,
                maintenanceMessage: e.target.value,
              })
            }
            placeholder={t("adminSettings.maintenanceMessagePlaceholder")}
            className="h-24 w-full resize-none rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
          />
        </Field>
      )}
    </Sec>
  );
}

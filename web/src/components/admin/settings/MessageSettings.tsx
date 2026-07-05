import type { SystemSettings } from "@navo/shared";
import { Sec, Field } from "../shared";

import { useT } from "../../../lib/i18n";
export function MessageSettings({
  settings,
  setSettings,
}: {
  settings: SystemSettings;
  setSettings: (s: SystemSettings) => void;
}) {
  const t = useT();
  return (
    <Sec title={t("adminSettings.message")}>
      <Field label={t("adminSettings.maxFileSize")}>
        <input
          type="number"
          value={settings.maxFileSize}
          onChange={(e) =>
            setSettings({
              ...settings,
              maxFileSize: Number(e.target.value),
            })
          }
          className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
        />
        <div className="mt-1 text-xs text-ink-muted">
          {t("adminSettings.currentSize", { size: (settings.maxFileSize / 1024 / 1024).toFixed(1) })}
        </div>
      </Field>
      <Field label={t("adminSettings.maxMessageLen")}>
        <input
          type="number"
          value={settings.maxMessageLength}
          onChange={(e) =>
            setSettings({
              ...settings,
              maxMessageLength: Number(e.target.value),
            })
          }
          className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
        />
      </Field>
    </Sec>
  );
}

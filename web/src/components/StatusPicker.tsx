import { PresenceDot } from "./Avatar";
import { cn } from "../lib/utils";
import { useT } from "../lib/i18n";
import type { PresenceStatus } from "@navo/shared";

const OPTIONS: { value: PresenceStatus }[] = [
  { value: "online" },
  { value: "away" },
  { value: "busy" },
  { value: "offline" },
];

interface StatusPickerProps {
  value: PresenceStatus;
  onChange: (status: PresenceStatus) => void;
}

export function StatusPicker({ value, onChange }: StatusPickerProps) {
  const t = useT();
  const labelMap: Record<PresenceStatus, string> = {
    online: t("status.online"),
    away: t("status.away"),
    busy: t("status.busy"),
    offline: t("status.offline"),
  };
  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm transition-all",
            value === opt.value
              ? "border-aqua bg-aqua/10 text-ink-primary shadow-glow"
              : "border-line-light bg-surface text-ink-secondary hover:bg-surface-soft hover:text-ink-primary",
          )}
        >
          <PresenceDot status={opt.value} pulse={false} />
          {labelMap[opt.value]}
        </button>
      ))}
    </div>
  );
}

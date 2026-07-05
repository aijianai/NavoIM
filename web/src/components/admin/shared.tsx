import { cn } from "../../lib/utils";
import type { SystemRole } from "@navo/shared";

import { getT } from "../../lib/i18n";
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const t = getT();
export type AdminTab = "dashboard" | "users" | "channels" | "settings" | "audit" | "notifications" | "reports";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ROLE_LABELS: Record<SystemRole, string> = {
  super_admin: t("admin.role.superAdmin"),
  admin: t("admin.role.admin"),
  moderator: t("admin.role.moderator"),
  user: t("admin.role.user"),
};

export const ALL_ROLES: SystemRole[] = ["user", "moderator", "admin", "super_admin"];

export const ACTION_LABELS: Record<string, string> = {
  "admin.grant": t("admin.grantAdmin"),
  "admin.revoke": t("admin.revokeAdmin"),
  "user.ban": t("admin.banUser"),
  "user.unban": t("admin.unbanUser"),
  "user.delete": t("admin.deleteUser"),
  "channel.delete": t("admin.deleteChannel"),
  "message.delete": t("admin.deleteMessage"),
  "settings.update": t("admin.updateSettings"),
};

// ---------------------------------------------------------------------------
// Toast system (shared via module-level state)
// ---------------------------------------------------------------------------

let _addToast: ((message: string, type: "success" | "error") => void) | null = null;

export function toast(message: string, type: "success" | "error" = "success") {
  _addToast?.(message, type);
}

export function setToastHandler(handler: (message: string, type: "success" | "error") => void) {
  _addToast = handler;
}

export function clearToastHandler() {
  _addToast = null;
}

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

export function NavItem({
  icon,
  label,
  active,
  onClick,
  collapsed,
  expandIcon,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  collapsed?: boolean;
  expandIcon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
        active
          ? "bg-ocean/10 text-ocean"
          : "text-ink-secondary hover:bg-surface-soft hover:text-ink-primary",
      )}
    >
      {icon}
      {!collapsed && (
        <>
          <span className="flex-1 text-left">{label}</span>
          {expandIcon}
        </>
      )}
    </button>
  );
}

export function SC({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-line-light/70 bg-surface-soft p-3 md:p-4">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-xl bg-surface",
            color,
          )}
        >
          {icon}
        </div>
        <div>
          <div className="text-xl font-semibold md:text-2xl">
            {value.toLocaleString()}
          </div>
          <div className="text-[10px] text-ink-muted md:text-[11px]">{label}</div>
        </div>
      </div>
    </div>
  );
}

export function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between border-b border-line-light/50 pb-2">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

export function Sec({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line-light/70 bg-surface-soft p-4">
      <h3 className="mb-4 text-sm font-medium">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs text-ink-muted">{label}</label>
      {children}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 select-none",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-ocean" : "bg-line-light",
          "focus:outline-none focus:ring-2 focus:ring-ocean/30",
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </button>
      {(label || description) && (
        <span className="flex flex-col gap-0.5">
          {label && <span className="text-sm text-ink-primary">{label}</span>}
          {description && (
            <span className="text-xs text-ink-muted">{description}</span>
          )}
        </span>
      )}
    </label>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    online: "bg-green-400",
    away: "bg-yellow-400",
    busy: "bg-red-400",
    offline: "bg-ink-muted",
  };
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn("h-2 w-2 rounded-full", colors[status] || colors.offline)}
      />
      <span className="text-sm capitalize">{status}</span>
    </div>
  );
}

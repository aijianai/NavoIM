import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Bell, Image as ImageIcon, RefreshCw } from "lucide-react";
import { useChatStore } from "../lib/store";
import { api } from "../lib/api";
import { cn } from "../lib/utils";
import { Markdown } from "./Markdown";
import { useT } from "../lib/i18n";
import type { NotificationWithRead } from "@navo/shared";

export function NotificationBell({ className, size = "lg" }: { className?: string; size?: "sm" | "lg" }) {
  const unreadCount = useChatStore((s) => s.unreadNotificationCount());
  const [open, setOpen] = useState(false);
  const t = useT();
  const isSmall = size === "sm";

  return (
    <>
      <button
        title={t("nav.notifications")}
        onClick={() => setOpen(true)}
        className={cn(
          "relative grid place-items-center rounded-xl transition-all hover:bg-surface-soft hover:shadow-soft",
          isSmall ? "h-9 w-9" : "h-10 w-10",
          className
        )}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className={cn(
            "absolute flex items-center justify-center rounded-full bg-error text-[8px] font-bold text-white shadow-[0_0_0_2px_rgba(255,255,255,0.85)] dark:shadow-[0_0_0_2px_rgba(20,22,28,0.85)]",
            isSmall ? "right-0.5 top-0.5 h-2 min-w-2" : "right-1 top-1 h-2 min-w-2"
          )}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && createPortal(
        <MobileNotificationModal onClose={() => setOpen(false)} />,
        document.body
      )}
    </>
  );
}

function MobileNotificationModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const notifications = useChatStore((s) => s.notifications);
  const markNotificationRead = useChatStore((s) => s.markNotificationRead);
  const setNotifications = useChatStore((s) => s.setNotifications);

  useEffect(() => {
    api.getMyNotifications()
      .then((data) => setNotifications(data))
      .catch(() => {});
  }, []);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 mx-4 flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line-light/70 bg-surface shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-line-light/70 px-5 py-4">
          <h2 className="font-display text-base font-semibold text-ink-primary">{t("nav.notifications")}</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-soft hover:text-ink-primary transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {notifications.length === 0 ? (
            <div className="py-12 text-center text-sm text-ink-muted">{t("notification.empty")}</div>
          ) : (
            <div className="space-y-3">
              {notifications.map((n) => (
                <NotificationCard key={n.id} notification={n} onRead={(id) => markNotificationRead(id)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function NotificationView({ onClose, embedded }: { onClose: () => void; embedded?: boolean }) {
  const t = useT();
  const notifications = useChatStore((s) => s.notifications);
  const markNotificationRead = useChatStore((s) => s.markNotificationRead);
  const setNotifications = useChatStore((s) => s.setNotifications);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setRefreshing(true);
    api.getMyNotifications()
      .then((data) => setNotifications(data))
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-app">
      {!embedded && (
        <header className="flex items-center justify-between border-b border-line-light/70 bg-surface/60 px-6 py-4 backdrop-blur-xl shrink-0">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">notifications</div>
            <h1 className="font-display text-xl font-semibold tracking-tight">{t("nav.notifications")}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setRefreshing(true);
                api.getMyNotifications()
                  .then((data) => setNotifications(data))
                  .catch(() => {})
                  .finally(() => setRefreshing(false));
              }}
              disabled={refreshing}
              className="btn-ghost grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-soft hover:text-ink-primary transition-colors"
              title={t("notification.refresh")}
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            </button>
            <button onClick={onClose} className="btn-ghost" title={t("common.close")}>
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>
      )}

      <div className="flex-1 overflow-y-auto p-5">
        {notifications.length === 0 ? (
          <div className="py-16 text-center text-sm text-ink-muted">{t("notification.empty")}</div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-3">
            {notifications.map((n) => (
              <NotificationCard
                key={n.id}
                notification={n}
                onRead={(id) => markNotificationRead(id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NotificationCard({
  notification,
  onRead,
}: {
  notification: NotificationWithRead;
  onRead: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        "rounded-xl border border-line-light/70 bg-surface-soft p-4 transition-colors cursor-pointer hover:bg-line-light/30",
        !notification.read && "border-ocean/30 bg-ocean/5"
      )}
      onClick={() => {
        if (!notification.read) onRead(notification.id);
        setExpanded(!expanded);
      }}
    >
      <div className="flex items-start gap-3">
        {!notification.read && (
          <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ocean" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-ink-primary">{notification.title}</h3>
            {notification.imageUrl && (
              <ImageIcon className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
            )}
          </div>
          {!expanded && (
            <p className="mt-1 text-xs text-ink-muted line-clamp-2">{notification.content}</p>
          )}
          {expanded && (
            <div className="mt-3 space-y-3">
              {notification.imageUrl && (
                <img
                  src={notification.imageUrl}
                  alt=""
                  className="max-h-48 w-full rounded-lg object-cover"
                />
              )}
              <div className="text-sm text-ink-secondary leading-relaxed">
                <Markdown text={notification.content} />
              </div>
              <div className="text-[11px] text-ink-muted">
                {new Date(notification.createdAt).toLocaleString("zh-CN")}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

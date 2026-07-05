import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useChatStore } from "./lib/store";
import { wsClient } from "./lib/ws-client";
import type { WSStatus } from "./lib/ws-client";
import { setToken as persistToken } from "./lib/api";
import { useIsMobile } from "./lib/useIsMobile";
import { Login } from "./components/Login";
import { Toast } from "./components/Toast";
import { CaptchaDialog } from "./components/CaptchaDialog";
import { PresencePingModal } from "./components/PresencePingModal";
import { callController } from "./lib/call";
import { useViewportHeight } from "./lib/useViewportHeight";
import { useT } from "./lib/i18n";
import { onAppStateChange } from "./lib/app-state";
import { requestNotificationPermission } from "./lib/notification";
import { catchUpStaleConversations } from "./lib/message-sync";

// Lazy-loaded heavy components — not needed for first paint
const AppShell = lazy(() => import("./components/AppShell").then(m => ({ default: m.AppShell })));
const MobileShell = lazy(() => import("./components/MobileShell").then(m => ({ default: m.MobileShell })));
const ImageViewer = lazy(() => import("./components/ImageViewer").then(m => ({ default: m.ImageViewer })));
const VideoViewer = lazy(() => import("./components/VideoViewer").then(m => ({ default: m.VideoViewer })));
const LocationViewer = lazy(() => import("./components/LocationViewer").then(m => ({ default: m.LocationViewer })));
const LocationPickerHost = lazy(() => import("./components/LocationPickerHost").then(m => ({ default: m.LocationPickerHost })));
const CallView = lazy(() => import("./components/CallView").then(m => ({ default: m.CallView })));

export function App() {
  const token = useChatStore((s) => s.token);
  const ready = useChatStore((s) => s.ready);
  const wsStatus = useChatStore((s) => s.wsStatus);
  const banInfo = useChatStore((s) => s.banInfo);
  const setToken = useChatStore((s) => s.setToken);
  const setWsStatus = useChatStore((s) => s.setWsStatus);
  const applyServerEvent = useChatStore((s) => s.applyServerEvent);
  const reset = useChatStore((s) => s.reset);
  const isMobile = useIsMobile();

  useViewportHeight();

  // 页面回到前台时重连 WebSocket
  useEffect(() => {
    const off = onAppStateChange((active) => {
      if (active) {
        wsClient.reconnectNow();
      }
    });
    return off;
  }, []);

  // 启动时从 IndexedDB 拉取消息（首次启动会从 localStorage 自动迁移）
  useEffect(() => {
    void useChatStore.getState().hydrateMessagesFromIdb();
  }, []);

  // Request notification permission on mount
  useEffect(() => {
    void requestNotificationPermission();
  }, []);

  // Sync token between localStorage helper and store
  useEffect(() => {
    persistToken(token);
  }, [token]);

  // Mirror ws-client status into store + query active calls on reconnect
  useEffect(() => {
    const off = wsClient.onStatusChange((s: WSStatus) => {
      setWsStatus(s);
      if (s === "connected") {
        setTimeout(() => wsClient.callQueryActive(), 500);
      }
    });
    return off;
  }, [setWsStatus]);

  // Connect WS whenever we have a token.
  const isFirstConnectRef = useRef(true);
  useEffect(() => {
    if (!token || banInfo?.banned) {
      console.log("[App] 无 token 或被封禁 — 显示登录");
      return;
    }
    console.log("[App] 找到 token — 正在连接 WS...");
    const off = wsClient.on((event) => {
      console.log("[App] WS 事件已接收:", event.type);
      applyServerEvent(event);
      void callController.handleServerEvent(event);
      if (event.type === "ready") {
        const isFirst = isFirstConnectRef.current;
        isFirstConnectRef.current = false;
        void catchUpStaleConversations(isFirst);
        wsClient.callQueryActive();
      }
    });
    wsClient.connect(token);
    return () => {
      console.log("[App] cleanup: disconnecting WS");
      off();
      wsClient.disconnect();
    };
  }, [token, applyServerEvent, banInfo]);

  const t = useT();

  // Show ban screen if user is banned
  if (banInfo?.banned) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-app">
        <div className="aurora-bg" />
        <div className="grain" />
        <div className="relative z-10 grid min-h-screen place-items-center">
          <div className="flex flex-col items-center gap-6 max-w-sm text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10">
              <svg className="h-10 w-10 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
              </svg>
            </div>
            <div>
              <h2 className="font-display text-2xl font-semibold text-ink-primary">{t("login.bannedTitle")}</h2>
              <p className="mt-2 text-sm text-ink-secondary">
                {t("login.bannedDesc")}
              </p>
              {banInfo.reason && (
                <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
                  <div className="text-xs font-medium uppercase tracking-wider text-red-400 mb-1">{t("login.banReason")}</div>
                  <div className="text-sm text-ink-primary">{banInfo.reason}</div>
                </div>
              )}
            </div>
            <button
              onClick={() => {
                reset();
                window.location.reload();
              }}
              className="rounded-xl bg-surface-soft border border-line-light/70 px-6 py-2.5 text-sm font-medium text-ink-secondary hover:bg-line-light/50 transition-colors"
            >
              {t("login.returnToLogin")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!token) {
    return <Login onLogin={(t) => setToken(t)} />;
  }

  if (!ready) {
    return <BootScreen />;
  }

  const showSyncOverlay = wsStatus !== "connected";

  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-app"><div className="h-8 w-8 animate-spin rounded-full border-2 border-transparent border-t-ocean" /></div>}>
      {isMobile ? <MobileShell /> : <AppShell />}
      <ImageViewer />
      <VideoViewer />
      <LocationViewer />
      <LocationPickerHost />
      <CallView />
      <Toast />
      <CaptchaDialog />
      <PresencePingModal />
      {showSyncOverlay && <SyncOverlay status={wsStatus} />}
    </Suspense>
  );
}

function SyncOverlay({ status }: { status: WSStatus }) {
  const [elapsed, setElapsed] = useState(0);
  const t = useT();

  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const label =
    status === "reconnecting"
      ? t("app.reconnecting")
      : status === "connecting"
      ? t("app.connecting")
      : t("app.disconnected");

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-app/80 backdrop-blur-md animate-fade-in">
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-line-light/50 bg-surface/90 px-10 py-8 shadow-2xl">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-2 border-ocean/30" />
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-ocean" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="font-display text-base font-semibold text-ink-primary">{label}</div>
          {elapsed > 3 && (
            <div className="text-xs text-ink-muted">{t("common.loading")} {elapsed}s</div>
          )}
        </div>
      </div>
    </div>
  );
}

function BootScreen() {
  const [elapsed, setElapsed] = useState(0);
  const reset = useChatStore((s) => s.reset);
  const t = useT();

  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const isSlow = elapsed >= 10;
  const isStuck = elapsed >= 30;

  return (
    <div className="relative min-h-screen overflow-hidden bg-app">
      <div className="aurora-bg" />
      <div className="grain" />
      <div className="relative z-10 grid min-h-screen place-items-center">
        <div className="flex flex-col items-center gap-6">
          <NavoMark className={isStuck ? "h-14 w-14" : "h-14 w-14 animate-pulse-dot"} />
          <div className="font-display text-2xl tracking-tight text-ink-secondary">
            {t("login.subtitle")} <span className="text-gradient-brand font-semibold">{t("app.name")}</span>
          </div>
          {isSlow && !isStuck && (
            <div className="text-sm text-ink-muted">
              {t("app.connectionTimeout", { elapsed })}
            </div>
          )}
          {isStuck && (
            <div className="flex flex-col items-center gap-3">
              <div className="max-w-xs text-center text-sm text-ink-muted">
                {t("app.connectionFailed", { elapsed })}
                <br />
                {t("app.checkServer")}
              </div>
              <button
                onClick={() => {
                  reset();
                  window.location.reload();
                }}
                className="btn-primary px-6 py-2"
              >
                {t("login.returnToLogin")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NavoMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden>
      <defs>
        <linearGradient id="nm-g" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#66B8FF" />
          <stop offset="0.5" stopColor="#2F7DFF" />
          <stop offset="1" stopColor="#8A6CFF" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#nm-g)" />
      <path
        d="M16 46V18l16 18V18l16 18v10"
        stroke="white"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

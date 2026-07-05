import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  Users,
  Settings,
  Activity,
  ChevronRight,
  ChevronDown,
  Eye,
  RefreshCw,
  Hash,
  ArrowLeft,
  Menu,
  X,
  Bell,
  Globe,
  UserPlus,
  MessageSquare,
  ShieldCheck,
  Server,
  Flag,
  Cpu,
  Wrench,
  ShieldAlert,
  FileText,
  Building2,
  Database,
  Gauge,
  Image,
  Languages,
  Smartphone,
  Mail,
  KeyRound,
} from "lucide-react";
import { useChatStore } from "../lib/store";
import { useT } from "../lib/i18n";
import { api } from "../lib/api";
import { cn } from "../lib/utils";
import { ConfirmModal } from "./ConfirmModal";
import {
  NavItem,
  toast,
  setToastHandler,
  clearToastHandler,
} from "./admin/shared";
import { DashboardTab } from "./admin/DashboardTab";
import { UsersTab } from "./admin/UsersTab";
import { ChannelsTab } from "./admin/ChannelsTab";
import { AuditTab } from "./admin/AuditTab";
import { NotificationsTab } from "./admin/NotificationsTab";
import { ReportsTab } from "./admin/ReportsTab";
import { SensitiveWordsTab } from "./admin/SensitiveWordsTab";
import { MessagesTab } from "./admin/MessagesTab";
import { OrgsTab } from "./admin/OrgsTab";
import { OssTab } from "./admin/OssTab";
import { PrivateNotificationsTab } from "./admin/PrivateNotificationsTab";
import { RateLimitSettings } from "./admin/RateLimitSettings";
import { SettingsTab } from "./admin/settings";
import { StickerPacksTab } from "./admin/StickerPacksTab";
import type {
  AdminUser,
  AdminPermission,
} from "@navo/shared";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type AdminTab = "dashboard" | "users" | "channels" | "settings" | "audit" | "notifications" | "reports" | "sensitive-words" | "organizations" | "messages" | "oss-bindings" | "rate-limit" | "sticker-packs";
type SettingsSubTab = "basic" | "registration" | "message" | "nsfw" | "captcha" | "ai" | "translation" | "cdn" | "ice" | "maintenance" | "getui" | "sms" | "email" | "sso";

interface AdminPanelProps {
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Toast system
// ---------------------------------------------------------------------------

interface ToastItem {
  id: number;
  message: string;
  type: "success" | "error";
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AdminPanel({ onClose }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [activeSettingsSubTab, setActiveSettingsSubTab] = useState<SettingsSubTab>("basic");
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [notifExpanded, setNotifExpanded] = useState(false);
  const [overviewExpanded, setOverviewExpanded] = useState(true);
  const [userExpanded, setUserExpanded] = useState(false);
  const [channelExpanded, setChannelExpanded] = useState(false);
  const [auditExpanded, setAuditExpanded] = useState(false);
  const [contentExpanded, setContentExpanded] = useState(false);
  const [operationsExpanded, setOperationsExpanded] = useState(false);
  const [notifSubTab, setNotifSubTab] = useState<"public" | "private">("public");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<AdminUser | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const t = useT();
  const roleLabels: Record<string, string> = {
    super_admin: t("admin.role.superAdmin"),
    admin: t("admin.role.admin"),
    moderator: t("admin.role.moderator"),
    user: t("admin.role.user"),
  };
  const me = useChatStore((s) => s.me);

  // Confirm modals
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    variant: "default" | "danger" | "warning";
    onConfirm: () => void;
  }>({ title: "", message: "", variant: "default", onConfirm: () => {} });

  // Ban reason modal
  const [banModalOpen, setBanModalOpen] = useState(false);
  const [banUserId, setBanUserId] = useState("");
  const [banReason, setBanReason] = useState("");

  // Channel delete confirm
  const [_channelDeleteId, _setChannelDeleteId] = useState<string | null>(null);

  // Transfer owner confirm
  const [_transferOwnerId, _setTransferOwnerId] = useState<string | null>(null);

  function openConfirm(title: string, message: string, variant: "default" | "danger" | "warning", onConfirm: () => void) {
    setConfirmConfig({ title, message, variant, onConfirm });
    setConfirmOpen(true);
  }

  // Toast helper
  const addToast = useCallback(
    (message: string, type: "success" | "error" = "success") => {
      const id = Date.now();
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3000);
    },
    [],
  );

  useEffect(() => {
    setToastHandler(addToast);
    return () => {
      clearToastHandler();
    };
  }, [addToast]);

  // Verify admin access
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    (async () => {
      try {
        const role = await api.admin.getMyRole();
        if (!cancelled) setMyRole(role);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : t("server.failedToGetRole"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me]);

  const hasPermission = (permission: AdminPermission): boolean => {
    if (!myRole) return false;
    if (myRole.role === "super_admin") return true;
    return myRole.permissions.includes(permission);
  };

  const selectTab = (tab: AdminTab) => {
    setActiveTab(tab);
    setMobileSidebarOpen(false);
  };

  const selectSettingsTab = (subTab: SettingsSubTab) => {
    setActiveTab("settings");
    setActiveSettingsSubTab(subTab);
    setMobileSidebarOpen(false);
  };

  const handleBan = async (userId: string, reason: string) => {
    try {
      await api.admin.banUser(userId, { userId, reason: reason || t("admin.banUser") });
      toast(t("server.banSuccess"));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("server.failedToBan"), "error");
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-app text-ink-primary">
        <div className="flex flex-1 items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-ocean" />
        </div>
      </div>
    );
  }

  // No login
  if (!me) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-app text-ink-primary">
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center text-ink-muted">{t("error.unauthorized")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-app text-ink-primary">
      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-medium shadow-lg backdrop-blur-xl animate-in slide-in-from-bottom-2",
              t.type === "success"
                ? "bg-green-500/90 text-white"
                : "bg-red-500/90 text-white",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-line-light/70 bg-surface/80 px-4 py-3 backdrop-blur-xl">
        <button
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-xl hover:bg-surface-soft"
          title={t("common.close")}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button
          onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          className="grid h-9 w-9 place-items-center rounded-xl hover:bg-surface-soft md:hidden"
        >
          {mobileSidebarOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </button>
        <Shield className="h-6 w-6 text-ocean" />
        <div className="flex-1">
            <span className="font-display text-lg font-semibold tracking-tight">
              {t("admin.dashboard")}
            </span>
          {myRole && (
            <span className="ml-2 text-xs text-ink-muted">
              · {roleLabels[myRole.role]}
            </span>
          )}
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Mobile sidebar backdrop */}
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-surface-deep/50 md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <nav
          className={cn(
            "z-40 flex shrink-0 flex-col border-r border-line-light/70 bg-surface p-2 transition-all duration-200 overflow-y-auto",
            "md:static md:translate-x-0",
            mobileSidebarOpen
              ? "fixed inset-y-0 left-0 w-56 translate-x-0"
              : "hidden md:flex",
            !mobileSidebarOpen && (sidebarOpen ? "md:w-64" : "md:w-14"),
          )}
        >
          {/* Desktop toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="mb-2 hidden md:flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-ink-muted hover:bg-surface-soft hover:text-ink-primary"
          >
            <ChevronRight
              className={cn(
                "h-4 w-4 transition-transform",
                sidebarOpen && "rotate-180",
              )}
            />
            {sidebarOpen && <span>{t("common.close")}</span>}
          </button>

          <NavItem
            icon={<Activity className="h-4 w-4" />}
            label={t("admin.dashboard")}
            active={activeTab === "dashboard"}
            onClick={() => {
              if (sidebarOpen || mobileSidebarOpen) {
                setOverviewExpanded(!overviewExpanded);
              } else {
                selectTab("dashboard");
              }
            }}
            collapsed={!sidebarOpen && !mobileSidebarOpen}
            expandIcon={
              <ChevronDown
                className={cn(
                  "h-3 w-3 transition-transform",
                  overviewExpanded ? "rotate-0" : "-rotate-90",
                )}
              />
            }
          />
          {(sidebarOpen || mobileSidebarOpen) && overviewExpanded && (
            <div className="ml-4 space-y-0.5 border-l border-line-light/50 pl-2">
              <button
                onClick={() => selectTab("dashboard")}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                  activeTab === "dashboard"
                    ? "bg-ocean/10 text-ocean font-medium"
                    : "text-ink-secondary hover:bg-surface-soft hover:text-ink-primary",
                )}
              >
                <Activity className="h-3.5 w-3.5" />
                <span>{t("admin.dashboard")}</span>
              </button>
            </div>
          )}
          {hasPermission("users.manage") && (
            <>
              <NavItem
                icon={<Users className="h-4 w-4" />}
                label={t("nav.contacts")}
                active={activeTab === "users" || activeTab === "organizations"}
                onClick={() => {
                  if (sidebarOpen || mobileSidebarOpen) {
                    setUserExpanded(!userExpanded);
                  } else {
                    selectTab("users");
                  }
                }}
                collapsed={!sidebarOpen && !mobileSidebarOpen}
                expandIcon={
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform",
                      userExpanded ? "rotate-0" : "-rotate-90",
                    )}
                  />
                }
              />
              {(sidebarOpen || mobileSidebarOpen) && userExpanded && (
                <div className="ml-4 space-y-0.5 border-l border-line-light/50 pl-2">
                  <button
                    onClick={() => selectTab("users")}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                      activeTab === "users"
                        ? "bg-ocean/10 text-ocean font-medium"
                        : "text-ink-secondary hover:bg-surface-soft hover:text-ink-primary",
                    )}
                  >
                    <Users className="h-3.5 w-3.5" />
                    <span>{t("nav.contacts")}</span>
                  </button>
                  <button
                    onClick={() => selectTab("organizations")}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                      activeTab === "organizations"
                        ? "bg-ocean/10 text-ocean font-medium"
                        : "text-ink-secondary hover:bg-surface-soft hover:text-ink-primary",
                    )}
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    <span>{t("admin.orgManagement")}</span>
                  </button>
                </div>
              )}
            </>
          )}
          {hasPermission("channels.manage") && (
            <>
              <NavItem
                icon={<Hash className="h-4 w-4" />}
                label={t("admin.channels")}
                active={activeTab === "channels"}
                onClick={() => {
                  if (sidebarOpen || mobileSidebarOpen) {
                    setChannelExpanded(!channelExpanded);
                  } else {
                    selectTab("channels");
                  }
                }}
                collapsed={!sidebarOpen && !mobileSidebarOpen}
                expandIcon={
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform",
                      channelExpanded ? "rotate-0" : "-rotate-90",
                    )}
                  />
                }
              />
              {(sidebarOpen || mobileSidebarOpen) && channelExpanded && (
                <div className="ml-4 space-y-0.5 border-l border-line-light/50 pl-2">
                  <button
                    onClick={() => selectTab("channels")}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                      activeTab === "channels"
                        ? "bg-ocean/10 text-ocean font-medium"
                        : "text-ink-secondary hover:bg-surface-soft hover:text-ink-primary",
                    )}
                  >
                    <Hash className="h-3.5 w-3.5" />
                    <span>{t("admin.channels")}</span>
                  </button>
                </div>
              )}
            </>
          )}
          {hasPermission("settings.manage") && (
            <>
              <NavItem
                icon={<Settings className="h-4 w-4" />}
                label={t("nav.settings")}
                active={activeTab === "settings"}
                onClick={() => {
                  if (sidebarOpen || mobileSidebarOpen) {
                    setSettingsExpanded(!settingsExpanded);
                  } else {
                    selectTab("settings");
                  }
                }}
                collapsed={!sidebarOpen && !mobileSidebarOpen}
                expandIcon={
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform",
                      settingsExpanded ? "rotate-0" : "-rotate-90",
                    )}
                  />
                }
              />
              {(sidebarOpen || mobileSidebarOpen) && settingsExpanded && (
                <div className="ml-4 space-y-0.5 border-l border-line-light/50 pl-2">
                  {[
                    { key: "basic" as SettingsSubTab, label: t("adminSettings.basic"), icon: <Globe className="h-3.5 w-3.5" /> },
                    { key: "registration" as SettingsSubTab, label: t("adminSettings.registration"), icon: <UserPlus className="h-3.5 w-3.5" /> },
                    { key: "message" as SettingsSubTab, label: t("adminSettings.message"), icon: <MessageSquare className="h-3.5 w-3.5" /> },
                    { key: "nsfw" as SettingsSubTab, label: t("adminSettings.nsfw"), icon: <Image className="h-3.5 w-3.5" /> },
                    { key: "captcha" as SettingsSubTab, label: t("adminSettings.captcha"), icon: <ShieldCheck className="h-3.5 w-3.5" /> },
                    { key: "ai" as SettingsSubTab, label: t("adminSettings.ai"), icon: <Cpu className="h-3.5 w-3.5" /> },
                    { key: "translation" as SettingsSubTab, label: t("translation.settings"), icon: <Languages className="h-3.5 w-3.5" /> },
                    { key: "cdn" as SettingsSubTab, label: t("adminSettings.cdn"), icon: <Server className="h-3.5 w-3.5" /> },
                    { key: "ice" as SettingsSubTab, label: "STUN/TURN", icon: <Globe className="h-3.5 w-3.5" /> },
                    { key: "maintenance" as SettingsSubTab, label: t("adminSettings.maintenance"), icon: <Wrench className="h-3.5 w-3.5" /> },
                    { key: "getui" as SettingsSubTab, label: "个推推送", icon: <Bell className="h-3.5 w-3.5" /> },
                    { key: "sms" as SettingsSubTab, label: t("adminSettings.sms"), icon: <Smartphone className="h-3.5 w-3.5" /> },
                    { key: "email" as SettingsSubTab, label: t("adminSettings.email"), icon: <Mail className="h-3.5 w-3.5" /> },
                    { key: "sso" as SettingsSubTab, label: t("adminSettings.sso"), icon: <KeyRound className="h-3.5 w-3.5" /> },
                  ].map((item) => (
                    <button
                      key={item.key}
                      onClick={() => selectSettingsTab(item.key)}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                        activeTab === "settings" && activeSettingsSubTab === item.key
                          ? "bg-ocean/10 text-ocean font-medium"
                          : "text-ink-secondary hover:bg-surface-soft hover:text-ink-primary",
                      )}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {hasPermission("settings.manage") && (
            <>
              <NavItem
                icon={<Bell className="h-4 w-4" />}
                label={t("notification.title")}
                active={activeTab === "notifications"}
                onClick={() => {
                  if (sidebarOpen || mobileSidebarOpen) {
                    setNotifExpanded(!notifExpanded);
                  } else {
                    selectTab("notifications");
                  }
                }}
                collapsed={!sidebarOpen && !mobileSidebarOpen}
                expandIcon={
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform",
                      notifExpanded ? "rotate-0" : "-rotate-90",
                    )}
                  />
                }
              />
              {(sidebarOpen || mobileSidebarOpen) && notifExpanded && (
                <div className="ml-4 space-y-0.5 border-l border-line-light/50 pl-2">
                  <button
                    onClick={() => { setNotifSubTab("public"); selectTab("notifications"); }}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                      activeTab === "notifications" && notifSubTab === "public"
                        ? "bg-ocean/10 text-ocean font-medium"
                        : "text-ink-secondary hover:bg-surface-soft hover:text-ink-primary",
                    )}
                  >
                    <Globe className="h-3.5 w-3.5" />
                    <span>{t("admin.notification.public")}</span>
                  </button>
                  <button
                    onClick={() => { setNotifSubTab("private"); selectTab("notifications"); }}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                      activeTab === "notifications" && notifSubTab === "private"
                        ? "bg-ocean/10 text-ocean font-medium"
                        : "text-ink-secondary hover:bg-surface-soft hover:text-ink-primary",
                    )}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>{t("admin.notification.private")}</span>
                  </button>
                </div>
              )}
            </>
          )}
          {hasPermission("audit.view") && (
            <>
              <NavItem
                icon={<Shield className="h-4 w-4" />}
                label={t("admin.audit")}
                active={activeTab === "audit" || activeTab === "messages"}
                onClick={() => {
                  if (sidebarOpen || mobileSidebarOpen) {
                    setAuditExpanded(!auditExpanded);
                  } else {
                    selectTab("audit");
                  }
                }}
                collapsed={!sidebarOpen && !mobileSidebarOpen}
                expandIcon={
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform",
                      auditExpanded ? "rotate-0" : "-rotate-90",
                    )}
                  />
                }
              />
              {(sidebarOpen || mobileSidebarOpen) && auditExpanded && (
                <div className="ml-4 space-y-0.5 border-l border-line-light/50 pl-2">
                  <button
                    onClick={() => selectTab("audit")}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                      activeTab === "audit"
                        ? "bg-ocean/10 text-ocean font-medium"
                        : "text-ink-secondary hover:bg-surface-soft hover:text-ink-primary",
                    )}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>{t("admin.auditLog")}</span>
                  </button>
                  <button
                    onClick={() => selectTab("messages")}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                      activeTab === "messages"
                        ? "bg-ocean/10 text-ocean font-medium"
                        : "text-ink-secondary hover:bg-surface-soft hover:text-ink-primary",
                    )}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>{t("admin.messages")}</span>
                  </button>
                </div>
              )}
            </>
          )}
          {hasPermission("settings.manage") && (
            <>
              <NavItem
                icon={<Globe className="h-4 w-4" />}
                label={t("admin.content")}
                active={activeTab === "sensitive-words" || activeTab === "reports" || activeTab === "sticker-packs"}
                onClick={() => {
                  if (sidebarOpen || mobileSidebarOpen) {
                    setContentExpanded(!contentExpanded);
                  } else {
                    selectTab("sensitive-words");
                  }
                }}
                collapsed={!sidebarOpen && !mobileSidebarOpen}
                expandIcon={
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform",
                      contentExpanded ? "rotate-0" : "-rotate-90",
                    )}
                  />
                }
              />
              {(sidebarOpen || mobileSidebarOpen) && contentExpanded && (
                <div className="ml-4 space-y-0.5 border-l border-line-light/50 pl-2">
                  <button
                    onClick={() => selectTab("sensitive-words")}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                      activeTab === "sensitive-words"
                        ? "bg-ocean/10 text-ocean font-medium"
                        : "text-ink-secondary hover:bg-surface-soft hover:text-ink-primary",
                    )}
                  >
                    <ShieldAlert className="h-3.5 w-3.5" />
                    <span>{t("admin.sensitiveWords")}</span>
                  </button>
                  <button
                    onClick={() => selectTab("reports")}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                      activeTab === "reports"
                        ? "bg-ocean/10 text-ocean font-medium"
                        : "text-ink-secondary hover:bg-surface-soft hover:text-ink-primary",
                    )}
                  >
                    <Flag className="h-3.5 w-3.5" />
                    <span>{t("admin.reports")}</span>
                  </button>
                  <button
                    onClick={() => selectTab("sticker-packs")}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                      activeTab === "sticker-packs"
                        ? "bg-ocean/10 text-ocean font-medium"
                        : "text-ink-secondary hover:bg-surface-soft hover:text-ink-primary",
                    )}
                  >
                    <Image className="h-3.5 w-3.5" />
                    <span>{t("admin.stickerPacks")}</span>
                  </button>
                </div>
              )}
            </>
          )}
          {hasPermission("settings.manage") && (
            <>
              <NavItem
                icon={<Wrench className="h-4 w-4" />}
                label={t("admin.operations")}
                active={activeTab === "oss-bindings" || activeTab === "rate-limit"}
                onClick={() => {
                  if (sidebarOpen || mobileSidebarOpen) {
                    setOperationsExpanded(!operationsExpanded);
                  } else {
                    selectTab("oss-bindings");
                  }
                }}
                collapsed={!sidebarOpen && !mobileSidebarOpen}
                expandIcon={
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform",
                      operationsExpanded ? "rotate-0" : "-rotate-90",
                    )}
                  />
                }
              />
              {(sidebarOpen || mobileSidebarOpen) && operationsExpanded && (
                <div className="ml-4 space-y-0.5 border-l border-line-light/50 pl-2">
                  <button
                    onClick={() => selectTab("oss-bindings")}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                      activeTab === "oss-bindings"
                        ? "bg-ocean/10 text-ocean font-medium"
                        : "text-ink-secondary hover:bg-surface-soft hover:text-ink-primary",
                    )}
                  >
                    <Database className="h-3.5 w-3.5" />
                    <span>{t("admin.ossStorage")}</span>
                  </button>
                  <button
                    onClick={() => selectTab("rate-limit")}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                      activeTab === "rate-limit"
                        ? "bg-ocean/10 text-ocean font-medium"
                        : "text-ink-secondary hover:bg-surface-soft hover:text-ink-primary",
                    )}
                  >
                    <Gauge className="h-3.5 w-3.5" />
                    <span>{t("admin.rateLimiting")}</span>
                  </button>
                </div>
              )}
            </>
          )}
        </nav>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {error && (
            <div className="mb-4 rounded-xl bg-red-400/10 p-4 text-sm text-red-400">
              {error}
            </div>
          )}
          {activeTab === "dashboard" && <DashboardTab />}
          {activeTab === "users" && (
            <UsersTab hasPermission={hasPermission} myRole={myRole} openConfirm={openConfirm} setBanUserId={setBanUserId} setBanReason={setBanReason} setBanModalOpen={setBanModalOpen} />
          )}
          {activeTab === "channels" && (
            <ChannelsTab hasPermission={hasPermission} openConfirm={openConfirm} />
          )}
          {activeTab === "settings" && <SettingsTab subTab={activeSettingsSubTab} />}
          {activeTab === "audit" && <AuditTab />}
          {activeTab === "notifications" && (notifSubTab === "private" ? <PrivateNotificationsTab /> : <NotificationsTab openConfirm={openConfirm} />)}
          {activeTab === "reports" && <ReportsTab />}
          {activeTab === "sensitive-words" && <SensitiveWordsTab />}
          {activeTab === "messages" && <MessagesTab />}
          {activeTab === "organizations" && <OrgsTab />}
          {activeTab === "oss-bindings" && <OssTab />}
          {activeTab === "rate-limit" && <RateLimitSettings />}
          {activeTab === "sticker-packs" && <StickerPacksTab />}
        </main>
      </div>

      {/* Confirm Modal */}
      <ConfirmModal
        open={confirmOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        variant={confirmConfig.variant}
        confirmText={t("common.confirm")}
        cancelText={t("common.cancel")}
        onConfirm={() => {
          confirmConfig.onConfirm();
          setConfirmOpen(false);
        }}
        onCancel={() => setConfirmOpen(false)}
      />

      {/* Ban Reason Modal */}
      <ConfirmModal
        open={banModalOpen}
        title={t("admin.banUser")}
        message={t("admin.banReason")}
        variant="danger"
        confirmText={t("admin.banUser")}
        cancelText={t("common.cancel")}
        showInput
        inputLabel={t("admin.banReason")}
        inputPlaceholder={t("admin.banReasonPlaceholder")}
        inputValue={banReason}
        onInputValueChange={setBanReason}
        onConfirm={(reason) => {
          handleBan(banUserId, reason || t("admin.banUser"));
          setBanModalOpen(false);
          setBanReason("");
        }}
        onCancel={() => {
          setBanModalOpen(false);
          setBanReason("");
        }}
      />
    </div>
  );
}

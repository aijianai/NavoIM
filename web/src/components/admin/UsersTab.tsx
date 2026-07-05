import { useState, useEffect, useCallback } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Ban,
  Eye,
  RefreshCw,
  ShieldCheck,
  Bell,
  Send,
} from "lucide-react";
import { api } from "../../lib/api";
import { Avatar } from "../Avatar";
import { useT } from "../../lib/i18n";
import {
  toast,
  ROLE_LABELS,
  ALL_ROLES,
  StatusBadge,
  InfoRow,
} from "./shared";
import type {
  AdminUser,
  SystemRole,
  AdminPermission,
  PublicUser,
} from "@navo/shared";

export function UsersTab({
  hasPermission,
  myRole,
  openConfirm,
  setBanUserId,
  setBanReason,
  setBanModalOpen,
}: {
  hasPermission: (p: AdminPermission) => boolean;
  myRole: AdminUser | null;
  openConfirm: (title: string, message: string, variant: "default" | "danger" | "warning", onConfirm: () => void) => void;
  setBanUserId: (id: string) => void;
  setBanReason: (reason: string) => void;
  setBanModalOpen: (open: boolean) => void;
}) {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailUser, setDetailUser] = useState<PublicUser | null>(null);
  const t = useT();

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.admin.getUsers({ page, limit: 20, search });
      setUsers(r.users);
      setTotal(r.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleUnban = async (userId: string) => {
    try {
      await api.admin.unbanUser(userId);
      toast(t("admin.unbanSuccess"));
      loadUsers();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("server.failedToUnban"), "error");
    }
  };

  const handleDelete = async (userId: string) => {
    openConfirm(t("admin.deleteUser"), t("admin.confirmDeleteUser"), "danger", async () => {
      try {
        await api.admin.deleteUser(userId);
        toast(t("admin.deleteSuccess"));
        loadUsers();
      } catch (e) {
        toast(e instanceof Error ? e.message : t("admin.deleteFailed"), "error");
      }
    });
  };

  const handleSetRole = async (userId: string, role: SystemRole) => {
    try {
      await api.admin.grantRole(userId, { userId, role });
      toast(t("admin.roleSet", { role: ROLE_LABELS[role] }));
      loadUsers();
      setDetailUser(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : t("admin.setRoleFailed"), "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold md:text-xl">
          {t("admin.userManagement")}
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t("friends.searchUserPlaceholder")}
              className="w-40 rounded-xl border border-line-light/70 bg-surface px-3 py-2 pl-9 text-sm outline-none focus:border-aqua md:w-64"
            />
          </div>
          <button
            onClick={loadUsers}
            className="rounded-xl p-2 text-ink-muted hover:bg-surface-soft"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-ocean" />
        </div>
      ) : (
        <div className="rounded-2xl border border-line-light/70 bg-surface-soft overflow-x-auto">
          <table className="w-full min-w-[500px]">
            <thead>
              <tr className="border-b border-line-light/70 text-left text-sm text-ink-muted">
                <th className="p-3 md:p-4">{t("admin.oss.user")}</th>
                <th className="p-3 md:p-4">{t("user.status")}</th>
                <th className="p-3 md:p-4 hidden md:table-cell">{t("user.lastSeen")}</th>
                <th className="p-3 md:p-4 text-right">{t("admin.operations")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-line-light/50 last:border-0 cursor-pointer hover:bg-surface/50"
                  onClick={() => setDetailUser(user)}
                >
                  <td className="p-3 md:p-4">
                    <div className="flex items-center gap-3">
                      <Avatar user={user} size="sm" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {user.displayName}
                        </div>
                        <div className="text-xs text-ink-muted">
                          @{user.username}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 md:p-4">
                    <StatusBadge status={user.status} />
                  </td>
                  <td className="p-3 md:p-4 text-sm text-ink-muted hidden md:table-cell">
                    {new Date(user.lastSeen).toLocaleString()}
                  </td>
                  <td className="p-3 md:p-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setDetailUser(user)}
                        className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-soft"
                        title={t("admin.viewDetail")}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      {hasPermission("users.ban") && (
                        <button
                          onClick={() => { setBanUserId(user.id); setBanReason(""); setBanModalOpen(true); }}
                          className="rounded-lg p-1.5 text-orange-400 hover:bg-orange-400/10"
                          title={t("admin.banUser")}
                        >
                          <Ban className="h-4 w-4" />
                        </button>
                      )}
                      {hasPermission("users.manage") && (
                        <button
                          onClick={() => handleSetRole(user.id, "admin")}
                          className="rounded-lg p-1.5 text-blue-400 hover:bg-blue-400/10"
                          title={t("channel.setAdmin")}
                        >
                          <ShieldCheck className="h-4 w-4" />
                        </button>
                      )}
                      {hasPermission("users.delete") && (
                        <button
                          onClick={() => handleDelete(user.id)}
                          className="rounded-lg p-1.5 text-red-400 hover:bg-red-400/10"
                          title={t("common.delete")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-ink-muted">
        <span>{t("admin.totalUsers")}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="rounded-lg p-1 hover:bg-surface-soft disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[4rem] text-center">
            {page} / {Math.ceil(total / 20) || 1}
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page >= Math.ceil(total / 20)}
            className="rounded-lg p-1 hover:bg-surface-soft disabled:opacity-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {detailUser && (
        <UserDetailModal
          user={detailUser}
          myRole={myRole}
          hasPermission={hasPermission}
          onClose={() => setDetailUser(null)}
          onBan={() => { setBanUserId(detailUser.id); setBanReason(""); setBanModalOpen(true); }}
          onUnban={handleUnban}
          onSetRole={handleSetRole}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// User detail modal
// ---------------------------------------------------------------------------

function UserDetailModal({
  user,
  myRole,
  hasPermission,
  onClose,
  onBan,
  onUnban,
  onSetRole,
  onDelete,
}: {
  user: PublicUser;
  myRole: AdminUser | null;
  hasPermission: (p: AdminPermission) => boolean;
  onClose: () => void;
  onBan: () => void;
  onUnban: (id: string) => void;
  onSetRole: (id: string, role: SystemRole) => void;
  onDelete: (id: string) => void;
}) {
  const [userRole, setUserRole] = useState<SystemRole>("user");
  const [banStatus, setBanStatus] = useState<{
    banned: boolean;
    reason?: string;
  }>({ banned: false });
  const [loadingBan, setLoadingBan] = useState(true);
  const [loadingRole, setLoadingRole] = useState(true);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyContent, setNotifyContent] = useState("");
  const [notifySending, setNotifySending] = useState(false);
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
  const [orgId, setOrgId] = useState(user.organizationId ?? "");
  const [orgTitle, setOrgTitle] = useState(user.orgTitle ?? "");
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgPath, setOrgPath] = useState<{ id: string; name: string }[]>([]);
  const t = useT();

  useEffect(() => {
    if (orgId) {
      api.admin.getOrgPath(orgId).then(setOrgPath).catch(() => setOrgPath([]));
    } else {
      setOrgPath([]);
    }
  }, [orgId]);

  const handleSendNotification = async () => {
    if (!notifyContent.trim()) return;
    setNotifySending(true);
    try {
      await api.admin.notifyUser(user.id, notifyContent.trim());
      toast(t("admin.notificationSent"));
      setNotifyOpen(false);
      setNotifyContent("");
    } catch (e) {
      toast(e instanceof Error ? e.message : t("admin.sendFailed"), "error");
    } finally {
      setNotifySending(false);
    }
  };

  const handleSaveOrg = async () => {
    setOrgSaving(true);
    try {
      await api.admin.setUserOrganization(user.id, orgId || null, orgTitle || null);
      toast(t("admin.orgUpdated"));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("common.unknown"), "error");
    } finally {
      setOrgSaving(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.admin.getBanStatus(user.id).catch(() => ({ banned: false })),
      api.admin.getUserRole(user.id).catch(() => null),
      api.admin.getOrganizations().catch(() => []),
    ]).then(([ban, roleRes, orgs]) => {
      if (cancelled) return;
      setBanStatus(ban);
      setLoadingBan(false);
      if (roleRes?.role) {
        const matched = ALL_ROLES.find((r) => r === roleRes.role);
        if (matched) setUserRole(matched);
      }
      setLoadingRole(false);
      setOrganizations(orgs);
    });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-surface-deep/50 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-line-light/70 bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Avatar user={user} size="md" />
            <div>
              <div className="font-semibold">{user.displayName}</div>
              <div className="text-xs text-ink-muted">@{user.username}</div>
            </div>
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <InfoRow label={t("admin.userId")}>
            <span className="font-mono text-xs">{user.id}</span>
          </InfoRow>
          <InfoRow label={t("user.status")}>
            <StatusBadge status={user.status} />
          </InfoRow>
          <InfoRow label={t("profile.bio")}>
            <span className="text-ink-secondary truncate max-w-[200px]">
              {user.bio || t("user.notSet")}
            </span>
          </InfoRow>
          <InfoRow label={t("user.lastSeen")}>
            <span className="text-ink-secondary">
              {new Date(user.lastSeen).toLocaleString()}
            </span>
          </InfoRow>
          {(user.organizationId || orgTitle) && (
            <InfoRow label={t("admin.organization")}>
              <span className="text-ink-secondary text-xs">
                {orgPath.length > 0
                  ? orgPath.map((o) => o.name).join(" > ")
                  : organizations.find(o => o.id === (orgId || user.organizationId))?.name ?? t("common.unknown")}
                {orgTitle ? ` · ${orgTitle}` : ""}
              </span>
            </InfoRow>
          )}
          <InfoRow label={t("admin.banStatus")}>
            {loadingBan ? (
              <RefreshCw className="h-4 w-4 animate-spin text-ink-muted" />
            ) : (
              <span className={banStatus.banned ? "text-red-400" : "text-green-400"}>
                {banStatus.banned
                  ? `${t("admin.banned")}${banStatus.reason ? ` (${banStatus.reason})` : ""}`
                  : t("admin.normal")}
              </span>
            )}
          </InfoRow>

          {hasPermission("users.manage") && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-ink-muted">{t("admin.role")}</span>
              {loadingRole ? (
                <RefreshCw className="h-4 w-4 animate-spin text-ink-muted" />
              ) : (
                <select
                  value={userRole}
                  onChange={(e) =>
                    onSetRole(user.id, e.target.value as SystemRole)
                  }
                  className="rounded-xl border border-line-light/70 bg-surface px-3 py-1.5 text-sm outline-none focus:border-aqua"
                >
                  {ALL_ROLES.map((r) => (
                    <option
                      key={r}
                      value={r}
                      disabled={
                        r === "super_admin" && myRole?.role !== "super_admin"
                      }
                    >
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {hasPermission("users.manage") && (
            <>
              <div className="flex items-center justify-between pt-2">
                <span className="text-ink-muted">{t("admin.organization")}</span>
                <div className="flex items-center gap-2">
                  <select
                    value={orgId}
                    onChange={(e) => setOrgId(e.target.value)}
                    className="rounded-xl border border-line-light/70 bg-surface px-3 py-1.5 text-sm outline-none focus:border-aqua"
                  >
                    <option value="">{t("admin.noOrganization")}</option>
                    {organizations.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-ink-muted">{t("admin.position")}</span>
                <input
                  value={orgTitle}
                  onChange={(e) => setOrgTitle(e.target.value)}
                  placeholder={t("admin.positionPlaceholder")}
                  className="w-40 rounded-xl border border-line-light/70 bg-surface px-3 py-1.5 text-sm outline-none focus:border-aqua"
                />
              </div>
              <div className="flex justify-end pt-1">
                <button
                  onClick={handleSaveOrg}
                  disabled={orgSaving}
                  className="rounded-xl bg-ocean/10 px-3 py-1 text-xs text-ocean hover:bg-ocean/20 disabled:opacity-50"
                >
                  {orgSaving ? t("common.saving") : t("admin.saveOrgInfo")}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={() => setNotifyOpen(!notifyOpen)}
            className="rounded-xl bg-blue-400/10 px-4 py-2 text-sm text-blue-400 hover:bg-blue-400/20"
          >
            <Bell className="inline h-4 w-4 mr-1" />
            {t("admin.sendNotification")}
          </button>
            {banStatus.banned
            ? hasPermission("users.ban") && (
                <button
                  onClick={() => onUnban(user.id)}
                  className="rounded-xl bg-green-400/10 px-4 py-2 text-sm text-green-400 hover:bg-green-400/20"
                >
                  {t("admin.unbanUser")}
                </button>
              )
            : hasPermission("users.ban") && (
                <button
                  onClick={() => onBan()}
                  className="rounded-xl bg-orange-400/10 px-4 py-2 text-sm text-orange-400 hover:bg-orange-400/20"
                >
                  {t("admin.banUser")}
                </button>
              )}
          {hasPermission("users.delete") && (
            <button
              onClick={() => onDelete(user.id)}
              className="rounded-xl bg-red-400/10 px-4 py-2 text-sm text-red-400 hover:bg-red-400/20"
            >
              {t("common.delete")}
            </button>
          )}
        </div>

        {notifyOpen && (
          <div className="mt-4 rounded-xl border border-line-light/70 bg-surface-soft p-4 space-y-3">
            <div className="text-sm font-medium text-ink-primary">{t("admin.notifyUser")} {user.displayName}</div>
            <textarea
              value={notifyContent}
              onChange={(e) => setNotifyContent(e.target.value)}
              placeholder={t("admin.notificationPlaceholder")}
              rows={3}
              className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua resize-none"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => { setNotifyOpen(false); setNotifyContent(""); }}
                className="rounded-xl px-4 py-2 text-sm text-ink-muted hover:bg-surface-soft"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleSendNotification}
                disabled={notifySending || !notifyContent.trim()}
                className="rounded-xl bg-ocean px-4 py-2 text-sm text-white hover:bg-ocean-light disabled:opacity-50"
              >
                <Send className="inline h-4 w-4 mr-1" />
                {notifySending ? t("common.loading") : t("common.send")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2,
  RefreshCw,
  Lock,
  Globe,
  UserPlus,
  Crown,
  Ban,
  CheckCircle,
} from "lucide-react";
import { useChatStore } from "../../lib/store";
import { api } from "../../lib/api";
import { Avatar } from "../Avatar";
import { DraggableToggle } from "../DraggableToggle";
import { useT } from "../../lib/i18n";
import { toast, Sec } from "./shared";
import type { AdminPermission, PublicUser } from "@navo/shared";

export function ChannelsTab({
  hasPermission,
  openConfirm,
}: {
  hasPermission: (p: AdminPermission) => boolean;
  openConfirm: (title: string, message: string, variant: "default" | "danger" | "warning", onConfirm: () => void) => void;
}) {
  const [channels, setChannels] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailChannel, setDetailChannel] = useState<any | null>(null);
  const t = useT();

  const loadChannels = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.admin.getChannels({ page, limit: 20, search });
      setChannels(r.channels);
      setTotal(r.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  const handleDelete = async (channelId: string) => {
    openConfirm(t("admin.deleteChannel"), t("admin.confirmDeleteChannel"), "danger", async () => {
      try {
        await api.admin.deleteChannel(channelId);
        toast(t("admin.deleteSuccess"));
        loadChannels();
      } catch (e) {
        toast(e instanceof Error ? e.message : t("admin.deleteFailed"), "error");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold md:text-xl">
          {t("admin.channelManagement")}
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
              placeholder={t("admin.searchChannelPlaceholder")}
              className="w-40 rounded-xl border border-line-light/70 bg-surface px-3 py-2 pl-9 text-sm outline-none focus:border-aqua md:w-64"
            />
          </div>
          <button
            onClick={loadChannels}
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
                <th className="p-3 md:p-4">{t("admin.channel")}</th>
                <th className="p-3 md:p-4">{t("admin.type")}</th>
                <th className="p-3 md:p-4">{t("member.member")}</th>
                <th className="p-3 md:p-4 hidden md:table-cell">{t("common.createdAt")}</th>
                <th className="p-3 md:p-4 text-right">{t("admin.operations")}</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((channel: any) => (
                <tr
                  key={channel.id}
                  className="border-b border-line-light/50 last:border-0 cursor-pointer hover:bg-surface/50"
                  onClick={() => setDetailChannel(channel)}
                >
                  <td className="p-3 md:p-4">
                    <div className="flex items-center gap-3">
                      {channel.avatarUrl ? (
                        <img
                          src={channel.avatarUrl}
                          alt=""
                          className="h-10 w-10 rounded-xl object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean/10 text-lg">
                          {channel.icon || "#"}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {channel.name}
                        </div>
                        {channel.topic && (
                          <div className="truncate text-xs text-ink-muted">
                            {channel.topic}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-3 md:p-4">
                    <div className="flex items-center gap-1">
                      {channel.isPrivate ? (
                        <Lock className="h-4 w-4 text-orange-400" />
                      ) : (
                        <Globe className="h-4 w-4 text-green-400" />
                      )}
                      <span className="text-sm">
                        {channel.isPrivate ? t("channel.private") : t("channel.public")}
                      </span>
                    </div>
                  </td>
                  <td className="p-3 md:p-4 text-sm">{channel.memberCount}</td>
                  <td className="p-3 md:p-4 text-sm text-ink-muted hidden md:table-cell">
                    {new Date(channel.createdAt).toLocaleString()}
                  </td>
                  <td className="p-3 md:p-4">
                    <div className="flex items-center justify-end gap-1">
                      {hasPermission("channels.delete") && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(channel.id);
                          }}
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
        <span>{t("admin.totalChannels", { count: total })}</span>
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

      {detailChannel && (
        <ChannelDetailModal
          channel={detailChannel}
          onClose={() => setDetailChannel(null)}
          openConfirm={openConfirm}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Channel detail modal
// ---------------------------------------------------------------------------

function ChannelDetailModal({
  channel,
  onClose,
  openConfirm,
}: {
  channel: any;
  onClose: () => void;
  openConfirm: (title: string, message: string, variant: "default" | "danger" | "warning", onConfirm: () => void) => void;
}) {
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResults, setMemberResults] = useState<PublicUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [banStatus, setBanStatus] = useState<{ banned: boolean; reason?: string }>({ banned: false });
  const [loadingBan, setLoadingBan] = useState(true);
  const [banReason, setBanReason] = useState("");
  const [showBanInput, setShowBanInput] = useState(false);
  const [membersCanInvite, setMembersCanInvite] = useState(channel.membersCanInvite ?? true);
  const t = useT();
  const users = useChatStore((s) => s.users);
  const [channelDetail, setChannelDetail] = useState<any>(null);

  useEffect(() => {
    api.admin.getChannel(channel.id).then(setChannelDetail).catch(() => {});
  }, [channel.id]);

  const members: PublicUser[] = channelDetail?.memberUsers ?? [];
  if (members.length === 0 && channelDetail?.members) {
    for (const m of channelDetail.members) {
      const u = users[m.userId];
      if (u && !members.some((x) => x.id === u.id)) members.push(u);
    }
  }

  const handleMemberSearch = async (q: string) => {
    setMemberSearch(q);
    if (!q.trim()) {
      setMemberResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const r = await api.admin.getUsers({ search: q, limit: 10 });
      setMemberResults(r.users);
    } catch {
      setMemberResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleTransferOwner = async (userId: string) => {
    openConfirm(t("channel.transferOwnership"), t("channel.transferConfirm"), "warning", async () => {
      try {
        await api.admin.transferChannelOwner(channel.id, userId);
        toast(t("channel.transferSuccess"));
      } catch (e) {
        toast(e instanceof Error ? e.message : t("channel.transferFailed"), "error");
      }
    });
  };

  useEffect(() => {
    let cancelled = false;
    api.admin.getChannelBanStatus(channel.id).then((status) => {
      if (!cancelled) setBanStatus(status);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setLoadingBan(false);
    });
    return () => { cancelled = true; };
  }, [channel.id]);

  const handleBanChannel = async () => {
    try {
      await api.admin.banChannel(channel.id, { reason: banReason.trim() || undefined });
      toast(t("channel.banned"));
      setBanStatus({ banned: true, reason: banReason.trim() || undefined });
      setShowBanInput(false);
      setBanReason("");
    } catch (e) {
      toast(e instanceof Error ? e.message : t("channel.banFailed"), "error");
    }
  };

  const handleUnbanChannel = async () => {
    try {
      await api.admin.unbanChannel(channel.id);
      toast(t("channel.unbanned"));
      setBanStatus({ banned: false });
    } catch (e) {
      toast(e instanceof Error ? e.message : t("channel.unbanFailed"), "error");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-surface-deep/50 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-line-light/70 bg-surface p-6 shadow-2xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {channel.avatarUrl ? (
              <img
                src={channel.avatarUrl}
                alt=""
                className="h-12 w-12 rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ocean/10 text-xl">
                {channel.icon || "#"}
              </div>
            )}
            <div>
              <div className="font-semibold">{channel.name}</div>
              <div className="text-xs text-ink-muted">
                {channel.isPrivate ? t("channel.private") : t("channel.public")} · {channel.memberCount} {t("member.member")}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* Ban status */}
          <Sec title={t("admin.banStatus")}>
            {loadingBan ? (
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-ink-muted" />
                <span className="text-sm text-ink-muted">{t("common.loading")}</span>
              </div>
            ) : banStatus.banned ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Ban className="h-4 w-4 text-red-400" />
                  <span className="text-sm text-red-400">
                    {t("admin.banned")}{banStatus.reason ? ` (${banStatus.reason})` : ""}
                  </span>
                </div>
                <button
                  onClick={handleUnbanChannel}
                  className="rounded-xl bg-green-400/10 px-4 py-2 text-sm text-green-400 hover:bg-green-400/20"
                >
                  <CheckCircle className="inline h-4 w-4 mr-1" />
                  {t("channel.unbanChannel")}
                </button>
              </div>
            ) : showBanInput ? (
              <div className="space-y-2">
                <input
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder={t("admin.banReasonOptional")}
                  className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleBanChannel}
                    className="rounded-xl bg-red-400/10 px-4 py-2 text-sm text-red-400 hover:bg-red-400/20"
                  >
                    {t("admin.confirmBan")}
                  </button>
                  <button
                    onClick={() => { setShowBanInput(false); setBanReason(""); }}
                    className="rounded-xl px-4 py-2 text-sm text-ink-muted hover:bg-surface-soft"
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowBanInput(true)}
                className="rounded-xl bg-orange-400/10 px-4 py-2 text-sm text-orange-400 hover:bg-orange-400/20"
              >
                <Ban className="inline h-4 w-4 mr-1" />
                {t("channel.banChannel")}
              </button>
            )}
          </Sec>

          {/* Members invite permission */}
          <Sec title={t("channel.memberInvitePermission")}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm">{t("channel.allowMemberInvite")}</div>
                <div className="text-xs text-ink-muted">{t("channel.onlyOwnerAdmin")}{t("channel.canAddMembers")}</div>
              </div>
              <DraggableToggle
                on={membersCanInvite}
                onChange={async (newValue) => {
                  try {
                    await api.updateChannel(channel.id, { membersCanInvite: newValue });
                    setMembersCanInvite(newValue);
                    toast(newValue ? t("channel.inviteAllowed") : t("channel.inviteForbidden"));
                  } catch (e) {
                    toast(e instanceof Error ? e.message : t("common.unknown"), "error");
                  }
                }}
              />
            </div>
          </Sec>

          {/* Members list */}
          <Sec title={`${t("member.memberList")} (${members.length})`}>
            {members.length === 0 ? (
              <div className="text-sm text-ink-muted">{t("channel.noMemberData")}</div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar user={m} size="xs" />
                      <div className="min-w-0">
                        <div className="truncate text-sm">{m.displayName}</div>
                        <div className="text-xs text-ink-muted">@{m.username}</div>
                      </div>
                    </div>
                    {channelDetail?.ownerId !== m.id && (
                      <button
                        onClick={() => handleTransferOwner(m.id)}
                        className="rounded-lg px-2 py-1 text-xs text-ink-muted hover:bg-surface-soft"
                        title={t("channel.setAsOwner")}
                      >
                        <Crown className="h-3 w-3" />
                      </button>
                    )}
                    {channelDetail?.ownerId === m.id && (
                      <span className="text-xs text-ocean">{t("channel.owner")}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Sec>

          {/* Add member */}
          <Sec title={t("channel.addMember")}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <input
                value={memberSearch}
                onChange={(e) => handleMemberSearch(e.target.value)}
                placeholder={t("friends.searchUserPlaceholder")}
                className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 pl-9 text-sm outline-none focus:border-aqua"
              />
            </div>
            {searchLoading && (
              <div className="flex justify-center py-2">
                <RefreshCw className="h-4 w-4 animate-spin text-ocean" />
              </div>
            )}
            {memberResults.length > 0 && (
              <div className="mt-2 space-y-1">
                {memberResults.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-surface-soft"
                  >
                    <div className="flex items-center gap-2">
                      <Avatar user={u} size="xs" />
                      <span className="text-sm">{u.displayName}</span>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await api.admin.addChannelMember(channel.id, u.id);
                          toast(t("channel.memberAdded"));
                        } catch (e) {
                          toast(e instanceof Error ? e.message : t("common.unknown"), "error");
                        }
                      }}
                      className="rounded-lg p-1 text-ink-muted hover:bg-surface"
                    >
                      <UserPlus className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Sec>
        </div>
      </div>
    </div>
  );
}

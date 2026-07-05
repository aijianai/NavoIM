import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Settings, Sparkles, Users, X, List, Layers, Search, Pin, MoreVertical, ShieldCheck, ShieldOff, UserRoundCheck } from "lucide-react";
import { useChatStore } from "../lib/store";
import { api } from "../lib/api";
import { wsClient } from "../lib/ws-client";
import { messageMenuBus } from "../lib/message-menu-bus";
import { Avatar, GroupAvatar, PresenceDot } from "./Avatar";
import { MessageBubble, jumpToMessage } from "./MessageBubble";
import { Composer } from "./Composer";
import { TypingIndicator } from "./TypingIndicator";
import { MessageSearch } from "./MessageSearch";
import { dayLabel, cn, safeDateMs, messagePreview } from "../lib/utils";
import { callController } from "../lib/call";
import type { CallKind, Conversation, Message, PublicUser } from "@navo/shared";
import { useT } from "../lib/i18n";
import { e2eeManager, useE2eeStore } from "../lib/e2ee-manager";
import { E2eeConfirmDialog } from "./E2eeConfirmDialog";
import { DmMoreMenu } from "./DmMoreMenu";
import { needsMessageSync, syncConversationMessages } from "../lib/message-sync";

interface ChatViewProps {
  onOpenUser?: (userId: string) => void;
  onManageChannel?: () => void;
  compact?: boolean;
}

/** Page size used when the user scrolls up to load older history. */
const OLDER_PAGE_SIZE = 20;
/** Distance (px) from the top of the scroller that triggers older-page load. */
const LOAD_OLDER_THRESHOLD = 80;

export function ChatView({ onOpenUser, onManageChannel, compact }: ChatViewProps) {
  const t = useT();
  const selectedId = useChatStore((s) => s.selectedId);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [showConvSelector, setShowConvSelector] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [forwardMode, setForwardMode] = useState<"single" | "merge">("merge");
  const [pinnedPreviews, setPinnedPreviews] = useState<Record<string, string>>({});
  const [dmMenuOpen, setDmMenuOpen] = useState(false);
  const [e2eeConfirmOpen, setE2eeConfirmOpen] = useState(false);
  const dmMenuBtnRef = useRef<HTMLButtonElement | null>(null);
  const conversationsById = useChatStore((s) => s.conversationsById);
  const messagesByConv = useChatStore((s) => s.messagesByConv);
  const setMessages = useChatStore((s) => s.setMessages);
  const prependOlderMessages = useChatStore((s) => s.prependOlderMessages);
  const setHistoryMeta = useChatStore((s) => s.setHistoryMeta);
  const historyMeta = useChatStore((s) => s.historyMeta);
  const setPollResults = useChatStore((s) => s.setPollResults);
  const users = useChatStore((s) => s.users);
  const me = useChatStore((s) => s.me);
  const typing = useChatStore((s) => s.typing);
  const toggleMemberPanel = useChatStore((s) => s.toggleMemberPanel);
  const memberPanelOpen = useChatStore((s) => s.memberPanelOpen);

  const conversation = selectedId ? conversationsById[selectedId] : undefined;
  const messages = selectedId ? messagesByConv[selectedId] ?? [] : [];
  const meta = selectedId ? historyMeta[selectedId] : undefined;
  const hasMore = meta?.hasMore ?? false;
  const loadingOlder = meta?.loadingOlder ?? false;
  const olderError = meta?.error;

  const [loading, setLoading] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  /** Tracks the last `selectedId` we appended/scrolled for, so we only force
   *  scroll-to-bottom on conversation switch and on genuine new tail messages
   *  — not when older history is prepended at the top. */
  const lastTailRef = useRef<{ convId: string | null; lastId: string | null }>({
    convId: null,
    lastId: null,
  });
  /** In-flight guard for older-page loads: prevents the same page being
   *  requested twice in a row (e.g. multiple scroll events in one frame). */
  const loadingOlderRef = useRef(false);

  // 打开会话时：无缓存则首屏拉取；有缓存但与 lastMessageId 不一致则增量补齐。
  useEffect(() => {
    if (!selectedId) return;
    const cached = messagesByConv[selectedId];
    const conv = conversationsById[selectedId];
    const lastMsg = useChatStore.getState().lastMessages[selectedId];
    if (!needsMessageSync(conv, cached, lastMsg)) return;

    const isEmpty = !cached || cached.length === 0;
    let cancelled = false;
    if (isEmpty) setLoading(true);

    syncConversationMessages(selectedId)
      .then(() => {
        if (cancelled) return;
        const msgs = useChatStore.getState().messagesByConv[selectedId];
        if (msgs?.some((m) => m.kind === "poll")) {
          api.pollResults(selectedId).then((r) => {
            if (!cancelled) setPollResults(r);
          }).catch(() => {});
        }
      })
      .catch(() => {
        if (cancelled || !isEmpty) return;
        setMessages(selectedId, [], false);
      })
      .finally(() => {
        if (!cancelled && isEmpty) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Refresh poll results every time messages change (initial load, history load, or new message)
  useEffect(() => {
    if (!selectedId) return;
    const msgs = messagesByConv[selectedId];
    if (!msgs || msgs.length === 0) return;
    if (msgs.some((m) => m.kind === "poll")) {
      api.pollResults(selectedId).then(setPollResults).catch(() => {});
    }
  }, [selectedId, messagesByConv[selectedId as string]]);

  /**
   * Loads the next (older) page of history.
   * - Uses the `createdAt` of the currently-oldest loaded message as the cursor.
   * - Anchors scroll position so the user's viewport doesn't jump when the new
   *   block is inserted at the top.
   * - Re-entrancy guarded by both `loadingOlderRef` and the store's `loadingOlder`.
   */
  const loadOlder = useCallback(async () => {
    if (!selectedId) return;
    if (loadingOlderRef.current) return;
    const cur = useChatStore.getState();
    const list = cur.messagesByConv[selectedId] ?? [];
    const m = cur.historyMeta[selectedId];
    if (!m?.hasMore || m.loadingOlder) return;
    if (list.length === 0) return;

    loadingOlderRef.current = true;
    setHistoryMeta(selectedId, { loadingOlder: true, error: undefined });

    // Anchor the scroll position to the first existing message so the
    // viewport stays put after we prepend older items.
    const scroller = scrollerRef.current;
    const prevScrollHeight = scroller?.scrollHeight ?? 0;
    const prevScrollTop = scroller?.scrollTop ?? 0;

    const oldest = list[0];
    try {
      const res = await api.messagesPage(selectedId, {
        before: oldest.createdAt,
        pageSize: OLDER_PAGE_SIZE,
      });
      prependOlderMessages(selectedId, res.items, res.hasMore);
      if (res.items.some((m) => m.kind === "poll")) {
        api.pollResults(selectedId).then(setPollResults).catch(() => {});
      }
      // Restore scroll offset relative to the (now larger) content.
      requestAnimationFrame(() => {
        const el = scrollerRef.current;
        if (!el) return;
        const delta = el.scrollHeight - prevScrollHeight;
        el.scrollTop = prevScrollTop + delta;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("chat.loadFailed");
      setHistoryMeta(selectedId, { loadingOlder: false, error: message });
    } finally {
      loadingOlderRef.current = false;
    }
  }, [selectedId, setHistoryMeta, prependOlderMessages]);

  // Auto-scroll to bottom only on conversation switch or when a NEW tail
  // message arrives — never when older history is prepended.
  const lastMsg = messages[messages.length - 1];
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !selectedId) return;
    const tail = lastTailRef.current;
    const tailId = lastMsg?.id ?? null;
    const switched = tail.convId !== selectedId;
    const newTail = !switched && tail.lastId !== tailId;
    if (switched || newTail) {
      el.scrollTop = el.scrollHeight;
      lastTailRef.current = { convId: selectedId, lastId: tailId };
    }
  }, [selectedId, lastMsg?.id]);

  // Detect "scrolled to top" → trigger older-page load.
  const onScroll = useCallback(() => {
    messageMenuBus.closeAll();
    const el = scrollerRef.current;
    if (!el) return;
    if (el.scrollTop <= LOAD_OLDER_THRESHOLD) {
      void loadOlder();
    }
  }, [loadOlder]);

  const sendPresencePing = useCallback(() => {
    if (!selectedId || !conversation || conversation.kind !== "dm") return;
    setDmMenuOpen(false);
    wsClient.send({ type: "presence:ping", conversationId: selectedId });
  }, [selectedId, conversation]);

  const closeDmMenu = useCallback(() => setDmMenuOpen(false), []);

  useEffect(() => {
    messageMenuBus.closeAll();
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || !conversation || messages.length === 0) return;
    const last = messages[messages.length - 1];
    wsClient.send({ type: "read", conversationId: selectedId, messageId: last.id });
  }, [selectedId, messages.length, conversation, messages]);

  // E2EE 状态变化时自动通知 e2eeManager（便于监听离线时自动退出）

  // Fetch pinned message previews
  useEffect(() => {
    if (!conversation?.pinned?.length) { setPinnedPreviews({}); return; }
    api.getPinnedMessages(selectedId!).then((res) => {
      const map: Record<string, string> = {};
      for (const m of res.items) {
        map[m.id] = messagePreview(m);
      }
      setPinnedPreviews(map);
    }).catch(() => {});
  }, [selectedId, conversation?.pinned?.length]);

  if (!selectedId || !conversation) {
    return (
      <main className="grid h-full place-items-center bg-app">
        <div className="text-center">
          <div className="text-gradient-brand font-display text-3xl font-semibold">Navo IM</div>
          <div className="mt-2 text-sm text-ink-secondary">{t("chat.noConversation")}</div>
        </div>
      </main>
    );
  }

  const otherId = conversation.kind === "dm" ? conversation.memberIds.find((id) => id !== me?.id) : undefined;
  const other = otherId ? users[otherId] : undefined;
  const isDm = conversation.kind === "dm";
  const e2eeActive = useChatStore((s) => isDm ? s.e2eeByConversation[conversation.id] === true : false);

  // E2EE 状态变化时自动通知 e2eeManager（便于监听离线时自动退出）
  useEffect(() => {
    if (!isDm) return;
    e2eeManager.bindConversation(conversation.id, other?.id ?? null);
  }, [isDm, conversation.id, other?.id]);
  const typingUsers = Array.from(typing[selectedId] ?? new Set<string>())
    .filter((id) => id !== me?.id)
    .map((id) => users[id])
    .filter(Boolean);

  const startCall = useCallback((kind: CallKind) => {
    void callController.startOutgoing(selectedId, kind);
  }, [selectedId]);

  const handleForwardMessage = useCallback((msg: Message) => {
    setMultiSelectMode(true);
    setSelectedMessages(new Set([msg.id]));
  }, []);

  const handleToggleSelect = useCallback((msg: Message) => {
    setSelectedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(msg.id)) next.delete(msg.id);
      else next.add(msg.id);
      if (next.size === 0) setMultiSelectMode(false);
      return next;
    });
  }, []);

  const handleCancelMultiSelect = useCallback(() => {
    setMultiSelectMode(false);
    setSelectedMessages(new Set());
  }, []);

  const handleForwardConfirm = useCallback((mode: "single" | "merge") => {
    setForwardMode(mode);
    setShowConvSelector(true);
  }, []);

  const title =
    conversation.kind === "channel" ? conversation.name ?? t("chat.unnamed") : other?.displayName ?? t("chat.dm");
  const subtitle =
    conversation.kind === "channel"
      ? conversation.topic ?? `${conversation.memberIds.length} ${t("chat.members")}`
      : other
      ? other.bio || `@${other.username}`
      : "";

  return (
    <main className="relative flex h-full min-h-0 min-w-0 flex-col bg-app">
      {!compact && (
      <header className="flex items-center gap-3 border-b border-line-light/70 bg-surface/60 px-6 py-4 backdrop-blur-xl">
        {conversation.kind === "channel" ? (
          <GroupAvatar
            name={conversation.name}
            conversationId={conversation.id}
            avatarUrl={conversation.avatarUrl}
            icon={conversation.icon}
            size="xl"
          />
        ) : other ? (
          <button onClick={() => onOpenUser?.(other.id)} className="shrink-0 rounded-full transition-opacity hover:opacity-80">
            <Avatar user={other} size="md" showPresence />
          </button>
        ) : null}
        <button
          onClick={() => {
            if (conversation.kind !== "channel" && other) onOpenUser?.(other.id);
          }}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-center gap-2">
            <h1 className="truncate font-display text-lg font-semibold tracking-tight">{title}</h1>
            {other?.username === "navo_ai" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ocean">
                <Sparkles className="h-3 w-3" /> AI
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 truncate text-xs text-ink-secondary">
            {other && <PresenceDot status={other.status} pulse={false} />}
            <span className="truncate">{subtitle}</span>
          </div>
        </button>
        <div className="flex items-center gap-1">
          {isDm ? (
            <button
              ref={dmMenuBtnRef}
              type="button"
              onClick={() => setDmMenuOpen((v) => !v)}
              className={cn("btn-ghost", dmMenuOpen && "bg-surface-soft text-ink-primary")}
              title={t("chat.more")}
              aria-haspopup="menu"
              aria-expanded={dmMenuOpen}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="btn-ghost"
              title={t("chat.searchMessage")}
            >
              <Search className="h-4 w-4" />
            </button>
          )}
          {conversation.kind === "channel" && onManageChannel && (
            <button onClick={onManageChannel} className="btn-ghost" title={t("chat.manageChannel")}>
              <Settings className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={toggleMemberPanel}
            className={cn(
              "btn-ghost",
              memberPanelOpen && "bg-surface-soft text-ink-primary",
            )}
            title={memberPanelOpen ? t("chat.hidePanel") : t("chat.showPanel")}
          >
            <Users className="h-4 w-4" />
            <span className="hidden md:inline">{conversation.memberIds.length}</span>
          </button>
        </div>
      </header>
      )}

      {/* Mobile floating menu */}
      {compact && (
        <div className="absolute right-4 top-2 z-30">
          <button
            ref={dmMenuBtnRef}
            type="button"
            onClick={() => setDmMenuOpen((v) => !v)}
            className={cn(
              "grid h-9 w-9 place-items-center rounded-full bg-surface shadow-lg backdrop-blur-xl",
              dmMenuOpen && "bg-surface-soft text-ink-primary",
            )}
            title={t("chat.more")}
            aria-haspopup="menu"
            aria-expanded={dmMenuOpen}
          >
            <MoreVertical className="h-4 w-4 text-ink-primary" />
          </button>
        </div>
      )}

      <DmMoreMenu open={dmMenuOpen} anchorRef={dmMenuBtnRef} onClose={closeDmMenu}>
        <button
          type="button"
          onClick={() => { setSearchOpen(true); closeDmMenu(); }}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink-primary hover:bg-surface-soft"
        >
          <Search className="h-4 w-4" /> {t("chat.searchMessage")}
        </button>
        {isDm && (
          <>
            <button
              type="button"
              onClick={sendPresencePing}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink-primary hover:bg-surface-soft"
            >
              <UserRoundCheck className="h-4 w-4" /> {t("chat.areYouThere")}
            </button>
            <div className="my-1 border-t border-line-light/70" />
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  closeDmMenu();
                  if (e2eeActive) {
                    await useE2eeStore.getState().endSession(conversation.id, "manual");
                  } else if (!other || other.status === "offline") {
                    useChatStore.getState().showToast(t("e2ee.peerOffline"), "error");
                  } else {
                    setE2eeConfirmOpen(true);
                  }
                })();
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-surface-soft",
                e2eeActive ? "text-success" : "text-ink-primary",
              )}
            >
              {e2eeActive ? <ShieldCheck className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
              {e2eeActive ? t("chat.e2eeDisable") : t("chat.e2eeEnable")}
            </button>
          </>
        )}
      </DmMoreMenu>

      {/* Pinned messages banner */}
      {conversation.pinned && conversation.pinned.length > 0 && (
        <div className="flex items-center gap-2 border-b border-line-light/30 bg-amber-50/50 px-6 py-2 text-xs text-amber-800">
          <Pin className="h-3 w-3 shrink-0" />
          <span className="font-medium shrink-0">{conversation.pinned.length} {t("chat.pinnedMessages")}</span>
          <div className="flex items-center gap-1 min-w-0 overflow-hidden">
            {conversation.pinned.slice(0, 3).map((p) => (
              <button
                key={p.messageId}
                onClick={() => jumpToMessage(p.messageId)}
                className="truncate rounded bg-amber-100/50 px-1.5 py-0.5 text-amber-700 hover:bg-amber-200/50 max-w-[160px]"
                title={t("chat.jumpToMessage")}
              >
                {pinnedPreviews[p.messageId]?.slice(0, 20) || "…"}
              </button>
            ))}
          </div>
          {conversation.pinned.length > 3 && (
            <span className="text-amber-500 shrink-0">+{conversation.pinned.length - 3}</span>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollerRef} onScroll={onScroll} data-role="chat-scroller" className="flex-1 overflow-y-auto ios-scroll no-overscroll">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <HistoryTopIndicator
            hasMore={hasMore}
            loading={loadingOlder}
            error={olderError}
            empty={messages.length === 0}
            onRetry={() => void loadOlder()}
          />
          {loading && messages.length === 0 && <SkeletonStream />}
          <DayedMessageList
            messages={messages}
            conversation={conversation}
            onOpenUser={onOpenUser}
            onReply={(msg) => setReplyTo(msg)}
            onForward={handleForwardMessage}
            selectedMessages={selectedMessages}
            onToggleSelect={handleToggleSelect}
            multiSelectMode={multiSelectMode}
          />
          {typingUsers.length > 0 && (
            <div className="mt-3">
              <TypingIndicator users={typingUsers} />
            </div>
          )}
        </div>
      </div>

      <Composer conversationId={selectedId} replyTo={replyTo} onClearReply={() => setReplyTo(null)} compact={compact} onCallInvite={startCall} />

      {/* Multi-select action bar */}
      {multiSelectMode && (
        <div className="flex items-center justify-between border-t border-line-light/70 bg-surface/80 px-6 py-3 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <button onClick={handleCancelMultiSelect} className="btn-ghost text-sm">
              <X className="h-4 w-4 mr-1" />{t("common.cancel")}
            </button>
            <span className="text-sm text-ink-secondary">{t("chat.selected")} {selectedMessages.size} {t("chat.messages")}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleForwardConfirm("single")}
              disabled={selectedMessages.size === 0}
              className="flex items-center gap-1.5 rounded-lg border border-line-light bg-surface px-3 py-1.5 text-sm text-ink-primary hover:bg-surface-soft disabled:opacity-50"
            >
              <List className="h-4 w-4" />{t("chat.forwardIndividual")}
            </button>
            <button
              onClick={() => handleForwardConfirm("merge")}
              disabled={selectedMessages.size === 0}
              className="flex items-center gap-1.5 rounded-lg bg-brand-gradient px-3 py-1.5 text-sm font-medium text-white shadow-soft hover:shadow-glow disabled:opacity-50"
            >
              <Layers className="h-4 w-4" />{t("chat.forwardCombined")}
            </button>
          </div>
        </div>
      )}

      {/* Conversation selector modal */}
      {showConvSelector && (
        <ConversationSelectorModal
          onSelect={(convId) => {
            const ids = Array.from(selectedMessages).sort((a, b) => {
              const ma = messages.find((m) => m.id === a);
              const mb = messages.find((m) => m.id === b);
              if (!ma || !mb) return 0;
              return ma.createdAt.localeCompare(mb.createdAt);
            });
            // 检查目标会话是否处于 E2EE 模式
            const targetE2ee = useChatStore.getState().e2eeByConversation[convId] === true;
            if (forwardMode === "merge") {
              // Merge forward: single message with kind=forwardedCard
              wsClient.send({
                type: "message:send",
                clientId: `fwd_${Date.now()}`,
                payload: {
                  conversationId: convId,
                  kind: "forwardedCard",
                  text: "",
                  sourceConvId: selectedId!,
                  forwardMessageIds: ids,
                  e2ee: targetE2ee,
                },
              });
            } else {
              // Single forward: send each message individually
              // Special kinds that can't be simply re-sent are converted to text
              const msgs = ids.map((id) => messages.find((m) => m.id === id)).filter(Boolean) as Message[];
              for (const m of msgs) {
                if (m.kind === "forwardedCard") {
                  // Forwarded cards are sent as merge-forward
                  wsClient.send({
                    type: "message:send",
                    clientId: `fwd_${Date.now()}_${m.id}`,
                    payload: {
                      conversationId: convId,
                      kind: "forwardedCard",
                      text: m.text,
                      sourceConvId: selectedId!,
                      forwardMessageIds: [m.id],
                      e2ee: targetE2ee,
                    },
                  });
                } else if (m.kind === "friendCard" || m.kind === "channelCard" || m.kind === "location") {
                  // Special kinds → convert to text
                  let fallbackText = m.text;
                  if (m.kind === "location" && m.text) {
                    try {
                      const loc = JSON.parse(m.text);
                      fallbackText = loc.name || loc.address || `${loc.latitude}, ${loc.longitude}`;
                    } catch { /* keep original text */ }
                  } else if (m.kind === "friendCard") {
                    fallbackText = `${t("message.card.friend")} ${m.text || ""}`.trim();
                  } else if (m.kind === "channelCard") {
                    fallbackText = `${t("message.card.channel")} ${m.text || ""}`.trim();
                  }
                  wsClient.send({
                    type: "message:send",
                    clientId: `fwd_${Date.now()}_${m.id}`,
                    payload: {
                      conversationId: convId,
                      kind: "text",
                      text: fallbackText,
                      e2ee: targetE2ee,
                    },
                  });
                } else {
                  wsClient.send({
                    type: "message:send",
                    clientId: `fwd_${Date.now()}_${m.id}`,
                    payload: {
                      conversationId: convId,
                      kind: m.kind,
                      text: m.text,
                      attachments: m.attachments.map((a) => ({
                        ...a,
                        id: crypto.randomUUID(),
                      })),
                      e2ee: targetE2ee,
                    },
                  });
                }
              }
            }
            setShowConvSelector(false);
            handleCancelMultiSelect();
          }}
          onClose={() => setShowConvSelector(false)}
        />
      )}

      {searchOpen && (
        <MessageSearch
          conversationId={selectedId}
          conversationName={title}
          onClose={() => setSearchOpen(false)}
          onJumpToMessage={(messageId) => {
            // If the message is already loaded, jump to it directly.
            // Otherwise we might need to load it. For now, try direct jump.
            const found = jumpToMessage(messageId);
            if (!found) {
              // Message not in DOM — could be in older history. Scroll to top to trigger load.
              // As a fallback, just close.
            }
          }}
        />
      )}

      {e2eeConfirmOpen && isDm && other && (
        <E2eeConfirmDialog
          peerName={other.displayName}
          onCancel={() => setE2eeConfirmOpen(false)}
          onConfirm={async () => {
            setE2eeConfirmOpen(false);
            await useE2eeStore.getState().startSession(conversation.id, other.id, other.displayName);
          }}
        />
      )}
    </main>
  );
}

/**
 * Top-of-list indicator for the on-demand history loader.
 * - Spinner while a page is loading.
 * - Friendly retry affordance on error.
 * - "已经是最早的消息" once we've reached the end.
 */
function HistoryTopIndicator({
  hasMore,
  loading,
  error,
  empty,
  onRetry,
}: {
  hasMore: boolean;
  loading: boolean;
  error?: string;
  empty: boolean;
  onRetry: () => void;
}) {
  const t = useT();
  if (empty) return null;
  if (error) {
    return (
      <div className="mb-3 flex items-center justify-center gap-2 text-xs text-ink-secondary">
        <span>{error}</span>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full border border-line-light/70 px-2 py-0.5 hover:bg-surface-soft"
        >
          {t("chat.retry")}
        </button>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="mb-3 flex items-center justify-center gap-2 text-xs text-ink-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>{t("chat.loading")}</span>
      </div>
    );
  }
  if (!hasMore) {
    return (
      <div className="mb-3 text-center text-[11px] uppercase tracking-[0.18em] text-ink-muted">
        {t("chat.earliest")}
      </div>
    );
  }
  return null;
}

function DayedMessageList({ messages, conversation, onOpenUser, onReply, onForward, selectedMessages, onToggleSelect, multiSelectMode }: {
  messages: Message[];
  conversation: Conversation;
  onOpenUser?: (userId: string) => void;
  onReply?: (msg: Message) => void;
  onForward?: (msg: Message) => void;
  selectedMessages?: Set<string>;
  onToggleSelect?: (msg: Message) => void;
  multiSelectMode?: boolean;
}) {
  const grouped = useMemo(() => groupByDay(messages), [messages]);
  const me = useChatStore((s) => s.me);
  const users = useChatStore((s) => s.users);

  // For DMs we only show 已读/未读 on MY most recent non-system message.
  const myLastMessageId = useMemo(() => {
    if (!me) return undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.authorId === me.id && m.kind !== "system" && !m.pending && !m.failed) return m.id;
    }
    return undefined;
  }, [messages, me]);

  return (
    <div className="space-y-4">
      {grouped.map(({ label, items }) => (
        <section key={label}>
          <DayDivider label={label} />
          <div className="mt-2 space-y-0.5">
            {items.map((m, i) => {
              const prev = i > 0 ? items[i - 1] : undefined;
              const sameAuthor = prev && prev.authorId === m.authorId;
              const closeInTime = prev && safeDateMs(m.createdAt) - safeDateMs(prev.createdAt) < 5 * 60_000;
              const grouped = sameAuthor && closeInTime;
              let author = users[m.authorId];
              // 系统消息（含 E2EE 系统提示）的 authorId 是 "__system__"，
              // 不在 users 表中。此处给出一个 fallback author，确保能渲染。
              if (!author && m.kind === "system") {
                author = {
                  id: m.authorId,
                  username: "system",
                  displayName: "System",
                  avatarColor: "#888888",
                  bio: "",
                  gender: "unspecified",
                  status: "online",
                  lastSeen: m.createdAt,
                  requireFriendApproval: false,
                } as PublicUser;
              }
              if (!author) return null;
              return (
                <MessageBubble
                  key={m.id}
                  message={m}
                  author={author}
                  isMine={author.id === me?.id}
                  grouped={!!grouped}
                  conversation={conversation}
                  isMyLastMessage={m.id === myLastMessageId}
                  onOpenUser={onOpenUser}
                  onReply={onReply}
                  onForward={onForward}
                  selected={selectedMessages?.has(m.id)}
                  onToggleSelect={onToggleSelect}
                  multiSelectMode={multiSelectMode}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function DayDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-line-light/70" />
      <div className="rounded-full border border-line-light/70 bg-surface px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
        {label}
      </div>
      <div className="h-px flex-1 bg-line-light/70" />
    </div>
  );
}

function groupByDay(messages: Message[]): { label: string; items: Message[] }[] {
  const out: { label: string; items: Message[] }[] = [];
  let curLabel: string | null = null;
  for (const m of messages) {
    const lbl = dayLabel(m.createdAt);
    if (lbl !== curLabel) {
      out.push({ label: lbl, items: [] });
      curLabel = lbl;
    }
    out[out.length - 1].items.push(m);
  }
  return out;
}

function SkeletonStream() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3">
          <div className="h-9 w-9 rounded-full bg-surface-soft" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-32 rounded-full bg-surface-soft" />
            <div className="h-12 w-3/4 rounded-2xl bg-surface-soft" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ConversationSelectorModal({ onSelect, onClose }: {
  onSelect: (conversationId: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const conversations = useChatStore((s) => s.conversations);
  const users = useChatStore((s) => s.users);
  const me = useChatStore((s) => s.me);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const list = conversations.filter(Boolean) as Conversation[];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((c) => {
      if (c.kind === "channel") return (c.name ?? "").toLowerCase().includes(q);
      const otherId = c.memberIds.find((id) => id !== me?.id);
      const other = otherId ? users[otherId] : undefined;
      return other?.displayName.toLowerCase().includes(q) || other?.username.toLowerCase().includes(q);
    });
  }, [conversations, search, users, me]);

  function getConvLabel(c: Conversation) {
    if (c.kind === "channel") return c.name ?? t("chat.unnamed");
    const otherId = c.memberIds.find((id) => id !== me?.id);
    return otherId ? users[otherId]?.displayName ?? t("chat.dm") : t("chat.dm");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-line-light/70 bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line-light/70 px-5 py-4">
          <h2 className="font-display text-lg font-semibold">{t("chat.forwardTo")}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-muted hover:bg-surface-soft">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 pt-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("chat.searchPlaceholder")}
            className="w-full rounded-xl border border-line-light bg-surface-soft px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted outline-none ring-focus-aqua"
            autoFocus
          />
        </div>
        <div className="max-h-72 overflow-y-auto px-3 py-2">
          {filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-ink-muted">{t("chat.noMatchConv")}</div>
          )}
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface-soft"
            >
              {c.kind === "channel" ? (
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-soft text-sm">
                  {c.icon ?? "👥"}
                </div>
              ) : (
                <Avatar user={users[c.memberIds.find((id) => id !== me?.id) ?? ""]} size="md" />
              )}
              <span className="truncate text-sm font-medium text-ink-primary">{getConvLabel(c)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

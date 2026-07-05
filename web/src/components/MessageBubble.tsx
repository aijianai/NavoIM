import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../lib/i18n";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Sparkles, FileText, Download, RotateCcw, Reply, Hash, Lock, Users, MessageSquare, ExternalLink, Pencil, Copy, Loader2, AlertCircle, MapPin, Eye, Forward, Vote, X, Flag, ChevronRight, Pin, PinOff, Languages, ShieldCheck } from "lucide-react";
import { useChatStore } from "../lib/store";
import { api } from "../lib/api";
import { wsClient } from "../lib/ws-client";
import { useViewer } from "../lib/viewer";
import { Avatar } from "./Avatar";
import { Markdown, PlainText } from "./Markdown";
import { cn, downloadAttachment, formatBytes, formatTime, isImage, isVideo, messagePreview, resolveAttachmentUrl, safeDateMs } from "../lib/utils";
import { getOrgDisplayPath } from "../lib/org-cache";
import { messageMenuBus } from "../lib/message-menu-bus";
import { parseE2eeSystemMessage } from "../lib/e2ee-system";
import { MESSAGE_RECALL_WINDOW_MS, type Attachment, type Conversation, type Message, type PollResult, type PublicUser, type TranslationKey } from "@navo/shared";
import { ReportModal } from "./ReportModal";
import { BottomSheet } from "./BottomSheet";

const QUICK_REACTIONS = ["👍", "🔥", "❤️", "🎉", "👀", "✨"];

export function jumpToMessage(messageId: string) {
  const el = document.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("msg-flash");
  void el.offsetWidth;
  el.classList.add("msg-flash");
  window.setTimeout(() => el.classList.remove("msg-flash"), 1500);
  return true;
}

interface MessageBubbleProps {
  message: Message;
  author: PublicUser;
  isMine: boolean;
  grouped: boolean;
  conversation?: Conversation;
  /** True iff this is my most recent successful message in the conversation. */
  isMyLastMessage?: boolean;
  onOpenUser?: (userId: string) => void;
  onReply?: (msg: Message) => void;
  /** Called when user taps t("admin.forwarded") in the context menu — enters multi-select mode. */
  onForward?: (msg: Message) => void;
  /** When in multi-select mode, whether this message is selected. */
  selected?: boolean;
  /** When in multi-select mode, toggle selection of this message. */
  onToggleSelect?: (msg: Message) => void;
  /** When in multi-select mode, disable the context menu long-press. */
  multiSelectMode?: boolean;
}

export function MessageBubble({ message, author, isMine, grouped, conversation, isMyLastMessage, onOpenUser, onReply, onForward, selected, onToggleSelect, multiSelectMode }: MessageBubbleProps) {
  const t = useT();
  const isAI = message.kind === "ai" || author.username === "navo_ai";
  const isRecalled = message.deleted === true;
  const isPinned = conversation?.pinned?.some((p) => p.messageId === message.id);
  const isChannel = conversation?.kind === "channel";
  /** E2EE 本地明文优先展示，不被服务端同步覆盖 */
  const bodyText = message.localPlaintext ?? message.text ?? "";
  // Editing is reserved for plain text. Cards / attachments / location / AI
  // echoes carry their own payload — letting the user "edit" the placeholder
  // text would be confusing and could strip the structured data.
  const canEdit =
    isMine &&
    !isRecalled &&
    message.kind === "text" &&
    !message.pending &&
    !message.failed;
  const me = useChatStore((s) => s.me);
  const readMarkers = useChatStore((s) => s.readMarkers);
  const channelReadStates = useChatStore((s) => s.channelReadStates);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeStartX = useRef<number | null>(null);
  const swipeStartY = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const [showTranslate, setShowTranslate] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translateError, setTranslateError] = useState<string | null>(null);

  // 同步全局消息菜单总线：本气泡只在自己持有"打开权"时显示菜单
  useEffect(() => {
    const syncFromBus = (ownerId: string | null, pos: { x: number; y: number } | null) => {
      if (ownerId === message.id) {
        setMenuPos(pos);
      } else {
        setMenuPos(null);
        setShowTranslate(false);
      }
    };
    setMenuPos(messageMenuBus.getOwnerId() === message.id ? messageMenuBus.getPos() : null);
    return messageMenuBus.subscribe(syncFromBus);
  }, [message.id]);

  // Compute read state for OUR own messages.
  // - DM: only on my latest message → "已读" if peer's lastReadAt covers this
  //       message; otherwise "未读".
  // - Channel: every own message gets "X/Y 已读" (counting myself, since
  //   sending implies reading).
  const readDisplay = useMemo<{ kind: "channel"; count: number; total: number } | { kind: "dm"; read: boolean } | null>(() => {
    if (!isMine || isRecalled || message.pending || message.failed || !conversation || !me) return null;
    const sentAt = safeDateMs(message.createdAt);
    const readsByUser = channelReadStates[conversation.id] ?? {};
    if (conversation.kind === "dm") {
      if (!isMyLastMessage) return null;
      const otherId = conversation.memberIds.find((id) => id !== me.id);
      if (!otherId) return null;
      const r = readsByUser[otherId];
      // Also accept the legacy readMarkers map: if it points to this exact
      // message id we know the peer has seen at least up to here.
      let read = !!r && safeDateMs(r.lastReadAt) >= sentAt;
      if (!read) {
        const legacy = readMarkers[conversation.id];
        if (legacy === message.id) read = true;
      }
      return { kind: "dm", read };
    }
    let count = 1; // myself counts (I sent it → I've read it)
    for (const uid of conversation.memberIds) {
      if (uid === me.id) continue;
      const r = readsByUser[uid];
      if (r && safeDateMs(r.lastReadAt) >= sentAt) count++;
    }
    return { kind: "channel", count, total: conversation.memberIds.length };
  }, [isMine, isRecalled, message.pending, message.failed, message.id, message.createdAt, conversation, me, isMyLastMessage, readMarkers, channelReadStates]);

  const closeMenu = useCallback(() => {
    setMenuPos(null);
    setShowTranslate(false);
    messageMenuBus.close(message.id);
  }, [message.id]);

  // 监听"点击其它位置"：点击空白处时全局关闭当前菜单
  useEffect(() => {
    if (!menuPos) return;
    const onDown = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-menu="message-actions"]') || target.closest('[data-menu="translate-picker"]')) return;
      if (target.closest("[data-message-id]")) return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    window.addEventListener("click", onDown);
    window.addEventListener("contextmenu", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onDown);
      window.removeEventListener("contextmenu", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuPos, closeMenu]);

  function startEdit() {
    setEditText(message.text || "");
    setEditing(true);
    closeMenu();
  }

  function cancelEdit() {
    setEditing(false);
  }

  function saveEdit() {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === message.text) { cancelEdit(); return; }
    wsClient.send({ type: "message:edit", messageId: message.id, text: trimmed });
    setEditing(false);
  }

  function keyDownEdit(e: React.KeyboardEvent) {
    if (e.key === "Escape") { cancelEdit(); }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      saveEdit();
    }
  }

  function handleContextMenu(e: React.MouseEvent) {
    if (isRecalled || multiSelectMode) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = { x: e.clientX, y: e.clientY };
    messageMenuBus.open(message.id, pos);
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (isRecalled || multiSelectMode) return;
    const t = e.touches[0];
    if (t) {
      swipeStartX.current = t.clientX;
      swipeStartY.current = t.clientY;
      const x = t.clientX;
      const y = t.clientY;
      longPressTimer.current = setTimeout(() => {
        const pos = { x, y };
        messageMenuBus.open(message.id, pos);
      }, 500);
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (isRecalled || multiSelectMode || !swipeStartX.current || !swipeStartY.current || !onReply) return;
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - swipeStartX.current;
    const dy = t.clientY - swipeStartY.current;
    // Only trigger swipe-left if horizontal distance > 60px and more horizontal than vertical
    if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swipeStartX.current = null;
      swipeStartY.current = null;
      onReply(message);
    }
  }

  function handleTouchEnd() {
    swipeStartX.current = null;
    swipeStartY.current = null;
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function recall() {
    closeMenu();
    wsClient.send({ type: "message:recall", messageId: message.id });
  }

  async function copyText() {
    closeMenu();
    const text = bodyText;
    if (!text) return;
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); return; } catch { /* fallthrough to legacy path */ }
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch { /* best-effort */ }
    document.body.removeChild(ta);
  }

  const canCopy = !isRecalled && bodyText.trim().length > 0;
  const canRecall = isMine && !isRecalled && (Date.now() - safeDateMs(message.createdAt) <= MESSAGE_RECALL_WINDOW_MS);

  async function handleTranslate(targetLang: string) {
    setTranslating(true);
    setTranslateError(null);
    try {
      const res = await api.translate({ text: bodyText, targetLang });
      setTranslatedText(res.result);
    } catch (e: any) {
      setTranslateError(e.message || t("common.unknown"));
    } finally {
      setTranslating(false);
    }
  }

  // In multi-select mode, clicking the bubble toggles selection
  const handleBubbleClick = multiSelectMode && onToggleSelect
    ? (e: React.MouseEvent) => { e.stopPropagation(); onToggleSelect(message); }
    : undefined;

  // 系统消息（含 E2EE 提示）：不显示头像、名字、已读状态，居中渲染
  if (message.kind === "system") {
    return (
      <motion.div
        ref={containerRef}
        data-message-id={message.id}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="group/bubble relative flex w-full justify-center py-0.5"
      >
        <BubbleBody message={message} isMine={isMine} isAI={isAI} />
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={containerRef}
      data-message-id={message.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onClick={handleBubbleClick}
      className={cn(
        "group/bubble relative flex w-full gap-3 select-none rounded-2xl content-auto",
        isMine ? "flex-row-reverse" : "flex-row",
        multiSelectMode && "cursor-pointer",
        selected && "bg-ocean/10 ring-2 ring-ocean/40 rounded-2xl",
      )}
      style={{ containIntrinsicSize: "auto 80px" }}
    >
      <div className={cn("w-9 shrink-0", grouped && "invisible")}>
        {multiSelectMode ? (
          <div className={cn(
            "mt-1 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors",
            selected ? "border-ocean bg-ocean text-white" : "border-ink-muted bg-transparent"
          )}>
            {selected && (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        ) : !grouped ? (
          <Avatar
            user={author}
            size="sm"
            onClick={onOpenUser ? (e) => {
              e.stopPropagation();
              onOpenUser(author.id);
            } : undefined}
          />
        ) : null}
      </div>

      <div className={cn("flex min-w-0 max-w-[78%] flex-col", isMine ? "items-end" : "items-start")}>
        {!grouped && (
          <div className={cn("mb-1 flex items-baseline gap-1.5 px-1 flex-wrap", isMine && "flex-row-reverse")}>
            <span className="text-sm font-semibold text-ink-primary">
              {isMine ? t("message.you") : author.displayName}
            </span>
            {!isMine && conversation?.kind === "channel" && (() => {
              const member = conversation.members?.find((m) => m.userId === author.id);
              const role = member?.role;
              if (role === "owner") return (
                <span className="inline-flex items-center rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm">{t("member.owner")}</span>
              );
              if (role === "admin") return (
                <span className="inline-flex items-center rounded-full bg-gradient-to-r from-blue-400 to-cyan-400 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm">{t("member.admin")}</span>
              );
              return null;
            })()}
            {!isMine && conversation?.kind === "dm" && author.organizationId && (
              <OrgBadge orgId={author.organizationId} title={author.orgTitle} />
            )}
            {isAI && (
              <span className="inline-flex items-center gap-1 rounded-full border border-aqua/40 bg-aqua/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-ocean">
                <Sparkles className="h-2.5 w-2.5" /> {t("media.markdown")}
              </span>
            )}
            <span className="text-[11px] text-ink-muted">{formatTime(message.createdAt)}</span>
          </div>
        )}

        {editing ? (
          <div className="w-full max-w-[400px]">
            <textarea
              ref={editRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={keyDownEdit}
              className="w-full rounded-xl border border-aqua bg-surface px-3 py-2 text-[15px] text-ink-primary outline-none ring-focus-aqua resize-none"
              rows={Math.min(editText.split('\n').length + 1, 6)}
              autoFocus
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              <span className="hidden text-[10px] text-ink-muted sm:inline">Esc {t("common.cancel")} · Enter {t("common.save")}</span>
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-lg border border-line-light bg-surface px-3 py-1 text-xs text-ink-primary hover:bg-surface-soft"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={!(editText || "").trim() || (editText || "").trim() === message.text}
                className="rounded-lg bg-brand-gradient px-3 py-1 text-xs font-medium text-white shadow-soft hover:shadow-glow disabled:opacity-50"
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <BubbleBody message={message} isMine={isMine} isAI={isAI} />
            {translatedText && (
              <div className={cn("mt-1.5 rounded-lg bg-surface-soft p-2 text-sm", isMine && "text-right")}>
                <div className="text-xs text-ink-muted mb-0.5">{t("translation.machineTranslated")}</div>
                <div className="text-ink-primary">{translatedText}</div>
              </div>
            )}
            {translating && (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-muted">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t("common.loading")}
              </div>
            )}
            {translateError && (
              <div className="mt-1.5 text-xs text-danger">{translateError}</div>
            )}
            {message.editedAt && (
              <div className={cn("mt-0.5 text-[10px] text-ink-muted", isMine && "text-right")}>{t("message.edited")}</div>
            )}
          </>
        )}

        {isMine && !isRecalled && message.kind !== "poll" && (
          <MessageStatus
            messageId={message.id}
            conversationId={message.conversationId}
            pending={!!message.pending}
            failed={!!message.failed}
            failedReason={message.failedReason}
            readDisplay={readDisplay}
            readPopup={readDisplay?.kind === "channel" && conversation && me ? { message, conversation, me } : null}
          />
        )}

        {!isRecalled && message.reactions.length > 0 && (
          <div className={cn("mt-1.5 flex flex-wrap gap-1", isMine && "justify-end")}>
            {message.reactions.map((r) => {
              const mine = me ? r.userIds.includes(me.id) : false;
              return (
                <button
                  key={r.emoji}
                  onClick={() => wsClient.send({ type: "reaction:toggle", messageId: message.id, emoji: r.emoji })}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                    mine
                      ? "border-ocean/40 bg-ocean/10 text-ocean"
                      : "border-line-light bg-surface text-ink-secondary hover:border-aqua hover:text-ink-primary",
                  )}
                >
                  <span>{r.emoji}</span>
                  <span className="font-medium">{r.userIds.length}</span>
                </button>
              );
            })}
          </div>
        )}

        {!isRecalled && (
          <div
            className={cn(
              "pointer-events-none mt-1 flex gap-1 opacity-0 transition-opacity group-hover/bubble:pointer-events-auto group-hover/bubble:opacity-100",
              isMine && "flex-row-reverse",
            )}
          >
            {QUICK_REACTIONS.map((e) => (
              <button
                key={e}
                onClick={() => wsClient.send({ type: "reaction:toggle", messageId: message.id, emoji: e })}
                className="grid h-7 w-7 place-items-center rounded-full border border-line-light bg-surface text-sm shadow-soft transition-transform hover:-translate-y-0.5 hover:border-aqua"
                title={`${t("message.emojiReact")} ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>

      {menuPos && !showTranslate && createPortal(
        <div
          data-menu="message-actions"
          className="fixed z-[9999] rounded-xl border border-line-light/70 bg-surface p-1 shadow-2xl"
          style={{ left: Math.min(menuPos.x, window.innerWidth - 160), top: Math.min(menuPos.y, window.innerHeight - 60) }}
        >
          {onReply && (
            <button
              onClick={() => { onReply(message); closeMenu(); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-primary hover:bg-surface-soft whitespace-nowrap"
            >
              <Reply className="h-4 w-4" /> {t("message.reply")}
            </button>
          )}
          {canCopy && (
            <button
              onClick={copyText}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-primary hover:bg-surface-soft whitespace-nowrap"
            >
              <Copy className="h-4 w-4" /> {t("message.copy")}
            </button>
          )}
          {canCopy && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowTranslate(true); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-primary hover:bg-surface-soft whitespace-nowrap"
            >
              <Languages className="h-4 w-4" /> {t("message.translate")}
            </button>
          )}
          {canEdit && (
            <button
              onClick={startEdit}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-primary hover:bg-surface-soft whitespace-nowrap"
            >
              <Pencil className="h-4 w-4" /> {t("common.edit")}
            </button>
          )}
          {canRecall && (
            <button
              onClick={recall}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger/10 whitespace-nowrap"
            >
              <RotateCcw className="h-4 w-4" /> {t("message.recall")}
            </button>
          )}
          {onForward && !isRecalled && (
            <button
              onClick={() => { onForward(message); closeMenu(); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-primary hover:bg-surface-soft whitespace-nowrap"
            >
              <Forward className="h-4 w-4" /> {t("chat.forward")}
            </button>
          )}
          {isChannel && !isRecalled && (
            <button
              onClick={() => {
                closeMenu();
                if (isPinned) {
                  api.unpinMessage(conversation!.id, message.id);
                } else {
                  api.pinMessage(conversation!.id, message.id);
                }
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-primary hover:bg-surface-soft whitespace-nowrap"
            >
              {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              {isPinned ? t("chat.unpin") : t("chat.pinned")}
            </button>
          )}
          {!isMine && !isRecalled && (
            <button
              onClick={() => { setReportOpen(true); closeMenu(); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger/10 whitespace-nowrap"
            >
              <Flag className="h-4 w-4" /> {t("message.report")}
            </button>
          )}
        </div>, document.body
      )}

      {menuPos && showTranslate && createPortal(
        <div
          data-menu="translate-picker"
          className="fixed z-[9999] rounded-xl border border-line-light/70 bg-surface p-2 shadow-2xl"
          style={{ left: Math.min(menuPos.x, window.innerWidth - 200), top: Math.min(menuPos.y, window.innerHeight - 280) }}
        >
          <div className="mb-1 px-2 py-1 text-[11px] font-medium text-ink-muted uppercase tracking-wider">{t("translation.selectLang")}</div>
          {(["en", "zh-CN", "ja", "ko", "fr", "de", "es"] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => {
                setShowTranslate(false);
                setMenuPos(null);
                messageMenuBus.close(message.id);
                handleTranslate(lang);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-primary hover:bg-surface-soft whitespace-nowrap"
            >
              <span className="w-6 text-center">{lang === "en" ? "🇬🇧" : lang === "zh-CN" ? "🇨🇳" : lang === "ja" ? "🇯🇵" : lang === "ko" ? "🇰🇷" : lang === "fr" ? "🇫🇷" : lang === "de" ? "🇩🇪" : "🇪🇸"}</span>
              {t(`lang.${lang}` as TranslationKey)}
            </button>
          ))}
        </div>, document.body
      )}

      {reportOpen && (
        <ReportModal
          targetType="message"
          targetId={message.id}
          targetName={t("message.fromUser", { name: author?.displayName ?? t("common.unknown") })}
          onClose={() => setReportOpen(false)}
        />
      )}
    </motion.div>
  );
}

function PollBlock({ message, isMine }: { message: Message; isMine: boolean }) {
  const t = useT();
  const [showDetail, setShowDetail] = useState(false);
  const me = useChatStore((s) => s.me);
  const pollResults = useChatStore((s) => s.pollResults);

  let pollData: { question: string; options: { id: string; text: string }[]; anonymous: boolean };
  try {
    pollData = JSON.parse(message.text);
  } catch {
    return <div className="text-sm text-ink-secondary">{t("message.pollError")}</div>;
  }

  const cached = pollResults[message.id];
  const results: PollResult[] = cached?.results ?? pollData.options.map((o) => ({ optionId: o.id, text: o.text, count: 0, voters: [] }));
  const totalVotes = cached?.totalVotes ?? 0;
  const myVote = me ? results.find((r) => r.voters.some((v) => v.userId === me.id)) : undefined;

  function handleVote(optionId: string) {
    if (!me || message.pending) return;
    wsClient.send({ type: "poll:vote", messageId: message.id, optionId });
  }

  return (
    <>
      <div className="w-full space-y-3">
        <div className="flex items-center gap-2">
          <Vote className={cn("h-4 w-4 shrink-0", isMine ? "text-white/80" : "text-ocean")} />
          <span className={cn("text-xs font-medium", isMine ? "text-white/80" : "text-ink-secondary")}>{t("media.poll")}</span>
          {pollData.anonymous && (
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", isMine ? "bg-white/15 text-white/70" : "bg-surface-soft text-ink-muted")}>{t("message.anonymous")}</span>
          )}
        </div>
        <div className={cn("text-sm font-semibold", isMine ? "text-white" : "text-ink-primary")}>{pollData.question}</div>
        <div className="space-y-2">
          {results.map((r) => {
            const pct = totalVotes > 0 ? (r.count / totalVotes) * 100 : 0;
            const isSelected = myVote?.optionId === r.optionId;
            return (
              <button
                key={r.optionId}
                onClick={() => handleVote(r.optionId)}
                className={cn(
                  "relative w-full rounded-xl px-3 py-2.5 text-left text-sm transition-all overflow-hidden",
                  isMine
                    ? cn("border", isSelected ? "border-white/50 bg-white/25" : "border-white/20 bg-white/10 hover:bg-white/20")
                    : cn("border", isSelected ? "border-ocean/50 bg-ocean/15" : "border-line-light bg-surface-soft hover:bg-surface"),
                )}
              >
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 transition-all rounded-xl",
                    isMine ? "bg-white/15" : "bg-ocean/10",
                  )}
                  style={{ width: `${pct}%` }}
                />
                <div className="relative flex items-center justify-between gap-2">
                  <span className={cn("font-medium", isMine ? "text-white" : "text-ink-primary")}>{r.text}</span>
                  <span className={cn("text-xs shrink-0", isMine ? "text-white/70" : "text-ink-muted")}>{r.count} {t("message.votes")}</span>
                </div>
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setShowDetail(true)}
          className={cn(
            "w-full py-2 text-xs font-medium transition-colors",
            isMine ? "text-white/70 hover:text-white/90" : "text-ink-muted hover:text-ocean",
          )}
        >
          {t("message.totalVoters", { count: totalVotes })}
        </button>
      </div>
      {showDetail && createPortal(
        <PollDetailPopup
          pollData={pollData}
          results={results}
          totalVotes={totalVotes}
          onClose={() => setShowDetail(false)}
        />,
        document.body,
      )}
    </>
  );
}

function PollDetailPopup({
  pollData,
  results,
  totalVotes,
  onClose,
}: {
  pollData: { question: string; options: { id: string; text: string }[]; anonymous: boolean };
  results: PollResult[];
  totalVotes: number;
  onClose: () => void;
}) {
  const t = useT();
  const users = useChatStore((s) => s.users);
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[min(90vw,380px)] max-h-[60vh] rounded-2xl border border-line-light bg-surface shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line-light px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-ink-primary truncate">{pollData.question}</div>
            <div className="text-xs text-ink-muted">{totalVotes} {t("message.votes")}{pollData.anonymous ? " · " + t("message.anonymousVote") : ""}</div>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary ml-2"><X className="h-4 w-4" /></button>
        </div>
        <div className="overflow-y-auto max-h-[calc(60vh-52px)] p-4 space-y-4">
          {results.map((r) => {
            const pct = totalVotes > 0 ? (r.count / totalVotes) * 100 : 0;
            return (
              <div key={r.optionId}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-ink-primary">{r.text}</span>
                  <span className="text-xs text-ink-muted">{r.count} {t("message.votes")} ({Math.round(pct)}%)</span>
                </div>
                <div className="h-2 rounded-full bg-surface-soft overflow-hidden mb-1.5">
                  <div className="h-full rounded-full bg-ocean transition-all" style={{ width: `${pct}%` }} />
                </div>
                {!pollData.anonymous && r.voters.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {r.voters.map((v) => (
                      <div key={v.userId} className="flex items-center gap-1.5 rounded-lg bg-surface-soft px-2 py-1">
                        <Avatar user={users[v.userId] ?? { id: v.userId, displayName: v.displayName, avatarColor: "#999", username: "" }} size="xs" />
                        <span className="text-xs text-ink-secondary">{v.displayName}</span>
                      </div>
                    ))}
        </div>
      )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ReadUserListPopup({
  message,
  conversation,
  me,
  onClose,
}: {
  message: Message;
  conversation: Conversation;
  me: PublicUser;
  onClose: () => void;
}) {
  const t = useT();
  const users = useChatStore((s) => s.users);
  const channelReadStates = useChatStore((s) => s.channelReadStates);
  const readsByUser = channelReadStates[conversation.id] ?? {};
  const sentAt = safeDateMs(message.createdAt);

  const readUsers: PublicUser[] = [];
  const unreadUsers: PublicUser[] = [];

  for (const uid of conversation.memberIds) {
    if (uid === me.id) continue;
    const user = users[uid];
    if (!user) continue;
    const r = readsByUser[uid];
    if (r && safeDateMs(r.lastReadAt) >= sentAt) {
      readUsers.push(user);
    } else {
      unreadUsers.push(user);
    }
  }

  return (
    <BottomSheet open={true} title={t("message.seenStatus")} onClose={onClose} bodyClassName="p-4 space-y-3">
      {readUsers.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
            <Eye className="h-3 w-3" /> {t("message.read")} ({readUsers.length})
          </div>
          <div className="space-y-1">
            {readUsers.map((u) => (
              <div key={u.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                <Avatar user={u} size="xs" />
                <span className="text-sm text-ink-primary">{u.displayName}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {unreadUsers.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
            {t("message.unread")} ({unreadUsers.length})
          </div>
          <div className="space-y-1">
            {unreadUsers.map((u) => (
              <div key={u.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 opacity-60">
                <Avatar user={u} size="xs" />
                <span className="text-sm text-ink-primary">{u.displayName}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {readUsers.length === 0 && unreadUsers.length === 0 && (
        <div className="py-4 text-center text-sm text-ink-muted">{t("common.noData")}</div>
      )}
    </BottomSheet>
  );
}

function MessageStatus({
  messageId,
  conversationId,
  pending,
  failed,
  failedReason,
  readDisplay,
  readPopup,
}: {
  messageId: string;
  conversationId: string;
  pending: boolean;
  failed: boolean;
  failedReason?: string;
  readDisplay?: { kind: "channel"; count: number; total: number } | { kind: "dm"; read: boolean } | null;
  readPopup?: { message: Message; conversation: Conversation; me: PublicUser } | null;
}) {
  const t = useT();
  const [showReadList, setShowReadList] = useState(false);
  const retryMessage = useChatStore((s) => s.retryMessage);

  // Per product spec: do NOT show a "已发送" badge for normal successful sends.
  // Only surface status when the message is in-flight, failed, or carries a
  // read-receipt (DM last message / channel reader count).
  if (failed) {
    return (
      <div className="mt-0.5 flex items-center justify-end gap-1.5 text-[10px] text-danger">
        <AlertCircle className="h-3 w-3" />
        <span>{failedReason ? `${t("chat.unsent")} · ${failedReason}` : t("chat.unsent")}</span>
        <button
          type="button"
          onClick={() => retryMessage(messageId, conversationId)}
          className="rounded-full border border-danger/40 px-1.5 py-0.5 text-[9px] font-medium text-danger hover:bg-danger/10 transition-colors"
          title={t("message.retrySend")}
        >
          {t("chat.retry")}
        </button>
      </div>
    );
  }
  if (pending) {
    return (
      <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-ink-muted">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>{t("message.sending")}</span>
      </div>
    );
  }
  if (readDisplay) {
    if (readDisplay.kind === "dm") {
      return (
        <div
          className={cn(
            "mt-0.5 text-right text-[10px]",
            readDisplay.read ? "text-ink-muted" : "text-ocean",
          )}
        >
          {readDisplay.read ? t("message.read") : t("message.unread")}
        </div>
      );
    }
    return (
      <>
        <button
          type="button"
          onClick={() => readPopup && setShowReadList(true)}
          className="mt-0.5 text-right text-[10px] text-ink-muted hover:text-ocean transition-colors cursor-pointer"
        >
          {readDisplay.count}/{readDisplay.total} {t("message.read")}
        </button>
        {showReadList && readPopup && (
          <ReadUserListPopup
            message={readPopup.message}
            conversation={readPopup.conversation}
            me={readPopup.me}
            onClose={() => setShowReadList(false)}
          />
        )}
      </>
    );
  }
  return null;
}

function BubbleBody({ message, isMine, isAI }: { message: Message; isMine: boolean; isAI: boolean }) {
  const t = useT();
  const bodyText = message.localPlaintext ?? message.text ?? "";
  if (message.kind === "friendCard" && message.cardId) {
    return <FriendCardBlock userId={message.cardId} />;
  }
  if (message.kind === "channelCard" && message.cardId) {
    return <ChannelCardBlock channelId={message.cardId} />;
  }
  if (message.kind === "forwardedCard" && message.cardId) {
    return <ForwardedCardBlock forwardId={message.cardId} />;
  }
  if (message.kind === "location") {
    return <LocationBlock text={message.text} />;
  }
  if (message.kind === "poll") {
    if (isMine) {
      return (
        <div className="relative max-w-full rounded-2xl rounded-br-md bg-bubble-mine px-4 py-2.5 text-white shadow-none">
          <PollBlock message={message} isMine={isMine} />
        </div>
      );
    }
    return (
      <div className="max-w-full rounded-2xl rounded-bl-md border border-bubble-border bg-bubble-ai px-4 py-2.5 shadow-none">
        <PollBlock message={message} isMine={isMine} />
      </div>
    );
  }
  if (message.kind === "system") {
    const text = message.text ?? "";
    if (text.startsWith("E2EE_SYSTEM:")) {
      const parsed = parseE2eeSystemMessage(text);
      if (parsed) {
        const reason = parsed.data?.reason;
        let label: string;
        if (parsed.kind === "e2ee_started") {
          label = reason === "peer" ? t("e2ee.sessionStartedByPeer") : t("e2ee.sessionStarted");
        } else {
          label = reason === "timeout" ? t("e2ee.sessionEndedTimeout") : t("e2ee.sessionEnded");
        }
        return (
          <div className="my-2 inline-flex items-center gap-1.5 rounded-full border border-line-light/70 bg-surface-soft/60 px-3 py-1 text-[11px] text-ink-muted select-none">
            <ShieldCheck className="h-3 w-3 text-ocean" />
            <span>{label}</span>
          </div>
        );
      }
    }
    return (
      <div className="my-2 rounded-xl bg-surface-soft/50 px-4 py-2 text-sm italic text-ink-muted select-none">
        {message.text}
      </div>
    );
  }
  if (message.deleted) {
    return (
      <div className="rounded-xl bg-surface-soft/50 px-4 py-2 text-sm italic text-ink-muted select-none">
        {t("chat.recalledMessage")}
      </div>
    );
  }

  if (message.kind === "sticker") {
    const img = message.attachments?.[0];
    return (
      <div>
        <ReplyRef replyToId={message.replyToId} replyTo={message.replyTo} />
        {img && (
          <img
            src={resolveAttachmentUrl(img.url)}
            alt={img.name || t("composer.sticker")}
            className="max-w-[160px] max-h-[160px] rounded-2xl object-contain"
            loading="lazy"
          />
        )}
      </div>
    );
  }

  if (message.kind === "voice") {
    return <VoiceMessageBlock message={message} isMine={isMine} />;
  }

  const hasText = bodyText.trim().length > 0;

  if (isAI) {
    return (
      <div className="relative max-w-full overflow-hidden rounded-2xl border border-aqua/30 bg-bubble-aiAlt p-4 shadow-none">
        <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-brand-gradient opacity-20 blur-3xl" />
        <ReplyRef replyToId={message.replyToId} replyTo={message.replyTo} />
        {message.attachments.length > 0 && <Attachments items={message.attachments} cleaned={!!message.e2eeCleaned} className="mb-2" />}
        {hasText && <div className="max-h-[7.75rem] overflow-y-auto break-words pr-1"><Markdown text={bodyText} /></div>}
      </div>
    );
  }

  const useMarkdown = message.format === "markdown";

  if (isMine) {
    return (
      <div className="relative max-w-full rounded-2xl rounded-br-md bg-bubble-mine px-4 py-2.5 text-white shadow-none">
        <ReplyRef replyToId={message.replyToId} replyTo={message.replyTo} mine />
        {message.attachments.length > 0 && <Attachments items={message.attachments} mine cleaned={!!message.e2eeCleaned} className="mb-2" />}
        {hasText && (
          <div className="max-h-[7.75rem] overflow-y-auto break-words pr-1 text-[15px] leading-relaxed">
            {useMarkdown ? <Markdown text={bodyText} mine /> : <PlainText text={bodyText} mine />}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-full rounded-2xl rounded-bl-md border border-bubble-border bg-bubble-ai px-4 py-2.5 shadow-none">
      <ReplyRef replyToId={message.replyToId} replyTo={message.replyTo} />
      {message.attachments.length > 0 && <Attachments items={message.attachments} cleaned={!!message.e2eeCleaned} className="mb-2" />}
      {hasText && (
        <div className="max-h-[7.75rem] overflow-y-auto break-words pr-1 text-[15px] leading-relaxed text-ink-primary">
          {useMarkdown ? <Markdown text={bodyText} /> : <PlainText text={bodyText} />}
        </div>
      )}
    </div>
  );
}

function ReplyRef({ replyToId, replyTo, mine }: { replyToId?: string; replyTo?: Message["replyTo"]; mine?: boolean }) {
  const t = useT();
  if (!replyToId) return null;
  const users = useChatStore((s) => s.users);
  const messagesByConv = useChatStore((s) => s.messagesByConv);
  let authorName = replyTo?.authorName;
  let snippet = "";
  let thumbnailUrl: string | undefined;
  let isVideoThumb = false;

  if (replyTo) {
    snippet = messagePreview({ kind: replyTo.kind, text: replyTo.text, attachments: replyTo.attachments, cardId: replyTo.cardId } as Message, users);
    const img = replyTo.attachments.find((a) => isImage(a.mimeType));
    const vid = replyTo.attachments.find((a) => isVideo(a.mimeType));
    if (img) {
      thumbnailUrl = resolveAttachmentUrl(img.url);
    } else if (vid) {
      thumbnailUrl = resolveAttachmentUrl(vid.poster);
      isVideoThumb = true;
    }
  } else {
    let replied: Message | undefined;
    for (const msgs of Object.values(messagesByConv)) {
      replied = msgs.find((m) => m.id === replyToId);
      if (replied) break;
    }
    if (replied) {
      authorName = users[replied.authorId]?.displayName ?? t("common.unknown");
      snippet = messagePreview(replied, users);
      const img = replied.attachments.find((a) => isImage(a.mimeType));
      const vid = replied.attachments.find((a) => isVideo(a.mimeType));
      if (img) {
        thumbnailUrl = resolveAttachmentUrl(img.url);
      } else if (vid) {
        thumbnailUrl = resolveAttachmentUrl(vid.poster);
        isVideoThumb = true;
      }
    } else {
      authorName = t("common.unknown");
    }
  }
  const cls = mine
    ? "mb-2 flex w-full items-center border-l-2 border-white/30 pl-2 text-left text-xs text-white/70 transition-colors hover:bg-white/10 rounded-r"
    : "mb-2 flex w-full items-center border-l-2 border-aqua/40 pl-2 text-left text-xs text-ink-muted transition-colors hover:bg-surface-soft rounded-r";
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); jumpToMessage(replyToId); }}
      className={cls}
    >
      {thumbnailUrl && (
        <div className="relative mr-1.5 h-8 w-8 shrink-0 overflow-hidden rounded">
          <img src={resolveAttachmentUrl(thumbnailUrl)} alt="" className="h-full w-full object-cover" />
          {isVideoThumb && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </div>
          )}
        </div>
      )}
      <span className="font-medium shrink-0">{authorName ?? t("common.unknown")}</span>
      {snippet && <span className="ml-1.5 italic truncate inline-block max-w-[160px] align-bottom">{snippet}</span>}
    </button>
  );
}

function FriendCardBlock({ userId }: { userId: string }) {
  const t = useT();
  const user = useChatStore((s) => s.users[userId]);
  const upsertConversation = useChatStore((s) => s.upsertConversation);
  const openConversation = useChatStore((s) => s.openConversation);
  if (!user) return <div className="text-sm text-ink-muted">{t("server.userNotFound")}</div>;

  async function openDM() {
    const conv = await api.createDM({ userId: user!.id });
    upsertConversation(conv);
    // Use the unified open-intent so mobile flips its stack to the chat view
    // rather than silently swapping `selectedId` while the user stares at
    // the same screen.
    openConversation(conv.id);
  }

  return (
    <div className="w-72 rounded-2xl border border-line-light/70 bg-surface p-4 shadow-soft">
      <div className="flex items-center gap-3">
        <Avatar user={user} size="lg" showPresence />
        <div className="min-w-0 flex-1">
          <div className="font-display text-base font-semibold tracking-tight truncate">{user.displayName}</div>
          <div className="text-xs text-ink-muted">@{user.username}</div>
        </div>
      </div>
      {user.bio && <div className="mt-2 text-sm text-ink-secondary line-clamp-2">{user.bio}</div>}
      <button onClick={openDM} className="btn-primary mt-3 w-full gap-1.5">
        <MessageSquare className="h-4 w-4" /> {t("friends.message")}
      </button>
    </div>
  );
}

function ChannelCardBlock({ channelId }: { channelId: string }) {
  const t = useT();
  const conv = useChatStore((s) => s.conversationsById[channelId]);
  const me = useChatStore((s) => s.me);
  const openConversation = useChatStore((s) => s.openConversation);
  const showToast = useChatStore((s) => s.showToast);

  // The card was sent for a channel the recipient isn't a member of (and
  // therefore isn't in their bootstrap). The previous implementation rendered
  // a stub "群组不存在" with no action — which is the bug the user reported as
  // "click does nothing". Fall back to a friendly explanatory state.
  if (!conv || conv.kind !== "channel") {
    return (
      <div className="w-72 rounded-2xl border border-line-light/70 bg-surface p-4 shadow-soft">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-xl">
            <Hash className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-base font-semibold tracking-tight truncate">{t("message.notJoined")}</div>
            <div className="text-xs text-ink-muted">{t("message.notJoinedDesc")}</div>
          </div>
        </div>
        <div className="mt-3 text-xs text-ink-muted">
          {t("message.notJoinedHint")}
        </div>
      </div>
    );
  }

  const isMember = me ? conv.memberIds.includes(me.id) : false;

  function handleOpen() {
    if (!isMember) {
      // Defensive: if for any reason the card is rendered for a non-member
      // (rare race: just been removed), be loud rather than silently failing.
      showToast(t("message.notInChannel"), "error");
      return;
    }
    openConversation(conv!.id);
  }

  return (
    <div className="w-72 rounded-2xl border border-line-light/70 bg-surface p-4 shadow-soft">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-xl">
          {conv.icon ?? (conv.isPrivate ? <Lock className="h-5 w-5" /> : <Hash className="h-5 w-5" />)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-base font-semibold tracking-tight truncate">{conv.name}</div>
          <div className="flex items-center gap-1 text-xs text-ink-muted">
            <Users className="h-3 w-3" />
            {conv.memberIds.length} {t("chat.memberCount")}
            {conv.isPrivate && <span> · {t("channel.private")}</span>}
          </div>
        </div>
      </div>
      {conv.topic && <div className="mt-2 text-sm text-ink-secondary line-clamp-2">{conv.topic}</div>}
      <button onClick={handleOpen} className="btn-primary mt-3 w-full gap-1.5">
        <ExternalLink className="h-4 w-4" />
        {t("message.openChannel")}
      </button>
    </div>
  );
}

function ForwardedCardBlock({ forwardId }: { forwardId: string }) {
  const t = useT();
  const [data, setData] = useState<{
    title: string; sourceConvId: string; sourceConvName: string; sourceConvKind: string;
    createdAt: string;
    items: Array<{
      messageId: string; authorId: string; authorName: string; kind: string;
      text: string; attachments: Attachment[]; createdAt: string;
    }>;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const handleOpen = () => {
    if (data) { setOpen(true); return; }
    setLoading(true);
    api.getForwardedMessages(forwardId)
      .then((d) => { setData(d); setOpen(true); })
      .catch((e) => setError(e instanceof Error ? e.message : t("common.loadFailed")))
      .finally(() => setLoading(false));
  };

  return (
    <>
      <button
        onClick={handleOpen}
        disabled={loading}
        className="group relative w-72 rounded-2xl border border-line-light/70 bg-surface/60 text-left shadow-soft overflow-hidden hover:bg-surface/80 transition-colors"
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-lg">
            <Forward className="h-5 w-5 text-ocean" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-sm font-semibold tracking-tight">{t("chat.forwardCombined")}</div>
            {loading ? (
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                <Loader2 className="h-3 w-3 animate-spin" /> {t("common.loading")}
              </div>
            ) : error ? (
              <div className="mt-0.5 text-xs text-danger">{error}</div>
            ) : (
              <div className="mt-0.5 text-xs text-ink-muted">
                {data ? `${data.items.length} ${t("chat.messages")}` : t("message.clickToView")}
              </div>
            )}
          </div>
          <ChevronRight className="h-4 w-4 text-ink-muted transition-transform group-hover:translate-x-0.5" />
        </div>
      </button>
      {open && data && (
        <ForwardedMessagesModal
          data={data}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ForwardedMessagesModal({
  data,
  onClose,
}: {
  data: {
    title: string; sourceConvId: string; sourceConvName: string; sourceConvKind: string;
    createdAt: string;
    items: Array<{
      messageId: string; authorId: string; authorName: string; kind: string;
      text: string; attachments: Attachment[]; createdAt: string;
    }>;
  };
  onClose: () => void;
}) {
  const t = useT();
  const users = useChatStore((s) => s.users);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  const sourceLabel = data.sourceConvKind === "channel"
    ? t("message.fromChannelName", { name: data.sourceConvName })
    : t("message.fromConversationName", { name: data.sourceConvName });

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-app shadow-2xl sm:h-[92vh] sm:rounded-2xl">
        <header className="flex shrink-0 items-center gap-3 border-b border-line-light/70 bg-surface/80 px-4 py-3 backdrop-blur-xl">
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-soft">
            <X className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-sm font-semibold">{t("chat.forwardCombined")}</h2>
            <p className="truncate text-xs text-ink-muted">{data.items.length} {t("chat.messages")} · {sourceLabel}</p>
          </div>
        </header>
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {data.items.map((item) => {
            const author = Object.values(users).find((u) => u.id === item.authorId);
            return (
              <div key={item.messageId} className="flex gap-2.5">
                <div className="mt-0.5 shrink-0">
                  <Avatar
                    user={author ?? { id: item.authorId, displayName: item.authorName, username: item.authorName, avatarColor: "#6366f1", avatarUrl: undefined, bio: "", gender: "unspecified" as const, status: "offline" as const, lastSeen: "", requireFriendApproval: true, organizationId: undefined, orgTitle: undefined }}
                    size="sm"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium text-ink-secondary">{item.authorName}</span>
                    <span className="text-[10px] text-ink-muted">{new Date(item.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="mt-0.5">
                    <ForwardedItemContent item={item} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}

function ForwardedItemContent({ item }: {
  item: {
    messageId: string; authorId: string; authorName: string; kind: string;
    text: string; attachments: Attachment[]; createdAt: string;
  };
}) {
  const t = useT();
  const showImages = useViewer((s) => s.show);

  if (item.kind === "location" && item.text) {
      try {
        const loc = JSON.parse(item.text);
        return (
          <div className="mt-1 flex items-center gap-1.5 rounded-lg bg-surface-soft px-2 py-1.5 text-xs text-ink-secondary">
            <MapPin className="h-3 w-3 shrink-0 text-ocean" />
            <span className="truncate">{loc.name || loc.address || `${loc.latitude}, ${loc.longitude}`}</span>
          </div>
        );
      } catch {
        return <div className="mt-0.5 text-sm text-ink-secondary line-clamp-2">{item.text}</div>;
      }
    }

    if (item.kind === "friendCard" || item.kind === "channelCard") {
      return (
        <div className="mt-1 flex items-center gap-1.5 rounded-lg bg-surface-soft px-2 py-1.5 text-xs text-ink-secondary">
          {item.kind === "friendCard" ? <Users className="h-3 w-3 shrink-0 text-ocean" /> : <Hash className="h-3 w-3 shrink-0 text-ocean" />}
          <span className="truncate">{item.text || (item.kind === "friendCard" ? t("message.card.friend") : t("message.card.channel"))}</span>
        </div>
      );
    }

    if (item.kind === "image" && item.attachments.length > 0) {
      const img = item.attachments[0];
      return (
        <div
          className="mt-1 cursor-pointer overflow-hidden rounded-lg"
          onClick={(e) => {
            e.stopPropagation();
            showImages(item.attachments.map((a) => ({ url: resolveAttachmentUrl(a.url), name: a.name })));
          }}
        >
          <img
            src={resolveAttachmentUrl(img.url)}
            alt={img.name}
            className="max-h-28 w-auto object-cover transition-transform hover:scale-[1.02]"
            loading="lazy"
          />
          {item.text && <div className="px-1 pt-1 text-xs text-ink-secondary whitespace-pre-wrap break-words">{item.text}</div>}
        </div>
      );
    }

    if (item.kind === "sticker" && item.attachments.length > 0) {
      const img = item.attachments[0];
      return (
        <div className="mt-1">
          <img src={resolveAttachmentUrl(img.url)} alt={img.name || t("composer.sticker")} className="max-w-[120px] max-h-[120px] rounded-xl object-contain" loading="lazy" />
        </div>
      );
    }

    if (item.kind === "file" && item.attachments.length > 0) {
      const file = item.attachments[0];
      return (
        <button
          onClick={(e) => {
            e.stopPropagation();
            void downloadAttachment(resolveAttachmentUrl(file.url), file.name);
          }}
          className="mt-1 flex w-full items-center gap-2 rounded-lg bg-surface-soft px-2 py-1.5 text-xs text-ink-secondary hover:bg-surface"
        >
          <FileText className="h-3 w-3 shrink-0" />
          <span className="truncate">{file.name}</span>
          {file.size > 0 && <span className="shrink-0 text-ink-muted">{formatBytes(file.size)}</span>}
          <Download className="ml-auto h-3 w-3 shrink-0 text-ocean" />
        </button>
      );
    }

    if (item.kind === "forwardedCard") {
      return (
        <div className="mt-1 flex items-center gap-1.5 rounded-lg bg-surface-soft px-2 py-1.5 text-xs text-ink-secondary">
          <Forward className="h-3 w-3 shrink-0 text-ocean" />
          <span className="truncate">{item.text || t("message.card.forwarded")}</span>
        </div>
      );
    }

    if (item.kind === "system") {
      return (
        <div className="mt-0.5 text-xs italic text-ink-muted">{item.text}</div>
      );
    }

    if (item.text) {
      return <div className="mt-0.5 text-sm text-ink-secondary whitespace-pre-wrap break-words">{item.text}</div>;
    }

    if (item.attachments.length > 0) {
      const a = item.attachments[0];
      if (a.mimeType?.startsWith("video/")) {
        return (
          <div className="mt-1 overflow-hidden rounded-lg">
            <video
              src={resolveAttachmentUrl(a.url)}
              poster={resolveAttachmentUrl(a.poster)}
              controls
              preload="metadata"
              className="max-h-28 w-auto"
            />
          </div>
        );
      }
      return (
        <div className="mt-1 flex items-center gap-1.5 rounded-lg bg-surface-soft px-2 py-1.5 text-xs text-ink-secondary">
          <FileText className="h-3 w-3 shrink-0" />
          <span className="truncate">{a.name}</span>
        </div>
      );
    }

    return null;
}

const AMAP_KEY = "ee95e52bf08006f63fd29bcfbcf21df0";

interface LocationPayload {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

function parseLocationPayload(text: string): LocationPayload | null {
  try {
    const obj = JSON.parse(text);
    if (
      obj &&
      typeof obj === "object" &&
      typeof obj.latitude === "number" &&
      typeof obj.longitude === "number"
    ) {
      return {
        latitude: obj.latitude,
        longitude: obj.longitude,
        name: typeof obj.name === "string" ? obj.name : undefined,
        address: typeof obj.address === "string" ? obj.address : undefined,
      };
    }
  } catch {
    /* fall through */
  }
  return null;
}

function LocationBlock({ text }: { text: string }) {
  const t = useT();
  const loc = parseLocationPayload(text);
  const showLocation = useViewer((s) => s.showLocation);
  if (!loc) {
    return <div className="text-sm text-ink-secondary">{t("message.invalidLocation")}</div>;
  }
  const staticMap = `https://restapi.amap.com/v3/staticmap?location=${loc.longitude},${loc.latitude}&zoom=15&size=300*180&markers=mid,,A:${loc.longitude},${loc.latitude}&key=${AMAP_KEY}`;
  return (
    <button
      type="button"
      onClick={() => showLocation(loc)}
      className="group block w-[260px] overflow-hidden rounded-xl border border-line-light/70 text-left transition-transform hover:scale-[1.01]"
    >
      <div className="relative aspect-[5/3] w-full bg-surface-soft">
        <img
          src={staticMap}
          alt={loc.name ?? t("media.location")}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
      <div className="flex items-center gap-1.5 bg-surface px-3 py-2">
        <MapPin className="h-3.5 w-3.5 text-ocean" />
        <span className="truncate text-xs font-medium text-ink-primary">
          {loc.name ?? loc.address ?? t("media.location")}
        </span>
      </div>
    </button>
  );
}

function VoiceMessageBlock({ message, isMine }: { message: Message; isMine: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audio = message.attachments?.[0];

  // 优先使用服务端预提取的 duration，否则才回退到运行时解析
  const preDuration = audio?.duration;
  const [runtimeDuration, setRuntimeDuration] = useState(0);
  const duration = preDuration && preDuration > 0 ? preDuration : runtimeDuration;
  const loaded = preDuration ? preDuration > 0 : runtimeDuration > 0;

  useEffect(() => {
    if (!audio) return;
    // 若服务端已提供 duration，仍需 audio 元素以播放
    const el = new Audio(resolveAttachmentUrl(audio.url));
    el.preload = "metadata";
    if (!preDuration) {
      const onMeta = () => {
        if (isFinite(el.duration) && el.duration > 0) setRuntimeDuration(el.duration);
      };
      el.onloadedmetadata = onMeta;
      el.oncanplay = onMeta;
      el.onloadeddata = onMeta;
    }
    el.ontimeupdate = () => setCurrentTime(el.currentTime);
    el.onended = () => { setPlaying(false); setCurrentTime(0); };
    audioRef.current = el;
    return () => { el.pause(); el.src = ""; };
  }, [audio?.url, preDuration]);

  function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  }

  if (!audio) return null;

  const pct = duration > 0 && isFinite(duration) ? (currentTime / duration) * 100 : 0;
  const remaining = Math.floor(duration - currentTime);
  const displaySec = playing ? (remaining > 0 && isFinite(remaining) ? remaining : 0) : Math.floor(duration);
  const showDuration = loaded && duration > 0 && isFinite(duration);

  return (
    <div
      className={cn(
        "flex w-56 cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 select-none transition-shadow hover:shadow-sm",
        isMine
          ? "bg-bubble-mine text-white"
          : "border border-bubble-border bg-bubble-ai text-ink-primary",
      )}
      onClick={toggle}
    >
      <button
        onClick={(e) => { e.stopPropagation(); toggle(); }}
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-full transition-transform active:scale-90",
          isMine ? "bg-white/20 hover:bg-white/30" : "bg-ocean/10 hover:bg-ocean/20",
        )}
      >
        {playing ? (
          <div className="flex items-end gap-[3px] h-5 px-0.5">
            {[0.3, 0.6, 1, 0.5, 0.8].map((h, i) => (
              <span
                key={i}
                className="w-[3px] rounded-full bg-current"
                style={{
                  height: `${h * 100}%`,
                  animation: `voicebar 0.5s ease-in-out ${i * 0.08}s infinite alternate`,
                }}
              />
            ))}
          </div>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5 ml-0.5" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="relative h-1 rounded-full overflow-hidden" style={{ background: isMine ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.08)" }}>
          <div
            className="absolute left-0 top-0 h-full rounded-full transition-all duration-200"
            style={{
              width: `${pct}%`,
              background: isMine ? "rgba(255,255,255,0.7)" : "currentColor",
              opacity: 0.6,
            }}
          />
        </div>
      </div>
      <span className="text-xs tabular-nums font-medium opacity-70 min-w-[2.5rem] text-right">
        {showDuration ? `${displaySec}″` : "··″"}
      </span>
    </div>
  );
}

function FileDetailsModal({
  attachment,
  onClose,
}: {
  attachment: NonNullable<Message["attachments"]>[number];
  onClose: () => void;
}) {
  const t = useT();
  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-black/50 backdrop-blur-sm md:items-center"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col rounded-t-2xl bg-surface shadow-2xl md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line-light px-4 py-3">
          <div className="text-base font-semibold text-ink-primary">{t("fileDetails.title")}</div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-soft hover:text-ink-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-line-light bg-surface-soft p-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-ocean/10 text-ocean">
              <FileText className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink-primary">{attachment.name}</div>
              <div className="mt-0.5 text-[11px] text-ink-muted">{attachment.mimeType}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-surface-soft p-2">
              <div className="text-ink-muted">{t("fileDetails.size")}</div>
              <div className="mt-0.5 font-medium text-ink-primary">{formatBytes(attachment.size)}</div>
            </div>
            {attachment.width && attachment.height && (
              <div className="rounded-lg bg-surface-soft p-2">
                <div className="text-ink-muted">{t("fileDetails.dimensions")}</div>
                <div className="mt-0.5 font-medium text-ink-primary">
                  {attachment.width} × {attachment.height}
                </div>
              </div>
            )}
            {attachment.duration && (
              <div className="rounded-lg bg-surface-soft p-2">
                <div className="text-ink-muted">{t("fileDetails.duration")}</div>
                <div className="mt-0.5 font-medium text-ink-primary">
                  {Math.floor(attachment.duration / 60)}:{String(Math.floor(attachment.duration % 60)).padStart(2, "0")}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 border-t border-line-light px-4 py-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-line-light/70 bg-surface px-4 py-2.5 text-sm font-medium text-ink-secondary hover:bg-surface-soft"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={() => {
              void downloadAttachment(resolveAttachmentUrl(attachment.url), attachment.name);
              onClose();
            }}
            className="flex-1 rounded-xl bg-ocean px-4 py-2.5 text-sm font-medium text-white hover:bg-ocean/90"
          >
            <Download className="mr-1.5 inline-block h-4 w-4" />
            {t("fileDetails.download")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Attachments({
  items,
  mine,
  cleaned,
  className,
}: {
  items: Message["attachments"];
  mine?: boolean;
  /** E2EE 已退出，文件已被服务器清理——显示占位。 */
  cleaned?: boolean;
  className?: string;
}) {
  const t = useT();
  const show = useViewer((s) => s.show);
  const showVideo = useViewer((s) => s.showVideo);
  const [detailsAttachment, setDetailsAttachment] = useState<NonNullable<Message["attachments"]>[number] | null>(null);
  const images = items
    .filter((a) => isImage(a.mimeType))
    .map((a) => ({ url: resolveAttachmentUrl(a.url), name: a.name }));
  const videos = items
    .filter((a) => isVideo(a.mimeType))
    .map((a) => ({ url: resolveAttachmentUrl(a.url), name: a.name, mimeType: a.mimeType }));

  if (cleaned) {
    // E2EE 文件已被清理：Navo 占位 + 红色提示
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-danger/30 bg-danger/5 p-4">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-ocean to-opera shadow-soft">
          <svg viewBox="0 0 64 64" className="h-8 w-8 text-white" fill="none" aria-hidden>
            <path
              d="M16 46V18l16 18V18l16 18v10"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="text-xs text-danger">{t("e2ee.fileCleaned")}</div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {items.map((a) => {
        if (isImage(a.mimeType)) {
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => show(images, images.findIndex((x) => x.url === resolveAttachmentUrl(a.url)))}
              className="block overflow-hidden rounded-xl border border-line-light/70 transition-transform hover:scale-[1.01]"
            >
              <img src={resolveAttachmentUrl(a.url)} alt={a.name} className="max-h-80 max-w-full object-cover" loading="lazy" />
            </button>
          );
        }
        if (isVideo(a.mimeType)) {
          return (
            <button
              key={a.id}
              type="button"
              onClick={() =>
                showVideo(videos, videos.findIndex((x) => x.url === resolveAttachmentUrl(a.url)))
              }
              className="group relative block overflow-hidden rounded-xl border border-line-light/70"
            >
              {a.poster ? (
                <img
                  src={resolveAttachmentUrl(a.poster)}
                  alt={a.name}
                  className="max-h-80 max-w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex max-h-80 max-w-[320px] flex-col items-center justify-center gap-2 bg-surface-soft p-6 text-center text-ink-muted">
                  <img
                    src="/navo.svg"
                    alt=""
                    aria-hidden
                    className="h-16 w-16 opacity-80"
                  />
                  <div className="truncate text-xs">{a.name}</div>
                </div>
              )}
              <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/30 transition-opacity group-hover:bg-black/40">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-white/85 text-ocean shadow-soft">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
              <div className="pointer-events-none absolute bottom-1.5 right-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {formatBytes(a.size)}
              </div>
            </button>
          );
        }
        // 统一文件/音频/其他二进制：点击先弹文件详情模态框
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => setDetailsAttachment(a)}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors",
              mine
                ? "border-white/30 bg-white/10 text-white hover:bg-white/15"
                : "border-line-light bg-surface-soft text-ink-primary hover:bg-surface",
            )}
          >
            <FileText className={cn("h-5 w-5 shrink-0", mine ? "text-white/90" : "text-ocean")} />
            <div className="min-w-0 flex-1">
              <div className={cn("truncate font-medium", mine && "text-white")}>{a.name}</div>
              <div className={cn("text-[11px]", mine ? "text-white/70" : "text-ink-muted")}>
                {formatBytes(a.size)}
              </div>
            </div>
            <Download className={cn("h-4 w-4", mine ? "text-white/80" : "text-ink-muted")} />
          </button>
        );
      })}
      {detailsAttachment && (
        <FileDetailsModal
          attachment={detailsAttachment}
          onClose={() => setDetailsAttachment(null)}
        />
      )}
    </div>
  );
}

const ORG_GRADIENTS = [
  "from-pink-500 to-rose-500",
  "from-purple-500 to-indigo-500",
  "from-blue-500 to-cyan-500",
  "from-teal-500 to-emerald-500",
  "from-orange-500 to-amber-500",
  "from-fuchsia-500 to-pink-500",
  "from-violet-500 to-purple-500",
  "from-sky-500 to-blue-500",
];

function OrgBadge({ orgId, title }: { orgId: string; title?: string }) {
  const [orgName, setOrgName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getOrgDisplayPath(orgId).then((name) => {
      if (!cancelled && name) setOrgName(name);
    });
    return () => { cancelled = true; };
  }, [orgId]);
  if (!orgName) return null;
  const idx = orgName.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const gradient = ORG_GRADIENTS[idx % ORG_GRADIENTS.length];
  return (
    <span className={`inline-flex items-center rounded-full bg-gradient-to-r ${gradient} px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm`}>
      {orgName}{title ? ` · ${title}` : ""}
    </span>
  );
}

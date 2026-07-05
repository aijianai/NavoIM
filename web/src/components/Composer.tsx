import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Paperclip, Send, Smile, Image as ImageIcon, Hash, X, Reply, Plus, UserPlus, Radio, MapPin, Phone, Video, Clock, FileText, Vote, Trash2, ShieldAlert, Loader2, Mic, MicOff } from "lucide-react";
import { useChatStore } from "../lib/store";
import { wsClient } from "../lib/ws-client";
import { api } from "../lib/api";
import { useLocationPicker, type LocationPayload } from "../lib/location-picker";
import { Avatar } from "./Avatar";
import { useT } from "../lib/i18n";
import { useE2eeStore } from "../lib/e2ee-manager";
import { EMOJI_TOKEN_RE, cn, emojiUrl, formatBytes, isImage, messagePreview, normalizeEmojiTokens, resolveAttachmentUrl } from "../lib/utils";
import { StickerPicker } from "./StickerPicker";
import { startAutoReadTimer } from "../lib/auto-read";
import type { Attachment, CallKind, Conversation, Message, PollOption, PublicUser } from "@navo/shared";

const EMOJIS_FALLBACK = ["😀", "😂", "🥰", "😎", "🤔", "👀", "👍", "👏", "🙏", "🎉", "🔥", "✨", "💡", "❤️", "🚀", "🌊", "🛠️", "🎨", "🥳", "💯"];

interface ComposerProps {
  conversationId: string;
  replyTo?: Message | null;
  onClearReply?: () => void;
  compact?: boolean;
  /** Called when the user taps "语音通话" or "视频通话" in the + menu. */
  onCallInvite?: (kind: CallKind) => void;
}

interface PendingFile {
  localId: string;
  file: File;
  previewUrl?: string;
  status: "uploading" | "done" | "error";
  attachment?: Attachment;
}

type CardMode = { kind: "user" } | { kind: "channel" } | null;
const MAX_TEXT_LENGTH = 100_000;

function emojiTokenAt(text: string, index: number): { start: number; end: number } | null {
  EMOJI_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EMOJI_TOKEN_RE.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (index >= start && index <= end) return { start, end };
  }
  return null;
}

export function Composer({ conversationId, replyTo, onClearReply, compact, onCallInvite }: ComposerProps) {
  const t = useT();
  const [text, setText] = useState<string>(() => useChatStore.getState().drafts[conversationId] ?? "");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pendingUploads, setPendingUploads] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [cardMode, setCardMode] = useState<CardMode>(null);
  const [cardQuery, setCardQuery] = useState("");
  const [toolMenuOpen, setToolMenuOpen] = useState(false);
  const [sendMenuOpen, setSendMenuOpen] = useState(false);
  const [scheduledTime, setScheduledTime] = useState("");
  const [showScheduledPicker, setShowScheduledPicker] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [banStatus, setBanStatus] = useState<{ banned: boolean; reason?: string; type: "user" | "channel" } | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  // Poll draft state — backed by store for persistence across refreshes
  const pollDrafts = useChatStore((s) => s.pollDrafts);
  const setPollDraft = useChatStore((s) => s.setPollDraft);
  const clearPollDraft = useChatStore((s) => s.clearPollDraft);
  const pollDraft = pollDrafts[conversationId] ?? { question: "", options: ["", ""], anonymous: false };
  const pollQuestion = pollDraft.question;
  const pollOptions = pollDraft.options;
  const pollAnonymous = pollDraft.anonymous;

  const users = useChatStore((s) => s.users);
  const me = useChatStore((s) => s.me);
  const conversations = useChatStore((s) => s.conversations);
  const conversationsById = useChatStore((s) => s.conversationsById);
  const appendMessage = useChatStore((s) => s.appendMessage);
  // 当前会话是否处于 E2EE 模式
  const e2eeActive = useE2eeStore((s) => !!s.active[conversationId]);
  const setDraft = useChatStore((s) => s.setDraft);
  const clearDraft = useChatStore((s) => s.clearDraft);
  const openLocationPicker = useLocationPicker((s) => s.openPicker);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<number | null>(null);
  const typingActiveRef = useRef<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const sendMenuRef = useRef<HTMLDivElement>(null);
  const sendLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const conv = conversationsById[conversationId];
  const isChannel = conv?.kind === "channel";

  useEffect(() => {
    setText(normalizeEmojiTokens(useChatStore.getState().drafts[conversationId] ?? ""));
    setAttachments([]);
    // revoke any pending blob URLs
    for (const p of pendingUploads) { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); }
    setPendingUploads([]);
    setError(null);
    setEmojiOpen(false);
    setMentionQuery(null);
    setCardMode(null);
    setToolMenuOpen(false);
    setBanStatus(null);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingActiveRef.current = false;
  }, [conversationId]);

  useEffect(() => {
    let cancelled = false;
    api.getConversationBanStatus(conversationId).then((res) => {
      if (!cancelled) setBanStatus(res);
    }).catch(() => {
      if (!cancelled) setBanStatus({ banned: false, type: "channel" });
    });
    return () => { cancelled = true; };
  }, [conversationId]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [text]);

  useEffect(() => {
    function click(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setToolMenuOpen(false);
      if (sendMenuRef.current && !sendMenuRef.current.contains(e.target as Node)) setSendMenuOpen(false);
    }
    document.addEventListener("mousedown", click);
    return () => document.removeEventListener("mousedown", click);
  }, []);

  // iOS Safari: when keyboard opens, scroll message list to show the latest message
  const onComposerFocus = useCallback(() => {
    // Wait for iOS keyboard to finish its animation, then scroll to bottom
    setTimeout(() => {
      // Find the message scroller and scroll to bottom
      const scroller = document.querySelector('[data-role="chat-scroller"]');
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
      composerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 400);
  }, []);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      if (document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "INPUT") {
        const scroller = document.querySelector('[data-role="chat-scroller"]');
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
      }
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();

    const allLabel = t("composer.everyone");
    const showAll =
      !q ||
      "all".startsWith(q) ||
      allLabel.startsWith(q);

    const members = conv
      ? conv.memberIds
          .map((id) => users[id])
          .filter(Boolean)
          .filter((u) => u.id !== me?.id)
          .filter((u) => !q || u.displayName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q))
          .slice(0, 6)
      : [];

    if (showAll) {
      return [{ isAll: true as const, displayName: allLabel }, ...members];
    }
    return members;
  }, [mentionQuery, conv, users, me]);

  const cardMatches = useMemo(() => {
    if (!cardMode) return [];
    const q = cardQuery.toLowerCase();
    if (cardMode.kind === "user") {
      // Only allow forwarding *current* friends as friend-cards. The picker
      // intentionally excludes pending/blocked/non-friend contacts so the
      // user can't even see them as a candidate.
      const friends = useChatStore.getState().friends;
      const friendIds = new Set(
        friends.filter((f) => f.status === "accepted" && !f.blockedByMe).map((f) => f.userId),
      );
      return Object.values(users)
        .filter((u) => u.id !== me?.id && u.username !== "navo_ai")
        .filter((u) => friendIds.has(u.id))
        .filter((u) => !q || u.displayName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q))
        .slice(0, 6);
    }
    return conversations
      .filter((c) => c.kind === "channel" && !c.isPrivate)
      .filter((c) => !q || (c.name ?? "").toLowerCase().includes(q))
      .slice(0, 6);
  }, [cardMode, cardQuery, users, me, conversations]);

  const onTextChange = useCallback((v: string) => {
    v = normalizeEmojiTokens(v).slice(0, MAX_TEXT_LENGTH);
    setText(v);
    // Persist the draft so it survives reloads and shows up as a
    // t("chat.draft") preview in the conversation list. Empty text clears it.
    setDraft(conversationId, v);
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      wsClient.send({ type: "typing:start", conversationId });
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => {
      typingActiveRef.current = false;
      wsClient.send({ type: "typing:stop", conversationId });
    }, 1500);
    const atIdx = v.lastIndexOf("@");
    if (atIdx >= 0) {
      const after = v.slice(atIdx + 1);
      if (!after.includes(" ") && !after.includes("\n") && (atIdx === 0 || v[atIdx - 1] === " " || v[atIdx - 1] === "\n")) {
        setMentionQuery(after);
        return;
      }
    }
    setMentionQuery(null);
  }, [conversationId]);

  function insertMention(user: PublicUser | { isAll: true; displayName: string }) {
    if (mentionQuery === null) return;
    const atIdx = text.lastIndexOf("@");
    if (atIdx < 0) return;
    const before = text.slice(0, atIdx);
    const after = text.slice(atIdx + mentionQuery.length + 1);
    setText(before + "@" + user.displayName + " " + after);
    setMentionQuery(null);
    textareaRef.current?.focus();
  }

  function insertEmoji(emoji: string) {
    const token = emoji.startsWith("[emoji:") ? emoji : `[emoji:${emoji.replace(/^webp:/, "")}]`;
    const ta = textareaRef.current;
    const start = ta?.selectionStart ?? text.length;
    const end = ta?.selectionEnd ?? text.length;
    const next = (text.slice(0, start) + token + text.slice(end)).slice(0, MAX_TEXT_LENGTH);
    setText(next);
    setDraft(conversationId, next);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function uploadFiles(files: FileList | File[]) {
    setError(null);
    setUploading(true);
    const accepted = Array.from(files);
    if (accepted.length === 0) {
      setUploading(false);
      return;
    }
    const uploadOpts = e2eeActive ? { e2eeConversationId: conversationId } : undefined;
    const pendings: PendingFile[] = accepted.map((f) => ({
      localId: "upload_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      file: f,
      previewUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
      status: "uploading" as const,
    }));
    setPendingUploads((prev) => [...prev, ...pendings]);
    try {
      for (const pf of pendings) {
        const att = await api.upload(pf.file, uploadOpts);
        setPendingUploads((prev) => prev.filter((p) => p.localId !== pf.localId));
        setAttachments((prev) => [...prev, att]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("error.uploadFailed");
      setError(msg.includes("nsfw") ? t("nsfw.rejected") : msg);
      setPendingUploads((prev) =>
        prev.map((p) => (p.status === "uploading" ? { ...p, status: "error" as const } : p))
      );
    } finally {
      setUploading(false);
    }
  }

  async function uploadAndSendImmediate(files: File[]) {
    if (!me || files.length === 0) return;
    setError(null);
    setUploading(true);
    const uploadOpts = e2eeActive ? { e2eeConversationId: conversationId } : undefined;
    try {
      const uploaded: Attachment[] = [];
      for (const file of files) {
        const att = await api.upload(file, uploadOpts);
        uploaded.push(att);
      }
      const clientId = "c_local_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      const firstMime = uploaded[0]?.mimeType ?? "";
      const kind = firstMime.startsWith("image/") ? "image" : firstMime.startsWith("audio/") ? "voice" : "file";
      const optimistic: Message = {
        id: clientId,
        conversationId,
        authorId: me.id,
        kind,
        text: " ",
        attachments: uploaded,
        reactions: [],
        createdAt: new Date().toISOString(),
        pending: true,
        ...(e2eeActive ? { e2ee: true } : {}),
      };
      appendMessage(optimistic, clientId);
      wsClient.send({
        type: "message:send",
        clientId,
        payload: { conversationId, text: "", attachments: uploaded, kind, e2ee: e2eeActive },
      });
      startAutoReadTimer(conversationId, clientId, kind, me.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("error.uploadFailed");
      setError(msg.includes("nsfw") ? t("nsfw.rejected") : msg);
    } finally {
      setUploading(false);
    }
  }

  function stopRecording(cancelled = false) {
    cancelledRef.current = cancelled;
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      mr.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (audioStream) {
      audioStream.getTracks().forEach((t) => t.stop());
      setAudioStream(null);
    }
    setRecording(false);
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setAudioStream(stream);
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        if (cancelledRef.current) return;
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const ext = mimeType.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: mimeType });
        void uploadAndSendImmediate([file]);
      };
      mr.start(250);
      setRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev >= 60) {
            stopRecording(true);
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      setError(t("error.microphoneDenied"));
    }
  }

  function handleRecordStart() {
    if (recording || uploading || banStatus?.banned) return;
    void startRecording();
  }

  function handleRecordEnd() {
    if (recording) stopRecording();
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length === 0) return;
    e.preventDefault();
    void uploadAndSendImmediate(files);
  }

  // Document-level paste listener: even when the textarea is not focused, if
  // the user pastes files (image from screenshot tool, files copied in
  // Finder/Explorer), auto-upload immediately.
  useEffect(() => {
    function onDocPaste(e: ClipboardEvent) {
      // Avoid double-handling when textarea already received the event.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return;
      const items = e.clipboardData?.items;
      if (!items || items.length === 0) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length === 0) return;
      e.preventDefault();
      // Use store state directly to avoid stale closures
      const currentConvId = useChatStore.getState().selectedId;
      if (!currentConvId) return;
      void uploadAndSendImmediate(files);
    }
    document.addEventListener("paste", onDocPaste);
    return () => document.removeEventListener("paste", onDocPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openLocation() {
    if (!me) return;
    setError(null);
    openLocationPicker((loc: LocationPayload) => {
      const payload = JSON.stringify(loc);
      const clientId = "c_local_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      const optimistic: Message = {
        id: clientId,
        conversationId,
        authorId: me.id,
        kind: "location",
        text: payload,
        attachments: [],
        reactions: [],
        replyToId: replyTo?.id,
        createdAt: new Date().toISOString(),
        pending: true,
      };
      appendMessage(optimistic, clientId);
      wsClient.send({
        type: "message:send",
        clientId,
        payload: { conversationId, text: payload, kind: "location", replyToId: replyTo?.id, e2ee: e2eeActive },
      });
      setText("");
      clearDraft(conversationId);
      onClearReply?.();
      startAutoReadTimer(conversationId, clientId, "location", me.id);
    });
  }

  function send() {
    const safeText = normalizeEmojiTokens(text).slice(0, MAX_TEXT_LENGTH);
    if (safeText !== text) setText(safeText);
    const trimmed = safeText.trim();
    if (!trimmed && attachments.length === 0) return;
    if (!me) return;
    const conv = conversationsById[conversationId];
    // Optimistic local block check for DM: do not even attempt to send if we
    // know we've blocked the other party (or vice-versa).
    if (conv?.kind === "dm") {
      const otherId = conv.memberIds.find((id) => id !== me.id);
      if (otherId) {
        const friends = useChatStore.getState().friends;
        const f = friends.find((x) => x.userId === otherId);
        const iBlocked = !!f?.blockedByMe;
        if (iBlocked) {
          const clientId = "c_local_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
          const failedMsg: Message = {
            id: clientId,
            conversationId,
            authorId: me.id,
            kind: "text",
            text: trimmed,
            attachments,
            reactions: [],
            replyToId: replyTo?.id,
            createdAt: new Date().toISOString(),
            pending: false,
            failed: true,
            failedReason: t("server.blockedByYou"),
          };
          appendMessage(failedMsg, clientId);
          setText("");
          setAttachments([]);
          onClearReply?.();
          useChatStore.getState().showToast(t("server.blockedByYou"), "error");
          return;
        }
      }
    }
    const clientId = "c_local_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    const optimistic: Message = {
      id: clientId,
      conversationId,
      authorId: me.id,
      kind: "text",
      text: trimmed,
      attachments,
      reactions: [],
      replyToId: replyTo?.id,
      createdAt: new Date().toISOString(),
      pending: true,
      ...(e2eeActive ? { e2ee: true, localPlaintext: trimmed } : {}),
    };
    appendMessage(optimistic, clientId);
    wsClient.send({
      type: "message:send",
      clientId,
      payload: { conversationId, text: trimmed, attachments, replyToId: replyTo?.id, e2ee: e2eeActive },
    });
    setText("");
    clearDraft(conversationId);
    setAttachments([]);
    onClearReply?.();
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      if (typingTimer.current) clearTimeout(typingTimer.current);
      wsClient.send({ type: "typing:stop", conversationId });
    }
    startAutoReadTimer(conversationId, clientId, "text", me.id);
  }

  function sendSticker(stickerId: string, fileUrl: string) {
    if (!me) return;
    const clientId = "c_local_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    const attId = "a_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    const optimistic: Message = {
      id: clientId,
      conversationId,
      authorId: me.id,
      kind: "sticker",
      text: "",
      attachments: [{ id: attId, name: "sticker", url: fileUrl, mimeType: "image/png", size: 0 }],
      reactions: [],
      stickerId,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    appendMessage(optimistic, clientId);
    wsClient.send({
      type: "message:send",
      clientId,
      payload: { conversationId, text: "", kind: "sticker", stickerId, attachments: [{ id: attId, name: "sticker", url: fileUrl, mimeType: "image/png", size: 0 }], e2ee: e2eeActive },
    });
    startAutoReadTimer(conversationId, clientId, "sticker", me.id);
  }

  function sendScheduled() {
    if (!scheduledTime) return;
    const safeText = normalizeEmojiTokens(text).slice(0, MAX_TEXT_LENGTH);
    const trimmed = safeText.trim();
    if (!trimmed && attachments.length === 0) return;
    if (!me) return;
    const scheduledAt = new Date(scheduledTime).toISOString();
    if (new Date(scheduledTime).getTime() <= Date.now()) {
      useChatStore.getState().showToast(t("composer.scheduleInFuture"), "error");
      return;
    }
    const clientId = "c_sched_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    // Show optimistic message immediately so user sees it scheduled
    const optimistic: Message = {
      id: clientId,
      conversationId,
      authorId: me.id,
      kind: attachments.length > 0 && !trimmed ? "image" : "text",
      text: trimmed || " ",
      attachments,
      reactions: [],
      replyToId: replyTo?.id,
      createdAt: new Date().toISOString(),
      scheduledAt,
      pending: true,
    };
    useChatStore.getState().appendMessage(optimistic, clientId);
    // Send to server with scheduledAt — server holds it until the target time
    import("../lib/ws-client").then(({ wsClient }) => {
      wsClient.send({
        type: "message:send",
        clientId,
        payload: {
          conversationId,
          text: trimmed,
          attachments,
          replyToId: replyTo?.id,
          scheduledAt,
          e2ee: e2eeActive,
        },
      });
    });
    const lang = useChatStore.getState().language || "zh-CN";
    useChatStore.getState().showToast(t("composer.scheduleSet", { time: new Date(scheduledTime).toLocaleString(lang) }));
    setText("");
    clearDraft(conversationId);
    setAttachments([]);
    onClearReply?.();
    setShowScheduledPicker(false);
    setScheduledTime("");
    setSendMenuOpen(false);
    startAutoReadTimer(conversationId, clientId, attachments.length > 0 && !trimmed ? "image" : "text", me.id);
  }

  function sendMarkdown() {
    const safeText = normalizeEmojiTokens(text).slice(0, MAX_TEXT_LENGTH);
    const trimmed = safeText.trim();
    if (!trimmed && attachments.length === 0) return;
    if (!me) return;
    const clientId = "c_local_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    const optimistic: Message = {
      id: clientId,
      conversationId,
      authorId: me.id,
      kind: "ai",
      format: "markdown",
      text: trimmed,
      attachments,
      reactions: [],
      replyToId: replyTo?.id,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    appendMessage(optimistic, clientId);
    wsClient.send({
      type: "message:send",
      clientId,
      payload: { conversationId, text: trimmed, attachments, kind: "ai", format: "markdown", replyToId: replyTo?.id, e2ee: e2eeActive },
    });
    setText("");
    clearDraft(conversationId);
    setAttachments([]);
    onClearReply?.();
    setSendMenuOpen(false);
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      if (typingTimer.current) clearTimeout(typingTimer.current);
      wsClient.send({ type: "typing:stop", conversationId });
    }
    startAutoReadTimer(conversationId, clientId, "ai", me.id);
  }

  function createPoll() {
    if (!me) return;
    const conv = conversationsById[conversationId];
    if (!conv || conv.kind !== "channel") {
      useChatStore.getState().showToast(t("composer.pollOnlyChannel"), "error");
      return;
    }
    const validOptions = pollOptions.filter((o) => o.trim());
    if (validOptions.length < 2) {
      useChatStore.getState().showToast(t("composer.pollMinOptions"), "error");
      return;
    }
    if (validOptions.length > 12) {
      useChatStore.getState().showToast(t("composer.pollMaxOptions"), "error");
      return;
    }
    if (!pollQuestion.trim()) {
      useChatStore.getState().showToast(t("composer.pollQuestion"), "error");
      return;
    }
    const options: PollOption[] = validOptions.map((text, i) => ({
      id: `opt_${i}_${Date.now()}`,
      text: text.trim(),
    }));
    const pollData = JSON.stringify({
      question: pollQuestion.trim(),
      options,
      anonymous: pollAnonymous,
    });
    const clientId = "c_local_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    const optimistic: Message = {
      id: clientId,
      conversationId,
      authorId: me.id,
      kind: "poll",
      text: pollData,
      attachments: [],
      reactions: [],
      createdAt: new Date().toISOString(),
      pending: true,
    };
    appendMessage(optimistic, clientId);
    wsClient.send({
      type: "message:send",
      clientId,
      payload: { conversationId, text: pollData, kind: "poll", e2ee: e2eeActive },
    });
    setShowPollModal(false);
    clearPollDraft(conversationId);
    setToolMenuOpen(false);
    startAutoReadTimer(conversationId, clientId, "poll", me.id);
  }

  function handleSendLongPressStart() {
    sendLongPressTimer.current = setTimeout(() => {
      setSendMenuOpen(true);
      sendLongPressTimer.current = null;
    }, 500);
  }

  function handleSendLongPressEnd() {
    if (sendLongPressTimer.current) {
      clearTimeout(sendLongPressTimer.current);
      sendLongPressTimer.current = null;
    }
  }

  async function sendCard(id: string, kind: "friendCard" | "channelCard") {
    if (!me) return;
    // Per spec: when sending a *friend* card, validate the relationship
    // against the server in real-time. Do not rely on stale local state.
    if (kind === "friendCard") {
      try {
        const fresh = await api.getFriendship(id);
        if (fresh.status !== "accepted" || fresh.blockedByMe) {
          useChatStore
            .getState()
            .showToast(t("composer.notFriendAnymore"), "error");
          setCardMode(null);
          setCardQuery("");
          return;
        }
      } catch (e) {
        useChatStore
          .getState()
          .showToast(e instanceof Error ? e.message : t("composer.friendCheckFailed"), "error");
        return;
      }
    }
    const clientId = "c_local_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    const optimistic: Message = {
      id: clientId,
      conversationId,
      authorId: me.id,
      kind,
      text: " ",
      attachments: [],
      reactions: [],
      cardId: id,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    appendMessage(optimistic, clientId);
    wsClient.send({
      type: "message:send",
      clientId,
      payload: { conversationId, text: " ", kind, cardId: id, e2ee: e2eeActive },
    });
    setCardMode(null);
    setCardQuery("");
    startAutoReadTimer(conversationId, clientId, kind, me.id);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null && mentionMatches.length > 0) {
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        insertMention(mentionMatches[0]);
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); setMentionQuery(null); return; }
      if (e.key === "Tab") { e.preventDefault(); return; }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
      return;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      let lo = start;
      let hi = end;
      if (start === end) {
        const t = emojiTokenAt(text, e.key === "Backspace" ? start - 1 : start);
        if (!t) return;
        lo = t.start;
        hi = t.end;
      } else {
        EMOJI_TOKEN_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = EMOJI_TOKEN_RE.exec(text)) !== null) {
          const a = m.index;
          const b = a + m[0].length;
          if (a < end && b > start) {
            lo = Math.min(lo, a);
            hi = Math.max(hi, b);
          }
        }
        if (lo === start && hi === end) return;
      }
      e.preventDefault();
      const next = text.slice(0, lo) + text.slice(hi);
      setText(next);
      setDraft(conversationId, next);
      requestAnimationFrame(() => ta.setSelectionRange(lo, lo));
    }
  }

  const replyingUser = replyTo ? users[replyTo.authorId] : undefined;

  return (
    <div ref={composerRef} className={cn("relative border-t border-line-light/70 bg-surface/60 backdrop-blur-xl", compact ? "px-2 pb-1.5 pt-1" : "px-6 pb-6 pt-3")} style={{ paddingBottom: `max(${compact ? "0.375rem" : "1.5rem"}, env(safe-area-inset-bottom, 0px))` }}>
      {error && (
        <div className="mb-2 flex items-center justify-between rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          <span>{error}</span>
          <button onClick={() => setError(null)}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
      {banStatus?.banned && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{banStatus.type === "channel" ? t("channel.bannedChannel") : t("channel.bannedDM")} {t("channel.banReason")}: {banStatus.reason || t("channel.noReason")}</span>
        </div>
      )}
      {replyTo && replyingUser && (
        <div className="mb-2 flex items-center gap-3 rounded-xl border border-line-light/70 bg-surface-soft px-3 py-2">
          <Reply className="h-4 w-4 shrink-0 text-ink-muted" />
          <div className="min-w-0 flex-1">
            <span className="text-xs font-medium text-ocean">{replyingUser.displayName}</span>
            <span className="text-xs text-ink-muted ml-2 truncate inline-block max-w-[300px] align-bottom">
              {messagePreview(replyTo, users)}
            </span>
          </div>
          <button onClick={onClearReply} className="text-ink-muted hover:text-ink-primary"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
      {(attachments.length > 0 || pendingUploads.length > 0) && (
        <AttachmentTray
          attachments={attachments}
          pending={pendingUploads}
          onRemove={(id) => setAttachments((a) => a.filter((x) => x.id !== id))}
          onCancelPending={(localId) => {
            const p = pendingUploads.find((x) => x.localId === localId);
            if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl);
            setPendingUploads((p) => p.filter((x) => x.localId !== localId));
          }}
        />
      )}
      {mentionQuery !== null && mentionMatches.length > 0 && (
        <div className="absolute bottom-full left-6 right-6 mb-1 z-20 max-h-52 overflow-y-auto rounded-2xl border border-line-light/70 bg-surface p-1 shadow-2xl">
          {mentionMatches.map((u) => (
            "isAll" in u ? (
              <button key="__all__" onClick={() => insertMention(u)} onMouseDown={(e) => e.preventDefault()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface-soft">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ocean/20 text-sm font-bold text-ocean">@</div>
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-ink-primary">{u.displayName}</div><div className="truncate text-[11px] text-ink-muted">{t("composer.everyone")}</div></div>
              </button>
            ) : (
              <button key={u.id} onClick={() => insertMention(u)} onMouseDown={(e) => e.preventDefault()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface-soft">
                <Avatar user={u} size="sm" showPresence />
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-ink-primary">{u.displayName}</div><div className="truncate text-[11px] text-ink-muted">@{u.username}</div></div>
              </button>
            )
          ))}
        </div>
      )}
      {cardMode && (
        <div className="absolute bottom-full left-6 right-6 mb-1 z-20 max-h-80 overflow-y-auto rounded-2xl border border-line-light/70 bg-surface p-2 shadow-2xl">
          <div className="flex items-center gap-2 mb-2">
            <input autoFocus value={cardQuery} onChange={(e) => setCardQuery(e.target.value)} placeholder={cardMode.kind === "user" ? t("composer.searchUser") : t("composer.searchChannel")} className="input-base flex-1 text-sm" />
            <button onClick={() => setCardMode(null)} className="text-ink-muted hover:text-ink-primary"><X className="h-4 w-4" /></button>
          </div>
          {cardMatches.length === 0 && <div className="py-6 text-center text-sm text-ink-muted">{t("friends.searchNoResult")}</div>}
          {cardMatches.map((item) => {
            if (cardMode.kind === "user" && "displayName" in item) {
              const u = item as PublicUser;
              return (
                <button key={u.id} onClick={() => sendCard(u.id, "friendCard")} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface-soft">
                  <Avatar user={u} size="sm" showPresence />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-ink-primary">{u.displayName}</div><div className="truncate text-[11px] text-ink-muted">@{u.username}</div></div>
                  <span className="shrink-0 rounded-lg bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-ocean">{t("common.send")}</span>
                </button>
              );
            }
            if (cardMode.kind === "channel" && "name" in item) {
              const c = item as Conversation;
              return (
                <button key={c.id} onClick={() => sendCard(c.id, "channelCard")} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface-soft">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand-soft text-base">{c.icon ?? <Hash className="h-4 w-4" />}</div>
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-ink-primary">{c.name}</div><div className="truncate text-[11px] text-ink-muted">{c.memberIds.length} {t("chat.members")}{c.isPrivate ? " · " + t("channel.private") : ""}</div></div>
                  <span className="shrink-0 rounded-lg bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-ocean">{t("common.send")}</span>
                </button>
              );
            }
            return null;
          })}
        </div>
      )}
      {showPollModal && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowPollModal(false)}>
          <div className="w-[min(90vw,420px)] max-h-[80vh] overflow-y-auto rounded-2xl border border-line-light bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line-light px-4 py-3">
              <div className="text-sm font-semibold text-ink-primary">{t("composer.createPoll")}</div>
              <button onClick={() => setShowPollModal(false)} className="text-ink-muted hover:text-ink-primary"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-4 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">{t("composer.pollQuestion")}</span>
                <input
                  value={pollQuestion}
                  onChange={(e) => setPollDraft(conversationId, { question: e.target.value })}
                  className="input-base"
                  placeholder={t("composer.pollQuestion")}
                  maxLength={200}
                />
              </label>
              <div>
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">{t("composer.pollOptions")} ({pollOptions.length}/12)</span>
                <div className="space-y-2">
                  {pollOptions.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs text-ink-muted w-5 text-center">{idx + 1}</span>
                      <input
                        value={opt}
                        onChange={(e) => {
                          const next = [...pollOptions];
                          next[idx] = e.target.value;
                          setPollDraft(conversationId, { options: next });
                        }}
                        className="input-base flex-1"
                        placeholder={`${t("common.option")} ${idx + 1}`}
                        maxLength={100}
                      />
                      {pollOptions.length > 2 && (
                        <button
                          onClick={() => setPollDraft(conversationId, { options: pollOptions.filter((_, i) => i !== idx) })}
                          className="text-ink-muted hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {pollOptions.length < 12 && (
                  <button
                    onClick={() => setPollDraft(conversationId, { options: [...pollOptions, ""] })}
                    className="mt-2 text-sm text-ocean hover:text-aqua"
                  >
                    {"+ " + t("composer.addOption")}
                  </button>
                )}
              </div>
              <label className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-ink-primary">{t("composer.anonymousPoll")}</div>
                  <div className="text-xs text-ink-muted">{t("composer.pollAnonymousDesc")}</div>
                </div>
                <button
                  onClick={() => setPollDraft(conversationId, { anonymous: !pollAnonymous })}
                  className={cn(
                    "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                    pollAnonymous ? "bg-brand-gradient" : "bg-line-light",
                  )}
                >
                  <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all", pollAnonymous ? "left-6" : "left-1")} />
                </button>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowPollModal(false)} className="btn-ghost px-4 text-sm">{t("common.cancel")}</button>
                <button onClick={createPoll} className="btn-primary px-4 text-sm">{t("composer.publishPoll")}</button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length > 0) void uploadFiles(e.dataTransfer.files); }}
        className={cn(
          "relative flex rounded-2xl border bg-surface transition-all",
          // Mobile (compact): center-align so the textarea, left toolbar, and
          // send button sit on the exact same horizontal baseline. Desktop
          // keeps `items-end` so multi-line composers grow upward.
          compact ? "items-center gap-1 px-1.5 py-1" : "items-end gap-1.5 px-3 py-2",
          dragOver ? "border-aqua ring-focus-aqua" : "border-line-light/70 focus-within:border-aqua focus-within:ring-focus-aqua",
        )}
      >
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => e.target.files && void uploadFiles(e.target.files)} />
        <input ref={imgInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => e.target.files && void uploadFiles(e.target.files)} />
        <div
          className={cn(
            "flex shrink-0 flex-nowrap items-center",
            compact ? "h-7 gap-1" : "h-9 gap-1.5 self-end",
          )}
        >
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => { setToolMenuOpen((v) => !v); setEmojiOpen(false); }}
              className={cn("grid shrink-0 place-items-center rounded-xl transition-colors", compact ? "h-7 w-7" : "h-9 w-9", toolMenuOpen ? "bg-surface-soft text-ink-primary" : "text-ink-muted hover:bg-surface-soft hover:text-ink-primary")}
              title={t("composer.more")}
            >
              <Plus className={cn("h-4 w-4 transition-transform", toolMenuOpen && "rotate-45")} />
            </button>
            {toolMenuOpen && (
              <div className="absolute bottom-full left-0 mb-2 min-w-[200px] rounded-2xl border border-line-light/70 bg-surface p-1.5 shadow-2xl">
                <button
                  onClick={() => { imgInputRef.current?.click(); setToolMenuOpen(false); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-primary hover:bg-surface-soft"
                >
                  <ImageIcon className="h-4 w-4 text-ocean" />
                  <span>{t("media.image")} / {t("media.video")}</span>
                </button>
                <button
                  onClick={() => {
                    setToolMenuOpen(false);
                    import("../lib/camera").then(async ({ takePhoto }) => {
                      try {
                        const dataUrl = await takePhoto();
                        const res = await fetch(dataUrl);
                        if (!res.ok) throw new Error("fetch failed: " + res.status);
                        const blob = await res.blob();
                        const file = new File([blob], `photo_${Date.now()}.jpg`, { type: "image/jpeg" });
                        void uploadAndSendImmediate([file]);
                      } catch (err) {
                        console.warn("[camera] failed:", err);
                      }
                    }).catch((err) => console.warn("[camera] import failed:", err));
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-primary hover:bg-surface-soft"
                >
                  <ImageIcon className="h-4 w-4 text-green-500" />
                  <span>{t("media.takePhoto")}</span>
                </button>
                <button
                  onClick={() => { fileInputRef.current?.click(); setToolMenuOpen(false); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-primary hover:bg-surface-soft"
                >
                  <Paperclip className="h-4 w-4 text-ocean" />
                  <span>{t("media.file")}</span>
                </button>
                <button
                  onClick={() => { openLocation(); setToolMenuOpen(false); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-primary hover:bg-surface-soft"
                >
                  <MapPin className="h-4 w-4 text-ocean" />
                  <span>{t("media.location")}</span>
                </button>
                <button
                  onClick={() => { setEmojiOpen((v) => !v); setToolMenuOpen(false); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-primary hover:bg-surface-soft"
                >
                  <Smile className="h-4 w-4 text-ocean" />
                  <span>{t("composer.emoji")}</span>
                </button>
                <div className="my-1 border-t border-line-light/50" />
                <button
                  onClick={() => { setCardMode({ kind: "user" }); setToolMenuOpen(false); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-primary hover:bg-surface-soft"
                >
                  <UserPlus className="h-4 w-4 text-ocean" />
                  <span>{t("composer.recommendFriend")}</span>
                </button>
                <button
                  onClick={() => { setCardMode({ kind: "channel" }); setToolMenuOpen(false); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-primary hover:bg-surface-soft"
                >
                  <Radio className="h-4 w-4 text-ocean" />
                  <span>{t("composer.shareChannel")}</span>
                </button>
                <div className="my-1 border-t border-line-light/50" />
                <button
                  onClick={() => { onCallInvite?.("audio"); setToolMenuOpen(false); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-primary hover:bg-surface-soft"
                >
                  <Phone className="h-4 w-4 text-ocean" />
                  <span>{t("call.audio")}</span>
                </button>
                <button
                  onClick={() => { onCallInvite?.("video"); setToolMenuOpen(false); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-primary hover:bg-surface-soft"
                >
                  <Video className="h-4 w-4 text-ocean" />
                  <span>{t("call.video")}</span>
                </button>
                {isChannel && (
                  <>
                    <div className="my-1 border-t border-line-light/50" />
                    <button
                      onClick={() => { setShowPollModal(true); setToolMenuOpen(false); }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-primary hover:bg-surface-soft"
                    >
                      <Vote className="h-4 w-4 text-ocean" />
                      <span>{t("composer.publishPoll")}</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        {emojiOpen && !toolMenuOpen && (
          <PickerPanel
            onPickEmoji={(e) => { insertEmoji(e); }}
            onPickSticker={(stickerId, fileUrl) => {
              sendSticker(stickerId, fileUrl);
            }}
            onClose={() => setEmojiOpen(false)}
          />
        )}
        <div className="relative flex-1">
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 overflow-y-auto whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink-primary",
              compact ? "min-h-[28px] max-h-[100px] px-1 py-1" : "min-h-[36px] max-h-[200px] px-1 py-1.5",
            )}
          >
            {text.length > 0 ? <InlineTextPreview text={text} /> : null}
            {text.length === 0 && (
              <span className={cn("text-ink-muted", compact ? "min-h-[28px] max-h-[100px] px-1 py-1" : "min-h-[36px] max-h-[200px] px-1 py-1.5")}>
                {banStatus?.banned ? t("composer.banned") : isChannel ? t("chat.inputPlaceholder") : t("chat.inputPlaceholder")}
              </span>
            )}
          </div>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={handlePaste}
            onFocus={onComposerFocus}
            rows={1}
            maxLength={MAX_TEXT_LENGTH}
            aria-label={t("chat.inputPlaceholder")}
            disabled={banStatus?.banned}
            className={cn(
              "relative z-10 block w-full resize-none bg-transparent text-[15px] leading-relaxed text-transparent caret-ink-primary focus:outline-none scroll-mb-16",
              compact ? "min-h-[28px] max-h-[100px] px-1 py-1" : "min-h-[36px] max-h-[200px] px-1 py-1.5",
              banStatus?.banned && "cursor-not-allowed opacity-50",
            )}
            style={{ color: "transparent" }}
            placeholder=""
          />
        </div>
        {recording && (
          <div className="absolute inset-0 z-20 flex items-center justify-between rounded-2xl bg-surface px-4">
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 rounded-full bg-danger animate-pulse" />
              <span className="text-sm font-medium text-danger">{t("composer.recording")}</span>
              <span className="text-sm text-ink-muted tabular-nums">{String(Math.floor(recordingTime / 60)).padStart(2, "0")}:{String(recordingTime % 60).padStart(2, "0")}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => stopRecording(false)}
                className="flex items-center gap-1.5 rounded-lg bg-ocean/10 px-3 py-1.5 text-sm text-ocean hover:bg-ocean/20"
              >
                <Send className="h-4 w-4" />
                {t("common.send")}
              </button>
              <button
                onClick={() => stopRecording(true)}
                className="flex items-center gap-1.5 rounded-lg bg-danger/10 px-3 py-1.5 text-sm text-danger hover:bg-danger/20"
              >
                <Trash2 className="h-4 w-4" />
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}
        <div className="flex shrink-0 items-center gap-1">
          <button
            onMouseDown={() => { if (!recording) handleRecordStart(); }}
            onMouseUp={() => { if (recording) handleRecordEnd(); }}
            onMouseLeave={() => { if (recording) handleRecordEnd(); }}
            onTouchStart={() => { if (!recording) handleRecordStart(); }}
            onTouchEnd={() => { if (recording) handleRecordEnd(); }}
            disabled={banStatus?.banned || uploading}
            className={cn(
              "grid shrink-0 place-items-center rounded-xl transition-colors",
              compact ? "h-7 w-7" : "h-9 w-9",
              recording ? "text-danger animate-pulse" : "text-ink-muted hover:bg-surface-soft hover:text-ink-primary",
              (banStatus?.banned || uploading) && "opacity-30 cursor-not-allowed",
            )}
            title={t("composer.voiceRecord")}
          >
            {recording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
          <div className="relative" ref={sendMenuRef}>
            <button
              onClick={() => { if (!sendMenuOpen) send(); }}
            onMouseDown={handleSendLongPressStart}
            onMouseUp={handleSendLongPressEnd}
            onMouseLeave={handleSendLongPressEnd}
            onTouchStart={handleSendLongPressStart}
            onTouchEnd={handleSendLongPressEnd}
            disabled={banStatus?.banned || uploading || (!text.trim() && attachments.length === 0)}
            className={cn(
              "btn-primary px-4 shrink-0",
              compact ? "h-7" : "h-9 self-end",
              (banStatus?.banned || uploading || (!text.trim() && attachments.length === 0)) && "from-ink-muted to-ink-muted",
            )}
          >
            <Send className="h-4 w-4" />
          </button>
          {sendMenuOpen && (
            <div className="absolute bottom-full right-0 mb-2 min-w-[200px] rounded-2xl border border-line-light/70 bg-surface p-1.5 shadow-2xl z-30">
              <button
                onClick={() => { setSendMenuOpen(false); send(); }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-primary hover:bg-surface-soft"
              >
                <Send className="h-4 w-4 text-ocean" />
                <span>{t("composer.normalSend")}</span>
              </button>
              <button
                onClick={() => { setShowScheduledPicker(true); }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-primary hover:bg-surface-soft"
              >
                <Clock className="h-4 w-4 text-ocean" />
                <span>{t("composer.scheduleSend")}</span>
              </button>
              <button
                onClick={() => { setSendMenuOpen(false); sendMarkdown(); }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-primary hover:bg-surface-soft"
              >
                <FileText className="h-4 w-4 text-ocean" />
                <span>{t("composer.markdownSend")}</span>
              </button>
            </div>
          )}
          {showScheduledPicker && (
            <div className="absolute bottom-full right-0 mb-2 rounded-2xl border border-line-light/70 bg-surface p-4 shadow-2xl z-30 w-[280px]">
              <div className="text-sm font-medium text-ink-primary mb-2">{t("composer.scheduleTime")}</div>
              <input
                type="datetime-local"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="input-base w-full mb-3"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => { setShowScheduledPicker(false); setScheduledTime(""); }} className="btn-ghost px-3 text-sm">{t("common.cancel")}</button>
                <button onClick={sendScheduled} disabled={!scheduledTime} className="btn-primary px-3 text-sm">{t("common.confirm")}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
      {dragOver && <div className="pointer-events-none mt-2 rounded-xl border border-dashed border-aqua bg-aqua/10 px-3 py-1.5 text-xs text-ocean">{t("composer.dragToUpload")}</div>}
    </div>
  );
}

function AttachmentTray({ attachments, pending, onRemove, onCancelPending }: { attachments: Attachment[]; pending: PendingFile[]; onRemove: (id: string) => void; onCancelPending: (localId: string) => void }) {
  const allItems = [
    ...pending.map((p) => ({ key: p.localId, pending: true as const, file: p.file, previewUrl: p.previewUrl, status: p.status, attachment: p.attachment })),
    ...attachments.map((a) => ({ key: a.id, pending: false as const, attachment: a })),
  ];
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {allItems.map((item) => (
        <div key={item.key} className="group/att relative flex items-center gap-2 rounded-xl border border-line-light bg-surface px-2 py-1.5 pr-7 text-sm">
          {item.pending ? (
            <>
              {item.previewUrl ? (
                <div className="relative h-9 w-9 shrink-0">
                  <img src={item.previewUrl} alt={item.file.name} className="h-9 w-9 rounded-md object-cover" />
                  {item.status === "uploading" && <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/40"><Loader2 className="h-4 w-4 animate-spin text-white" /></div>}
                </div>
              ) : (
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand-soft text-xs text-ocean">
                  {item.status === "uploading" ? <Loader2 className="h-4 w-4 animate-spin" /> : (item.file.name.split(".").pop()?.toUpperCase().slice(0, 4) ?? "FILE")}
                </div>
              )}
              <div className="min-w-0 max-w-[12rem]">
                <div className="truncate text-ink-primary">{item.file.name}</div>
                <div className="text-[11px] text-ink-muted">{formatBytes(item.file.size)}</div>
              </div>
              {item.status === "uploading" ? (
                <button onClick={() => onCancelPending(item.key)} className="absolute right-1.5 top-1.5 rounded-full p-0.5 text-ink-muted opacity-0 transition-opacity group-hover/att:opacity-100 hover:bg-surface-soft hover:text-ink-primary"><X className="h-3.5 w-3.5" /></button>
              ) : item.status === "error" ? (
                <button onClick={() => onCancelPending(item.key)} className="absolute right-1.5 top-1.5 rounded-full p-0.5 text-danger/60 hover:text-danger"><X className="h-3.5 w-3.5" /></button>
              ) : null}
            </>
          ) : (
            <>
              {isImage(item.attachment.mimeType) ? (<img src={resolveAttachmentUrl(item.attachment.url)} alt={item.attachment.name} className="h-9 w-9 rounded-md object-cover" />) : (<div className="grid h-9 w-9 place-items-center rounded-md bg-brand-soft text-xs text-ocean">{item.attachment.name.split(".").pop()?.toUpperCase().slice(0, 4) ?? "FILE"}</div>)}
              <div className="min-w-0 max-w-[12rem]"><div className="truncate text-ink-primary">{item.attachment.name}</div><div className="text-[11px] text-ink-muted">{formatBytes(item.attachment.size)}</div></div>
              <button onClick={() => onRemove(item.key)} className="absolute right-1.5 top-1.5 rounded-full p-0.5 text-ink-muted opacity-0 transition-opacity group-hover/att:opacity-100 hover:bg-surface-soft hover:text-ink-primary"><X className="h-3.5 w-3.5" /></button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

const EMOJI_PAGE_SIZE = 32;

/**
 * Emoji picker backed by the static webp assets under /public/emoji. Loads a
 * manifest once and renders the assets in lazily-loaded pages, so we never
 * transfer more than a page of images at a time (the full bundle is ~640
 * animated webp files, hundreds of KB each).
 */
function EmojiPicker({ onPick }: { onPick: (key: string) => void }) {
  const t = useT();
  const [files, setFiles] = useState<string[] | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (files !== null) return;
    let cancelled = false;
    fetch(emojiUrl("manifest.json"))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((list: string[]) => {
        if (!cancelled) setFiles(list);
      })
      .catch((err) => {
        if (!cancelled) {
          setFiles(EMOJIS_FALLBACK);
          setError(t("sticker.loadFailed", { error: err.message }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [files]);

  // Infinite scroll: bump the page count when the sentinel enters view.
  useEffect(() => {
    if (!files) return;
    const totalPages = Math.ceil(files.length / EMOJI_PAGE_SIZE);
    if (page >= totalPages) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setPage((p) => Math.min(totalPages, p + 1));
            break;
          }
        }
      },
      { root: containerRef.current, rootMargin: "120px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [files, page]);

  const visible = files ? files.slice(0, page * EMOJI_PAGE_SIZE) : [];

  return (
    <div ref={containerRef} className="flex max-h-72 flex-col">
      {!files ? (
        <div className="flex flex-1 items-center justify-center py-8 text-xs text-ink-muted">
          {t("common.loading")}
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-8 gap-1 overflow-y-auto p-2">
          {visible.map((name) => {
            const key = `[emoji:${name}]`;
            return (
              <button
                key={name}
                type="button"
                title={name.replace(/\.webp$/, "")}
                onClick={() => onPick(key)}
                className="grid h-9 w-9 place-items-center overflow-hidden rounded-md transition-transform hover:scale-110 hover:bg-surface-soft"
              >
                <img
                  src={emojiUrl(name)}
                  alt={name}
                  loading="lazy"
                  decoding="async"
                  className="h-8 w-8 object-contain"
                />
              </button>
            );
          })}
          {visible.length < files.length && (
            <div ref={sentinelRef} className="col-span-8 grid place-items-center py-2 text-[10px] text-ink-muted">
              {t("chat.loadMore")}
            </div>
          )}
        </div>
      )}
      {error && <div className="border-t border-line-light/60 px-3 py-1.5 text-[10px] text-danger">{error}</div>}
    </div>
  );
}

function PickerPanel({ onPickEmoji, onPickSticker, onClose }: { onPickEmoji: (key: string) => void; onPickSticker: (stickerId: string, fileUrl: string) => void; onClose: () => void }) {
  const t = useT();
  const [tab, setTab] = useState<"emoji" | "sticker">("emoji");
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(e.target as Node)) onClose();
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [onClose]);

  return (
    <div ref={panelRef} className="absolute bottom-full left-16 z-50 mb-2 w-80 rounded-2xl border border-line-light/70 bg-surface shadow-2xl">
      <div className="flex items-center border-b border-line-light/50">
        <button
          onClick={() => setTab("emoji")}
          className={`flex-1 px-3 py-2 text-xs font-medium text-center transition-colors ${tab === "emoji" ? "border-b-2 border-ocean text-ocean" : "text-ink-secondary hover:text-ink-primary"}`}
        >
          {t("composer.emoji")}
        </button>
        <button
          onClick={() => setTab("sticker")}
          className={`flex-1 px-3 py-2 text-xs font-medium text-center transition-colors ${tab === "sticker" ? "border-b-2 border-ocean text-ocean" : "text-ink-secondary hover:text-ink-primary"}`}
        >
          {t("composer.sticker")}
        </button>
      </div>
      {tab === "emoji" && <EmojiPicker onPick={onPickEmoji} />}
      {tab === "sticker" && <StickerPicker onSelect={(stickerId, fileUrl) => onPickSticker(stickerId, fileUrl)} />}
    </div>
  );
}

/**
 * Renders emoji tokens shown as inline emoji.
 * Used as a transparent overlay above the textarea so the user sees the
 * rendered form of what they're typing while the textarea keeps full native
 * caret + selection behavior.
 */
function InlineTextPreview({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  let idx = 0;
  EMOJI_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EMOJI_TOKEN_RE.exec(text)) !== null) {
    if (m.index > last) {
      out.push(<span key={idx++}>{text.slice(last, m.index)}</span>);
    }
    const name = m[1] ?? m[2];
    out.push(
      <img
        key={idx++}
        src={emojiUrl(name)}
        alt={name}
        loading="lazy"
        className="mx-0.5 inline-block h-6 w-6 align-middle"
      />,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(<span key={idx++}>{text.slice(last)}</span>);
  // Preserve a trailing newline so the overlay height matches the textarea
  // (the cursor should sit on the same logical line as the rendered content).
  return <>{out}{text.endsWith("\n") ? "\u200b" : null}</>;
}

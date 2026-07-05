import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff, MonitorUp, Users, Shield, Volume2, VolumeX, UserX, PhoneIncoming } from "lucide-react";
import { useCallStore, callController } from "../lib/call";
import { useChatStore } from "../lib/store";
import { cn, resolveAttachmentUrl } from "../lib/utils";
import { useT } from "../lib/i18n";

// ---------------------------------------------------------------------------
// Req 2: Global autoplay recovery — detects AudioContext suspension and
// resumes all registered audio/video elements on first user interaction.
// ---------------------------------------------------------------------------

type RecoveryCallback = () => void;
const _autoplayRecoveryCallbacks = new Set<RecoveryCallback>();
let _recoveryHandlerInstalled = false;

function installAutoplayRecoveryHandler() {
  if (_recoveryHandlerInstalled) return;
  _recoveryHandlerInstalled = true;
  const handler = () => {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (AC) {
        const ctx = new AC();
        if (ctx.state === "suspended") {
          ctx.resume().catch(() => undefined);
        }
        ctx.close().catch(() => undefined);
      }
    } catch { /* noop */ }
    for (const cb of _autoplayRecoveryCallbacks) {
      try { cb(); } catch { /* noop */ }
    }
  };
  document.addEventListener("click", handler, { once: true, capture: true });
  document.addEventListener("keydown", handler, { once: true, capture: true });
}

function registerAutoplayRecovery(cb: RecoveryCallback): () => void {
  installAutoplayRecoveryHandler();
  _autoplayRecoveryCallbacks.add(cb);
  return () => { _autoplayRecoveryCallbacks.delete(cb); };
}

/**
 * Req 1 + Req 2 + Req 3: Audio element for remote audio tracks.
 * Binds a dedicated audio-only MediaStream to a positioned-offscreen
 * `<audio>` element, syncs muted state in real-time, and handles
 * autoplay recovery.
 *
 * The element is positioned absolutely off-screen (not display:none) to
 * maximize browser compatibility with hidden media elements.
 */
function RemoteAudio({
  stream,
  muted,
}: {
  stream: MediaStream | null;
  muted?: boolean;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const bindTimeRef = useRef<number>(0);
  const audioOnlyStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return;
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      el.srcObject = null;
      return;
    }
    let audioOnly = audioOnlyStreamRef.current;
    if (!audioOnly) {
      audioOnly = new MediaStream();
      audioOnlyStreamRef.current = audioOnly;
    }
    const existingIds = new Set(audioOnly.getAudioTracks().map((t) => t.id));
    for (const t of audioTracks) {
      if (!existingIds.has(t.id)) audioOnly.addTrack(t);
    }
    for (const t of [...audioOnly.getAudioTracks()]) {
      if (!audioTracks.some((a) => a.id === t.id)) audioOnly.removeTrack(t);
    }
    if (el.srcObject !== audioOnly) {
      el.srcObject = audioOnly;
      bindTimeRef.current = performance.now();
    }
    el.muted = !!muted;
    el.volume = 1;
    el.autoplay = true;
    if (!el.muted) {
      const p = el.play();
      if (p) {
        p.catch((err) => {
          console.warn("[audio] autoplay blocked, will resume on user interaction:", err);
        });
      }
    }
  }, [stream, muted]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return;
    const syncMuted = () => {
      const audioTracks = stream.getAudioTracks();
      const allMuted = audioTracks.length > 0 && audioTracks.every((t) => t.muted || !t.enabled);
      el.muted = allMuted || !!muted;
      if (!el.muted) {
        el.play().catch(() => undefined);
      }
    };
    const tracks = stream.getAudioTracks();
    for (const t of tracks) {
      t.addEventListener("mute", syncMuted);
      t.addEventListener("unmute", syncMuted);
      t.addEventListener("ended", syncMuted);
    }
    return () => {
      for (const t of tracks) {
        t.removeEventListener("mute", syncMuted);
        t.removeEventListener("unmute", syncMuted);
        t.removeEventListener("ended", syncMuted);
      }
    };
  }, [stream, muted]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return registerAutoplayRecovery(() => {
      if (el.srcObject && el.paused && !el.muted) {
        el.play().catch(() => undefined);
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      const s = audioOnlyStreamRef.current;
      if (s) {
        for (const t of s.getTracks()) s.removeTrack(t);
        audioOnlyStreamRef.current = null;
      }
    };
  }, []);

  return (
    <audio
      ref={ref}
      autoPlay
      playsInline
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        opacity: 0,
        pointerEvents: "none",
        left: -9999,
        top: -9999,
      }}
    />
  );
}

/**
 * Default Navo mark used as the avatar fallback when a user/conv avatar
 * image fails to load or has not been provided.
 */
function NavoFallbackMark({ size = 64 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="navo-fallback-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#66B8FF" />
          <stop offset="0.5" stopColor="#2F7DFF" />
          <stop offset="1" stopColor="#8A6CFF" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#navo-fallback-grad)" />
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

/**
 * Image with automatic fallback to the Navo mark. Replaces the broken
 * image with the default logo whenever `onError` fires, ensuring the
 * UI never shows a broken-image icon.
 */
function SafeImage({
  src,
  alt = "",
  className,
  fallbackClassName,
  ringClassName = "ring-2 ring-ocean/20",
  fallbackSize = 32,
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  fallbackClassName?: string;
  ringClassName?: string;
  fallbackSize?: number;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  if (!src || failed) {
    return (
      <div
        className={cn(
          "grid place-items-center overflow-hidden rounded-full bg-brand-soft",
          ringClassName,
          fallbackClassName ?? className,
        )}
      >
        <NavoFallbackMark size={fallbackSize} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Req 4 + Req 5 + Req 6 + Req 7: Video tile for local or remote streams.
 *
 * - Local video: muted mirror preview.
 * - Remote video: bound to a video-only MediaStream so audio is not
 *   silenced by the muted video element. The full stream is also passed
 *   to a separate <RemoteAudio> element.
 * - Each instance has its own isolated ref — no cross-contamination.
 */
function MediaTile({
  stream,
  muted,
  label,
  localStream,
  publishing,
  isLocal,
  avatarUrl,
  localMuted,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  label: string;
  localStream?: MediaStream | null;
  publishing?: import("@navo/shared").CallTrackKind[];
  isLocal?: boolean;
  avatarUrl?: string;
  localMuted?: boolean;
}) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [trackVersion, setTrackVersion] = useState(0);
  const videoOnlyRef = useRef<MediaStream | null>(null);

  const isLocalStreamInRemoteTile = !isLocal && !!localStream && stream === localStream;
  const effectiveStream = isLocalStreamInRemoteTile ? null : stream;
  const hasVideo = !!effectiveStream?.getVideoTracks().some((t) => t.readyState === "live");
  const videoOnlyStream = useMemo(() => {
    if (!effectiveStream) return null;
    let s = videoOnlyRef.current;
    if (!s) {
      s = new MediaStream();
      videoOnlyRef.current = s;
    }
    const incoming = effectiveStream.getVideoTracks();
    const existing = new Set(s.getVideoTracks().map((t) => t.id));
    for (const t of incoming) {
      if (!existing.has(t.id)) s.addTrack(t);
    }
    for (const t of [...s.getVideoTracks()]) {
      if (!incoming.some((a) => a.id === t.id)) s.removeTrack(t);
    }
    return s;
  }, [effectiveStream, trackVersion]);

  useEffect(() => {
    return () => {
      const s = videoOnlyRef.current;
      if (s) {
        for (const t of s.getTracks()) s.removeTrack(t);
        videoOnlyRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isLocal) return;
    const el = videoRef.current;
    if (!el || !effectiveStream) return;
    if (el.srcObject !== effectiveStream) {
      el.srcObject = effectiveStream;
    }
    el.autoplay = true;
    el.playsInline = true;
    el.muted = true;
    el.play().catch(() => undefined);
  }, [effectiveStream, trackVersion, isLocal]);

  useEffect(() => {
    if (isLocal) return;
    const el = videoRef.current;
    if (!el || !videoOnlyStream) return;
    if (el.srcObject !== videoOnlyStream) {
      el.srcObject = videoOnlyStream;
    }
    el.muted = true;
    el.autoplay = true;
    el.playsInline = true;
    el.play().catch(() => undefined);
  }, [videoOnlyStream, trackVersion, isLocal]);

  useEffect(() => {
    if (!effectiveStream) return;
    const bump = () => setTrackVersion((v) => v + 1);
    effectiveStream.addEventListener("addtrack", bump);
    effectiveStream.addEventListener("removetrack", bump);
    const tracks = effectiveStream.getTracks();
    for (const t of tracks) {
      t.addEventListener("unmute", bump);
      t.addEventListener("mute", bump);
      t.addEventListener("ended", bump);
    }
    return () => {
      effectiveStream.removeEventListener("addtrack", bump);
      effectiveStream.removeEventListener("removetrack", bump);
      for (const t of tracks) {
        t.removeEventListener("unmute", bump);
        t.removeEventListener("mute", bump);
        t.removeEventListener("ended", bump);
      }
    };
  }, [effectiveStream]);

  useEffect(() => {
    if (isLocal) return;
    const el = videoRef.current;
    if (!el) return;
    const onVisible = () => {
      if (document.hidden) return;
      if (!el.srcObject) return;
      if (el.paused && el.srcObject) {
        const s = el.srcObject;
        el.srcObject = null;
        requestAnimationFrame(() => {
          el.srcObject = s;
          el.play().catch(() => undefined);
        });
      }
      if (el.videoWidth === 0 && el.videoHeight === 0 && el.srcObject) {
        const s = el.srcObject;
        el.srcObject = null;
        requestAnimationFrame(() => {
          el.srcObject = s;
          el.play().catch(() => undefined);
        });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [isLocal]);

  const remoteAudioStream = !isLocal && effectiveStream?.getAudioTracks().length ? effectiveStream : null;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-line-light/60 bg-surface-soft shadow-soft transition-all duration-300",
        isLocal
          ? "h-32 w-44 md:h-40 md:w-56"
          : "min-h-[180px] w-full md:min-h-[240px]",
      )}
    >
      {effectiveStream && (hasVideo || true) ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn(
            "h-full w-full object-cover bg-gradient-to-br from-surface-soft to-brand-soft",
            isLocal && "scale-x-[-1]",
          )}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-soft via-brand-soft/60 to-surface-soft">
          <SafeImage
            src={avatarUrl ? resolveAttachmentUrl(avatarUrl) : undefined}
            className={cn("h-16 w-16 rounded-full object-cover ring-2 ring-ocean/20")}
            fallbackClassName="h-20 w-20"
            fallbackSize={48}
          />
          {!isLocal && effectiveStream && (
            <div className="absolute bottom-14 left-1/2 -translate-x-1/2 rounded-full bg-white/80 px-3 py-1 text-[10px] font-medium text-ink-secondary shadow-sm backdrop-blur">
              {t("call.connecting")}
            </div>
          )}
        </div>
      )}

      {remoteAudioStream && <RemoteAudio stream={remoteAudioStream} muted={muted} />}

      <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5">
        <div className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-ink-primary shadow-sm backdrop-blur-sm">
          {label}
        </div>
        {!isLocal && (
          <div className="flex items-center gap-1">
            {muted !== undefined && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium shadow-sm backdrop-blur-sm",
                  muted ? "bg-danger/90 text-white" : "bg-emerald-500/90 text-white",
                )}
              >
                {muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
              </span>
            )}
            {publishing && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium shadow-sm backdrop-blur-sm",
                  publishing.includes("camera") ? "bg-emerald-500/90 text-white" : "bg-white/90 text-ink-secondary",
                )}
              >
                {publishing.includes("camera") ? <Video className="h-3 w-3" /> : <VideoOff className="h-3 w-3" />}
              </span>
            )}
          </div>
        )}
        {isLocal && localMuted && (
          <div className="rounded-full bg-danger/90 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm backdrop-blur-sm">
            <MicOff className="h-3 w-3" />
          </div>
        )}
      </div>
    </div>
  );
}

function DialingView({
  cur,
  conversation,
  otherName,
}: {
  cur: ReturnType<typeof useCallStore.getState>["current"];
  conversation: ReturnType<typeof useChatStore.getState>["conversationsById"][string] | undefined;
  otherName: string;
}) {
  const t = useT();
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (!cur) return;
    const id = window.setInterval(() => setPulse((p) => (p + 1) % 360), 30);
    return () => window.clearInterval(id);
  }, [cur?.callId]);

  if (!cur) return null;
  const isVideo = cur.kind === "video";
  const channelAvatar = conversation?.kind === "channel" ? conversation.avatarUrl : undefined;
  const dmOtherAvatar = conversation?.kind === "dm" ? undefined : undefined;
  const title = (conversation?.kind === "channel" ? conversation.name : otherName) ?? otherName;
  const avatarSrc = channelAvatar ? resolveAttachmentUrl(channelAvatar) : dmOtherAvatar;

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-app via-surface-soft/40 to-brand-soft/60 px-6 text-ink-primary">
      <div className="aurora-bg opacity-60" />
      <div className="grain opacity-30" />

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center text-center">
        <div
          className="relative mb-8 grid h-44 w-44 place-items-center"
          style={{ transform: `rotate(${pulse}deg)` }}
        >
          <div className="absolute inset-0 rounded-full border border-ocean/20" />
          <div className="absolute inset-3 rounded-full border border-ocean/30" />
          <div className="absolute inset-7 rounded-full border border-ocean/40" />
          <div
            className="absolute inset-11 rounded-full border-2 border-aqua/60"
            style={{ boxShadow: "0 0 24px rgba(142, 235, 255, 0.55)" }}
          />
          <div className="relative grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-brand-gradient text-3xl font-semibold text-white shadow-soft ring-4 ring-white/70">
            {avatarSrc ? (
              <SafeImage src={avatarSrc} className="h-full w-full object-cover" fallbackClassName="h-full w-full bg-brand-gradient" fallbackSize={64} />
            ) : (
              <NavoFallbackMark size={56} />
            )}
          </div>
        </div>

        <div className="text-xs font-medium uppercase tracking-[0.18em] text-ocean/80">
          {t("call.dialing")}
        </div>
        <div className="mt-2 text-2xl font-semibold text-ink-primary md:text-3xl">
          {t("call.calling", { name: title })}
        </div>
        <div className="mt-2 text-sm text-ink-secondary">
          {t("call.waitingAnswer")}
        </div>

        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-surface px-3.5 py-1.5 text-xs font-medium text-ink-secondary shadow-soft">
          {isVideo ? <Video className="h-3.5 w-3.5 text-ocean" /> : <Phone className="h-3.5 w-3.5 text-ocean" />}
          <span>{isVideo ? t("call.video") : t("call.audio")}</span>
        </div>

        <div className="mt-12 flex items-center gap-8">
          <button
            onClick={() => callController.hangup()}
            className="group flex flex-col items-center gap-2"
          >
            <span className="grid h-16 w-16 place-items-center rounded-full bg-danger text-white shadow-lg shadow-danger/30 transition-all group-hover:scale-105 group-active:scale-95">
              <PhoneOff className="h-7 w-7" />
            </span>
            <span className="text-xs font-medium text-ink-secondary">{t("common.cancelCall")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function IncomingView({
  incoming,
  from,
  convTitle,
}: {
  incoming: NonNullable<ReturnType<typeof useCallStore.getState>["incoming"]>;
  from: ReturnType<typeof useChatStore.getState>["users"][string] | undefined;
  convTitle: string;
}) {
  const t = useT();
  const isVideo = incoming.kind === "video";
  const displayName = from?.displayName ?? t("call.someone");
  const avatarSrc = from?.avatarUrl ? resolveAttachmentUrl(from.avatarUrl) : undefined;

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-app via-surface-soft/40 to-brand-soft/60 px-6 text-ink-primary">
      <div className="aurora-bg opacity-60" />
      <div className="grain opacity-30" />

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center text-center">
        <div className="mb-6 grid h-28 w-28 place-items-center overflow-hidden rounded-full bg-brand-gradient text-4xl font-semibold text-white shadow-soft ring-4 ring-white/70 animate-fade-in-up">
          {avatarSrc ? (
            <SafeImage src={avatarSrc} className="h-full w-full object-cover" fallbackClassName="h-full w-full bg-brand-gradient" fallbackSize={72} />
          ) : (
            <NavoFallbackMark size={72} />
          )}
        </div>

        <div className="text-xs font-medium uppercase tracking-[0.18em] text-ocean/80 animate-fade-in-up">
          <PhoneIncoming className="mr-1 inline h-3.5 w-3.5" />
          {t("call.incomingCall")}
        </div>
        <div className="mt-2 text-2xl font-semibold text-ink-primary md:text-3xl animate-fade-in-up">
          {displayName}
        </div>
        <div className="mt-2 text-sm text-ink-secondary animate-fade-in-up">
          {t("call.incomingInvite", {
            type: isVideo ? t("call.video") : t("call.audio"),
            name: convTitle,
          })}
        </div>

        <div className="mt-12 flex items-center gap-10">
          <button
            onClick={() => callController.rejectIncoming()}
            className="group flex flex-col items-center gap-2"
          >
            <span className="grid h-16 w-16 place-items-center rounded-full bg-danger text-white shadow-lg shadow-danger/30 transition-all group-hover:scale-105 group-active:scale-95">
              <PhoneOff className="h-7 w-7" />
            </span>
            <span className="text-xs font-medium text-ink-secondary">{t("common.cancel")}</span>
          </button>
          <button
            onClick={() => void callController.acceptIncoming()}
            className="group flex flex-col items-center gap-2"
          >
            <span className="grid h-16 w-16 place-items-center rounded-full bg-brand-gradient text-white shadow-lg shadow-ocean/30 transition-all group-hover:scale-105 group-active:scale-95">
              <Phone className="h-7 w-7" />
            </span>
            <span className="text-xs font-medium text-ink-secondary">{t("common.confirm")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function CallView() {
  const current = useCallStore((s) => s.current);
  const incoming = useCallStore((s) => s.incoming);
  const users = useChatStore((s) => s.users);
  const me = useChatStore((s) => s.me);
  const conversationsById = useChatStore((s) => s.conversationsById);
  const [elapsed, setElapsed] = useState(0);
  const [showAdmin, setShowAdmin] = useState(false);
  const t = useT();

  const shownCall = current;
  const conversation = shownCall
    ? conversationsById[shownCall.conversationId]
    : incoming
      ? conversationsById[incoming.conversationId]
      : undefined;
  const isAdmin = useMemo(() => {
    if (!shownCall || !conversation || conversation.kind !== "channel" || !me) return false;
    const role = conversation.members?.find((m) => m.userId === me.id)?.role;
    return role === "owner" || role === "admin";
  }, [conversation, me, shownCall]);

  useEffect(() => {
    if (!shownCall || shownCall.phase === "ended") return;
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - shownCall.startedAt) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [shownCall?.startedAt, shownCall?.phase]);

  if (!current && !incoming) return null;

  if (incoming && !current) {
    const from = users[incoming.fromUserId];
    const convTitle = conversationsById[incoming.conversationId]?.name ?? from?.displayName ?? t("call.incomingCall");
    return <IncomingView incoming={incoming} from={from} convTitle={convTitle} />;
  }

  if (!current) return null;

  const cur = current;
  const otherName =
    users[conversation?.memberIds.find((id) => id !== me?.id) ?? ""]?.displayName
    ?? t("call.title");
  const title = (conversation?.kind === "channel" ? conversation.name : otherName) ?? t("call.title");
  const remotes = Object.values(cur.remoteMedia);
  const participants = Object.values(cur.participants).filter((p) => p.userId !== me?.id);
  const remoteUserIds = new Set(remotes.map((r) => r.userId));
  const participantsWithoutMedia = participants.filter((p) => !remoteUserIds.has(p.userId));

  // Outgoing (dialing) — show a dedicated, lightweight screen until the
  // callee accepts. The full call UI is only shown once we have a live
  // media connection (phase = connecting or active).
  if (cur.phase === "outgoing") {
    return <DialingView cur={cur} conversation={conversation} otherName={otherName} />;
  }

  const status =
    cur.phase === "ended"
      ? t("call.ended")
      : cur.phase === "connecting"
        ? t("call.connecting")
        : `${Math.floor(elapsed / 60).toString().padStart(2, "0")}:${(elapsed % 60).toString().padStart(2, "0")}`;

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-hidden bg-gradient-to-b from-app via-surface-soft/40 to-brand-soft/60 text-ink-primary">
      <div className="aurora-bg opacity-50" />
      <div className="grain opacity-20" />

      <div className="relative z-10 flex items-center justify-between border-b border-line-light/70 bg-surface/70 px-4 py-3 backdrop-blur-xl md:px-6 md:py-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {conversation?.kind === "channel" && (
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-xl bg-brand-soft ring-1 ring-line-light/70">
              {conversation.avatarUrl ? (
                <SafeImage
                  src={resolveAttachmentUrl(conversation.avatarUrl)}
                  className="h-full w-full object-cover"
                  fallbackClassName="h-full w-full bg-brand-soft"
                />
              ) : (
                <div className="grid h-full w-full place-items-center bg-brand-gradient text-sm font-semibold text-white">
                  {(conversation.name ?? "?").slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold md:text-lg">{title}</div>
            <div className="flex items-center gap-2 text-xs text-ink-secondary md:text-sm">
              {cur.kind === "video" ? t("call.video") : t("call.audio")}
              <span className="text-ink-muted">·</span>
              <span>{status}</span>
              {cur.phase === "active" && cur.latency !== undefined && (
                <span className="ml-1 hidden rounded-full bg-surface-soft px-2 py-0.5 text-[10px] font-mono text-ink-secondary md:inline-flex">
                  {cur.latency}ms{cur.jitter !== undefined ? ` / ${cur.jitter}ms` : ""}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full bg-surface-soft px-3 py-1 text-xs text-ink-secondary ring-1 ring-line-light/70">
            <Users className="h-3.5 w-3.5" />
            <span>{participants.length + 1}</span>
          </div>
          {isAdmin && participants.length > 0 && (
            <button
              onClick={() => setShowAdmin(!showAdmin)}
              className={cn(
                "rounded-full p-2 transition-colors ring-1",
                showAdmin
                  ? "bg-ocean/15 text-ocean ring-ocean/30"
                  : "bg-surface-soft text-ink-secondary ring-line-light/70 hover:bg-brand-soft",
              )}
            >
              <Shield className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto p-3 md:p-6">
        <div
          className={cn(
            "mx-auto grid max-w-6xl gap-3 md:gap-4",
            remotes.length + participantsWithoutMedia.length <= 1
              ? "grid-cols-1"
              : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
          )}
        >
          {remotes.map((m) => {
            const participant = cur.participants[m.userId];
            const user = users[m.userId];
            return (
              <MediaTile
                key={`${m.userId}:${m.kind}`}
                stream={m.stream}
                muted={participant?.muted}
                publishing={participant?.publishing}
                label={`${user?.displayName ?? t("member.member")}${m.kind === "screen" ? ` ${t("call.screen")}` : ""}`}
                localStream={cur.localStream}
                avatarUrl={user?.avatarUrl}
              />
            );
          })}
          {participantsWithoutMedia.map((p) => {
            const user = users[p.userId];
            return (
              <MediaTile
                key={p.userId}
                stream={null}
                muted={p.muted}
                publishing={p.publishing}
                label={user?.displayName ?? t("member.member")}
                localStream={cur.localStream}
                avatarUrl={user?.avatarUrl}
              />
            );
          })}
          {remotes.length === 0 && participantsWithoutMedia.length === 0 && (
            <MediaTile
              stream={cur.localStream}
              muted={cur.localMuted}
              label={t("call.mySelf")}
              localStream={cur.localStream}
              isLocal
              localMuted={cur.localMuted}
              avatarUrl={me?.avatarUrl}
            />
          )}
        </div>

        {cur.error && (
          <div className="mx-auto mt-4 max-w-xl animate-fade-in-up rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-center text-sm text-danger backdrop-blur">
            {cur.error}
          </div>
        )}

        {isAdmin && showAdmin && participants.length > 0 && (
          <div className="mx-auto mt-4 max-w-3xl animate-fade-in-up rounded-2xl border border-line-light/70 bg-surface/80 p-4 shadow-soft backdrop-blur-xl">
            <div className="mb-3 flex items-center gap-2 px-1 text-sm font-medium text-ink-secondary">
              <Shield className="h-4 w-4 text-ocean" />
              {t("call.manage")}
              {cur.phase === "active" && cur.latency !== undefined && (
                <span className="ml-auto hidden text-[10px] font-mono text-ink-muted md:inline">
                  {cur.latency}ms{cur.jitter !== undefined ? ` / ${cur.jitter}ms` : ""}
                  {cur.packetLoss !== undefined ? ` / ${cur.packetLoss}% ${t("call.packetLoss")}` : ""}
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              {participants.map((p) => {
                const user = users[p.userId];
                return (
                  <div
                    key={p.userId}
                    className="flex items-center justify-between rounded-xl bg-surface-soft px-3 py-2 transition-colors hover:bg-brand-soft"
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 overflow-hidden rounded-full ring-1 ring-line-light/70">
                        <SafeImage
                          src={user?.avatarUrl ? resolveAttachmentUrl(user.avatarUrl) : undefined}
                          className="h-full w-full object-cover"
                          fallbackClassName="h-full w-full bg-brand-gradient"
                          fallbackSize={24}
                        />
                      </div>
                      <span className="text-sm text-ink-primary">{user?.displayName ?? p.userId}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => callController.admin(p.muted ? "unmute" : "mute", p.userId)}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-xs transition-colors ring-1",
                          p.muted
                            ? "bg-danger/10 text-danger ring-danger/30 hover:bg-danger/20"
                            : "bg-surface-soft text-ink-secondary ring-line-light/70 hover:bg-brand-soft",
                        )}
                      >
                        <Volume2 className="mr-1 inline h-3.5 w-3.5" />
                        {p.muted ? t("call.unmute") : t("call.mute")}
                      </button>
                      <button
                        onClick={() => callController.admin("ban", p.userId)}
                        className="rounded-full bg-danger/10 px-3 py-1.5 text-xs text-danger ring-1 ring-danger/30 transition-colors hover:bg-danger/20"
                      >
                        <UserX className="mr-1 inline h-3.5 w-3.5" />
                        {t("call.removeMember")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="relative z-10 flex items-center justify-center gap-3 border-t border-line-light/70 bg-surface/85 px-4 py-4 backdrop-blur-xl md:gap-4 md:py-5">
        <button
          onClick={() => callController.toggleMute()}
          className={cn(
            "grid h-12 w-12 place-items-center rounded-full transition-all ring-1 active:scale-90 md:h-14 md:w-14",
            cur.localMuted
              ? "bg-danger text-white shadow-lg shadow-danger/30 ring-danger/40"
              : "bg-surface-soft text-ink-primary ring-line-light/70 shadow-soft hover:bg-brand-soft",
          )}
          title={cur.localMuted ? t("call.unmute") : t("call.mute")}
        >
          {cur.localMuted ? <MicOff className="h-5 w-5 md:h-6 md:w-6" /> : <Mic className="h-5 w-5 md:h-6 md:w-6" />}
        </button>

        {cur.kind === "video" && (
          <button
            onClick={() => callController.toggleCamera()}
            className={cn(
              "grid h-12 w-12 place-items-center rounded-full transition-all ring-1 active:scale-90 md:h-14 md:w-14",
              cur.cameraOff
                ? "bg-surface-soft text-ink-muted ring-line-light/70 shadow-soft"
                : "bg-surface-soft text-ink-primary ring-line-light/70 shadow-soft hover:bg-brand-soft",
            )}
          >
            {cur.cameraOff ? (
              <VideoOff className="h-5 w-5 md:h-6 md:w-6" />
            ) : (
              <Video className="h-5 w-5 md:h-6 md:w-6" />
            )}
          </button>
        )}

        <button
          onClick={() => void callController.shareScreen()}
          className={cn(
            "grid h-12 w-12 place-items-center rounded-full transition-all ring-1 active:scale-90 md:h-14 md:w-14",
            cur.screenSharing
              ? "bg-ocean text-white shadow-lg shadow-ocean/30 ring-ocean/40"
              : "bg-surface-soft text-ink-primary ring-line-light/70 shadow-soft hover:bg-brand-soft",
          )}
        >
          <MonitorUp className="h-5 w-5 md:h-6 md:w-6" />
        </button>

        <button
          onClick={() => callController.hangup()}
          className="grid h-14 w-14 place-items-center rounded-full bg-danger text-white shadow-xl shadow-danger/30 transition-all ring-1 ring-danger/40 hover:brightness-110 active:scale-90 md:h-16 md:w-16"
          title={t("common.cancelCall")}
        >
          <PhoneOff className="h-6 w-6 md:h-7 md:w-7" />
        </button>
      </div>
    </div>
  );
}

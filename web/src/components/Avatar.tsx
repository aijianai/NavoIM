import { useState } from "react";
import { cn, initials, channelColor, resolveAttachmentUrl } from "../lib/utils";
import type { PresenceStatus, PublicUser } from "@navo/shared";
import { useT } from "../lib/i18n";

const SIZE_CLASSES = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-lg",
} as const;

const GROUP_SIZE_CLASSES = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-7 w-7 text-[11px]",
  md: "h-9 w-9 text-xs",
  lg: "h-10 w-10 text-sm",
  xl: "h-12 w-12 text-base",
} as const;

function NavoFallbackMark({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="navo-av-fallback" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#66B8FF" />
          <stop offset="0.5" stopColor="#2F7DFF" />
          <stop offset="1" stopColor="#8A6CFF" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#navo-av-fallback)" />
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

export function Avatar({
  user,
  size = "md",
  showPresence = false,
  className,
  ring = false,
  onClick,
}: {
  user: PublicUser;
  size?: keyof typeof SIZE_CLASSES;
  showPresence?: boolean;
  className?: string;
  ring?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const isAI = user.username === "navo_ai";
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = user.avatarUrl && !imgFailed;
  const sizePx: Record<keyof typeof SIZE_CLASSES, number> = {
    xs: 16, sm: 22, md: 28, lg: 36, xl: 48,
  };
  return (
    <div className={cn("relative shrink-0", className)}>
      <div
        onClick={onClick}
        role={onClick ? "button" : undefined}
        className={cn(
          "flex items-center justify-center overflow-hidden rounded-full font-semibold text-white",
          SIZE_CLASSES[size],
          ring && "ring-2 ring-surface",
          onClick && "cursor-pointer transition-transform hover:scale-105",
        )}
        style={{
          background: isAI
            ? "conic-gradient(from 220deg, #8EEBFF, #2F7DFF, #8A6CFF, #8EEBFF)"
            : `linear-gradient(135deg, ${user.avatarColor} 0%, #2F7DFF 100%)`,
          boxShadow: isAI ? "0 0 0 1px rgba(142,235,255,0.6)" : undefined,
        }}
        aria-label={user.displayName}
      >
        {showImage ? (
          <img
            src={resolveAttachmentUrl(user.avatarUrl!)}
            alt={user.displayName}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : isAI ? (
          <AISpark />
        ) : imgFailed ? (
          <NavoFallbackMark size={sizePx[size]} />
        ) : (
          initials(user.displayName)
        )}
      </div>
      {showPresence && <PresenceDot status={user.status} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-surface" />}
    </div>
  );
}

function AISpark() {
  return (
    <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" fill="none" aria-hidden>
      <path
        d="M12 2l1.8 5.4L19 9.2l-4.5 3 1.5 5.4L12 14.8 7 17.6l1.5-5.4-4.5-3 5.2-1.8L12 2z"
        fill="white"
      />
    </svg>
  );
}

const STATUS_COLOR: Record<PresenceStatus, string> = {
  online: "bg-success",
  away: "bg-warning",
  busy: "bg-danger",
  offline: "bg-ink-muted",
};

export function PresenceDot({
  status,
  className,
  pulse = true,
}: {
  status: PresenceStatus;
  className?: string;
  pulse?: boolean;
}) {
  const t = useT();
  return (
    <span
      className={cn(
        "block h-2.5 w-2.5 rounded-full",
        STATUS_COLOR[status],
        pulse && status === "online" && "animate-pulse-dot",
        className,
      )}
      aria-label={`${t("user.status")}: ${status}`}
    />
  );
}

export function GroupAvatar({
  name,
  conversationId,
  avatarUrl,
  icon,
  size = "md",
  className,
}: {
  name?: string;
  conversationId: string;
  avatarUrl?: string;
  icon?: string;
  size?: keyof typeof GROUP_SIZE_CLASSES;
  className?: string;
}) {
  const t = useT();
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = !!avatarUrl && !imgFailed;
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-lg font-semibold text-white",
        GROUP_SIZE_CLASSES[size],
        className,
      )}
      style={
        showImage
          ? undefined
          : { background: `linear-gradient(135deg, ${channelColor(conversationId)} 0%, #2F7DFF 100%)` }
      }
    >
      {showImage ? (
        <img
          src={resolveAttachmentUrl(avatarUrl!)}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : imgFailed ? (
        <NavoFallbackMark size={20} />
      ) : icon && icon !== "#" ? (
        <span>{icon}</span>
      ) : (
        initials(name ?? t("common.unknown"))
      )}
    </div>
  );
}

import { t, type Language, detectBrowserLanguage, type Message } from "@navo/shared";
import { clsx, type ClassValue } from "clsx";
import { getToken } from "./api";

/** Simple className combiner — no tailwind-merge needed for this codebase. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/** Initials from a display name, max 2 chars. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const CHANNEL_COLORS = [
  "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
  "#f43f5e", "#ef4444", "#f97316", "#eab308", "#84cc16",
  "#22c55e", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6",
];

export function channelColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CHANNEL_COLORS[Math.abs(hash) % CHANNEL_COLORS.length];
}

function detectCurrentLang(): Language {
  try {
    const stored = localStorage.getItem("navo:im:language");
    if (stored === "en" || stored === "ja") return stored;
  } catch {}
  return detectBrowserLanguage();
}

/** Format a timestamp into a chat-friendly label. */
export function formatTime(iso: string, lang?: Language): string {
  const d = new Date(iso);
  const l = lang || detectCurrentLang();
  const locale = l === "ja" ? "ja-JP" : l === "en" ? "en-US" : "zh-CN";
  return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: l === "en" });
}

/** Relative time formatting */
export function formatRelative(iso: string, lang?: Language): string {
  const l = lang || detectCurrentLang();
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return t(l, "time.justNow");
  if (diff < 3600) return t(l, "time.minutesAgo", { n: Math.floor(diff / 60) });
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round((today.getTime() - that.getTime()) / 86400000);
  if (dayDiff === 0) return formatTime(iso, l);
  if (dayDiff === 1) return t(l, "time.yesterday", { time: formatTime(iso, l) });
  if (dayDiff < 7) {
    const locale = l === "ja" ? "ja-JP" : l === "en" ? "en-US" : "zh-CN";
    return d.toLocaleDateString(locale, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  }
  const locale = l === "ja" ? "ja-JP" : l === "en" ? "en-US" : "zh-CN";
  return d.toLocaleDateString(locale, { month: "long", day: "numeric" });
}

/** Day-divider label */
export function dayLabel(iso: string, lang?: Language): string {
  const l = lang || detectCurrentLang();
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round((today.getTime() - that.getTime()) / 86400000);
  if (dayDiff === 0) return t(l, "time.today");
  if (dayDiff === 1) return t(l, "time.yesterday", { time: "" }).replace(" {time}", "").replace("{time}", "");
  const locale = l === "ja" ? "ja-JP" : l === "en" ? "en-US" : "zh-CN";
  return d.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}

export function isVideo(mime: string): boolean {
  return mime.startsWith("video/");
}

export function isAudio(mime: string): boolean {
  return mime.startsWith("audio/");
}

/**
 * Returns true when the message text contains a mention of the given user,
 * either by `@displayName` or by `@username`. The match is whitespace-anchored
 * (mention must be a discrete token) so it doesn't false-positive on
 * e.g. "alice" matching "ali".
 *
 * Also recognizes a `@@all` / `@所有人` mention as addressing the current
 * user (it's effectively a mention of everyone in a channel).
 */
export function messageMentionsUser(
  text: string,
  user: { displayName: string; username: string } | null | undefined,
): boolean {
  if (!user) return false;
  if (!text) return false;
  if (text.includes("@@all") || text.includes(t(detectCurrentLang(), "composer.everyone"))) return true;
  const names = new Set([user.displayName, user.username].filter(Boolean));
  for (const name of names) {
    // Mention token is `@<name>` followed by anything that isn't another
    // word char — covers "@alice" / "@alice," / "@alice " / end-of-string.
    const re = new RegExp(`@${name.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}(?![A-Za-z0-9_])`, "g");
    if (re.test(text)) return true;
  }
  return false;
}

/**
 * Download an attachment with its ORIGINAL `name` as the saved filename.
 *
 * Servers in the wild tend to use the random upload id (e.g. `a8f...navofile`)
 * as the Content-Disposition filename because the original name lives in
 * metadata. We fetch the blob ourselves and feed it to a temporary <a> with
 * the `download` attribute set to the attachment's `name`, so the user gets a
 * sensibly named file.
 */
/**
 * Sniff a video's first decodable frame and return it as a data URL.
 * Used to give video attachments a "poster" thumbnail so the message card
 * doesn't have to load the full video just to render a preview tile.
 *
 * The poster is intentionally small (~width 320) and JPEG-compressed so
 * the resulting data URL stays well under 100 KB even for long clips.
 */
/**
 * Sniff a video's first decodable frame and return it as a data URL.
 * Used to give video attachments a "poster" thumbnail so the message card
 * doesn't have to load the full video just to render a preview tile.
 *
 * Implementation notes:
 *  - We use `preload="metadata"`, NOT `auto`. Otherwise some browsers
 *    (notably mobile Safari) will start streaming the entire clip before
 *    `loadeddata` fires, which can take 30+ seconds for a long 4K file.
 *    With `preload="metadata"` the browser only fetches the file header
 *    and a tiny first-frame fragment — enough to know width/height and
 *    to have a decodable frame on the canvas.
 *  - We draw whatever the <video> element has right now (frame 0) instead
 *    of seeking to t=0.1. Seeking requires the decoder to buffer up to that
 *    point and can stall on slow hardware.
 *  - The whole thing is wrapped in a 2.5s safety timeout. If poster
 *    extraction fails for any reason we return `undefined` and the upload
 *    proceeds without one — better a poster-less bubble than a forever-
 *    pending upload.
 */
export async function extractVideoPoster(file: File, maxWidth = 320): Promise<string | undefined> {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  // Off-screen so the user never sees a flicker when the element is added.
  video.style.position = "fixed";
  video.style.left = "-9999px";
  video.style.top = "0";
  video.style.pointerEvents = "none";
  document.body.appendChild(video);

  const cleanup = () => {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    try { video.load(); } catch { /* noop */ }
    if (video.parentNode) video.parentNode.removeChild(video);
  };

  return new Promise<string | undefined>((resolve) => {
    let settled = false;
    const finish = (result: string | undefined) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const draw = () => {
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) {
          finish(undefined);
          return;
        }
        const ratio = Math.min(1, maxWidth / w);
        const cw = Math.max(1, Math.round(w * ratio));
        const ch = Math.max(1, Math.round(h * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          finish(undefined);
          return;
        }
        ctx.drawImage(video, 0, 0, cw, ch);
        let dataUrl: string;
        try {
          dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        } catch {
          dataUrl = canvas.toDataURL("image/png");
        }
        finish(dataUrl);
      } catch {
        finish(undefined);
      }
    };
    video.addEventListener("loadedmetadata", draw, { once: true });
    video.addEventListener("error", () => finish(undefined), { once: true });
    // Safety net so the upload is never blocked by a slow/stalled decoder.
    window.setTimeout(() => finish(undefined), 2500);
    video.src = url;
  });
}

/**
 * 附件在服务端以 `.navofile` 存储，下载时应保存为 attachment.name（真实文件名+后缀）。
 */
export function resolveDownloadFileName(displayName: string): string {
  const name = (displayName || "").trim();
  if (!name) return "download";
  if (/\.navofile$/i.test(name)) {
    const stripped = name.replace(/\.navofile$/i, "").trim();
    return stripped || "download";
  }
  return name;
}

export async function downloadAttachment(url: string, name: string) {
  const saveName = resolveDownloadFileName(name);
  const fullUrl = resolveAttachmentUrl(url);
  const { saveBlob } = await import("./download");

  const token = getToken();
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

  let res: Response;
  try {
    if (fullUrl.startsWith("http://") || fullUrl.startsWith("https://")) {
      res = await fetch(fullUrl, { headers });
    } else {
      res = await apiFetch(url, { headers });
    }
    if (!res.ok) throw new Error(t(detectCurrentLang(), "error.downloadFailed", { status: String(res.status) }));
    const blob = await res.blob();
    await saveBlob(blob, saveName);
  } catch (err) {
    console.error("download failed", err);
    window.open(fullUrl || url, "_blank", "noopener");
  }
}

/**
 * Safe date parsing that returns 0 for invalid dates instead of NaN.
 * Prevents NaN propagation in time comparisons.
 */
export function safeDateMs(dateStr: string | undefined | null): number {
  if (!dateStr) return 0;
  const t = new Date(dateStr).getTime();
  return Number.isFinite(t) ? t : 0;
}

export const EMOJI_TOKEN_RE = /\[emoji:([A-Za-z0-9_\-]+\.webp)\]|webp:([A-Za-z0-9_\-]+\.webp)/g;

export function normalizeEmojiTokens(text: string): string {
  return text.replace(/webp:([A-Za-z0-9_\-]+\.webp)/g, "[emoji:$1]");
}

export function emojiPreviewText(text: string): string {
  EMOJI_TOKEN_RE.lastIndex = 0;
  const l = detectCurrentLang();
  return text.replace(EMOJI_TOKEN_RE, t(l, "message.emoji"));
}

export function messagePreview(msg: Message, users?: Record<string, { displayName: string }>): string {
  const l = detectCurrentLang();
  if (msg.kind === "system") return msg.text || t(l, "message.card.system");
  if (msg.kind === "friendCard") {
    const name = msg.cardId && users?.[msg.cardId]?.displayName;
    return name ? `${t(l, "message.card.friend")} ${name}` : t(l, "message.card.friend");
  }
  if (msg.kind === "channelCard") {
    const name = msg.cardId && users?.[msg.cardId]?.displayName;
    return name ? `${t(l, "message.card.channel")} ${name}` : t(l, "message.card.channel");
  }
  if (msg.kind === "location") {
    try {
      const loc = JSON.parse(msg.text);
      const label = loc.name || loc.address || `${loc.latitude}, ${loc.longitude}`;
      return `${t(l, "message.card.location")} ${label}`;
    } catch {
      return t(l, "message.card.location");
    }
  }
  if (msg.kind === "poll") {
    try {
      const poll = JSON.parse(msg.text);
      return poll.question ? `${t(l, "message.card.poll")} ${poll.question}` : t(l, "message.card.poll");
    } catch {
      return t(l, "message.card.poll");
    }
  }
  if (msg.kind === "forwardedCard") return t(l, "message.card.forwarded");
  const text = msg.text?.trim();
  if (text) return normalizeEmojiTokens(text);
  if (msg.attachments.length > 0) {
    const img = msg.attachments.find((a) => isImage(a.mimeType));
    if (img) return msg.attachments.length > 1 ? t(l, "message.card.images", { count: msg.attachments.length }) : t(l, "message.card.image");
    return msg.attachments.length > 1 ? t(l, "message.card.files", { count: msg.attachments.length }) : `${t(l, "message.card.file")} ${msg.attachments[0].name}`;
  }
  return "";
}

export function resolveBase(): string {
  return (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");
}

export function emojiUrl(name: string): string {
  const base = resolveBase();
  return base ? `${base}/emoji/${name}` : `/emoji/${name}`;
}

export function resolveAttachmentUrl(url: string | undefined | null): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return url;
  const base = resolveBase();
  return base ? `${base}${url.startsWith("/") ? "" : "/"}${url}` : url;
}

/** fetch wrapper that prefixes relative paths with VITE_API_BASE (APK mode). */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = resolveBase();
  const url = base ? `${base}${path}` : path;
  return fetch(url, init);
}

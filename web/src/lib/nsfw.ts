/**
 * NSFW 审核：通过本地服务端 /api/nsfw/check 检测（nsfwjs 模型运行在服务端）
 */

import { apiFetch } from "./utils";

const THRESHOLD = 0.6;

export interface NsfwResult {
  ok: boolean;
  reason?: string;
  score?: number;
}

/** 保留兼容接口，客户端始终走服务端检测 */
export function configureNsfw(_serverEnabled: boolean, threshold: number, _clientEnabled = false): void {
  void _serverEnabled;
  void _clientEnabled;
  void threshold;
}

async function postNsfwCheck(blob: Blob, mimeType: string): Promise<NsfwResult> {
  const form = new FormData();
  form.append("file", blob, mimeType.startsWith("video/") ? "frame.jpg" : "upload");
  try {
    const res = await apiFetch("/api/nsfw/check", { method: "POST", body: form });
    if (res.status === 400) {
      return { ok: false, reason: "nsfw.rejected" };
    }
    if (!res.ok) return { ok: true };
    const data = (await res.json()) as { ok?: boolean; score?: number };
    if (data.ok === false) return { ok: false, reason: "nsfw.rejected", score: data.score };
    return { ok: true, score: data.score };
  } catch {
    return { ok: true };
  }
}

/** 对图片 URL/Blob 进行 NSFW 检查 */
export async function checkImageNsfw(src: string): Promise<NsfwResult> {
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    return postNsfwCheck(blob, blob.type || "image/jpeg");
  } catch {
    return { ok: true };
  }
}

/** 对视频文件抽取关键帧，逐帧提交服务端检测 */
export async function checkVideoNsfw(file: File): Promise<NsfwResult> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  video.crossOrigin = "anonymous";
  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("Video load failed")), { once: true });
      setTimeout(() => reject(new Error("Video load timeout")), 15000);
    });
    const duration = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const timePoints = duration > 0
      ? [Math.min(0.5, duration * 0.1), duration * 0.25, duration * 0.5, duration * 0.75, Math.max(0, duration - 0.5)]
      : [0];
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: true };
    let maxScore = 0;
    for (const t of timePoints) {
      try {
        await seekTo(video, t);
        const vw = video.videoWidth || 320;
        const vh = video.videoHeight || 240;
        const scale = Math.min(1, 480 / Math.max(vw, vh));
        canvas.width = Math.max(1, Math.round(vw * scale));
        canvas.height = Math.max(1, Math.round(vh * scale));
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85);
        });
        if (!blob) continue;
        const result = await postNsfwCheck(blob, "image/jpeg");
        if (!result.ok) return result;
        if (result.score && result.score > maxScore) maxScore = result.score;
        if (maxScore >= THRESHOLD) return { ok: false, reason: "nsfw.rejected", score: maxScore };
      } catch {
        // 单帧失败跳过
      }
    }
    return { ok: true, score: maxScore };
  } catch (e) {
    console.error("[nsfw] video check failed:", e);
    return { ok: true };
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      clearTimeout(timer);
      resolve();
    };
    let timer: ReturnType<typeof setTimeout>;
    video.addEventListener("seeked", onSeeked, { once: true });
    timer = setTimeout(() => {
      video.removeEventListener("seeked", onSeeked);
      reject(new Error("seek timeout"));
    }, 5000);
    try {
      video.currentTime = Math.max(0, Math.min(time, video.duration || 0));
    } catch (e) {
      clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      reject(e as Error);
    }
  });
}

export const NSFW_CLASSES = ["Porn", "Hentai", "Sexy", "Neutral", "Drawing"];

/**
 * NSFW 本地审核（内置 nsfwjs 模型，上传图片时自动检测）
 */

import fs from "node:fs/promises";
import type * as TfTypes from "@tensorflow/tfjs";
import type { Sharp, SharpOptions } from "sharp";
import { queryOne } from "./db.js";

type SharpFactory = (input?: Buffer | SharpOptions) => Sharp;

type NsfwModel = {
  classify: (img: TfTypes.Tensor3D) => Promise<Array<{ className: string; probability: number }>>;
};

interface NsfwRuntimeConfig {
  enabled: boolean;
  threshold: number;
}

const INPUT_SIZE = 224;

let modelLoad: Promise<NsfwModel | null> | null = null;
let configCache: NsfwRuntimeConfig | null = null;
let tfMod: typeof TfTypes | null = null;
let sharpFactory: SharpFactory | null = null;
let warmupDone = false;

/** 优先使用 tfjs-node（原生加速），失败则回退纯 JS 后端 */
async function getTf(): Promise<typeof TfTypes> {
  if (!tfMod) {
    try {
      tfMod = await import("@tensorflow/tfjs-node") as typeof TfTypes;
    } catch {
      tfMod = await import("@tensorflow/tfjs");
    }
    tfMod.enableProdMode();
    await tfMod.ready();
  }
  return tfMod;
}

async function getSharp(): Promise<SharpFactory> {
  if (!sharpFactory) {
    const mod = await import("sharp");
    sharpFactory = (mod as { default: SharpFactory }).default ?? (mod as unknown as SharpFactory);
  }
  return sharpFactory;
}

/** 从 system_settings 读取 NSFW 开关与阈值（带内存缓存） */
async function getNsfwConfig(): Promise<NsfwRuntimeConfig> {
  if (configCache) return configCache;
  const enabledRow = await queryOne<{ value: string }>(
    "SELECT value FROM system_settings WHERE `key` = 'nsfwEnabled'",
  );
  const thresholdRow = await queryOne<{ value: string }>(
    "SELECT value FROM system_settings WHERE `key` = 'nsfwThreshold'",
  );
  configCache = {
    enabled: enabledRow?.value === "true",
    threshold: Math.max(0, Math.min(1, parseFloat(thresholdRow?.value || "0.6"))),
  };
  return configCache;
}

/** 懒加载 nsfwjs 模型（进程内只加载一次） */
async function loadModel(): Promise<NsfwModel | null> {
  if (!modelLoad) {
    modelLoad = (async () => {
      try {
        await getTf();
        const nsfwjs = await import("nsfwjs");
        return (await nsfwjs.load()) as NsfwModel;
      } catch (e) {
        console.warn("[nsfw] model load failed:", e);
        return null;
      }
    })();
  }
  return modelLoad;
}

/** 将图片 Buffer 转为 224×224 RGB 张量（最快路径预处理） */
async function bufferToTensor(buf: Buffer): Promise<TfTypes.Tensor3D> {
  const sharp = await getSharp();
  const tf = await getTf();
  const { data, info } = await sharp(buf)
    .resize(INPUT_SIZE, INPUT_SIZE, {
      fit: "fill",
      kernel: "nearest",
      fastShrinkOnLoad: true,
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3]);
}

export interface ServerNsfwResult {
  ok: boolean;
  reason?: string;
  score?: number;
  skipped?: boolean;
}

/** 对图片 Buffer 执行 NSFW 分类 */
export async function checkBufferNsfw(buf: Buffer, mimeType: string): Promise<ServerNsfwResult> {
  const cfg = await getNsfwConfig();
  if (!cfg.enabled) return { ok: true, skipped: true };
  if (!mimeType.startsWith("image/")) {
    return { ok: true };
  }
  const model = await loadModel();
  if (!model) return { ok: true };

  let tensor: TfTypes.Tensor3D | null = null;
  try {
    tensor = await bufferToTensor(buf);
    const predictions = await model.classify(tensor);

    let score = 0;
    for (const p of predictions) {
      if (p.className === "Porn" || p.className === "Hentai") score += p.probability;
    }
    if (score >= cfg.threshold) {
      return { ok: false, reason: "nsfw.rejected", score };
    }
    return { ok: true, score };
  } catch (e) {
    console.warn("[nsfw] classify failed:", e);
    return { ok: true };
  } finally {
    tensor?.dispose();
  }
}

/** 对本地文件路径执行 NSFW 检测（上传接口使用） */
export async function checkFileNsfw(filePath: string, mimeType: string): Promise<ServerNsfwResult> {
  const cfg = await getNsfwConfig();
  if (!cfg.enabled) return { ok: true, skipped: true };
  if (!mimeType.startsWith("image/") && !mimeType.startsWith("video/")) {
    return { ok: true };
  }
  if (mimeType.startsWith("video/")) {
    return { ok: true };
  }
  try {
    const buf = await fs.readFile(filePath);
    return checkBufferNsfw(buf, mimeType);
  } catch (e) {
    console.warn("[nsfw] file read failed:", e);
    return { ok: true };
  }
}

/** 服务启动时预热模型与推理管线（开启 NSFW 时后台执行） */
export async function warmupNsfw(): Promise<void> {
  if (warmupDone) return;
  try {
    const cfg = await getNsfwConfig();
    if (!cfg.enabled) return;
    const model = await loadModel();
    if (!model) return;
    const sharp = await getSharp();
    const tf = await getTf();
    const blank = await sharp({
      create: {
        width: INPUT_SIZE,
        height: INPUT_SIZE,
        channels: 3,
        background: { r: 128, g: 128, b: 128 },
      },
    })
      .raw()
      .toBuffer();
    const tensor = tf.tensor3d(new Uint8Array(blank), [INPUT_SIZE, INPUT_SIZE, 3]);
    try {
      await model.classify(tensor);
    } finally {
      tensor.dispose();
    }
    warmupDone = true;
    // eslint-disable-next-line no-console
    console.log("[nsfw] model warmed up");
  } catch (e) {
    console.warn("[nsfw] warmup failed:", e);
  }
}

/** 管理员更新配置后刷新阈值/开关缓存（不卸载已加载模型） */
export function reloadNsfwConfig(): void {
  configCache = null;
}

/** 基准测试：临时强制开启检测并返回耗时（不修改 DB） */
export async function benchNsfw(
  buf: Buffer,
  mimeType: string,
): Promise<{ elapsedMs: number; result: ServerNsfwResult }> {
  const cfg = await getNsfwConfig();
  const prev = configCache;
  configCache = { enabled: true, threshold: cfg.threshold };
  const t0 = performance.now();
  try {
    const result = await checkBufferNsfw(buf, mimeType);
    return { elapsedMs: performance.now() - t0, result };
  } finally {
    configCache = prev;
  }
}

export interface NsfwBenchResult {
  elapsedMs: number;
  score?: number;
  ok: boolean;
}

/** 性能基准：忽略 NSFW 开关，强制执行完整推理并返回耗时 */
export async function benchClassifyBuffer(buf: Buffer): Promise<NsfwBenchResult> {
  const t0 = performance.now();
  const model = await loadModel();
  if (!model) {
    return { elapsedMs: performance.now() - t0, ok: true };
  }

  let tensor: TfTypes.Tensor3D | null = null;
  try {
    tensor = await bufferToTensor(buf);
    const predictions = await model.classify(tensor);

    let score = 0;
    for (const p of predictions) {
      if (p.className === "Porn" || p.className === "Hentai") score += p.probability;
    }
    let threshold = 0.6;
    try {
      threshold = (await getNsfwConfig()).threshold;
    } catch {
      // 无 DB 时使用默认阈值
    }
    return {
      elapsedMs: performance.now() - t0,
      score,
      ok: score < threshold,
    };
  } catch (e) {
    console.warn("[nsfw] bench classify failed:", e);
    return { elapsedMs: performance.now() - t0, ok: true };
  } finally {
    tensor?.dispose();
  }
}

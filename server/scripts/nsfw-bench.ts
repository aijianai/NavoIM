/**
 * NSFW 单张图片检测耗时基准（使用 Navo 图标）
 *
 * 用法（仓库根目录）：
 *   npm run nsfw:bench
 *   npm run nsfw:bench -- web/appicon.png
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: resolve(import.meta.dirname, "../../.env") });

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const DEFAULT_IMAGE = resolve(REPO_ROOT, "web/appicon.png");
const WARMUP_ROUNDS = 1;
const BENCH_ROUNDS = 10;

function fmtMs(ms: number): string {
  return `${ms.toFixed(2)} ms`;
}

function stats(samples: number[]): { min: number; max: number; avg: number; p50: number } {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    avg: sum / (sorted.length || 1),
    p50: sorted[Math.floor(sorted.length / 2)] ?? 0,
  };
}

async function main(): Promise<void> {
  const argPath = process.argv[2];
  const imagePath = argPath
    ? (argPath.startsWith("/") ? resolve(argPath) : resolve(REPO_ROOT, argPath))
    : DEFAULT_IMAGE;
  const buf = await readFile(imagePath);
  const ext = imagePath.split(".").pop()?.toLowerCase() ?? "svg";
  const mimeType =
    ext === "svg" ? "image/svg+xml"
    : ext === "png" ? "image/png"
    : ext === "jpg" || ext === "jpeg" ? "image/jpeg"
    : ext === "webp" ? "image/webp"
    : "image/png";

  // 动态导入：确保 dotenv 已加载（DB 读阈值可选）
  const { benchNsfw, warmupNsfw, reloadNsfwConfig } = await import("../src/nsfw.js");

  // eslint-disable-next-line no-console
  console.log("=== Navo IM NSFW 单张检测基准 ===");
  // eslint-disable-next-line no-console
  console.log(`图片: ${imagePath}`);
  // eslint-disable-next-line no-console
  console.log(`大小: ${(buf.length / 1024).toFixed(2)} KB  MIME: ${mimeType}`);
  // eslint-disable-next-line no-console
  console.log("");

  let tfBackend = "unknown";
  try {
    const tf = await import("@tensorflow/tfjs-node");
    await tf.ready();
    tfBackend = tf.getBackend();
  } catch (err) {
    try {
      const tf = await import("@tensorflow/tfjs");
      await tf.ready();
      tfBackend = `${tf.getBackend()} (纯 JS 回退: ${err instanceof Error ? err.message.split("\n")[0] : "tfjs-node 不可用"})`;
    } catch {
      tfBackend = "unavailable";
    }
  }
  // eslint-disable-next-line no-console
  console.log(`TF 后端: ${tfBackend}`);
  // eslint-disable-next-line no-console
  console.log("");

  reloadNsfwConfig();

  // 冷启动：首次推理（含模型加载）
  const cold = await benchNsfw(buf, mimeType);
  // eslint-disable-next-line no-console
  console.log(`[冷启动] 首次检测: ${fmtMs(cold.elapsedMs)}  score=${cold.result.score?.toFixed(4) ?? "n/a"}  ok=${cold.result.ok}`);

  // 预热
  const warmupStart = performance.now();
  await warmupNsfw();
  const warmupMs = performance.now() - warmupStart;
  // eslint-disable-next-line no-console
  console.log(`[预热]   warmupNsfw(): ${fmtMs(warmupMs)}`);

  for (let i = 0; i < WARMUP_ROUNDS; i++) {
    await benchNsfw(buf, mimeType);
  }

  const samples: number[] = [];
  let lastScore: number | undefined;
  for (let i = 0; i < BENCH_ROUNDS; i++) {
    const { elapsedMs, result } = await benchNsfw(buf, mimeType);
    samples.push(elapsedMs);
    lastScore = result.score;
  }

  const s = stats(samples);
  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log(`[热路径] ${BENCH_ROUNDS} 次检测（模型已加载）:`);
  // eslint-disable-next-line no-console
  console.log(`  平均: ${fmtMs(s.avg)}`);
  // eslint-disable-next-line no-console
  console.log(`  中位: ${fmtMs(s.p50)}`);
  // eslint-disable-next-line no-console
  console.log(`  最小: ${fmtMs(s.min)}`);
  // eslint-disable-next-line no-console
  console.log(`  最大: ${fmtMs(s.max)}`);
  // eslint-disable-next-line no-console
  console.log(`  末次 score: ${lastScore?.toFixed(4) ?? "n/a"}`);
  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log("说明: 冷启动含模型加载；热路径接近实际上传单张图的审核耗时。");
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});

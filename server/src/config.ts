import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

export const ROOT = path.resolve(__dirname, "..");

/** All Redis keys + pubsub channels are namespaced under this prefix. */
export const REDIS_PREFIX = "navo:im:";

const PORT = Number(process.env.PORT ?? 8080);

const jwtSecret = process.env.JWT_SECRET;
const publicBaseUrl = process.env.PUBLIC_BASE_URL;
const aiApiKey = process.env.AI_API_KEY;

if (!jwtSecret) {
  console.error("[navo-im] FATAL: JWT_SECRET environment variable is required");
  process.exit(1);
}
if (!publicBaseUrl) {
  console.error("[navo-im] FATAL: PUBLIC_BASE_URL environment variable is required");
  process.exit(1);
}
if (!aiApiKey) {
  console.error("[navo-im] FATAL: AI_API_KEY environment variable is required");
  process.exit(1);
}

export const config = {
  port: PORT,
  jwtSecret,
  jwtExpiresIn: "7d",
  dataDir: path.join(ROOT, "data"),
  uploadsDir: path.join(ROOT, "uploads"),
  mysql: {
    host: process.env.MYSQL_HOST ?? "127.0.0.1",
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? "root",
    password: process.env.MYSQL_PASSWORD ?? "",
    database: process.env.MYSQL_DATABASE ?? "navo_im",
  },
  maxUploadBytes: 25 * 1024 * 1024, // 25MB
  /** Used to turn relative upload URLs into absolute ones for the multimodal AI. */
  publicBaseUrl,
  redis: {
    url: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
    prefix: REDIS_PREFIX,
    busChannel: `${REDIS_PREFIX}bus`,
    presenceTtl: 60,
  },
  ai: {
    baseUrl: process.env.AI_BASE_URL || "",
    apiKey: aiApiKey,
    model: process.env.AI_MODEL || "qwen3.6-plus",
    userId: "u_navo_ai",
    timeoutMs: 30_000,
  },
} as const;

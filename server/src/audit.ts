import { createWriteStream } from "node:fs";
import path from "node:path";
import { config } from "./config.js";

const logPath = path.join(config.dataDir, "audit.log");
const stream = createWriteStream(logPath, { flags: "a" });

export function auditLog(action: string, userId: string, details?: Record<string, unknown>) {
  const entry = {
    time: new Date().toISOString(),
    action,
    userId,
    details,
  };
  stream.write(JSON.stringify(entry) + "\n");
}

process.on("exit", () => stream.end());
process.on("SIGINT", () => stream.end());
process.on("SIGTERM", () => stream.end());

import http from "node:http";

import { config } from "./config.js";
import { createHttpApp } from "./http.js";
import { attachWebSocket, getHub } from "./ws.js";
import { shutdownRedis } from "./redis.js";
import { ScheduledDelivery } from "./scheduler.js";
import { initFCM } from "./fcm.js";
// Import db module for its boot-time side effect (open + migrate + seed).
import "./db.js";

// Validate required environment variables before starting.
if (!config.jwtSecret) {
  console.error("[navo-im] FATAL: JWT_SECRET environment variable is required");
  process.exit(1);
}
if (!config.ai.apiKey) {
  console.error("[navo-im] FATAL: AI_API_KEY environment variable is required");
  process.exit(1);
}
if (!config.publicBaseUrl) {
  console.error("[navo-im] FATAL: PUBLIC_BASE_URL environment variable is required");
  process.exit(1);
}

const app = await createHttpApp(getHub);
const server = http.createServer(app);
const hub = attachWebSocket(server);

await initFCM();

const scheduler = new ScheduledDelivery(hub);
hub.setScheduler(scheduler);
void scheduler.start();

server.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[navo-im] server listening on http://0.0.0.0:${config.port}`);
  // eslint-disable-next-line no-console
  console.log(`[navo-im] redis prefix: ${config.redis.prefix}`);
  void import("./nsfw.js").then(({ warmupNsfw }) => warmupNsfw()).catch(() => {});
});

async function shutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.log(`[navo-im] received ${signal}, shutting down...`);
  scheduler.stop();
  hub.shutdown();
  server.close(() => {
    void shutdownRedis().then(() => process.exit(0));
  });
  // hard timeout
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

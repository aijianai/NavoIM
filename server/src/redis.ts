import { Redis } from "ioredis";
import type { ID, PresenceStatus, ServerEvent } from "@navo/shared";
import { config } from "./config.js";

/**
 * Three Redis clients:
 *  - `redis`    : general commands (presence, sockets, counters)
 *  - `pub`      : publishes WS bus events to other instances
 *  - `sub`      : subscribes to the WS bus channel
 *
 * All keys are prefixed with `navo:im:` to avoid colliding with anything
 * else sharing the Redis instance.
 */
export const redis = new Redis(config.redis.url, { keyPrefix: config.redis.prefix, lazyConnect: false });
export const pub = new Redis(config.redis.url, { keyPrefix: config.redis.prefix, lazyConnect: false });
// Subscribers ignore keyPrefix on subscribe(), so we use the fully-qualified channel name.
export const sub = new Redis(config.redis.url, { lazyConnect: false });

export const KEYS = {
  /** ZSET: userId -> last heartbeat ts. Used for fast online-set queries. */
  presence: "presence",
  /** STRING with TTL: per-user status. presence:status:<userId> = "online"|"away"|... */
  presenceStatus: (uid: ID) => `presence:status:${uid}`,
  /** SET: userId -> set of socketIds for that user (across all instances). */
  userSockets: (uid: ID) => `user:${uid}:sockets`,
  /** STRING with TTL: socketId -> userId, used to clean up on hard disconnect. */
  socketUser: (sid: string) => `socket:${sid}:user`,
} as const;

/** Set/refresh presence for a user. TTL ensures dead instances don't keep ghosts online. */
export async function setPresence(userId: ID, status: PresenceStatus) {
  const ttl = config.redis.presenceTtl;
  await redis
    .multi()
    .set(KEYS.presenceStatus(userId), status, "EX", ttl)
    .zadd(KEYS.presence, Date.now(), userId)
    .exec();
}

export async function clearPresence(userId: ID) {
  await redis.multi().del(KEYS.presenceStatus(userId)).zrem(KEYS.presence, userId).exec();
}

/** A bus message wraps a ServerEvent + the set of users to deliver it to. */
export interface BusMessage {
  /** Excludes a specific socket (for echo suppression) — only meaningful on origin instance. */
  excludeSocketId?: string;
  /** Deliver to these userIds (their connected sockets on each instance). */
  toUserIds: ID[];
  event: ServerEvent;
  /** Marker so origin can ignore its own publish. */
  originId: string;
}

export async function publishBus(msg: BusMessage) {
  await pub.publish(config.redis.busChannel, JSON.stringify(msg));
}

/** Subscribe; handler is invoked on every message. */
export async function subscribeBus(handler: (msg: BusMessage) => void) {
  await sub.subscribe(config.redis.busChannel);
  sub.on("message", (channel, raw) => {
    if (channel !== config.redis.busChannel) return;
    try {
      const msg = JSON.parse(raw) as BusMessage;
      handler(msg);
    } catch (err) {
      console.error("[redis] Failed to parse bus message:", err, raw.slice(0, 200));
    }
  });
}

export async function shutdownRedis() {
  await Promise.allSettled([redis.quit(), pub.quit(), sub.quit()]);
}

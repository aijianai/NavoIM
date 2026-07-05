type RateLimitKey = string;

interface Entry {
  timestamps: number[];
}

const stores = new Map<string, Map<RateLimitKey, Entry>>();

/** Users who hit rate limit while captcha is enabled — locked until they solve captcha. */
const captchaLockedUsers = new Set<RateLimitKey>();

function getStore(name: string): Map<RateLimitKey, Entry> {
  let store = stores.get(name);
  if (!store) {
    store = new Map();
    stores.set(name, store);
  }
  return store;
}

export function checkRateLimit(
  storeName: string,
  key: RateLimitKey,
  max: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetAfterMs: number } {
  const store = getStore(storeName);
  const now = Date.now();
  const entry = store.get(key);

  if (!entry) {
    store.set(key, { timestamps: [now] });
    return { allowed: true, remaining: max - 1, resetAfterMs: windowMs };
  }

  const cutoff = now - windowMs;
  const recent = entry.timestamps.filter((t) => t > cutoff);
  entry.timestamps = recent;

  if (recent.length >= max) {
    const oldest = recent[0];
    const resetAfterMs = oldest + windowMs - now;
    return { allowed: false, remaining: 0, resetAfterMs: Math.max(resetAfterMs, 1000) };
  }

  recent.push(now);
  entry.timestamps = recent;
  return { allowed: true, remaining: max - recent.length, resetAfterMs: windowMs };
}

/** A user has hit the rate limit and must solve captcha before sending again. */
export function setCaptchaLock(key: RateLimitKey): void {
  captchaLockedUsers.add(key);
}

/** Check if user is captcha-locked (persistent across rate limit windows). */
export function isCaptchaLocked(key: RateLimitKey): boolean {
  return captchaLockedUsers.has(key);
}

export function resetRateLimit(storeName: string, key: RateLimitKey): void {
  const store = getStore(storeName);
  store.delete(key);
  captchaLockedUsers.delete(key);
}

setInterval(() => {
  const now = Date.now();
  for (const store of stores.values()) {
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter((t) => t > now - 120_000);
      if (entry.timestamps.length === 0) store.delete(key);
    }
  }
}, 60_000);

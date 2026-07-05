import type { ID } from "@navo/shared";

let messaging: any = null;

export async function initFCM(): Promise<void> {
  try {
    // @ts-expect-error firebase-admin is an optional peer dependency
    const admin = await import("firebase-admin");
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    messaging = admin.messaging();
    console.log("[fcm] Firebase initialized");
  } catch (err) {
    console.warn("[fcm] Firebase init failed (missing GOOGLE_APPLICATION_CREDENTIALS?):", (err as Error).message);
  }
}

const tokenStore = new Map<ID, Set<string>>();

export function registerToken(userId: ID, token: string): void {
  let tokens = tokenStore.get(userId);
  if (!tokens) {
    tokens = new Set();
    tokenStore.set(userId, tokens);
  }
  tokens.add(token);
}

export function unregisterToken(userId: ID, token: string): void {
  tokenStore.get(userId)?.delete(token);
}

export function clearUserTokens(userId: ID): void {
  tokenStore.delete(userId);
}

export function getAllTokens(): ID[] {
  return Array.from(tokenStore.keys());
}

interface PushPayload {
  userIds: ID[];
  type: string;
  title?: string;
  body?: string;
  conversationId?: string;
  messageId?: string;
  kind?: string;
  text?: string;
}

export async function sendPush(payload: PushPayload): Promise<void> {
  if (!messaging) return;

  const tokens: string[] = [];
  for (const uid of payload.userIds) {
    const userTokens = tokenStore.get(uid);
    if (userTokens) tokens.push(...Array.from(userTokens));
  }
  if (tokens.length === 0) return;

  try {
    const result = await messaging.sendEachForMulticast({
      data: {
        type: payload.type,
        title: payload.title ?? "",
        body: payload.body ?? "",
        conversationId: payload.conversationId ?? "",
        messageId: payload.messageId ?? "",
        kind: payload.kind ?? "",
        text: payload.text ?? "",
      },
      tokens,
    });
    console.log(`[fcm] push: ${result.successCount} ok, ${result.failureCount} fail`);
  } catch (err) {
    console.warn("[fcm] push failed:", (err as Error).message);
  }
}

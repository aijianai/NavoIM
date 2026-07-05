/**
 * IndexedDB 消息本地化存储。
 *
 * 用法与原本基于 localStorage 的 loadMsgCache/saveMsgCache 保持一致：
 *   - loadAll()        : 启动时一次性拉回整张表
 *   - saveAll(messagesByConv) : 退出前或变更时写回
 *   - 键为对话 id，值为该会话的消息数组（按时间正序）
 *
 * 与 localStorage 实现相比：
 *   - 容量从 ~5MB 提升到浏览器配额（通常数百 MB 以上）
 *   - 不再受 10 个会话上限限制
 *   - 异步 API，但仍通过 loadAll 在启动时同步拿到一份"热缓存"
 */

import type { ID, Message } from "@navo/shared";

const DB_NAME = "navo-im-msg";
const DB_VERSION = 1;
const STORE_NAME = "messages";

interface MessagesEntry {
  conversationId: ID;
  messages: Message[];
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "conversationId" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** 启动时拉取全部会话的消息。 */
export async function loadAllMessages(): Promise<Record<ID, Message[]>> {
  try {
    const db = await openDb();
    return await new Promise<Record<ID, Message[]>>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const out: Record<ID, Message[]> = {};
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          const entry = cursor.value as MessagesEntry;
          out[entry.conversationId] = entry.messages;
          cursor.continue();
        } else {
          resolve(out);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return {};
  }
}

/** 整张表写回（用于登出或大量变更后）。 */
export async function saveAllMessages(messagesByConv: Record<ID, Message[]>): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      const ts = Date.now();
      for (const [conversationId, messages] of Object.entries(messagesByConv)) {
        store.put({ conversationId, messages, updatedAt: ts });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // 静默失败：消息缓存是性能优化，丢失不应影响功能
  }
}

/** 更新单个会话的消息列表。 */
export async function saveConversationMessages(conversationId: ID, messages: Message[]): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put({ conversationId, messages, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // 静默失败
  }
}

/** 删除单个会话的本地缓存。 */
export async function deleteConversationMessages(conversationId: ID): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(conversationId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // 静默失败
  }
}

/** 清空整张表。 */
export async function clearAllMessages(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // 静默失败
  }
}

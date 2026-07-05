/**
 * E2EE 会话期间上传的文件登记与清理。
 */

import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { config } from "./config.js";
import { execute, query } from "./db.js";

/** 登记 E2EE 上传文件，便于会话结束时删除磁盘文件。 */
export async function registerE2eeFile(
  conversationId: string,
  userId: string,
  attachmentId: string,
  url: string,
): Promise<void> {
  const ts = new Date().toISOString();
  await execute(
    `INSERT INTO e2ee_files (id, conversation_id, user_id, url, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [attachmentId || `ef_${nanoid(10)}`, conversationId, userId, url, ts],
  ).catch((e) => {
    console.warn("[e2ee-files] register failed:", e);
  });
}

/** 删除指定会话下所有 E2EE 文件（磁盘 + 数据库记录）。 */
export async function deleteE2eeConversationFiles(conversationId: string): Promise<void> {
  const rows = await query<{ id: string; url: string }>(
    "SELECT id, url FROM e2ee_files WHERE conversation_id = ?",
    [conversationId],
  ).catch(() => [] as { id: string; url: string }[]);

  for (const row of rows) {
    unlinkUploadUrl(row.url);
  }
  if (rows.length > 0) {
    await execute("DELETE FROM e2ee_files WHERE conversation_id = ?", [conversationId]).catch(() => {});
  }
}

function unlinkUploadUrl(url: string): void {
  if (!url) return;
  try {
    if (url.startsWith("/uploads/")) {
      const filename = path.basename(url);
      fs.unlinkSync(path.join(config.uploadsDir, filename));
      return;
    }
    if (url.startsWith("http") && url.includes("/uploads/")) {
      const filename = path.basename(new URL(url).pathname);
      fs.unlinkSync(path.join(config.uploadsDir, filename));
    }
  } catch {
    // 文件可能已在 OSS 或已删除
  }
}

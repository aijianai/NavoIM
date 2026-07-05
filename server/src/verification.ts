import { nanoid } from "nanoid";
import { queryOne, execute } from "./db.js";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export type VerificationPurpose = "register" | "login" | "reset_password" | "bind_email" | "bind_phone" | "change_email" | "change_phone";

/** 验证码 TTL（秒） */
export const VERIFICATION_CODE_TTL_SECONDS = 600;

export async function createVerificationCode(target: string, purpose: VerificationPurpose): Promise<string> {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

  // Invalidate any existing codes for this target+purpose
  await execute(
    "UPDATE verification_codes SET used = 1 WHERE target = ? AND purpose = ? AND used = 0",
    [target, purpose]
  );

  await execute(
    "INSERT INTO verification_codes (id, target, code, purpose, expires_at, used, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)",
    [nanoid(12), target, code, purpose, expiresAt, now]
  );

  return code;
}

export async function verifyCode(target: string, purpose: VerificationPurpose, code: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    "SELECT id FROM verification_codes WHERE target = ? AND purpose = ? AND code = ? AND used = 0 AND expires_at > ?",
    [target, purpose, code, new Date().toISOString()]
  );

  if (!row) return false;

  await execute("UPDATE verification_codes SET used = 1 WHERE id = ?", [row.id]);
  return true;
}

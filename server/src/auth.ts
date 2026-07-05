import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { ID } from "@navo/shared";
import type { Language } from "@navo/shared";
import { config } from "./config.js";

interface TokenPayload {
  sub: ID;
  username: string;
  lang?: string;
}

export function issueToken(userId: ID, username: string, lang?: string): string {
  const payload: TokenPayload = { sub: userId, username, lang };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as TokenPayload;
    return decoded;
  } catch {
    return null;
  }
}

export function getTokenLanguage(token: string): Language {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as TokenPayload;
    return (decoded.lang as Language) || "zh-CN";
  } catch {
    return "zh-CN";
  }
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

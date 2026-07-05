import crypto from "node:crypto";
import { query, queryOne, execute } from "./db.js";

/** PKCE code_verifier 生成（43-128 字符的 base64url） */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function generateState(): string {
  return crypto.randomBytes(16).toString("hex");
}

export async function saveSsoState(state: string, codeVerifier: string, redirectUri: string): Promise<void> {
  const ts = new Date().toISOString();
  await execute(
    "INSERT INTO sso_states (state, code_verifier, redirect_uri, created_at) VALUES (?, ?, ?, ?)",
    [state, codeVerifier, redirectUri, ts],
  );
}

export interface SsoStateRow {
  state: string;
  code_verifier: string | null;
  redirect_uri: string;
  created_at: string;
}

export async function consumeSsoState(state: string): Promise<SsoStateRow | null> {
  const row = await queryOne<SsoStateRow>("SELECT * FROM sso_states WHERE state = ?", [state]);
  if (row) {
    await execute("DELETE FROM sso_states WHERE state = ?", [state]);
    return row;
  }
  return null;
}

/** 清理 10 分钟前的状态码 */
export async function purgeExpiredSsoStates(): Promise<void> {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await execute("DELETE FROM sso_states WHERE created_at < ?", [cutoff]);
}

export interface SsoConfig {
  enabled: boolean;
  companyName: string;
  companyFormalName: string;
  iconUrl: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
}

export async function loadSsoConfig(): Promise<SsoConfig | null> {
  const r = await query<{ key: string; value: string }>(
    "SELECT `key`, value FROM system_settings WHERE `key` LIKE 'sso_%'",
  );
  const s: Record<string, string> = {};
  for (const row of r) s[row.key] = row.value;
  if (s.ssoEnabled !== "true") return null;
  if (!s.ssoAuthorizationEndpoint || !s.ssoTokenEndpoint || !s.ssoClientId) return null;
  return {
    enabled: true,
    companyName: s.ssoCompanyName || "",
    companyFormalName: s.ssoCompanyFormalName || "",
    iconUrl: s.ssoIconUrl || "",
    authorizationEndpoint: s.ssoAuthorizationEndpoint,
    tokenEndpoint: s.ssoTokenEndpoint,
    userInfoEndpoint: s.ssoUserInfoEndpoint || "",
    clientId: s.ssoClientId,
    clientSecret: s.ssoClientSecret || "",
    scopes: s.ssoScopes || "openid profile email",
  };
}

export interface SsoTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
}

/** 用 authorization code 换 access token */
export async function exchangeCodeForToken(
  tokenEndpoint: string,
  clientId: string,
  clientSecret: string,
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<SsoTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  if (clientSecret) {
    headers["Authorization"] = "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  }
  const resp = await fetch(tokenEndpoint, { method: "POST", headers, body: body.toString() });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`SSO token exchange failed (${resp.status}): ${text.slice(0, 200)}`);
  }
  return (await resp.json()) as SsoTokenResponse;
}

export interface SsoUserInfo {
  sub?: string;
  id?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  nickname?: string;
  picture?: string;
  phone?: string;
  phone_number?: string;
  [key: string]: unknown;
}

/** 用 access token 取用户信息 */
export async function fetchUserInfo(userInfoEndpoint: string, accessToken: string): Promise<SsoUserInfo> {
  const resp = await fetch(userInfoEndpoint, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`SSO userinfo failed (${resp.status}): ${text.slice(0, 200)}`);
  }
  return (await resp.json()) as SsoUserInfo;
}

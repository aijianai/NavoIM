import nodemailer from "nodemailer";
import { query, queryOne } from "./db.js";

let _transporter: nodemailer.Transporter | null = null;

async function getSmtpSettings() {
  const rows = await query<{ key: string; value: string }>(
    "SELECT `key`, value FROM system_settings WHERE `key` LIKE 'smtp_%' OR `key` = 'siteName'"
  );
  const s: Record<string, string> = {};
  for (const row of rows) s[row.key] = row.value;
  return {
    host: s.smtp_host || "",
    port: parseInt(s.smtp_port || "465"),
    secure: s.smtp_secure !== "false",
    user: s.smtp_user || "",
    pass: s.smtp_pass || "",
    fromName: s.smtp_from_name || "Navo IM",
    fromEmail: s.smtp_from_email || "",
    siteName: s.siteName || "Navo IM",
  };
}

function getTransporter(s: Awaited<ReturnType<typeof getSmtpSettings>>): nodemailer.Transporter | null {
  if (!s.host || !s.user || !s.pass) return null;
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: s.host,
      port: s.port,
      secure: s.secure,
      auth: { user: s.user, pass: s.pass },
    });
  }
  return _transporter;
}

export function reloadTransporter() {
  _transporter = null;
}

function renderTemplate(html: string, vars: Record<string, string>): string {
  let result = html;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}

export async function sendEmail(to: string, templateKey: string, vars: Record<string, string>): Promise<boolean> {
  const s = await getSmtpSettings();
  const transporter = getTransporter(s);
  if (!transporter) {
    console.warn("[email] SMTP not configured, skipping send to", to);
    return false;
  }

  const row = await queryOne<{ subject: string; html: string }>(
    "SELECT subject, html FROM email_templates WHERE `key` = ?",
    [templateKey]
  );
  if (!row) {
    console.error("[email] Template not found:", templateKey);
    return false;
  }

  const subject = renderTemplate(row.subject, { ...vars, sitename: s.siteName });
  const html = renderTemplate(row.html, { ...vars, sitename: s.siteName });

  try {
    await transporter.sendMail({
      from: `"${s.fromName}" <${s.fromEmail}>`,
      to,
      subject,
      html,
    });
    return true;
  } catch (err) {
    console.error("[email] Send failed:", err);
    return false;
  }
}

export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function isEmailWhitelisted(email: string): Promise<boolean> {
  const rows = await query<{ pattern: string }>("SELECT pattern FROM email_whitelist");
  if (rows.length === 0) return true;
  return rows.some((r) => matchWhitelistPattern(r.pattern, email));
}

export async function isPhoneWhitelisted(phone: string): Promise<boolean> {
  const rows = await query<{ pattern: string }>("SELECT pattern FROM phone_whitelist");
  if (rows.length === 0) return true;
  return rows.some((r) => matchWhitelistPattern(r.pattern, phone));
}

/** 通配符匹配：* 匹配任意非空字符序列（不含空）。 */
export function matchWhitelistPattern(pattern: string, value: string): boolean {
  if (!pattern) return false;
  if (!pattern.includes("*")) return pattern === value;
  // 转义正则元字符，* 替换为 .*
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(value);
}

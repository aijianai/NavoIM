import fs from "node:fs";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { config } from "./config.js";

fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
fs.mkdirSync(config.uploadsDir, { recursive: true, mode: 0o700 });

// Create MySQL connection pool
export const pool = mysql.createPool({
  host: config.mysql.host,
  port: config.mysql.port,
  user: config.mysql.user,
  password: config.mysql.password,
  database: config.mysql.database,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  charset: "utf8mb4",
});

// Helper to execute a query and return rows
export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

// Helper to execute a query and return first row
export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | undefined> {
  const [rows] = await pool.query(sql, params);
  const arr = rows as T[];
  return arr[0];
}

// Helper to execute an INSERT/UPDATE/DELETE
export async function execute(sql: string, params?: any[]): Promise<mysql.ResultSetHeader> {
  const [result] = await pool.execute(sql, params);
  return result as mysql.ResultSetHeader;
}

// Helper to check if a column exists in a table
async function columnExists(table: string, column: string): Promise<boolean> {
  const [rows] = await pool.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
  return (rows as any[]).length > 0;
}

// Helper to add a column if it doesn't exist
async function addColumnIfMissing(table: string, column: string, ddl: string) {
  if (!(await columnExists(table, column))) {
    await pool.execute(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  }
}

// Helper to add a unique index if it doesn't exist
async function addUniqueIndexIfMissing(table: string, indexName: string, column: string) {
  const [rows] = await pool.execute<any[]>(
    `SELECT 1 FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1`,
    [table, indexName]
  );
  if ((rows as any[]).length === 0) {
    await pool.execute(`ALTER TABLE \`${table}\` ADD UNIQUE INDEX \`${indexName}\` (\`${column}\`)`);
  }
}

// ----------------------------------------------------------------------------
// Schema. Idempotent — safe to run on every boot.
// ----------------------------------------------------------------------------

async function initSchema() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id            VARCHAR(64) PRIMARY KEY,
      username      VARCHAR(128) NOT NULL UNIQUE,
      display_name  VARCHAR(128) NOT NULL,
      avatar_color  VARCHAR(32) NOT NULL,
      avatar_url    TEXT,
      bio           TEXT NOT NULL DEFAULT (''),
      gender        VARCHAR(32) NOT NULL DEFAULT 'unspecified',
      \`status\`      VARCHAR(32) NOT NULL DEFAULT 'offline',
      last_seen     VARCHAR(64) NOT NULL,
      require_friend_approval TINYINT(1) NOT NULL DEFAULT 1,
      password_hash VARCHAR(255) NOT NULL,
      second_password_hash VARCHAR(255) DEFAULT NULL,
      second_password_hint TEXT DEFAULT NULL,
      register_ip   VARCHAR(64) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS conversations (
      id              VARCHAR(64) PRIMARY KEY,
      kind            VARCHAR(16) NOT NULL,
      name            VARCHAR(128),
      topic           TEXT,
      announcement    TEXT,
      is_private      TINYINT(1) NOT NULL DEFAULT 0,
      icon            VARCHAR(128),
      avatar_url      TEXT,
      mute_all        TINYINT(1) NOT NULL DEFAULT 0,
      owner_id        VARCHAR(64),
      created_at      VARCHAR(64) NOT NULL,
      last_message_id VARCHAR(64),
      last_message_at VARCHAR(64),
      CONSTRAINT fk_conv_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS conversation_members (
      conversation_id VARCHAR(64) NOT NULL,
      user_id         VARCHAR(64) NOT NULL,
      role            VARCHAR(32) NOT NULL DEFAULT 'member',
      muted           TINYINT(1) NOT NULL DEFAULT 0,
      banned          TINYINT(1) NOT NULL DEFAULT 0,
      joined_at       VARCHAR(64) NOT NULL,
      PRIMARY KEY (conversation_id, user_id),
      CONSTRAINT fk_cm_conv FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      CONSTRAINT fk_cm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`CREATE INDEX IF NOT EXISTS idx_members_user ON conversation_members(user_id)`).catch(() => {});

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id              VARCHAR(64) PRIMARY KEY,
      conversation_id VARCHAR(64) NOT NULL,
      author_id       VARCHAR(64) NOT NULL,
      kind            VARCHAR(32) NOT NULL,
      text            TEXT NOT NULL,
      reply_to_id     VARCHAR(64),
      edited_at       VARCHAR(64),
      scheduled_at    VARCHAR(64),
      created_at      VARCHAR(64) NOT NULL,
      CONSTRAINT fk_msg_conv FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      CONSTRAINT fk_msg_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Add scheduled_at column for existing DBs (CREATE TABLE IF NOT EXISTS won't alter)
  await pool.execute(`ALTER TABLE messages ADD COLUMN scheduled_at VARCHAR(64) AFTER edited_at`).catch(() => {});

  await pool.execute(`CREATE INDEX IF NOT EXISTS idx_messages_scheduled ON messages(scheduled_at)`).catch(() => {});

  // Add format column for existing DBs (plain | markdown)
  await pool.execute(`ALTER TABLE messages ADD COLUMN format VARCHAR(16) AFTER kind`).catch(() => {});

  await pool.execute(`CREATE INDEX IF NOT EXISTS idx_messages_conv_time ON messages(conversation_id, created_at)`).catch(() => {});

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS attachments (
      id          VARCHAR(64) PRIMARY KEY,
      message_id  VARCHAR(64) NOT NULL,
      name        VARCHAR(255) NOT NULL,
      url         TEXT NOT NULL,
      mime_type   VARCHAR(128) NOT NULL,
      size        BIGINT NOT NULL,
      width       INT,
      height      INT,
      poster      TEXT,
      CONSTRAINT fk_att_msg FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id)`).catch(() => {});

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS reactions (
      message_id VARCHAR(64) NOT NULL,
      user_id    VARCHAR(64) NOT NULL,
      emoji      VARCHAR(32) NOT NULL,
      PRIMARY KEY (message_id, user_id, emoji),
      CONSTRAINT fk_react_msg FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      CONSTRAINT fk_react_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS pinned_messages (
      conversation_id VARCHAR(64) NOT NULL,
      message_id      VARCHAR(64) NOT NULL,
      pinned_by       VARCHAR(64) NOT NULL,
      pinned_at       VARCHAR(64) NOT NULL,
      PRIMARY KEY (conversation_id, message_id),
      CONSTRAINT fk_pin_conv FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      CONSTRAINT fk_pin_msg FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      CONSTRAINT fk_pin_user FOREIGN KEY (pinned_by) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Add note columns to friendships if not present
  await pool.execute(`ALTER TABLE friendships ADD COLUMN note_a TEXT`).catch(() => {});
  await pool.execute(`ALTER TABLE friendships ADD COLUMN note_b TEXT`).catch(() => {});

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS sticker_packs (
      id          VARCHAR(64) PRIMARY KEY,
      name        VARCHAR(255) NOT NULL,
      created_by  VARCHAR(64) NOT NULL,
      created_at  VARCHAR(64) NOT NULL,
      CONSTRAINT fk_sp_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS stickers (
      id          VARCHAR(64) PRIMARY KEY,
      pack_id     VARCHAR(64) NOT NULL,
      name        VARCHAR(255) NOT NULL,
      file_url    TEXT NOT NULL,
      mime_type   VARCHAR(128) NOT NULL DEFAULT 'image/png',
      created_at  VARCHAR(64) NOT NULL,
      CONSTRAINT fk_st_pack FOREIGN KEY (pack_id) REFERENCES sticker_packs(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`CREATE INDEX IF NOT EXISTS idx_stickers_pack ON stickers(pack_id)`).catch(() => {});

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS \`reads\` (
      conversation_id     VARCHAR(64) NOT NULL,
      user_id             VARCHAR(64) NOT NULL,
      last_read_message   VARCHAR(64) NOT NULL,
      PRIMARY KEY (conversation_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS friendships (
      user_a      VARCHAR(64) NOT NULL,
      user_b      VARCHAR(64) NOT NULL,
      \`status\`    VARCHAR(32) NOT NULL DEFAULT 'accepted',
      action_by   VARCHAR(64),
      blocked_a   TINYINT(1) NOT NULL DEFAULT 0,
      blocked_b   TINYINT(1) NOT NULL DEFAULT 0,
      created_at  VARCHAR(64) NOT NULL,
      PRIMARY KEY (user_a, user_b),
      CONSTRAINT fk_fs_a FOREIGN KEY (user_a) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_fs_b FOREIGN KEY (user_b) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS friend_requests (
      id           VARCHAR(64) PRIMARY KEY,
      from_user_id VARCHAR(64) NOT NULL,
      to_user_id   VARCHAR(64) NOT NULL,
      message      TEXT NOT NULL,
      created_at   VARCHAR(64) NOT NULL,
      UNIQUE KEY uq_freq (from_user_id, to_user_id),
      CONSTRAINT fk_freq_from FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_freq_to FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`CREATE INDEX IF NOT EXISTS idx_freq_to ON friend_requests(to_user_id)`).catch(() => {});

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS forwarded_messages (
      id              VARCHAR(64) PRIMARY KEY,
      source_conv_id  VARCHAR(64) NOT NULL,
      title           TEXT NOT NULL,
      created_at      VARCHAR(64) NOT NULL,
      CONSTRAINT fk_fwd_src FOREIGN KEY (source_conv_id) REFERENCES conversations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS forwarded_message_items (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      forward_id      VARCHAR(64) NOT NULL,
      message_id      VARCHAR(64) NOT NULL,
      author_id       VARCHAR(64) NOT NULL,
      author_name     VARCHAR(128) NOT NULL DEFAULT '',
      kind            VARCHAR(32) NOT NULL,
      text            TEXT NOT NULL,
      attachments_json TEXT,
      sort_order      INT NOT NULL,
      created_at      VARCHAR(64) NOT NULL,
      CONSTRAINT fk_fmi_fwd FOREIGN KEY (forward_id) REFERENCES forwarded_messages(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`CREATE INDEX IF NOT EXISTS idx_fmi_forward ON forwarded_message_items(forward_id)`).catch(() => {});

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS poll_votes (
      message_id VARCHAR(64) NOT NULL,
      user_id    VARCHAR(64) NOT NULL,
      option_id  VARCHAR(64) NOT NULL,
      created_at VARCHAR(64) NOT NULL,
      PRIMARY KEY (message_id, user_id),
      CONSTRAINT fk_pv_msg FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      CONSTRAINT fk_pv_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`CREATE INDEX IF NOT EXISTS idx_poll_votes_message ON poll_votes(message_id)`).catch(() => {});

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS admin_roles (
      id            VARCHAR(64) PRIMARY KEY,
      user_id       VARCHAR(64) NOT NULL,
      role          VARCHAR(32) NOT NULL DEFAULT 'user',
      permissions   TEXT NOT NULL,
      granted_by    VARCHAR(64),
      granted_at    VARCHAR(64) NOT NULL,
      expires_at    VARCHAR(64),
      note          TEXT,
      UNIQUE KEY uq_admin_user (user_id),
      CONSTRAINT fk_admin_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_admin_grantor FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`CREATE INDEX IF NOT EXISTS idx_admin_roles_user ON admin_roles(user_id)`).catch(() => {});

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id            VARCHAR(64) PRIMARY KEY,
      user_id       VARCHAR(64) NOT NULL,
      action        VARCHAR(128) NOT NULL,
      target_type   VARCHAR(64) NOT NULL,
      target_id     VARCHAR(64),
      details       TEXT,
      ip_address    VARCHAR(64),
      created_at    VARCHAR(64) NOT NULL,
      CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id)`).catch(() => {});
  await pool.execute(`CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(created_at)`).catch(() => {});
  await pool.execute(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)`).catch(() => {});

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS system_settings (
      \`key\`        VARCHAR(128) PRIMARY KEY,
      value         TEXT NOT NULL,
      updated_at    VARCHAR(64) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS push_tokens (
      user_id       VARCHAR(64) NOT NULL,
      token         VARCHAR(256) NOT NULL,
      provider      VARCHAR(32) NOT NULL DEFAULT 'getui',
      created_at    VARCHAR(64) NOT NULL,
      PRIMARY KEY (user_id, token)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS user_bans (
      id            VARCHAR(64) PRIMARY KEY,
      user_id       VARCHAR(64) NOT NULL,
      banned_by     VARCHAR(64),
      reason        TEXT,
      expires_at    VARCHAR(64),
      created_at    VARCHAR(64) NOT NULL,
      UNIQUE KEY uq_ban_user (user_id),
      CONSTRAINT fk_ban_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_ban_by FOREIGN KEY (banned_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`CREATE INDEX IF NOT EXISTS idx_user_bans_user ON user_bans(user_id)`).catch(() => {});

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS notifications (
      id            VARCHAR(64) PRIMARY KEY,
      title         VARCHAR(255) NOT NULL,
      content       TEXT NOT NULL,
      image_url     TEXT,
      author_id     VARCHAR(64),
      created_at    VARCHAR(64) NOT NULL,
      updated_at    VARCHAR(64) NOT NULL,
      CONSTRAINT fk_notif_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS user_notifications (
      notification_id VARCHAR(64) NOT NULL,
      user_id         VARCHAR(64) NOT NULL,
      read_at         VARCHAR(64),
      PRIMARY KEY (notification_id, user_id),
      CONSTRAINT fk_un_notif FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
      CONSTRAINT fk_un_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON user_notifications(user_id)`).catch(() => {});

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS channel_bans (
      id            VARCHAR(64) PRIMARY KEY,
      channel_id    VARCHAR(64) NOT NULL,
      banned_by     VARCHAR(64),
      reason        TEXT,
      created_at    VARCHAR(64) NOT NULL,
      UNIQUE KEY uk_channel_ban (channel_id),
      INDEX idx_channel_bans_channel (channel_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS reports (
      id            VARCHAR(64) PRIMARY KEY,
      reporter_id   VARCHAR(64) NOT NULL,
      target_type   VARCHAR(32) NOT NULL COMMENT 'user|channel|message',
      target_id     VARCHAR(64) NOT NULL,
      reason        TEXT NOT NULL,
      screenshot_url TEXT,
      status        VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT 'pending|reviewed|rejected|actioned',
      result        TEXT,
      handled_by    VARCHAR(64),
      created_at    VARCHAR(64) NOT NULL,
      updated_at    VARCHAR(64) NOT NULL,
      INDEX idx_reports_reporter (reporter_id),
      INDEX idx_reports_target (target_type, target_id),
      INDEX idx_reports_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS sensitive_words (
      id          VARCHAR(64) PRIMARY KEY,
      word        VARCHAR(255) NOT NULL,
      policy      VARCHAR(32) NOT NULL DEFAULT 'block' COMMENT 'block|mask',
      created_by  VARCHAR(64),
      created_at  VARCHAR(64) NOT NULL,
      INDEX idx_sw_word (word),
      INDEX idx_sw_policy (policy)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS organizations (
      id          VARCHAR(64) PRIMARY KEY,
      name        VARCHAR(255) NOT NULL,
      parent_id   VARCHAR(64),
      description TEXT,
      created_at  VARCHAR(64) NOT NULL,
      INDEX idx_org_parent (parent_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS ai_conversation_summaries (
      conversation_id VARCHAR(64) PRIMARY KEY,
      summary         TEXT NOT NULL,
      message_count   INT NOT NULL DEFAULT 0,
      updated_at      VARCHAR(64) NOT NULL,
      CONSTRAINT fk_ai_sum_conv FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS oss_bindings (
      id                VARCHAR(64) PRIMARY KEY,
      user_id           VARCHAR(64) NOT NULL,
      name              VARCHAR(255) NOT NULL,
      provider          VARCHAR(64) NOT NULL,
      endpoint          TEXT NOT NULL,
      bucket            VARCHAR(255) NOT NULL,
      region            VARCHAR(128),
      access_key_id     VARCHAR(255) NOT NULL,
      access_key_secret TEXT NOT NULL,
      is_default        TINYINT(1) NOT NULL DEFAULT 0,
      created_at        VARCHAR(64) NOT NULL,
      INDEX idx_oss_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 邮箱白名单：pattern 支持精确匹配与通配符（*@example.com、user@*）
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS email_whitelist (
      id          VARCHAR(64) PRIMARY KEY,
      pattern     VARCHAR(255) NOT NULL,
      note        VARCHAR(255) DEFAULT NULL,
      created_by  VARCHAR(64) DEFAULT NULL,
      created_at  VARCHAR(64) NOT NULL,
      UNIQUE KEY uniq_email_whitelist_pattern (pattern)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 手机号白名单：pattern 支持精确匹配与通配符（+8613*）
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS phone_whitelist (
      id          VARCHAR(64) PRIMARY KEY,
      pattern     VARCHAR(64) NOT NULL,
      note        VARCHAR(255) DEFAULT NULL,
      created_by  VARCHAR(64) DEFAULT NULL,
      created_at  VARCHAR(64) NOT NULL,
      UNIQUE KEY uniq_phone_whitelist_pattern (pattern)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 邮件模板：register_code/bind_code
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS email_templates (
      \`key\`     VARCHAR(64) PRIMARY KEY,
      subject    VARCHAR(255) NOT NULL,
      html       TEXT NOT NULL,
      updated_at VARCHAR(64) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // SSO 状态码：临时存储 PKCE/state 以防 CSRF
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS sso_states (
      state        VARCHAR(128) PRIMARY KEY,
      code_verifier VARCHAR(128) DEFAULT NULL,
      redirect_uri  TEXT NOT NULL,
      created_at    VARCHAR(64) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 邮箱/手机号验证码：注册/绑定/换绑/重置密码 通用
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS verification_codes (
      id          VARCHAR(64) PRIMARY KEY,
      target      VARCHAR(255) NOT NULL,
      code        VARCHAR(16) NOT NULL,
      purpose     VARCHAR(32) NOT NULL,
      expires_at  VARCHAR(64) NOT NULL,
      used        TINYINT(1) NOT NULL DEFAULT 0,
      created_at  VARCHAR(64) NOT NULL,
      INDEX idx_vc_target_purpose (target, purpose),
      INDEX idx_vc_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // E2EE 预密钥包：每个用户当前只维护一份 identity_key + signed_pre_key + 一次性预密钥池
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS e2ee_prekey_bundles (
      user_id              VARCHAR(64) PRIMARY KEY,
      identity_key         TEXT NOT NULL,
      signed_pre_key       TEXT NOT NULL,
      signed_pre_key_sig   TEXT NOT NULL,
      created_at           VARCHAR(64) NOT NULL,
      updated_at           VARCHAR(64) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS e2ee_one_time_prekeys (
      id           BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id      VARCHAR(64) NOT NULL,
      pre_key      TEXT NOT NULL,
      consumed     TINYINT(1) NOT NULL DEFAULT 0,
      consumed_at  VARCHAR(64) DEFAULT NULL,
      created_at   VARCHAR(64) NOT NULL,
      INDEX idx_otp_user (user_id, consumed)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // E2EE 会话：保存双方 ephemeral_key（首次握手）和当前 ratchet 状态（base64 编码）
  // 注：消息负载加密后存于 messages.encrypted_payload，ratchet_state 仅用于前后向保密
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS e2ee_sessions (
      conversation_id  VARCHAR(64) NOT NULL,
      user_id          VARCHAR(64) NOT NULL,
      peer_id          VARCHAR(64) NOT NULL,
      ratchet_state    MEDIUMTEXT,
      created_at       VARCHAR(64) NOT NULL,
      updated_at       VARCHAR(64) NOT NULL,
      PRIMARY KEY (conversation_id, user_id),
      INDEX idx_session_user (user_id),
      INDEX idx_session_peer (peer_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // E2EE 上传文件登记（消息不入库，但需在会话结束时删除磁盘文件）
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS e2ee_files (
      id               VARCHAR(64) PRIMARY KEY,
      conversation_id  VARCHAR(64) NOT NULL,
      user_id          VARCHAR(64) NOT NULL,
      url              TEXT NOT NULL,
      created_at       VARCHAR(64) NOT NULL,
      INDEX idx_e2ee_files_conv (conversation_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

// ----------------------------------------------------------------------------
// Run schema initialization
// ----------------------------------------------------------------------------

await initSchema();

// Run guarded migrations for databases seeded before these columns existed.
await addColumnIfMissing("users", "avatar_url", "avatar_url TEXT");
await addColumnIfMissing("users", "gender", "gender VARCHAR(32) NOT NULL DEFAULT 'unspecified'");
await addColumnIfMissing("users", "require_friend_approval", "require_friend_approval TINYINT(1) NOT NULL DEFAULT 1");
await addColumnIfMissing("conversations", "announcement", "announcement TEXT");
await addColumnIfMissing("conversations", "avatar_url", "avatar_url TEXT");
await addColumnIfMissing("conversations", "mute_all", "mute_all TINYINT(1) NOT NULL DEFAULT 0");
await addColumnIfMissing("conversation_members", "role", "role VARCHAR(32) NOT NULL DEFAULT 'member'");
await addColumnIfMissing("conversation_members", "muted", "muted TINYINT(1) NOT NULL DEFAULT 0");
await addColumnIfMissing("conversation_members", "banned", "banned TINYINT(1) NOT NULL DEFAULT 0");
await addColumnIfMissing("messages", "card_id", "card_id VARCHAR(64)");
  await addColumnIfMissing("attachments", "poster", "poster TEXT");
  await addColumnIfMissing("attachments", "duration", "duration DECIMAL(10,2) DEFAULT NULL");
await addColumnIfMissing("friendships", "blocked_a", "blocked_a TINYINT(1) NOT NULL DEFAULT 0");
await addColumnIfMissing("friendships", "blocked_b", "blocked_b TINYINT(1) NOT NULL DEFAULT 0");
await addColumnIfMissing("users", "second_password_hash", "second_password_hash VARCHAR(255) DEFAULT NULL");
await addColumnIfMissing("messages", "deleted_at", "deleted_at VARCHAR(64) DEFAULT NULL");
await addColumnIfMissing("messages", "deleted_by", "deleted_by VARCHAR(64) DEFAULT NULL");
await addColumnIfMissing("users", "organization_id", "organization_id VARCHAR(64) DEFAULT NULL");
await addColumnIfMissing("users", "org_title", "org_title VARCHAR(128) DEFAULT NULL");
await addColumnIfMissing("notifications", "target_user_id", "target_user_id VARCHAR(64) DEFAULT NULL");
await addColumnIfMissing("users", "second_password_hint", "second_password_hint TEXT DEFAULT NULL");
await addColumnIfMissing("conversations", "members_can_invite", "members_can_invite TINYINT(1) NOT NULL DEFAULT 1");
await addColumnIfMissing("users", "register_ip", "register_ip VARCHAR(64) DEFAULT NULL");
await addColumnIfMissing("users", "language", "language VARCHAR(16) DEFAULT NULL");
await addColumnIfMissing("users", "email", "email VARCHAR(255) DEFAULT NULL");
await addColumnIfMissing("users", "phone", "phone VARCHAR(32) DEFAULT NULL");
// E2EE 加密负载：仅在加密消息场景使用，text 字段保留为空（明文兼容期会同时填充）
await addColumnIfMissing("messages", "encrypted_payload", "encrypted_payload MEDIUMTEXT DEFAULT NULL");
await addColumnIfMissing("messages", "e2ee_ephemeral_key", "e2ee_ephemeral_key TEXT DEFAULT NULL");
await addColumnIfMissing("messages", "e2ee_opk_id", "e2ee_opk_id BIGINT DEFAULT NULL");
await addColumnIfMissing("attachments", "e2ee_session_id", "e2ee_session_id VARCHAR(128) DEFAULT NULL");
await addColumnIfMissing("attachments", "e2ee_expires_at", "e2ee_expires_at VARCHAR(64) DEFAULT NULL");

// SSO 用户名最长为 company_formal_name (≤31) + "_" + 16 位 uuid = 48
// 显示名最长可达 company_name (≤64) + "用户" + "_" + 16 = ~85
// 将 username 提升至 128 以兼容
await pool.execute(`ALTER TABLE users MODIFY COLUMN username VARCHAR(128) NOT NULL`).catch(() => {});

// 唯一索引：email/phone 可空但需唯一（MySQL 允许多个 NULL）
await addUniqueIndexIfMissing("users", "uniq_users_email", "email");
await addUniqueIndexIfMissing("users", "uniq_users_phone", "phone");

// Backfill: migrate legacy status='blocked' rows
await execute(`
  UPDATE friendships
  SET blocked_a = CASE WHEN \`status\` = 'blocked' AND action_by = user_a THEN 1 ELSE blocked_a END,
      blocked_b = CASE WHEN \`status\` = 'blocked' AND action_by = user_b THEN 1 ELSE blocked_b END,
      \`status\`  = CASE WHEN \`status\` = 'blocked' THEN 'accepted' ELSE \`status\` END
  WHERE \`status\` = 'blocked'
`);

// Backfill channel owner roles
await execute(`
  UPDATE conversation_members cm
  JOIN conversations c ON c.id = cm.conversation_id
  SET cm.role = 'owner'
  WHERE cm.role = 'member'
    AND c.kind = 'channel'
    AND cm.user_id = c.owner_id
`);

// ----------------------------------------------------------------------------
// Seed (only if users table is empty). Default password: navo1234.
// ----------------------------------------------------------------------------

const userCountResult = await queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM users");
if (!userCountResult || userCountResult.c === 0) {
  await seed();
}

// 邮件模板幂等种子：与用户数无关，每次启动都尝试补齐
await seedEmailTemplates();

async function seed() {
  const now = () => new Date().toISOString();

  const aiPassword = nanoid(32);
  await execute(
    `INSERT IGNORE INTO users (id, username, display_name, avatar_color, bio, gender, status, last_seen, require_friend_approval, password_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "u_navo_ai",
      "navo_ai",
      "Navo 助手",
      "#8EEBFF",
      "你的专属聊天助手，可以陪你聊天、帮你起草文字、解释概念。",
      "unspecified",
      "online",
      now(),
      0,
      bcrypt.hashSync(aiPassword, 10),
    ]
  );

  // eslint-disable-next-line no-console
  console.log("[navo-im] seeded system AI user.");
}

/** 幂等地插入默认邮件模板；与 seed 解耦，部署时总能跑。 */
export async function seedEmailTemplates(): Promise<void> {
  const ts = new Date().toISOString();
  const defaultTemplates: Array<[string, string, string]> = [
    [
      "register_code",
      "【{sitename}】您的注册验证码",
      `<div style="max-width:480px;margin:0 auto;padding:24px;font-family:-apple-system,'Segoe UI',sans-serif;color:#1a1a1a"><h2 style="margin:0 0 16px">欢迎注册 {sitename}</h2><p>您的注册验证码为：</p><div style="font-size:32px;font-weight:600;letter-spacing:8px;color:#2F7DFF;margin:24px 0">{code}</div><p style="color:#666;font-size:13px">验证码 10 分钟内有效，请勿泄露给他人。</p></div>`,
    ],
    [
      "bind_code",
      "【{sitename}】您的绑定验证码",
      `<div style="max-width:480px;margin:0 auto;padding:24px;font-family:-apple-system,'Segoe UI',sans-serif;color:#1a1a1a"><h2 style="margin:0 0 16px">邮箱绑定</h2><p>您正在绑定此邮箱至 {sitename} 账号，验证码为：</p><div style="font-size:32px;font-weight:600;letter-spacing:8px;color:#2F7DFF;margin:24px 0">{code}</div><p style="color:#666;font-size:13px">验证码 10 分钟内有效。如非本人操作，请忽略本邮件。</p></div>`,
    ],
    [
      "reset_password_code",
      "【{sitename}】您的密码重置验证码",
      `<div style="max-width:480px;margin:0 auto;padding:24px;font-family:-apple-system,'Segoe UI',sans-serif;color:#1a1a1a"><h2 style="margin:0 0 16px">重置密码</h2><p>您正在重置 {sitename} 账号密码，验证码为：</p><div style="font-size:32px;font-weight:600;letter-spacing:8px;color:#2F7DFF;margin:24px 0">{code}</div><p style="color:#666;font-size:13px">验证码 10 分钟内有效。如非本人操作，请忽略本邮件并尽快修改密码。</p></div>`,
    ],
  ];
  for (const [key, subject, html] of defaultTemplates) {
    await execute(
      "INSERT IGNORE INTO email_templates (`key`, subject, html, updated_at) VALUES (?, ?, ?, ?)",
      [key, subject, html, ts],
    );
  }
  // eslint-disable-next-line no-console
  console.log(`[navo-im] seeded ${defaultTemplates.length} email templates.`);
}

// ----------------------------------------------------------------------------
// Auto-initialize admin account (admin / navo2026)
// ----------------------------------------------------------------------------

async function initAdminAccount() {
  const now = new Date().toISOString();
  const adminHash = bcrypt.hashSync("navo2026", 10);

  // Create admin user if not exists
  const existingAdmin = await queryOne<{ id: string }>(
    "SELECT id FROM users WHERE username = ?",
    ["admin"]
  );

  if (!existingAdmin) {
    await execute(
      `INSERT INTO users (id, username, display_name, avatar_color, bio, gender, status, last_seen, require_friend_approval, password_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "u_admin",
        "admin",
        "管理员",
        "#FF6B6B",
        "系统管理员",
        "unspecified",
        "offline",
        now,
        0,
        adminHash,
      ]
    );
    // eslint-disable-next-line no-console
    console.log("[navo-im] created admin account (admin/navo2026).");
  } else {
    // Update password hash to ensure it matches navo2026
    await execute(
      "UPDATE users SET password_hash = ? WHERE username = ?",
      [adminHash, "admin"]
    );
  }

  // Ensure admin has super_admin role
  const adminUser = await queryOne<{ id: string }>(
    "SELECT id FROM users WHERE username = ?",
    ["admin"]
  );

  if (adminUser) {
    const existingRole = await queryOne<{ id: string }>(
      "SELECT id FROM admin_roles WHERE user_id = ?",
      [adminUser.id]
    );

    if (!existingRole) {
      await execute(
        `INSERT IGNORE INTO admin_roles (id, user_id, role, permissions, granted_by, granted_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          nanoid(),
          adminUser.id,
          "super_admin",
          JSON.stringify([
            "manage_users",
            "manage_channels",
            "manage_settings",
            "view_audit_logs",
            "manage_roles",
            "manage_notifications",
          ]),
          adminUser.id,
          now,
        ]
      );
      // eslint-disable-next-line no-console
      console.log("[navo-im] granted super_admin role to admin account.");
    }
  }
}

await initAdminAccount();

// ----------------------------------------------------------------------------
// Initialize system settings (if empty)
// ----------------------------------------------------------------------------

const settingsCountResult = await queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM system_settings");
if (!settingsCountResult || settingsCountResult.c === 0) {
  const now = new Date().toISOString();

  const settings: [string, string][] = [
    ["siteName", "Navo IM"],
    ["siteDescription", "下一代 IM 聊天软件"],
    ["allowRegistration", "true"],
    ["requireInviteCode", "false"],
    ["maxFileSize", "26214400"],
    ["maxMessageLength", "5000"],
    ["aiEnabled", "true"],
    ["maintenanceMode", "false"],
    ["requireSecondPassword", "false"],
    ["captchaEnabled", "true"],
    ["captchaBackendUrl", ""],
    ["captchaFrontendUrl", ""],
    ["captchaProvider", "cap-pow"],
    ["aiBaseUrl", ""],
    ["aiApiKey", ""],
    ["aiModel", "qwen3.6-plus"],
    ["cdnFontsGoogleCssUrl", "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600;9..144,700&family=Geist:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"],
    ["cdnVconsoleEnabled", "false"],
    ["iceStunUrls", "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302"],
    ["iceTurnUrl", ""],
    ["iceTurnUsername", ""],
    ["iceTurnCredential", ""],
    ["rateLimitMessageCount", "60"],
    ["rateLimitMessageWindow", "60"],
    ["rateLimitLoginMax", "10"],
    ["rateLimitLoginWindow", "900"],
    ["rateLimitRegisterMax", "5"],
    ["rateLimitRegisterWindow", "3600"],
    ["rateLimitMaxAccountsPerIp", "3"],
    ["rateLimitPresencePingMax", "1"],
    ["rateLimitPresencePingWindow", "30"],
    ["getui_app_id", "AtfS8xjXcq5krheUxGCcPA"],
    ["getui_app_key", "6q7YsMFVVc94s4CevEQ1Z"],
    ["getui_app_secret", "hRQWliC5xw5Kp3Nt8Cu0Y3"],
    ["getui_master_secret", "r79dS4Fu0C94xSGxvJS1s1"],
  ];

  for (const [key, value] of settings) {
    await execute(
      "INSERT IGNORE INTO system_settings (`key`, value, updated_at) VALUES (?, ?, ?)",
      [key, value, now]
    );
  }

  // eslint-disable-next-line no-console
  console.log("[navo-im] initialized system settings.");
}

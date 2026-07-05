import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import type {
  Attachment,
  ChannelRole,
  Conversation,
  ConversationMember,
  Friendship,
  FriendRequest,
  Gender,
  ID,
  Message,
  PollResult,
  PresenceStatus,
  Reaction,
  User,
} from "@navo/shared";
import { AI_USER_ID, MESSAGE_RECALL_WINDOW_MS, type StickerPack, type Sticker } from "@navo/shared";
import { pool, query, queryOne, execute } from "./db.js";

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  avatar_color: string;
  avatar_url: string | null;
  bio: string;
  gender: Gender;
  status: PresenceStatus;
  last_seen: string;
  require_friend_approval: number;
  password_hash: string;
  second_password_hash: string | null;
  second_password_hint: string | null;
  email: string | null;
  phone: string | null;
  organization_id: string | null;
  org_title: string | null;
  register_ip: string | null;
  language: string | null;
}

interface ConversationRow {
  id: string;
  kind: "dm" | "channel";
  name: string | null;
  topic: string | null;
  announcement: string | null;
  is_private: number;
  icon: string | null;
  avatar_url: string | null;
  mute_all: number;
  owner_id: string | null;
  members_can_invite: number;
  created_at: string;
  last_message_id: string | null;
  last_message_at: string | null;
}

interface MemberRow {
  user_id: string;
  role: ChannelRole;
  muted: number;
  banned: number;
  joined_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  author_id: string;
  kind: Message["kind"];
  format: string | null;
  text: string;
  card_id: string | null;
  reply_to_id: string | null;
  edited_at: string | null;
  scheduled_at: string | null;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

interface AttachmentRow {
  id: string;
  message_id: string;
  name: string;
  url: string;
  mime_type: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  poster: string | null;
}

interface ReactionRow {
  message_id: string;
  user_id: string;
  emoji: string;
}

interface FriendshipRow {
  user_a: string;
  user_b: string;
  status: "pending" | "accepted" | "blocked";
  action_by: string | null;
  blocked_a: number;
  blocked_b: number;
  created_at: string;
  note_a: string | null;
  note_b: string | null;
}

interface FriendRequestRow {
  id: string;
  from_user_id: string;
  to_user_id: string;
  message: string;
  created_at: string;
}

const now = () => new Date().toISOString();

function hydrateUser(r: UserRow): User {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    avatarColor: r.avatar_color,
    avatarUrl: r.avatar_url ?? undefined,
    bio: r.bio,
    gender: r.gender,
    status: r.status,
    lastSeen: r.last_seen,
    requireFriendApproval: r.require_friend_approval === 1,
    email: r.email ?? undefined,
    phone: r.phone ?? undefined,
    organizationId: r.organization_id ?? undefined,
    orgTitle: r.org_title ?? undefined,
    language: r.language ?? undefined,
  };
}

function hydrateConversation(r: ConversationRow, members: MemberRow[]): Conversation {
  const detailed: ConversationMember[] = members.map((m) => ({
    userId: m.user_id,
    role: m.role,
    muted: m.muted === 1,
    banned: m.banned === 1,
    joinedAt: m.joined_at,
  }));
  return {
    id: r.id,
    kind: r.kind,
    name: r.name ?? undefined,
    topic: r.topic ?? undefined,
    announcement: r.announcement ?? undefined,
    isPrivate: r.is_private === 1,
    icon: r.icon ?? undefined,
    avatarUrl: r.avatar_url ?? undefined,
    muteAll: r.mute_all === 1,
    memberIds: detailed.filter((m) => !m.banned).map((m) => m.userId),
    members: r.kind === "channel" ? detailed : undefined,
    ownerId: r.owner_id ?? undefined,
    membersCanInvite: r.members_can_invite === 1,
    createdAt: r.created_at,
    lastMessageId: r.last_message_id ?? undefined,
    lastMessageAt: r.last_message_at ?? undefined,
  };
}

function hydrateAttachment(r: AttachmentRow): Attachment {
  return {
    id: r.id,
    name: r.name,
    url: r.url,
    mimeType: r.mime_type,
    size: r.size,
    width: r.width ?? undefined,
    height: r.height ?? undefined,
    duration: r.duration ?? undefined,
    poster: r.poster ?? undefined,
  };
}

function reactionsToList(rows: ReactionRow[]): Reaction[] {
  const map = new Map<string, Reaction>();
  for (const row of rows) {
    let r = map.get(row.emoji);
    if (!r) {
      r = { emoji: row.emoji, userIds: [] };
      map.set(row.emoji, r);
    }
    r.userIds.push(row.user_id);
  }
  return Array.from(map.values());
}

function orderPair(a: ID, b: ID): [ID, ID] {
  return a < b ? [a, b] : [b, a];
}

function hydrateFriendship(row: FriendshipRow, viewerId: ID): Friendship {
  const otherId = row.user_a === viewerId ? row.user_b : row.user_a;
  const viewerIsA = row.user_a === viewerId;
  const blockedByMe = viewerIsA ? row.blocked_a === 1 : row.blocked_b === 1;
  let direction: Friendship["direction"] = "none";
  if (row.status === "pending") {
    direction = row.action_by === viewerId ? "outgoing" : "incoming";
  }
  return {
    userId: otherId,
    status: row.status,
    direction,
    blockedByMe: row.status === "blocked" ? row.action_by === viewerId : blockedByMe,
    createdAt: row.created_at,
    note: viewerIsA ? row.note_a ?? undefined : row.note_b ?? undefined,
  };
}

export interface ActionResult {
  status: number;
  error?: string;
}

export interface ChannelActionResult {
  error?: string;
  status: number;
  conversation?: Conversation;
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      if (err?.code === "ER_LOCK_DEADLOCK" && i < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, (i + 1) * 100));
        continue;
      }
      throw err;
    }
  }
  throw new Error("max retries exceeded");
}

export const store = {
  publicUser(u: UserRow): User {
    return hydrateUser(u);
  },

  async allUsers(): Promise<User[]> {
    const rows = await query<UserRow>("SELECT * FROM users ORDER BY display_name");
    return rows.map(hydrateUser);
  },

  async findUserById(id: ID): Promise<UserRow | undefined> {
    return queryOne<UserRow>("SELECT * FROM users WHERE id = ?", [id]);
  },

  async findUserByUsername(username: string): Promise<UserRow | undefined> {
    return queryOne<UserRow>("SELECT * FROM users WHERE LOWER(username) = LOWER(?)", [username]);
  },

  async getUserById(id: ID): Promise<UserRow | undefined> {
    return queryOne<UserRow>("SELECT * FROM users WHERE id = ?", [id]);
  },

  verifyPassword(u: UserRow, plain: string): boolean {
    return bcrypt.compareSync(plain, u.password_hash);
  },

  async changePassword(userId: ID, currentPassword: string, newPassword: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const u = await queryOne<UserRow>("SELECT * FROM users WHERE id = ?", [userId]);
    if (!u) return { ok: false, error: "用户不存在" };
    if (!bcrypt.compareSync(currentPassword, u.password_hash)) {
      return { ok: false, error: "当前密码不正确" };
    }
    if (newPassword.length < 8) return { ok: false, error: "新密码至少 8 位" };
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
      return { ok: false, error: "新密码需包含大写字母、小写字母和数字" };
    }
    if (newPassword === currentPassword) return { ok: false, error: "新密码与当前密码相同" };
    await execute("UPDATE users SET password_hash = ? WHERE id = ?", [bcrypt.hashSync(newPassword, 10), userId]);
    return { ok: true };
  },

  /** 通过已验证的邮箱/手机号重置密码（无需旧密码）。 */
  async resetPasswordByTarget(userId: ID, newPassword: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const u = await queryOne<UserRow>("SELECT * FROM users WHERE id = ?", [userId]);
    if (!u) return { ok: false, error: "用户不存在" };
    if (newPassword.length < 8) return { ok: false, error: "新密码至少 8 位" };
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
      return { ok: false, error: "新密码需包含大写字母、小写字母和数字" };
    }
    await execute("UPDATE users SET password_hash = ? WHERE id = ?", [bcrypt.hashSync(newPassword, 10), userId]);
    return { ok: true };
  },

  async hasSecondPassword(userId: ID): Promise<boolean> {
    const u = await queryOne<UserRow>("SELECT second_password_hash FROM users WHERE id = ?", [userId]);
    return !!u && !!u.second_password_hash;
  },

  async getSecondPasswordHint(userId: ID): Promise<string | null> {
    const u = await queryOne<UserRow>("SELECT second_password_hint FROM users WHERE id = ?", [userId]);
    return u?.second_password_hint ?? null;
  },

  async verifySecondPassword(userId: ID, password: string): Promise<boolean> {
    const u = await queryOne<UserRow>("SELECT second_password_hash FROM users WHERE id = ?", [userId]);
    if (!u || !u.second_password_hash) return false;
    return bcrypt.compareSync(password, u.second_password_hash);
  },

  async setSecondPassword(userId: ID, password: string, hint: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const u = await queryOne<UserRow>("SELECT * FROM users WHERE id = ?", [userId]);
    if (!u) return { ok: false, error: "用户不存在" };
    
    // 检查二次密码不能与登录密码相同
    if (bcrypt.compareSync(password, u.password_hash)) {
      return { ok: false, error: "二次密码不能与登录密码相同" };
    }
    
    // 检查提醒内容不能包含密码
    if (hint.includes(password)) {
      return { ok: false, error: "提醒内容不能包含密码" };
    }
    
    const hash = bcrypt.hashSync(password, 10);
    await execute("UPDATE users SET second_password_hash = ?, second_password_hint = ? WHERE id = ?", [hash, hint, userId]);
    return { ok: true };
  },

  async removeSecondPassword(userId: ID): Promise<void> {
    await execute("UPDATE users SET second_password_hash = NULL, second_password_hint = NULL WHERE id = ?", [userId]);
  },

  /**
   * Delete (anonymize) a user account.
   */
  async deleteAccount(userId: ID, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const u = await queryOne<UserRow>("SELECT * FROM users WHERE id = ?", [userId]);
    if (!u) return { ok: false, error: "用户不存在" };
    if (!bcrypt.compareSync(password, u.password_hash)) {
      return { ok: false, error: "密码不正确" };
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute(
        "UPDATE users SET display_name = ?, bio = '', gender = 'unspecified', avatar_url = NULL, avatar_color = '#999999', require_friend_approval = 1 WHERE id = ?",
        ["账号已注销", userId]
      );
      await conn.execute("UPDATE users SET password_hash = '' WHERE id = ?", [userId]);
      await conn.execute("UPDATE users SET \`status\` = 'offline', last_seen = ? WHERE id = ?", [new Date().toISOString(), userId]);

      await conn.execute("DELETE FROM friendships WHERE user_a = ? OR user_b = ?", [userId, userId]);

      const [ownedChannels] = await conn.query("SELECT id FROM conversations WHERE kind = 'channel' AND owner_id = ?", [userId]) as any[];
      for (const ch of ownedChannels) {
        await conn.execute("DELETE FROM conversation_members WHERE conversation_id = ?", [ch.id]);
        await conn.execute("DELETE FROM messages WHERE conversation_id = ?", [ch.id]);
        await conn.execute("DELETE FROM \`reads\` WHERE conversation_id = ?", [ch.id]);
        await conn.execute("DELETE FROM conversations WHERE id = ?", [ch.id]);
      }

      await conn.execute("DELETE FROM conversation_members WHERE user_id = ?", [userId]);
      await conn.execute("DELETE FROM \`reads\` WHERE user_id = ?", [userId]);

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    return { ok: true };
  },

  async createUser(input: { username: string; password: string; displayName: string; registerIp?: string; language?: string; email?: string; phone?: string; avatarUrl?: string }): Promise<User> {
    const id = `u_${nanoid(10)}`;
    const colors = ["#66B8FF", "#2F7DFF", "#8A6CFF", "#FFB84D", "#FF5C7A", "#35C789", "#4DA3FF"];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const ts = now();
    await execute(
      `INSERT INTO users (id, username, display_name, avatar_color, bio, gender, status, last_seen, require_friend_approval, password_hash, register_ip, language, email, phone, avatar_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.username, input.displayName, color, "", "unspecified", "online", ts, 1, bcrypt.hashSync(input.password, 10), input.registerIp ?? null, input.language ?? null, input.email ?? null, input.phone ?? null, input.avatarUrl ?? null]
    );
    await this.ensureAiUser();
    const dm = await this.findOrCreateDM(id, AI_USER_ID);
    await this.createMessage({
      conversationId: dm.id,
      authorId: AI_USER_ID,
      kind: "ai",
      text: "你好！我是你的专属聊天助手，可以陪你聊天、帮你起草文字、解释概念。直接和我说话就行。",
    });
    const user = await queryOne<UserRow>("SELECT * FROM users WHERE id = ?", [id]);
    return hydrateUser(user!);
  },

  async findUserByEmail(email: string): Promise<User | null> {
    const row = await queryOne<UserRow>("SELECT * FROM users WHERE email = ?", [email]);
    return row ? hydrateUser(row) : null;
  },

  async findUserByPhone(phone: string): Promise<User | null> {
    const row = await queryOne<UserRow>("SELECT * FROM users WHERE phone = ?", [phone]);
    return row ? hydrateUser(row) : null;
  },

  async searchUsers(searchQuery: string, meId: ID): Promise<User[]> {
    const term = searchQuery.toLowerCase();
    const rows = await query<UserRow>("SELECT * FROM users ORDER BY display_name");
    return rows
      .filter((u) => {
        if (u.id === meId) return false;
        if (u.username === AI_USER_ID) return false;
        return u.username.toLowerCase().includes(term) || u.display_name.toLowerCase().includes(term);
      })
      .slice(0, 20)
      .map(hydrateUser);
  },

  async ensureAiUser(): Promise<void> {
    const existing = await queryOne<UserRow>("SELECT id FROM users WHERE id = ?", [AI_USER_ID]);
    if (existing) return;
    const ts = now();
    await execute(
      `INSERT IGNORE INTO users (id, username, display_name, avatar_color, bio, gender, status, last_seen, require_friend_approval, password_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [AI_USER_ID, "navo_ai", "Navo 助手", "#8EEBFF", "你的专属聊天助手，可以陪你聊天、帮你起草文字、解释概念。", "unspecified", "online", ts, 0, bcrypt.hashSync("", 10)]
    );
  },

  async updateContact(
    id: ID,
    patch: { email?: string | null; phone?: string | null },
  ): Promise<User | undefined> {
    const cur = await queryOne<UserRow>("SELECT * FROM users WHERE id = ?", [id]);
    if (!cur) return undefined;
    const nextEmail = patch.email === undefined ? cur.email : patch.email;
    const nextPhone = patch.phone === undefined ? cur.phone : patch.phone;
    await execute(
      "UPDATE users SET email = ?, phone = ? WHERE id = ?",
      [nextEmail, nextPhone, id],
    );
    const updated = await queryOne<UserRow>("SELECT * FROM users WHERE id = ?", [id]);
    return updated ? hydrateUser(updated) : undefined;
  },

  async updateProfile(
    id: ID,
    patch: {
      displayName?: string;
      bio?: string;
      gender?: Gender;
      avatarUrl?: string;
      avatarColor?: string;
      requireFriendApproval?: boolean;
      language?: string;
    },
  ): Promise<User | undefined> {
    const cur = await queryOne<UserRow>("SELECT * FROM users WHERE id = ?", [id]);
    if (!cur) return undefined;
    await execute(
      `UPDATE users SET display_name = ?, bio = ?, gender = ?, avatar_url = ?, avatar_color = ?, require_friend_approval = ?, language = ? WHERE id = ?`,
      [
        patch.displayName ?? cur.display_name,
        patch.bio ?? cur.bio,
        patch.gender ?? cur.gender,
        patch.avatarUrl !== undefined ? patch.avatarUrl : cur.avatar_url,
        patch.avatarColor ?? cur.avatar_color,
        patch.requireFriendApproval !== undefined ? (patch.requireFriendApproval ? 1 : 0) : cur.require_friend_approval,
        patch.language !== undefined ? patch.language : cur.language,
        id,
      ]
    );
    const updated = await queryOne<UserRow>("SELECT * FROM users WHERE id = ?", [id]);
    return updated ? hydrateUser(updated) : undefined;
  },

  async setPresence(id: ID, status: PresenceStatus): Promise<User | undefined> {
    const u = await queryOne<UserRow>("SELECT * FROM users WHERE id = ?", [id]);
    if (!u) return undefined;
    const ts = now();
    await execute("UPDATE users SET \`status\` = ?, last_seen = ? WHERE id = ?", [status, ts, id]);
    return hydrateUser({ ...u, status, last_seen: ts });
  },

  async conversationsForUser(userId: ID): Promise<Conversation[]> {
    const rows = await query<ConversationRow>(
      `SELECT c.* FROM conversations c
       JOIN conversation_members cm ON cm.conversation_id = c.id
       WHERE cm.user_id = ? AND cm.banned = 0
       ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`,
      [userId]
    );
    const result: Conversation[] = [];
    for (const r of rows) {
      const members = await query<MemberRow>(
        "SELECT user_id, role, muted, banned, joined_at FROM conversation_members WHERE conversation_id = ?",
        [r.id]
      );
      const conv = hydrateConversation(r, members);
      conv.pinned = await this.getPinnedMessages(r.id);
      result.push(conv);
    }
    return result;
  },

  async findConversation(id: ID): Promise<Conversation | undefined> {
    const r = await queryOne<ConversationRow>("SELECT * FROM conversations WHERE id = ?", [id]);
    if (!r) return undefined;
    const members = await query<MemberRow>(
      "SELECT user_id, role, muted, banned, joined_at FROM conversation_members WHERE conversation_id = ?",
      [id]
    );
    const conv = hydrateConversation(r, members);
    conv.pinned = await this.getPinnedMessages(id);
    return conv;
  },

  async isMember(conversationId: ID, userId: ID): Promise<boolean> {
    const row = await queryOne<MemberRow>(
      "SELECT user_id, role, muted, banned, joined_at FROM conversation_members WHERE conversation_id = ? AND user_id = ?",
      [conversationId, userId]
    );
    return !!row && row.banned === 0;
  },

  async memberRole(conversationId: ID, userId: ID): Promise<ChannelRole | undefined> {
    const row = await queryOne<MemberRow>(
      "SELECT user_id, role, muted, banned, joined_at FROM conversation_members WHERE conversation_id = ? AND user_id = ?",
      [conversationId, userId]
    );
    return row?.role;
  },

  async isChannelAdmin(conversationId: ID, userId: ID): Promise<boolean> {
    const role = await this.memberRole(conversationId, userId);
    return role === "owner" || role === "admin";
  },

  async isMuted(conversationId: ID, userId: ID): Promise<boolean> {
    const row = await queryOne<MemberRow>(
      "SELECT user_id, role, muted, banned, joined_at FROM conversation_members WHERE conversation_id = ? AND user_id = ?",
      [conversationId, userId]
    );
    return !!row && row.muted === 1;
  },

  async createChannel(input: {
    name: string;
    topic?: string;
    isPrivate?: boolean;
    icon?: string;
    ownerId: ID;
    memberIds: ID[];
  }): Promise<Conversation> {
    const id = `c_${nanoid(10)}`;
    const memberIds = Array.from(new Set([input.ownerId, ...input.memberIds]));
    const created_at = now();

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `INSERT INTO conversations (id, kind, name, topic, is_private, icon, owner_id, created_at)
         VALUES (?, 'channel', ?, ?, ?, ?, ?, ?)`,
        [id, input.name, input.topic ?? "", input.isPrivate ? 1 : 0, input.icon ?? "#", input.ownerId, created_at]
      );
      for (const m of memberIds) {
        await conn.execute(
          "INSERT IGNORE INTO conversation_members (conversation_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)",
          [id, m, m === input.ownerId ? "owner" : "member", created_at]
        );
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    return (await this.findConversation(id))!;
  },

  async updateChannel(
    id: ID,
    patch: {
      name?: string;
      topic?: string;
      announcement?: string;
      icon?: string;
      avatarUrl?: string;
      muteAll?: boolean;
      membersCanInvite?: boolean;
      isPrivate?: boolean;
    },
  ): Promise<Conversation | undefined> {
    const r = await queryOne<ConversationRow>("SELECT * FROM conversations WHERE id = ?", [id]);
    if (!r || r.kind !== "channel") return undefined;
    await execute(
      `UPDATE conversations SET name = ?, topic = ?, announcement = ?, icon = ?, avatar_url = ?, mute_all = ?, members_can_invite = ?, is_private = ? WHERE id = ?`,
      [
        patch.name ?? r.name,
        patch.topic !== undefined ? patch.topic : r.topic,
        patch.announcement !== undefined ? patch.announcement : r.announcement,
        patch.icon ?? r.icon,
        patch.avatarUrl !== undefined ? patch.avatarUrl : r.avatar_url,
        patch.muteAll !== undefined ? (patch.muteAll ? 1 : 0) : r.mute_all,
        patch.membersCanInvite !== undefined ? (patch.membersCanInvite ? 1 : 0) : r.members_can_invite,
        patch.isPrivate !== undefined ? (patch.isPrivate ? 1 : 0) : r.is_private,
        id,
      ]
    );
    return this.findConversation(id);
  },

  async findOrCreateDM(a: ID, b: ID): Promise<Conversation> {
    if (a === b) {
      const existing = await queryOne<{ id: string }>(
        `SELECT c.id FROM conversations c
         WHERE c.kind = 'dm'
           AND (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = c.id) = 2
           AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = ?)
           AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = ?)
         LIMIT 1`,
        [a, a]
      );
      if (existing) return (await this.findConversation(existing.id))!;
    }
    const existing = await queryOne<{ id: string }>(
      `SELECT c.id FROM conversations c
       WHERE c.kind = 'dm'
         AND (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = c.id) = 2
         AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = ?)
         AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = ?)
       LIMIT 1`,
      [a, b]
    );
    if (existing) return (await this.findConversation(existing.id))!;

    const id = `c_dm_${nanoid(8)}`;
    const created_at = now();

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `INSERT INTO conversations (id, kind, name, topic, is_private, icon, owner_id, created_at)
         VALUES (?, 'dm', NULL, NULL, 0, NULL, NULL, ?)`,
        [id, created_at]
      );
      await conn.execute(
        "INSERT IGNORE INTO conversation_members (conversation_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)",
        [id, a, created_at]
      );
      await conn.execute(
        "INSERT IGNORE INTO conversation_members (conversation_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)",
        [id, b, created_at]
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    return (await this.findConversation(id))!;
  },

  async addMember(conversationId: ID, userId: ID, actorId?: ID): Promise<Conversation | undefined> {
    const conv = await queryOne<ConversationRow>("SELECT * FROM conversations WHERE id = ?", [conversationId]);
    if (!conv || conv.kind !== "channel") return undefined;
    
    // If members_can_invite is false, only owner or admins can add members
    if (conv.members_can_invite === 0 && actorId) {
      const actorRole = await this.memberRole(conversationId, actorId);
      if (actorRole !== "owner" && actorRole !== "admin") {
        return undefined; // Signal permission denied
      }
    }
    
    await execute(
      "INSERT IGNORE INTO conversation_members (conversation_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)",
      [conversationId, userId, now()]
    );
    return this.findConversation(conversationId);
  },

  async removeMember(conversationId: ID, actorId: ID, userId: ID): Promise<ChannelActionResult> {
    const denied = await this.guardTargetAction(conversationId, actorId, userId);
    if (denied) return denied;
    await execute("DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?", [conversationId, userId]);
    return { status: 200, conversation: await this.findConversation(conversationId) };
  },

  async setRole(conversationId: ID, actorId: ID, userId: ID, role: ChannelRole): Promise<ChannelActionResult> {
    if ((await this.memberRole(conversationId, actorId)) !== "owner") {
      return { error: "只有群主可以设置管理员", status: 403 };
    }
    if (userId === actorId) return { error: "不能修改自己的角色", status: 400 };
    if (!(await this.memberRole(conversationId, userId))) return { error: "成员不存在", status: 404 };
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (role === "owner") {
        // Transfer ownership: demote current owner to member, promote target to owner
        await conn.execute(
          "UPDATE conversation_members SET role = 'member' WHERE conversation_id = ? AND user_id = ?",
          [conversationId, actorId]
        );
        await conn.execute(
          "UPDATE conversation_members SET role = 'owner' WHERE conversation_id = ? AND user_id = ?",
          [conversationId, userId]
        );
        // Also update the conversation's ownerId
        await conn.execute(
          "UPDATE conversations SET owner_id = ? WHERE id = ?",
          [userId, conversationId]
        );
      } else {
        await conn.execute(
          "UPDATE conversation_members SET role = ? WHERE conversation_id = ? AND user_id = ?",
          [role, conversationId, userId]
        );
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    return { status: 200, conversation: await this.findConversation(conversationId) };
  },

  async setMemberMuted(conversationId: ID, actorId: ID, userId: ID, muted: boolean): Promise<ChannelActionResult> {
    const denied = await this.guardTargetAction(conversationId, actorId, userId);
    if (denied) return denied;
    await execute(
      "UPDATE conversation_members SET muted = ? WHERE conversation_id = ? AND user_id = ?",
      [muted ? 1 : 0, conversationId, userId]
    );
    return { status: 200, conversation: await this.findConversation(conversationId) };
  },

  async setMemberBanned(conversationId: ID, actorId: ID, userId: ID, banned: boolean): Promise<ChannelActionResult> {
    const denied = await this.guardTargetAction(conversationId, actorId, userId);
    if (denied) return denied;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        "UPDATE conversation_members SET banned = ? WHERE conversation_id = ? AND user_id = ?",
        [banned ? 1 : 0, conversationId, userId]
      );
      if (banned) {
        await conn.execute("DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?", [conversationId, userId]);
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    return { status: 200, conversation: await this.findConversation(conversationId) };
  },

  async leaveChannel(conversationId: ID, userId: ID): Promise<ChannelActionResult> {
    const conv = await queryOne<ConversationRow>("SELECT * FROM conversations WHERE id = ?", [conversationId]);
    if (!conv || conv.kind !== "channel") return { error: "群组不存在", status: 404 };
    const role = await this.memberRole(conversationId, userId);
    if (!role) return { error: "你不是该群组成员", status: 404 };
    if (role === "owner") return { error: "群主不能退出群组，只能解散", status: 403 };
    await execute("DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?", [conversationId, userId]);
    return { status: 200, conversation: await this.findConversation(conversationId) };
  },

  async disbandChannel(conversationId: ID, actorId: ID): Promise<{ status: number; error?: string; memberIds?: ID[] }> {
    const conv = await queryOne<ConversationRow>("SELECT * FROM conversations WHERE id = ?", [conversationId]);
    if (!conv || conv.kind !== "channel") return { status: 404, error: "群组不存在" };
    if (conv.owner_id !== actorId) return { status: 403, error: "只有群主可以解散群组" };
    const members = (await query<MemberRow>(
      "SELECT user_id, role, muted, banned, joined_at FROM conversation_members WHERE conversation_id = ?",
      [conversationId]
    )).map((m) => m.user_id);
    await execute("DELETE FROM conversations WHERE id = ?", [conversationId]);
    return { status: 200, memberIds: members };
  },

  async guardTargetAction(conversationId: ID, actorId: ID, targetId: ID): Promise<ChannelActionResult | null> {
    if (!(await this.isChannelAdmin(conversationId, actorId))) return { error: "需要管理员权限", status: 403 };
    if (actorId === targetId) return { error: "不能对自己执行该操作", status: 400 };
    const targetRole = await this.memberRole(conversationId, targetId);
    if (!targetRole) return { error: "成员不存在", status: 404 };
    if (targetRole === "owner") return { error: "不能对群主执行该操作", status: 403 };
    if (targetRole === "admin" && (await this.memberRole(conversationId, actorId)) !== "owner") {
      return { error: "只有群主可以操作其他管理员", status: 403 };
    }
    return null;
  },

  async messagesFor(conversationId: ID, limit = 200): Promise<Message[]> {
    const rows = (await query<MessageRow>(
      "SELECT * FROM messages WHERE conversation_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ?",
      [conversationId, limit]
    )).reverse();
    return this.hydrateMessages(rows);
  },

  async recentMessages(conversationId: ID, limit: number): Promise<Message[]> {
    const rows = (await query<MessageRow>(
      "SELECT * FROM messages WHERE conversation_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ?",
      [conversationId, limit]
    )).reverse();
    return this.hydrateMessages(rows);
  },

  async pagedMessages(
    conversationId: ID,
    opts: { before?: string; pageSize?: number; offset?: number },
  ): Promise<{ items: Message[]; hasMore: boolean; total: number; pageSize: number }> {
    const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50));
    let rows: MessageRow[];
    if (opts.before) {
      rows = await query<MessageRow>(
        `SELECT * FROM messages WHERE conversation_id = ? AND deleted_at IS NULL AND created_at < ? ORDER BY created_at DESC LIMIT ?`,
        [conversationId, opts.before, pageSize + 1]
      );
    } else if (typeof opts.offset === "number" && opts.offset > 0) {
      rows = await query<MessageRow>(
        "SELECT * FROM messages WHERE conversation_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?",
        [conversationId, pageSize + 1, opts.offset]
      );
    } else {
      rows = await query<MessageRow>(
        "SELECT * FROM messages WHERE conversation_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ?",
        [conversationId, pageSize + 1]
      );
    }
    const hasMore = rows.length > pageSize;
    const slice = hasMore ? rows.slice(0, pageSize) : rows;
    const items = await this.hydrateMessages(slice.slice().reverse());
    const countResult = await queryOne<{ c: number }>(
      "SELECT COUNT(*) AS c FROM messages WHERE conversation_id = ? AND deleted_at IS NULL",
      [conversationId]
    );
    const total = countResult?.c ?? items.length;
    return { items, hasMore, total, pageSize };
  },

  async messagesSince(conversationId: ID, since: string, limit = 500): Promise<Message[]> {
    const rows = await query<MessageRow>(
      `SELECT * FROM messages WHERE conversation_id = ? AND deleted_at IS NULL AND created_at > ? ORDER BY created_at ASC LIMIT ?`,
      [conversationId, since, limit]
    );
    return this.hydrateMessages(rows);
  },

  async pinMessage(conversationId: ID, messageId: ID, userId: ID): Promise<void> {
    const now = new Date().toISOString();
    await execute(
      `INSERT IGNORE INTO pinned_messages (conversation_id, message_id, pinned_by, pinned_at) VALUES (?, ?, ?, ?)`,
      [conversationId, messageId, userId, now]
    );
  },

  async unpinMessage(conversationId: ID, messageId: ID): Promise<void> {
    await execute(
      "DELETE FROM pinned_messages WHERE conversation_id = ? AND message_id = ?",
      [conversationId, messageId]
    );
  },

  async getPinnedMessages(conversationId: ID, limit = 5): Promise<{ messageId: string; pinnedBy: string; pinnedAt: string }[]> {
    const rows = await query<any>(
      "SELECT message_id, pinned_by, pinned_at FROM pinned_messages WHERE conversation_id = ? ORDER BY pinned_at DESC LIMIT ?",
      [conversationId, limit]
    );
    return rows.map((r: any) => ({
      messageId: r.message_id,
      pinnedBy: r.pinned_by,
      pinnedAt: r.pinned_at,
    }));
  },

  async hydrateMessages(rows: MessageRow[]): Promise<Message[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const placeholders = ids.map(() => "?").join(",");
    const atts = await query<AttachmentRow>(
      `SELECT * FROM attachments WHERE message_id IN (${placeholders})`,
      ids
    );
    const reacts = await query<ReactionRow>(
      `SELECT * FROM reactions WHERE message_id IN (${placeholders})`,
      ids
    );
    const byMsgAtt = new Map<string, Attachment[]>();
    for (const a of atts) {
      const list = byMsgAtt.get(a.message_id) ?? [];
      list.push(hydrateAttachment(a));
      byMsgAtt.set(a.message_id, list);
    }
    const byMsgReact = new Map<string, ReactionRow[]>();
    for (const r of reacts) {
      const list = byMsgReact.get(r.message_id) ?? [];
      list.push(r);
      byMsgReact.set(r.message_id, list);
    }
    // Batch fetch replyTo messages
    const replyToIds = rows.map((r) => r.reply_to_id).filter(Boolean) as string[];
    const replyToMap = new Map<string, any>();
    if (replyToIds.length > 0) {
      const replyPlaceholders = replyToIds.map(() => "?").join(",");
      const replyRows = await query<any>(
        `SELECT m.id, m.text, m.author_id, u.display_name, m.kind, m.card_id
         FROM messages m
         LEFT JOIN users u ON u.id = m.author_id
         WHERE m.id IN (${replyPlaceholders})`,
        replyToIds
      );
      for (const rr of replyRows) {
        replyToMap.set(rr.id, rr);
      }
      // fetch attachments for reply messages
      const replyAtts = await query<AttachmentRow>(
        `SELECT * FROM attachments WHERE message_id IN (${replyPlaceholders})`,
        replyToIds
      );
      for (const a of replyAtts) {
        const entry = replyToMap.get(a.message_id);
        if (entry) {
          if (!entry._atts) entry._atts = [];
          entry._atts.push(hydrateAttachment(a));
        }
      }
    }
    return rows.map((r) => {
      const msg: Message = {
        id: r.id,
        conversationId: r.conversation_id,
        authorId: r.author_id,
        kind: r.kind,
        text: r.text,
        format: (r.format as Message["format"]) ?? undefined,
        cardId: r.card_id ?? undefined,
        attachments: byMsgAtt.get(r.id) ?? [],
        reactions: reactionsToList(byMsgReact.get(r.id) ?? []),
      replyToId: r.reply_to_id ?? undefined,
      editedAt: r.edited_at ?? undefined,
      scheduledAt: r.scheduled_at ?? undefined,
      createdAt: r.created_at,
      deleted: !!r.deleted_at,
      };
      const replyRow = r.reply_to_id ? replyToMap.get(r.reply_to_id) : undefined;
      if (replyRow) {
        msg.replyTo = {
          id: replyRow.id,
          text: replyRow.text,
          authorId: replyRow.author_id,
          authorName: replyRow.display_name || "未知",
          attachments: replyRow._atts ?? [],
          kind: replyRow.kind as Message["kind"],
          cardId: replyRow.card_id ?? undefined,
        };
      }
      return msg;
    });
  },

  async findMessage(id: ID): Promise<Message | undefined> {
    const r = await queryOne<MessageRow>("SELECT * FROM messages WHERE id = ?", [id]);
    if (!r) return undefined;
    const msgs = await this.hydrateMessages([r]);
    return msgs[0];
  },

  async createMessage(input: {
    conversationId: ID;
    authorId: ID;
    kind: Message["kind"];
    text: string;
    format?: Message["format"];
    attachments?: Attachment[];
    cardId?: ID;
    replyToId?: ID;
    /** ISO date string for scheduled delivery. When set, message is stored but not broadcast until this time. */
    scheduledAt?: string;
  }): Promise<Message> {
    return withRetry(async () => {
      const id = `m_${nanoid(12)}`;
      const created_at = now();

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.execute(
          `INSERT INTO messages (id, conversation_id, author_id, kind, format, text, card_id, reply_to_id, edited_at, scheduled_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
          [id, input.conversationId, input.authorId, input.kind, input.format ?? null, input.text, input.cardId ?? null, input.replyToId ?? null, input.scheduledAt ?? null, created_at]
        );
        for (const a of input.attachments ?? []) {
          await conn.execute(
            `INSERT IGNORE INTO attachments (id, message_id, name, url, mime_type, size, width, height, duration, poster)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [a.id, id, a.name, a.url, a.mimeType, a.size, a.width ?? null, a.height ?? null, a.duration ?? null, a.poster ?? null]
          );
        }
        // Don't update last_message_at for scheduled messages (not yet delivered)
        if (!input.scheduledAt) {
          await conn.execute(
            "UPDATE conversations SET last_message_id = ?, last_message_at = ? WHERE id = ?",
            [id, created_at, input.conversationId]
          );
        }
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
      return (await this.findMessage(id))!;
    });
  },

  async clearHistory(conversationId: ID): Promise<void> {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute("DELETE FROM messages WHERE conversation_id = ?", [conversationId]);
      await conn.execute("UPDATE conversations SET last_message_id = NULL, last_message_at = NULL WHERE id = ?", [conversationId]);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  },

  async recallMessage(messageId: ID, userId: ID): Promise<{ ok: true; message: Message } | { ok: false; error: string }> {
    const row = await queryOne<MessageRow>("SELECT * FROM messages WHERE id = ?", [messageId]);
    if (!row) return { ok: false, error: "消息不存在" };
    if (row.author_id !== userId) return { ok: false, error: "只能撤回自己的消息" };
    if (row.deleted_at) return { ok: false, error: "该消息已被撤回" };
    const ageMs = Date.now() - new Date(row.created_at).getTime();
    if (ageMs > MESSAGE_RECALL_WINDOW_MS) {
      return { ok: false, error: "消息发送超过 5 分钟，无法撤回" };
    }
    const ts = now();
    await execute("UPDATE messages SET deleted_at = ?, deleted_by = ? WHERE id = ?", [ts, userId, messageId]);
    const message = await this.findMessage(messageId);
    if (!message) return { ok: false, error: "消息不存在" };
    message.deleted = true;
    return { ok: true, message };
  },

  async editMessage(messageId: ID, userId: ID, text: string): Promise<Message | undefined> {
    const row = await queryOne<MessageRow>("SELECT * FROM messages WHERE id = ?", [messageId]);
    if (!row || row.author_id !== userId) return undefined;
    if (row.kind === "system") return undefined;
    const ts = now();
    await execute("UPDATE messages SET text = ?, kind = ?, edited_at = ? WHERE id = ?", [text, row.kind, ts, messageId]);
    return this.findMessage(messageId);
  },

  async createForwardedCard(input: {
    sourceConvId: ID;
    targetConvId: ID;
    authorId: ID;
    messageIds: ID[];
  }): Promise<{ forwardId: string; message: Message }> {
    const forwardId = `fwd_${nanoid(12)}`;
    const ts = now();

    const originalMessages: Array<{
      id: string; author_id: string; author_name: string; kind: string;
      text: string; attachments_json: string | null; created_at: string;
    }> = [];

    for (const msgId of input.messageIds) {
      const row = await queryOne<MessageRow>("SELECT * FROM messages WHERE id = ?", [msgId]);
      if (!row || row.conversation_id !== input.sourceConvId) continue;
      const author = await queryOne<{ display_name: string }>("SELECT display_name FROM users WHERE id = ?", [row.author_id]);
      const attachments = await query<AttachmentRow>("SELECT * FROM attachments WHERE message_id = ?", [msgId]);

      let text = row.text;
      if ((row.kind === "friendCard" || row.kind === "channelCard") && row.card_id && !text) {
        if (row.kind === "friendCard") {
          const user = await queryOne<{ display_name: string }>("SELECT display_name FROM users WHERE id = ?", [row.card_id]);
          text = user?.display_name ?? "好友";
        } else {
          const conv = await queryOne<{ name: string }>("SELECT name FROM conversations WHERE id = ?", [row.card_id]);
          text = conv?.name ?? "群组";
        }
      }

      originalMessages.push({
        id: row.id,
        author_id: row.author_id,
        author_name: author?.display_name ?? "未知",
        kind: row.kind,
        text,
        attachments_json: attachments.length > 0 ? JSON.stringify(attachments) : null,
        created_at: row.created_at,
      });
    }

    if (originalMessages.length === 0) {
      throw new Error("没有可转发的消息");
    }

    const title = `${originalMessages[0].author_name} 等人的聊天记录`;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `INSERT INTO forwarded_messages (id, source_conv_id, title, created_at) VALUES (?, ?, ?, ?)`,
        [forwardId, input.sourceConvId, title, ts]
      );
      for (let i = 0; i < originalMessages.length; i++) {
        const m = originalMessages[i];
        await conn.execute(
          `INSERT INTO forwarded_message_items (forward_id, message_id, author_id, author_name, kind, text, attachments_json, sort_order, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [forwardId, m.id, m.author_id, m.author_name, m.kind, m.text, m.attachments_json, i, m.created_at]
        );
      }
      const msgId = `m_${nanoid(12)}`;
      await conn.execute(
        `INSERT INTO messages (id, conversation_id, author_id, kind, text, card_id, reply_to_id, edited_at, created_at)
         VALUES (?, ?, ?, 'forwardedCard', ?, ?, NULL, NULL, ?)`,
        [msgId, input.targetConvId, input.authorId, title, forwardId, ts]
      );
      await conn.execute(
        "UPDATE conversations SET last_message_id = ?, last_message_at = ? WHERE id = ?",
        [msgId, ts, input.targetConvId]
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    const fwdMsg = await queryOne<{ id: string }>(
      "SELECT id FROM messages WHERE card_id = ? AND kind = 'forwardedCard' ORDER BY created_at DESC LIMIT 1",
      [forwardId]
    );
    const message = (await this.findMessage(fwdMsg!.id))!;
    return { forwardId, message };
  },

  async getForwardedMessages(forwardId: ID): Promise<{
    id: string; sourceConvId: string; sourceConvName: string; sourceConvKind: string;
    title: string; createdAt: string;
    items: Array<{
      messageId: string; authorId: string; authorName: string; kind: string;
      text: string; attachments: Attachment[]; createdAt: string;
    }>;
  } | null> {
    const fwd = await queryOne<{ id: string; source_conv_id: string; title: string; created_at: string }>(
      "SELECT * FROM forwarded_messages WHERE id = ?",
      [forwardId]
    );
    if (!fwd) return null;

    let sourceConvName = "未知会话";
    let sourceConvKind = "dm";
    const conv = await queryOne<{ name?: string; kind?: string }>(
      "SELECT name, kind FROM conversations WHERE id = ?",
      [fwd.source_conv_id]
    );
    if (conv) {
      sourceConvKind = conv.kind ?? "dm";
      if (conv.kind === "channel") {
        sourceConvName = conv.name ?? "未命名群组";
      } else {
        sourceConvName = "私聊";
      }
    }

    const rows = await query<any>(
      "SELECT * FROM forwarded_message_items WHERE forward_id = ? ORDER BY sort_order ASC",
      [forwardId]
    );
    return {
      id: fwd.id,
      sourceConvId: fwd.source_conv_id,
      sourceConvName,
      sourceConvKind,
      title: fwd.title,
      createdAt: fwd.created_at,
      items: rows.map((r: any) => ({
        messageId: r.message_id,
        authorId: r.author_id,
        authorName: r.author_name,
        kind: r.kind,
        text: r.text,
        attachments: r.attachments_json ? JSON.parse(r.attachments_json) : [],
        createdAt: r.created_at,
      })),
    };
  },

  async toggleReaction(messageId: ID, userId: ID, emoji: string): Promise<Message | undefined> {
    const has = await queryOne<{ c: number }>(
      "SELECT COUNT(*) AS c FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?",
      [messageId, userId, emoji]
    );
    if (!has) return undefined;
    if (has.c > 0) {
      await execute("DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?", [messageId, userId, emoji]);
    } else {
      await execute("INSERT IGNORE INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)", [messageId, userId, emoji]);
    }
    return this.findMessage(messageId);
  },

  async setRead(conversationId: ID, userId: ID, messageId: ID): Promise<void> {
    await execute(
      `INSERT INTO \`reads\` (conversation_id, user_id, last_read_message) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE last_read_message = VALUES(last_read_message)`,
      [conversationId, userId, messageId]
    );
  },

  async readMarkersForUser(userId: ID): Promise<Record<ID, ID>> {
    const rows = await query<{ conversation_id: string; last_read_message: string }>(
      `SELECT r.conversation_id, r.last_read_message
       FROM \`reads\` r
       JOIN messages m ON m.id = r.last_read_message
       JOIN conversation_members cm ON cm.conversation_id = r.conversation_id AND cm.user_id = ?
       WHERE r.user_id != ?
       AND m.created_at = (
         SELECT MAX(m2.created_at)
         FROM \`reads\` r2
         JOIN messages m2 ON m2.id = r2.last_read_message
         WHERE r2.conversation_id = r.conversation_id AND r2.user_id != ?
       )
       GROUP BY r.conversation_id`,
      [userId, userId, userId]
    );
    const out: Record<ID, ID> = {};
    for (const r of rows) out[r.conversation_id] = r.last_read_message;
    return out;
  },

  async channelReadStatesForUser(userId: ID): Promise<Record<ID, Record<ID, { lastReadAt: string; lastReadMessageId: ID }>>> {
    const rows = await query<{ conversation_id: string; user_id: string; last_read_message: string; created_at: string }>(
      `SELECT r.conversation_id, r.user_id, r.last_read_message, m.created_at
       FROM \`reads\` r
       JOIN messages m ON m.id = r.last_read_message
       JOIN conversations c ON c.id = r.conversation_id
       JOIN conversation_members cm ON cm.conversation_id = r.conversation_id AND cm.user_id = ?
       WHERE c.kind = 'channel'`,
      [userId]
    );
    const out: Record<ID, Record<ID, { lastReadAt: string; lastReadMessageId: ID }>> = {};
    for (const r of rows) {
      if (!out[r.conversation_id]) out[r.conversation_id] = {};
      out[r.conversation_id][r.user_id] = { lastReadAt: r.created_at, lastReadMessageId: r.last_read_message };
    }
    return out;
  },

  // ── Polls ─────────────────────────────────────────────────────────────

  async votePoll(messageId: ID, userId: ID, optionId: string): Promise<void> {
    await execute(
      `INSERT INTO poll_votes (message_id, user_id, option_id, created_at) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE option_id = VALUES(option_id), created_at = VALUES(created_at)`,
      [messageId, userId, optionId, now()]
    );
  },

  async getPollResults(messageId: ID, pollData: { question: string; options: { id: string; text: string }[]; anonymous: boolean }): Promise<{ results: PollResult[]; totalVotes: number }> {
    const votes = await query<{ user_id: string; option_id: string }>(
      "SELECT user_id, option_id FROM poll_votes WHERE message_id = ?",
      [messageId]
    );
    const totalVotes = votes.length;
    const counts = new Map<string, { count: number; voters: { userId: ID; displayName: string }[] }>();
    for (const opt of pollData.options) {
      counts.set(opt.id, { count: 0, voters: [] });
    }
    for (const v of votes) {
      const entry = counts.get(v.option_id);
      if (entry) {
        entry.count++;
        const user = await queryOne<UserRow>("SELECT * FROM users WHERE id = ?", [v.user_id]);
        entry.voters.push({ userId: v.user_id, displayName: user?.display_name ?? "未知" });
      }
    }
    const results: PollResult[] = pollData.options.map((opt) => {
      const entry = counts.get(opt.id)!;
      return {
        optionId: opt.id,
        text: opt.text,
        count: entry.count,
        voters: pollData.anonymous ? [] : entry.voters,
      };
    });
    return { results, totalVotes };
  },

  async lastMessagesForUser(userId: ID): Promise<Record<ID, Message>> {
    const out: Record<ID, Message> = {};
    for (const conv of await this.conversationsForUser(userId)) {
      if (!conv.lastMessageId) continue;
      const m = await this.findMessage(conv.lastMessageId);
      if (m) out[conv.id] = m;
    }
    return out;
  },

  async friendshipsFor(userId: ID): Promise<Friendship[]> {
    const rows = await query<FriendshipRow>(
      "SELECT * FROM friendships WHERE user_a = ? OR user_b = ?",
      [userId, userId]
    );
    return rows.map((r) => hydrateFriendship(r, userId));
  },

  async friendshipBetween(a: ID, b: ID): Promise<FriendshipRow | undefined> {
    const [ua, ub] = orderPair(a, b);
    return queryOne<FriendshipRow>("SELECT * FROM friendships WHERE user_a = ? AND user_b = ?", [ua, ub]);
  },

  async areFriends(a: ID, b: ID): Promise<boolean> {
    const row = await this.friendshipBetween(a, b);
    return row?.status === "accepted";
  },

  async isBlockedBetween(a: ID, b: ID): Promise<boolean> {
    const row = await this.friendshipBetween(a, b);
    if (!row) return false;
    if (row.status === "blocked") return true;
    return row.blocked_a === 1 || row.blocked_b === 1;
  },

  async hasBlocked(viewer: ID, other: ID): Promise<boolean> {
    const row = await this.friendshipBetween(viewer, other);
    if (!row) return false;
    if (row.status === "blocked") return row.action_by === viewer;
    const viewerIsA = row.user_a === viewer;
    return viewerIsA ? row.blocked_a === 1 : row.blocked_b === 1;
  },

  async setFriendship(a: ID, b: ID, status: "pending" | "accepted" | "blocked", actionBy: ID): Promise<void> {
    const [ua, ub] = orderPair(a, b);
    await execute(
      `INSERT INTO friendships (user_a, user_b, \`status\`, action_by, created_at) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE \`status\` = VALUES(\`status\`), action_by = VALUES(action_by)`,
      [ua, ub, status, actionBy, now()]
    );
  },

  async viewFriendship(viewerId: ID, otherId: ID): Promise<Friendship> {
    const row = await this.friendshipBetween(viewerId, otherId);
    if (!row) {
      return { userId: otherId, status: "accepted", direction: "none", blockedByMe: false, createdAt: now() };
    }
    return hydrateFriendship(row, viewerId);
  },

  async incomingFriendRequests(userId: ID): Promise<FriendRequest[]> {
    const rows = await query<FriendRequestRow>(
      "SELECT * FROM friend_requests WHERE to_user_id = ? ORDER BY created_at DESC",
      [userId]
    );
    return rows.map((r) => ({
      id: r.id,
      fromUserId: r.from_user_id,
      toUserId: r.to_user_id,
      message: r.message,
      createdAt: r.created_at,
    }));
  },

  async sendFriendRequest(
    fromId: ID,
    toId: ID,
    message: string,
  ): Promise<ActionResult & { body?: { status: "pending" | "accepted" }; request?: FriendRequest; autoAccepted?: boolean }> {
    if (fromId === toId) return { status: 400, error: "不能添加自己为好友" };
    const existing = await this.friendshipBetween(fromId, toId);
    if (existing?.status === "accepted") return { status: 409, error: "你们已经是好友了" };
    if (existing?.status === "blocked") return { status: 403, error: "无法发送好友申请" };

    const target = await queryOne<UserRow>("SELECT * FROM users WHERE id = ?", [toId]);
    if (!target) return { status: 404, error: "用户不存在" };

    if (target.require_friend_approval === 0) {
      await this.setFriendship(fromId, toId, "accepted", fromId);
      return { status: 201, body: { status: "accepted" }, autoAccepted: true };
    }

    const existingReq = await queryOne<FriendRequestRow>(
      "SELECT * FROM friend_requests WHERE from_user_id = ? AND to_user_id = ?",
      [fromId, toId]
    );
    const id = existingReq?.id ?? `fr_${nanoid(12)}`;
    const created_at = now();
    await execute(
      `INSERT INTO friend_requests (id, from_user_id, to_user_id, message, created_at) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE message = VALUES(message), created_at = VALUES(created_at)`,
      [id, fromId, toId, message, created_at]
    );
    await this.setFriendship(fromId, toId, "pending", fromId);
    return {
      status: 201,
      body: { status: "pending" },
      request: { id, fromUserId: fromId, toUserId: toId, message, createdAt: created_at },
    };
  },

  async acceptFriendRequest(meId: ID, requestId: ID): Promise<ActionResult & { otherUserId?: ID }> {
    const r = await queryOne<FriendRequestRow>("SELECT * FROM friend_requests WHERE id = ?", [requestId]);
    if (!r) return { status: 404, error: "请求不存在" };
    if (r.to_user_id !== meId) return { status: 403, error: "无权处理该请求" };

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [ua, ub] = orderPair(r.from_user_id, r.to_user_id);
      await conn.execute(
        `INSERT INTO friendships (user_a, user_b, \`status\`, action_by, created_at) VALUES (?, ?, 'accepted', ?, ?)
         ON DUPLICATE KEY UPDATE \`status\` = 'accepted', action_by = VALUES(action_by)`,
        [ua, ub, meId, now()]
      );
      await conn.execute("DELETE FROM friend_requests WHERE id = ?", [requestId]);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    return { status: 200, otherUserId: r.from_user_id };
  },

  async declineFriendRequest(meId: ID, requestId: ID): Promise<boolean> {
    const r = await queryOne<FriendRequestRow>("SELECT * FROM friend_requests WHERE id = ?", [requestId]);
    if (!r || r.to_user_id !== meId) return false;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute("DELETE FROM friend_requests WHERE id = ?", [requestId]);
      const [ua, ub] = orderPair(r.from_user_id, r.to_user_id);
      await conn.execute("DELETE FROM friendships WHERE user_a = ? AND user_b = ?", [ua, ub]);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    return true;
  },

  async removeFriend(a: ID, b: ID): Promise<void> {
    const [ua, ub] = orderPair(a, b);
    await execute("DELETE FROM friendships WHERE user_a = ? AND user_b = ?", [ua, ub]);
  },

  async blockUser(meId: ID, otherId: ID): Promise<void> {
    const [ua, ub] = orderPair(meId, otherId);
    const row = await queryOne<FriendshipRow>("SELECT * FROM friendships WHERE user_a = ? AND user_b = ?", [ua, ub]);
    const meIsA = ua === meId;
    if (!row) {
      await execute(
        `INSERT INTO friendships (user_a, user_b, \`status\`, action_by, blocked_a, blocked_b, created_at)
         VALUES (?, ?, 'blocked', ?, ?, ?, ?)`,
        [ua, ub, meId, meIsA ? 1 : 0, meIsA ? 0 : 1, now()]
      );
      return;
    }
    if (row.status === "accepted" || row.status === "pending") {
      if (meIsA) await execute("UPDATE friendships SET blocked_a = 1 WHERE user_a = ? AND user_b = ?", [ua, ub]);
      else await execute("UPDATE friendships SET blocked_b = 1 WHERE user_a = ? AND user_b = ?", [ua, ub]);
      return;
    }
    await execute(
      `INSERT INTO friendships (user_a, user_b, \`status\`, action_by, created_at)
       VALUES (?, ?, 'blocked', ?, ?)
       ON DUPLICATE KEY UPDATE \`status\` = 'blocked', action_by = VALUES(action_by)`,
      [ua, ub, meId, row.created_at]
    );
    if (meIsA) await execute("UPDATE friendships SET blocked_a = 1 WHERE user_a = ? AND user_b = ?", [ua, ub]);
    else await execute("UPDATE friendships SET blocked_b = 1 WHERE user_a = ? AND user_b = ?", [ua, ub]);
  },

  async unblockUser(meId: ID, otherId: ID): Promise<void> {
    const [ua, ub] = orderPair(meId, otherId);
    const row = await queryOne<FriendshipRow>("SELECT * FROM friendships WHERE user_a = ? AND user_b = ?", [ua, ub]);
    if (!row) return;
    const meIsA = ua === meId;
    if (row.status === "blocked") {
      if (row.action_by === meId) {
        await execute("DELETE FROM friendships WHERE user_a = ? AND user_b = ?", [ua, ub]);
      }
      return;
    }
    if (meIsA) await execute("UPDATE friendships SET blocked_a = 0 WHERE user_a = ? AND user_b = ?", [ua, ub]);
    else await execute("UPDATE friendships SET blocked_b = 0 WHERE user_a = ? AND user_b = ?", [ua, ub]);
  },

  async setFriendNote(meId: ID, otherId: ID, note: string): Promise<void> {
    const [ua, ub] = orderPair(meId, otherId);
    const col = ua === meId ? "note_a" : "note_b";
    await execute(`UPDATE friendships SET \`${col}\` = ? WHERE user_a = ? AND user_b = ?`, [note || null, ua, ub]);
  },

  async createStickerPack(name: string, createdBy: ID): Promise<StickerPack> {
    const id = `sp_${nanoid(10)}`;
    await execute("INSERT INTO sticker_packs (id, name, created_by, created_at) VALUES (?, ?, ?, ?)", [id, name, createdBy, now()]);
    return { id, name, createdBy, createdAt: now() };
  },

  async deleteStickerPack(id: ID): Promise<void> {
    await execute("DELETE FROM sticker_packs WHERE id = ?", [id]);
  },

  async updateStickerPack(id: ID, name: string): Promise<void> {
    await execute("UPDATE sticker_packs SET name = ? WHERE id = ?", [name, id]);
  },

  async listStickerPacks(): Promise<StickerPack[]> {
    const rows = await query<any>("SELECT * FROM sticker_packs ORDER BY created_at DESC");
    return rows.map((r: any) => ({ id: r.id, name: r.name, createdBy: r.created_by, createdAt: r.created_at }));
  },

  async addSticker(packId: ID, name: string, fileUrl: string, mimeType: string): Promise<Sticker> {
    const id = `st_${nanoid(10)}`;
    await execute("INSERT INTO stickers (id, pack_id, name, file_url, mime_type, created_at) VALUES (?, ?, ?, ?, ?, ?)", [id, packId, name, fileUrl, mimeType, now()]);
    return { id, packId, name, fileUrl, mimeType, createdAt: now() };
  },

  async deleteSticker(id: ID): Promise<void> {
    await execute("DELETE FROM stickers WHERE id = ?", [id]);
  },

  async updateStickerName(id: ID, name: string): Promise<void> {
    await execute("UPDATE stickers SET name = ? WHERE id = ?", [name, id]);
  },

  async listStickers(packId: ID): Promise<Sticker[]> {
    const rows = await query<any>("SELECT * FROM stickers WHERE pack_id = ? ORDER BY created_at ASC", [packId]);
    return rows.map((r: any) => ({ id: r.id, packId: r.pack_id, name: r.name, fileUrl: r.file_url, mimeType: r.mime_type, createdAt: r.created_at }));
  },

  async getAllStickers(): Promise<(Sticker & { packName: string })[]> {
    const rows = await query<any>(
      "SELECT s.*, p.name as pack_name FROM stickers s JOIN sticker_packs p ON p.id = s.pack_id ORDER BY p.name, s.created_at ASC"
    );
    return rows.map((r: any) => ({
      id: r.id, packId: r.pack_id, name: r.name, fileUrl: r.file_url,
      mimeType: r.mime_type, createdAt: r.created_at, packName: r.pack_name,
    }));
  },

  async getSticker(id: ID): Promise<{ id: string; packId: string; name: string; fileUrl: string; mimeType: string } | undefined> {
    const r = await queryOne<any>("SELECT * FROM stickers WHERE id = ?", [id]);
    if (!r) return undefined;
    return { id: r.id, packId: r.pack_id, name: r.name, fileUrl: r.file_url, mimeType: r.mime_type };
  },

  async banChannel(channelId: ID, bannedBy: ID, reason?: string): Promise<void> {
    const id = `cb_${nanoid(10)}`;
    const ts = now();
    await execute(
      `INSERT INTO channel_bans (id, channel_id, banned_by, reason, created_at) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE banned_by = VALUES(banned_by), reason = VALUES(reason), created_at = VALUES(created_at)`,
      [id, channelId, bannedBy, reason || null, ts]
    );
  },

  async unbanChannel(channelId: ID): Promise<void> {
    await execute("DELETE FROM channel_bans WHERE channel_id = ?", [channelId]);
  },

  async isChannelBanned(channelId: ID): Promise<{ banned: boolean; reason?: string }> {
    const row = await queryOne<{ channel_id: string; reason: string | null }>(
      "SELECT channel_id, reason FROM channel_bans WHERE channel_id = ?",
      [channelId]
    );
    if (!row) return { banned: false };
    return { banned: true, reason: row.reason ?? undefined };
  },

  async getPublicChannels(search?: string, userId?: ID): Promise<any[]> {
    let sql = `
      SELECT c.id, c.name, c.topic, c.icon, c.avatar_url, c.owner_id,
             u.display_name AS owner_name,
             (SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = c.id) AS member_count
      FROM conversations c
      LEFT JOIN users u ON u.id = c.owner_id
      WHERE c.kind = 'channel' AND c.is_private = 0`;
    const params: any[] = [];
    if (search) {
      sql += ` AND (c.name LIKE ? OR c.topic LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    sql += ` ORDER BY member_count DESC LIMIT 50`;
    const rows = await query<any>(sql, params);
    const memberIds = userId ? await query<any>(
      "SELECT conversation_id FROM conversation_members WHERE user_id = ?",
      [userId]
    ).then((rows) => new Set(rows.map((r: any) => r.conversation_id))) : new Set();
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      topic: r.topic,
      icon: r.icon,
      avatarUrl: r.avatar_url,
      memberCount: r.member_count,
      ownerId: r.owner_id,
      ownerName: r.owner_name,
      joined: memberIds.has(r.id),
    }));
  },

  // --- Scheduled message delivery ---

  /** Fetch all messages whose scheduled_at is in the past (due for delivery). */
  async fetchDueScheduledMessages(): Promise<Message[]> {
    const nowStr = new Date().toISOString();
    const rows = await query<MessageRow>(
      "SELECT * FROM messages WHERE scheduled_at IS NOT NULL AND scheduled_at <= ? ORDER BY scheduled_at ASC",
      [nowStr]
    );
    return this.hydrateMessages(rows);
  },

  /** Fetch all future scheduled messages (for scheduling timers). */
  async fetchPendingScheduledMessages(): Promise<Message[]> {
    const nowStr = new Date().toISOString();
    const rows = await query<MessageRow>(
      "SELECT * FROM messages WHERE scheduled_at IS NOT NULL AND scheduled_at > ? ORDER BY scheduled_at ASC",
      [nowStr]
    );
    return this.hydrateMessages(rows);
  },

  /** Deliver a scheduled message: clear scheduled_at and update conversation's last_message. */
  async deliverScheduledMessage(messageId: ID): Promise<void> {
    await execute(
      "UPDATE messages SET scheduled_at = NULL WHERE id = ? AND scheduled_at IS NOT NULL",
      [messageId]
    );
    const msg = await this.findMessage(messageId);
    if (msg) {
      await execute(
        "UPDATE conversations SET last_message_id = ?, last_message_at = ? WHERE id = ?",
        [messageId, msg.createdAt, msg.conversationId]
      );
    }
  },
};

export type { UserRow };

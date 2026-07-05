# server/src/store.ts — Data Access Layer

## Purpose

Single source of truth for all MySQL data access. Provides a `store` object with methods for CRUD operations on users, conversations, messages, friendships, channels, polls, stickers, and scheduled messages. Handles row-to-domain hydration, transactional multi-table operations, and deadlock retry.

## Exports

- `store` — Singleton object containing all data access methods (see below).
- `ActionResult` — Type: `{ status: number; error?: string }`.
- `ChannelActionResult` — Type: `{ status: number; error?: string; conversation?: Conversation }`.
- `UserRow` — Type re-export (the raw DB row shape for users).

## Key Logic

**Hydration layer:**

Internal functions convert DB row types to domain types:
- `hydrateUser(r: UserRow): User` — Maps snake_case columns to camelCase fields. `require_friend_approval` converted from 0/1 to boolean.
- `hydrateConversation(r, members): Conversation` — Builds `ConversationMember[]` from member rows. Banned members are excluded from `memberIds`. `pinned` messages are fetched separately.
- `hydrateAttachment(r): Attachment` — Maps nullable width/height/poster to optional.
- `reactionsToList(rows): Reaction[]` — Aggregates reaction rows into `{ emoji, userIds[] }` list.
- `hydrateFriendship(row, viewerId): Friendship` — Computes `direction` (outgoing/incoming/none) and `blockedByMe` from the viewer's perspective.
- `orderPair(a, b): [ID, ID]` — Canonical ordering for friendship rows (lexicographic) to ensure consistent DB lookups.

**`withRetry(fn, maxRetries=3)`:**

Retries a function up to 3 times on `ER_LOCK_DEADLOCK` errors with exponential backoff (100ms, 200ms, 300ms). Used by `createMessage` to handle MySQL deadlock on concurrent message inserts.

**Store methods by domain:**

*Users:*
- `publicUser(u)` — Hydrates a UserRow to public User.
- `allUsers()` — All users ordered by display_name.
- `findUserById(id)`, `findUserByUsername(username)`, `getUserById(id)` — Lookup by ID or case-insensitive username.
- `verifyPassword(u, plain)` — bcrypt compare.
- `changePassword(userId, current, new)` — Validates current password, enforces 8+ chars with upper/lower/digit, rejects same-password.
- `hasSecondPassword`, `getSecondPasswordHint`, `verifySecondPassword`, `setSecondPassword`, `removeSecondPassword` — Secondary PIN management. Second password cannot equal login password. Hint cannot contain the password.
- `deleteAccount(userId, password)` — Anonymizes user (sets display_name to "已注销", clears bio/avatar/password, deletes friendships, owned channels + their messages/reads, and own membership/reads). Transactional.
- `createUser(input)` — Generates `u_<nanoid10>` ID, random avatar color, hashes password, inserts user. Ensures AI user exists. Creates DM with AI user and sends a welcome message.
- `searchUsers(query, meId)` — Loads all users, filters by username/displayName substring match (excludes self and AI user), limits to 20.
- `ensureAiUser()` — Idempotent insert of the AI assistant user.
- `updateProfile(id, patch)` — Partial update of profile fields.
- `setPresence(id, status)` — Updates `status` and `last_seen`.

*Conversations:*
- `conversationsForUser(userId)` — All conversations where user is an active (non-banned) member, ordered by last message time. Includes pinned messages.
- `findConversation(id)` — Single conversation with members and pinned messages.
- `isMember(convId, userId)` — Checks membership and not banned.
- `memberRole(convId, userId)` — Returns `ChannelRole` or undefined.
- `isChannelAdmin(convId, userId)` — Owner or admin.
- `isMuted(convId, userId)` — Per-user mute check.
- `createChannel(input)` — Transactional: creates conversation + member rows. Owner gets "owner" role.
- `updateChannel(id, patch)` — Partial update of channel fields.
- `findOrCreateDM(a, b)` — Finds existing 2-member DM or creates new one. Handles self-DM (a === b). Transactional on create.
- `addMember(convId, userId, actorId?)` — Respects `members_can_invite` flag (only owner/admin can invite when disabled).
- `removeMember(convId, actorId, targetId)` — Permission-guarded via `guardTargetAction`.
- `setRole(convId, actorId, userId, role)` — Owner only. Supports ownership transfer (demotes current owner to member). Transactional.
- `setMemberMuted`, `setMemberBanned` — Permission-guarded. Ban also deletes the membership row. Transactional.
- `leaveChannel(convId, userId)` — Owner cannot leave (must disband).
- `disbandChannel(convId, actorId)` — Owner only. Returns member IDs for notification. Deletes conversation (cascading via FK or manual).
- `guardTargetAction(convId, actorId, targetId)` — Common permission check: admin required, cannot target self, cannot target owner, only owner can target other admins.

*Messages:*
- `messagesFor(convId, limit=200)` — Last N non-deleted messages, ascending order.
- `recentMessages(convId, limit)` — Same as above (alias).
- `pagedMessages(convId, opts)` — Pagination with `before` (cursor), `offset`, or default. Returns `{ items, hasMore, total, pageSize }`. Fetches pageSize+1 to detect hasMore.
- `messagesSince(convId, since)` — Messages after a timestamp (for sync). Max 500.
- `hydrateMessages(rows)` — Batch-loads attachments, reactions, and replyTo messages for a set of message rows. Returns hydrated `Message[]` with `replyTo` inline objects.
- `findMessage(id)` — Single message lookup + hydration.
- `createMessage(input)` — Transactional with deadlock retry. Generates `m_<nanoid12>` ID. Inserts message + attachments. Updates conversation's `last_message_id/at` (skipped for scheduled messages).
- `clearHistory(convId)` — Transactional: deletes all messages, resets conversation's last message.
- `recallMessage(messageId, userId)` — Soft-delete within 5-minute window (`MESSAGE_RECALL_WINDOW_MS`). Sets `deleted_at` and `deleted_by`.
- `editMessage(messageId, userId, text)` — Author only. Cannot edit system messages. Sets `edited_at`.
- `createForwardedCard(input)` — Transactional: creates `forwarded_messages` row, `forwarded_message_items` for each original message (with hydrated author name and attachments JSON), then a `forwardedCard` message in the target conversation.
- `getForwardedMessages(forwardId)` — Fetches forwarded message group with source conversation metadata.
- `toggleReaction(messageId, userId, emoji)` — Toggle: if reaction exists, delete; if not, insert.
- `setRead(convId, userId, messageId)` — Upsert on `reads` table.
- `readMarkersForUser(userId)` — Returns `{ convId → lastReadMessageId }` for other users' read positions in shared conversations.
- `channelReadStatesForUser(userId)` — Returns nested map: `{ convId → { userId → { lastReadAt, lastReadMessageId } } }` for channel read states.

*Pins:*
- `pinMessage`, `unpinMessage`, `getPinnedMessages` — CRUD on `pinned_messages` table. Max 5 pinned per conversation (enforced by `getPinnedMessages` limit).

*Polls:*
- `votePoll(messageId, userId, optionId)` — Upsert on `poll_votes`.
- `getPollResults(messageId, pollData)` — Aggregates vote counts per option. Returns voter details unless anonymous.

*Last messages:*
- `lastMessagesForUser(userId)` — For each conversation, fetches the last message. Returns `{ convId → Message }`.

*Friendships:*
- `friendshipsFor(userId)` — All friendship rows involving the user.
- `friendshipBetween(a, b)` — Canonical pair lookup via `orderPair`.
- `areFriends(a, b)` — Status === "accepted".
- `isBlockedBetween(a, b)`, `hasBlocked(viewer, other)` — Block checks.
- `setFriendship(a, b, status, actionBy)` — Upsert on canonical pair.
- `viewFriendship(viewerId, otherId)` — Returns hydrated Friendship for viewer's perspective.
- `incomingFriendRequests(userId)` — Pending requests addressed to the user.
- `sendFriendRequest(fromId, toId, message)` — Auto-accepts if target has `requireFriendApproval=false`. Creates friendship + request. Handles existing requests (upsert).
- `acceptFriendRequest(meId, requestId)` — Transactional: sets friendship to "accepted", deletes request.
- `declineFriendRequest(meId, requestId)` — Transactional: deletes request + friendship row.
- `removeFriend(a, b)` — Deletes friendship row.
- `blockUser(meId, otherId)` — Sets blocked_a/blocked_b flag or creates blocked status. Handles all existing states.
- `unblockUser(meId, otherId)` — Clears block flag. If status is "blocked" and viewer is the action_by, deletes the row entirely.
- `setFriendNote(meId, otherId, note)` — Sets note_a or note_b based on canonical ordering.

*Stickers:*
- `createStickerPack`, `deleteStickerPack`, `updateStickerPack`, `listStickerPacks` — CRUD on `sticker_packs`.
- `addSticker`, `deleteSticker`, `updateStickerName`, `listStickers`, `getAllStickers`, `getSticker` — CRUD on `stickers` with pack joins.

*Channel bans:*
- `banChannel`, `unbanChannel`, `isChannelBanned` — CRUD on `channel_bans` table.

*Public channels:*
- `getPublicChannels(search?, userId?)` — Lists non-private channels with member count, owner name, and whether the requesting user has joined.

*Scheduled messages:*
- `fetchDueScheduledMessages()` — Messages where `scheduled_at <= now`.
- `fetchPendingScheduledMessages()` — Messages where `scheduled_at > now`.
- `deliverScheduledMessage(messageId)` — Clears `scheduled_at`, updates conversation's last message.

## Dependencies

- **Imports:** `nanoid`, `bcryptjs`, `@navo/shared` (types, `AI_USER_ID`, `MESSAGE_RECALL_WINDOW_MS`), `./db.js` (`pool`, `query`, `queryOne`, `execute`).
- **Imported by:** `http.ts`, `ws.ts`, `ai.ts`, `scheduler.ts`, `admin-routes.ts` — virtually every server module.

## Constraints and Gotchas

- `orderPair` ensures friendship lookups are order-independent — `friendships` table stores (user_a < user_b) canonically.
- `deleteAccount` anonymizes rather than hard-deletes — the user row remains for referential integrity. Owned channels are hard-deleted.
- `createMessage` uses `withRetry` for deadlock handling — this is critical under high concurrency.
- `hydrateMessages` batch-loads all attachments, reactions, and replyTo messages in 3 queries regardless of message count — avoids N+1.
- `pagedMessages` fetches `pageSize + 1` rows to determine `hasMore` without a separate COUNT query in the common path. A COUNT is still done for the `total` field.
- `recallMessage` has a 5-minute window enforced by `MESSAGE_RECALL_WINDOW_MS` from shared types.
- `createUser` automatically creates a DM with the AI user and sends a welcome message — this happens on every registration.
- `findOrCreateDM` handles self-DM (a === b) by searching for a DM where both members are the same user.
- `leaveChannel` prevents the owner from leaving — they must disband instead.
- `setMemberBanned` both sets the banned flag AND deletes the membership row in a transaction.
- `setRole` with `"owner"` role performs ownership transfer: demotes current owner to member, promotes target, and updates `conversations.owner_id`.
- Sticker and channel ban methods are on the store but are primarily used by admin routes.
- All timestamps use ISO 8601 strings via `new Date().toISOString()`.

## Interactions

- **db.js:** All SQL goes through `query`, `queryOne`, `execute`, and `pool.getConnection` (for transactions). The store never imports HTTP, WebSocket, or SFU modules.
- **http.ts:** Calls store methods for all data operations. After mutations, calls hub methods for real-time broadcast.
- **ws.ts:** Calls store methods for message creation, read markers, reactions, polls, presence, and all lookups needed for event handling.
- **ai.ts:** Calls store for conversation/message data to build AI prompts.
- **scheduler.ts:** Calls `fetchDueScheduledMessages`, `fetchPendingScheduledMessages`, and `deliverScheduledMessage`.
- **admin-routes.ts:** Calls store for channel management, sticker CRUD, and ban operations.

# server/src/ws.ts — WebSocket Hub

## Purpose

Manages all WebSocket connections for real-time communication. Handles authentication, presence, messaging, typing indicators, reactions, read receipts, friend events, call signaling, poll voting, and AI auto-reply. Acts as the bridge between the SFU (WebRTC) and connected clients.

## Exports

- `class Hub` — The WebSocket hub. Created by `attachWebSocket`. Manages client connections, message routing, and call state.
- `attachWebSocket(server)` — Creates a `Hub` instance, attaches it to the HTTP server on path `/ws`, stores the singleton in `hubInstance`. Returns the hub.
- `Hub.isUserOnline(userId)` — Returns `true` if the user has at least one active WebSocket connection (registered in the `byUser` map).
- `getHub()` — Returns the current `Hub` singleton (may be null before `attachWebSocket` is called).

## Key Logic

**Connection lifecycle:**

1. Client connects to `/ws`. A `socketId` (nanoid 12) is assigned.
2. Auth timer starts (`WS_AUTH_TIMEOUT_MS` from `@navo/shared`). If no `auth` event received within the window, the socket is closed.
3. First message must be `{ type: "auth", token }`. The JWT is verified. If valid, the client is registered in `byUser` map (userId → Set of LocalClient).
4. On successful auth: presence is set to "online" in Redis + DB, a `ready` event with full `BootstrapData` is sent, and presence is broadcast to the user's audience (conversation members + friends).
5. On close: client is unregistered. If no more sockets remain for that user, presence is set to "offline" and broadcast.

**Message routing (fanout):**

- `fanout(userIds, event, exceptSocketId?)` — Delivers locally AND publishes to Redis bus for multi-instance delivery.
- `fanoutToConversation(conversationId, event)` — Looks up conversation members, then fans out.
- `fanoutToAll(event)` — Sends to all locally connected users.
- Redis pub/sub with `ORIGIN_ID` (nanoid 16) to prevent echo — messages from this instance are excluded when received back from the bus.

**Client event handling (`handleEvent`):**

| Event | Logic |
|-------|-------|
| `message:send` | Validates membership, channel ban status, message length (from DB setting), rate limit (with captcha escalation), DM block check, non-friend message limit (3 messages), channel mute/muteAll, friend card permission, sensitive word filtering. Creates message in DB. If scheduled, acknowledges without broadcast. Triggers offline push via GeTui. Triggers AI reply if conversation includes AI user. |
| `typing:start/stop` | Fans out typing indicator to conversation members (excluding sender). |
| `presence:set` | Updates Redis + DB presence, broadcasts to audience. |
| `reaction:toggle` | Toggles emoji reaction on a message, broadcasts updated message. |
| `read` | Updates read marker in DB, broadcasts read receipt. |
| `message:recall` | Soft-deletes message (within 5-minute window). Broadcasts update. |
| `message:edit` | Updates message text, sets `edited_at`. Broadcasts update. |
| `call:invite` | Stores call metadata (callId → conversationId, kind, fromUserId). Fans out `call:incoming` to callees. Sets 30s timeout to auto-cancel. |
| `call:accept` | Clears timeout, notifies caller with `call:accepted`. |
| `call:reject` | Clears timeout, shuts down SFU room, notifies caller with `call:rejected`. |
| `call:cancel` | Clears timeout, shuts down room, fans out `call:cancelled`. |
| `call:hangup` | Leaves SFU room, broadcasts `call:hangup`, creates a system message with call duration summary, then fans out the new message. |
| `call:offer` | Creates or joins SFU room via `getOrCreateRoom`. Calls `room.joinUpstream` with client's SDP. Returns answer SDP + existing participants. Fans out `call:peer-joined` to other members. |
| `call:answer` | Forwards downstream SDP answer to SFU room via `room.answerDownstream`. |
| `call:ice` | Forwards ICE candidate to SFU room (upstream or downstream target). |
| `call:subscribe` | Requests subscription to a publisher's track. Rejects self-subscription. Returns downstream offer SDP via `room.subscribe`. |
| `call:admin` | Owner/admin can mute/unmute/ban a participant. Requires `canAdminCall` permission check (owner/admin in channel, or any member in DM). |
| `call:query-active` | Returns list of active calls the user is participating in, with participant states. |
| `poll:vote` | Validates poll message exists, user is member, option ID is valid. Records vote, broadcasts updated results. |
| `presence:ping` | DM only. Rate-limited per user+conversation (`rateLimitPresencePingMax` / `rateLimitPresencePingWindow` from system settings). Fans out `presence:ping` to the peer with `pingId`. |
| `presence:pong` | Forwards `presence:pong` to the original requester (`toUserId`) after the peer taps "I'm here". |

**AI reply mechanism (`maybeAiReply`):**

- Only triggers for DM conversations that include `AI_USER_ID`.
- Uses a per-conversation promise queue (`aiQueues`) to serialize AI responses.
- Sends typing indicator, waits 300ms, calls `generateAiReply(conversationId, userId)`, creates AI message, broadcasts.
- The `userId` parameter is the human message author's ID, used by `generateAiReply` for profile injection in the system prompt.
- If AI is not configured, returns an error message.

**Call state tracking:**

- `callConv`: Map<callId, conversationId>
- `callKindMap`: Map<callId, CallKind>
- `callMeta`: Map<callId, { fromUserId, startedAt, kind }>
- `callTimeouts`: Map<callId, setTimeout handle>
- `wiredRooms`: Set<callId> — tracks which SFU rooms have event listeners attached

**SFU room wiring (`wireRoom`):**

Attaches event listeners to the SFU room's EventEmitter: `user-left`, `track-published`, `ice-upstream`, `ice-downstream`, `downstream-offer`, `user-muted`, `user-unmuted`, `closed`. Each event is translated to a `ServerEvent` and fanned out to conversation members.

**Rate limit + captcha flow for messages:**

1. Check if captcha is enabled and user is captcha-locked.
2. If locked OR rate limit exceeded: require captcha token.
3. If no captcha token: set captcha lock, send `captcha_required` error.
4. If captcha valid: reset rate limit.
5. If captcha not enabled: send `rate_limited` error.

## Dependencies

- **Imports:** `ws` (WebSocketServer, WebSocket), `nanoid`, `@navo/shared` (types, `WS_AUTH_TIMEOUT_MS`, `AI_USER_ID`, `t`), `./store.js`, `./db.js` (`queryOne`), `./auth.js` (`verifyToken`), `./redis.js` (`publishBus`, `setPresence`, `clearPresence`, `subscribeBus`), `./ai.js` (`generateAiReply`, `isAiConfigured`), `./sfu.js` (`getOrCreateRoom`, `getRoom`, SFU type), `./admin.js` (ban checks, sensitive words, system settings, captcha), `./rate-limit.js`, `./scheduler.js` (type only).
- **Imported by:** `index.ts` (attaches the hub), `http.ts` (imports Hub type for callback), `scheduler.ts` (imports Hub type), `admin-routes.ts` (indirectly via getHub).

## Constraints and Gotchas

- Max WebSocket message size: 256 KB (`MAX_WS_MESSAGE_BYTES`). Messages exceeding this close the socket.
- JSON depth limit: 32 levels (`MAX_JSON_DEPTH`). Prevents stack overflow from deeply nested payloads.
- `ORIGIN_ID` prevents Redis pub/sub echo — each instance ignores its own messages on the bus.
- The `byUser` map supports multiple sockets per user (multi-tab/device). `unregister` only triggers offline when the last socket closes.
- The 30-second call invite timeout auto-cancels if no one accepts. The timeout is cleared on accept, reject, or cancel.
- Non-friend DMs are limited to 3 messages (checked against the 50 most recent messages).
- `call:hangup` creates a system message with call duration — this is the only place call duration is recorded.
- The AI reply queue per conversation ensures sequential processing — if a second message arrives while the first AI reply is generating, it queues behind.
- The `wireRoom` function is idempotent — it only attaches listeners once per callId via the `wiredRooms` set.
- Scheduled messages are acknowledged to the sender (`message:scheduled`) but not broadcast until the scheduler delivers them.
- `broadcastUserUpdate` uses the user's audience (conversation members + friends), not just conversation members.

## Interactions

- **store.js:** All data lookups (conversations, messages, users, friendships, read markers, poll votes).
- **sfu.js:** Creates/looks up SFU rooms for calls. The hub calls `getOrCreateRoom`, `getRoom`, `room.joinUpstream`, `room.answerDownstream`, `room.addIce`, `room.subscribe`, `room.leave`, `room.shutdown`, `room.mute`, `room.unmute`, `room.ban`.
- **redis.js:** Pub/sub for multi-instance fanout. Presence management (`setPresence`, `clearPresence`).
- **http.ts:** The HTTP layer calls `hub.broadcastUserUpdate`, `hub.broadcastConversationUpdate`, `hub.notifyConversationNew`, `hub.notifyConversationRemove`, `hub.fanout`, `hub.broadcastHistoryCleared` after mutations.
- **admin.js:** Ban status checks, sensitive word filtering, system settings, captcha validation.
- **ai.js:** AI reply generation for DM conversations with the AI user.
- **rate-limit.js:** Message rate limiting with captcha escalation.

# SFU Room Integration Tests

**File:** `tests/server/sfu/webrtc-sfu-room.test.ts`

## Purpose

Tests the actual `SFU` class from `server/src/sfu.ts`: room creation, participant management, subscribe flow, mute/unmute, ban, and shutdown. These tests import real server module functions, not mocked versions.

## Test Cases

### Room Creation and Lifecycle

| Test | Description |
|------|-------------|
| Create room via `getOrCreateRoom` | Returns room with correct `callId`, `conversationId`, `kind`. |
| Same `callId` returns same room | `getOrCreateRoom` returns identical instance for same callId. |
| Different `callId` returns different rooms | Distinct room instances for different callIds. |
| `getRoom` finds created room | Lookup by callId returns the room. |
| `getRoom` returns undefined for unknown | Non-existent callId returns `undefined`. |
| `closeRoom` removes from registry | Room removed from registry after `closeRoom`. |
| `"closed"` event on shutdown | `room.once("closed")` fires when `shutdown()` is called. |

### Participant Management

| Test | Description |
|------|-------------|
| Starts with no participants | `participants().length === 0` for new room. |
| Correct count after `joinUpstream` | First joiner sees 0 existing participants; room has 1 participant. |
| List existing participants on second join | Second joiner sees 1 existing participant; room has 2. |
| Remove participant on `leave()` | `participants().length` drops to 0 after `leave()`. |
| Auto-shutdown on last leave | Room emits `"closed"` and is removed from registry when last participant leaves. |
| `"user-joined"` event | Event contains correct `userId` on `joinUpstream`. |
| `"user-left"` event | Event contains correct `userId` on `leave()`. |

### Mute/Unmute

| Test | Description |
|------|-------------|
| `mute()` sets muted state | `"user-muted"` event fires with `userId` and `byUserId`. |
| `unmute()` clears muted state | `"user-unmuted"` event fires with correct data. |

### Ban

| Test | Description |
|------|-------------|
| Ban user emits `"user-banned"` | Event contains correct `userId`; user removed from room. |
| Banned user rejected on re-join | User removed from participants after ban. |

### Room Shutdown

| Test | Description |
|------|-------------|
| `joinUpstream` rejects after shutdown | Throws `"Room closed"`. |
| All participants cleared on shutdown | `participants().length === 0` after shutdown. |
| Double shutdown is idempotent | No throw on second `shutdown()` call. |

### Reset ICE Config

| Test | Description |
|------|-------------|
| `resetIceServersConfig` does not throw | Clears cached ICE config without error. |

## Dependencies

- `SFU`, `getOrCreateRoom`, `getRoom`, `closeRoom`, `resetIceServersConfig` from `server/src/sfu.ts`.
- `RTCPeerConnection`, `createTestVideoTrack`, `createTestAudioTrack`, `pushVideoFrame`, `pushAudioFrame`, `cleanupPair` from helpers.

## Key Logic

- Tests use the real `SFU` class, not mocks -- they exercise actual room state management.
- Each test creates a unique `callId` to avoid state leakage between tests.
- `joinUpstream` accepts `{ callId, conversationId, userId, kind, sdp }` and returns `{ sdp, participants }`.
- ICE servers are configured with `{ iceServers: [] }` in test PCs; SFU's `getIceServers` may fail gracefully.
- Room auto-closes via `shutdown()` when `upstreams.size === 0` after the last `leave()`.

## Constraints

- Tests do not verify actual media forwarding (subscribe/answerDownstream) -- they focus on room state management.
- SFU's `getIceServers()` may fail if `admin.js` is not available; test PCs use empty ICE config.
- `joinUpstream` requires a valid SDP offer; tests create offers via `pc.createOffer()` but don't complete full media flow.
- `ban()` internally calls `leave()` which may trigger auto-shutdown; tests account for this.
- Each test must call `closeRoom(callId)` to clean up, even if auto-shutdown occurred.

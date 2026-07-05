# sound.ts — Notification Sound

## Purpose

Plays a short notification tone when new messages arrive. Uses the Web Audio API for synthesized sound (no audio file dependencies).

## Exports

| Export | Kind | Description |
|--------|------|-------------|
| `notificationSound` | Singleton | `NotificationSound` instance |

## Key Logic

**Synthesized tone.** Two sine-wave oscillators: 880 Hz (0.18s) followed by 1318.5 Hz (0.22s), with exponential gain decay. No audio files needed.

**Rate limiting.** Maximum one play per 1500ms to prevent rapid-fire sounds on message bursts.

**User preference.** Enabled state persisted in `localStorage` under `navo:im:soundEnabled`. Defaults to `true` if not set.

**`AudioContext` lazy init.** The context is created on first `play()` call. Handles `webkitAudioContext` fallback for older Safari. Resumes suspended contexts (required after user gesture policy).

## Dependencies

None (pure Web Audio API).

## Constraints and Gotchas

- The `AudioContext` may be in `suspended` state until a user gesture occurs. `play()` calls `resume()` but does not wait for it.
- If `AudioContext` construction fails (restricted environment), `play()` silently no-ops.
- The 1500ms rate limit is global, not per-conversation.

## Interactions

- **Store (`store.ts`):** `appendMessage` calls `notificationSound.play()` for incoming non-self messages when the app is not focused or the message is for a non-selected conversation.

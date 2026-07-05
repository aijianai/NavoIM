// ============================================================================
// Navo IM - Shared domain types & wire protocol
// Imported by both @navo/server and @navo/web. Single source of truth.
// ============================================================================
/** Default permissions for each role */
export const ROLE_PERMISSIONS = {
    super_admin: [
        "users.manage",
        "users.ban",
        "users.delete",
        "channels.manage",
        "channels.delete",
        "messages.moderate",
        "messages.delete",
        "settings.manage",
        "audit.view",
        "roles.manage",
    ],
    admin: [
        "users.manage",
        "users.ban",
        "channels.manage",
        "messages.moderate",
        "messages.delete",
        "audit.view",
    ],
    moderator: [
        "messages.moderate",
        "messages.delete",
        "users.ban",
    ],
    user: [],
};
export const WS_AUTH_TIMEOUT_MS = 10_000;
export const AI_USER_ID = "u_navo_ai";
export const MESSAGE_RECALL_WINDOW_MS = 5 * 60 * 1000;
/**
 * Offline message sync limits.
 *
 * INITIAL_PULL_MAX: no upper bound for the first connection after auth.
 * The client fetches all unsynchronized messages in one batch.
 *
 * RECONNECT_PULL_MAX: cap for subsequent reconnections.
 * Only the N most recent messages per conversation are pulled.
 */
export const RECONNECT_PULL_MAX = 30;
export { t, LANGUAGES, detectBrowserLanguage, getLanguageLabel } from "./i18n.js";

# audit.ts — File-Based Audit Logger

## Purpose

Append-only JSON-lines audit logger for recording user actions to disk.

## Exports

- `auditLog(action: string, userId: string, details?: Record<string, unknown>)` — writes a single JSON entry to the audit log.

## Key Logic

- Opens `config.dataDir/audit.log` as an append-only write stream at module load time.
- Each entry is a single JSON line with fields: `time` (ISO 8601), `action`, `userId`, `details`.
- Registers handlers on `exit`, `SIGINT`, and `SIGTERM` to flush and close the stream.

## Dependencies

- `server/src/config.js` — `dataDir`

## Constraints and Gotchas

- The write stream is created once at import time. If the data directory does not exist or is not writable, writes will silently fail.
- There is no log rotation, size limit, or compression. The file grows unboundedly.
- The stream is closed on process exit signals but not on normal `SIGTERM` if the process is killed forcefully.

## Interactions

Called throughout the server (e.g., login, message send, admin actions) to produce an auditable trail. The log file can be consumed by external tooling.

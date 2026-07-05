# settings/IceSettings.tsx — ICE Server Configuration

## Purpose

Form for managing STUN and TURN servers used in WebRTC connections. Supports adding, editing, and removing multiple servers with optional authentication.

## Exports

- `IceSettings` — React component with `iceConfig` and `setIceConfig` props.
- `IceServer` — Interface: `{ url: string; username?: string; credential?: string }`.
- `IceConfig` — Interface: `{ stunServers: IceServer[]; turnServers: IceServer[] }`.

## Key Logic

- **STUN servers**: Dynamic list with URL input per server. No authentication fields.
- **TURN servers**: Dynamic list with URL, username (required), and credential (optional) inputs.
- **ServerRow** (internal): Renders a single server entry with URL input, optional auth fields, delete button, and validation error message.
- **Add buttons**: "Add STUN" and "Add TURN" buttons append empty server entries.

## Dependencies

- `Sec`, `Field` from `../shared`.
- `useT` from `../../../lib/i18n`.

## Constraints and Gotchas

- `ServerRow` validates that URL is non-empty; for TURN servers, username must also be non-empty. Validation errors show inline.
- `IceConfig` and `IceServer` interfaces are exported but defined locally (not from `@navo/shared`).
- No validation on URL format (e.g., must start with `stun:` or `turn:`).
- STUN entries have no auth fields; TURN entries always show auth fields.

## Interactions

- Receives config object and setter from `SettingsTab`.
- Changes are persisted as part of the global settings save.

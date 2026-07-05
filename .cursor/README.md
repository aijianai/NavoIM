# Cursor AI Index

This directory provides persistent context for Cursor AI when modifying the Navo IM monorepo.

## Files

| File | Purpose |
|------|---------|
| `PROJECT_INDEX.md` | Full source-to-documentation mapping for all 150+ modules |
| `rules/*.mdc` | Scoped rules auto-loaded by Cursor based on file context |

## Rules Overview

| Rule | Scope | Trigger |
|------|-------|---------|
| `navo-docs-first.mdc` | Doc lookup workflow | Always |
| `navo-coding-standards.mdc` | Language, change discipline | Always |
| `navo-deployment.mdc` | Production deploy constraints | Always |
| `navo-server.mdc` | Server package conventions | `server/**/*` |
| `navo-web.mdc` | Web frontend conventions | `web/**/*` |
| `navo-shared.mdc` | Shared types/i18n | `shared/**/*` |
| `navo-tests.mdc` | WebRTC test conventions | `tests/**/*` |

## Related Files

- `AGENTS.md` — Full agent system prompt (repo root)
- `docs-src/` — Canonical module documentation (read before code changes)
- `.cursorignore` — Excludes build artifacts and secrets from indexing

## Regenerating the Index

When new source files are added, regenerate `PROJECT_INDEX.md`:

```bash
python3 .cursor/generate-index.py
```

Or re-run the index generation script from the repo root.

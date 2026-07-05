#!/usr/bin/env python3
"""Regenerate .cursor/PROJECT_INDEX.md from current source tree."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_DIRS = ["server/src", "web/src", "shared/src", "tests"]
EXTS = {".ts", ".tsx"}
OUT = ROOT / ".cursor" / "PROJECT_INDEX.md"


def source_to_doc(rel: str) -> str:
    """Map a source path to its docs-src counterpart."""
    p = Path(rel)
    stem = p.stem
    if stem.endswith(".test"):
        stem = stem[:-5]
    doc = p.parent / f"{stem}.md"
    return str(doc).replace("\\", "/")


def main() -> None:
    lines: list[str] = []
    lines.append("# Navo IM Project Index")
    lines.append("")
    lines.append("Auto-generated module index. Maps every source file to its `docs-src/` documentation.")
    lines.append("Read the doc file BEFORE modifying the corresponding source file.")
    lines.append("")
    lines.append("## Quick Navigation")
    lines.append("")
    lines.append("| Area | Entry Point | Primary Doc |")
    lines.append("|------|-------------|-------------|")
    quick = [
        ("Server bootstrap", "server/src/index.ts", "docs-src/server/src/index.md"),
        ("HTTP API", "server/src/http.ts", "docs-src/server/src/http.md"),
        ("WebSocket hub", "server/src/ws.ts", "docs-src/server/src/ws.md"),
        ("SFU / WebRTC", "server/src/sfu.ts", "docs-src/server/src/sfu.md"),
        ("Database", "server/src/db.ts", "docs-src/server/src/db.md"),
        ("Redis", "server/src/redis.ts", "docs-src/server/src/redis.md"),
        ("Admin API", "server/src/admin-routes.ts", "docs-src/server/src/admin-routes.md"),
        ("Web root", "web/src/App.tsx", "docs-src/web/src/App.md"),
        ("Web entry", "web/src/main.tsx", "docs-src/web/src/main.md"),
        ("Zustand store", "web/src/lib/store.ts", "docs-src/web/src/lib/store.md"),
        ("WS client", "web/src/lib/ws-client.ts", "docs-src/web/src/lib/ws-client.md"),
        ("Shared types", "shared/src/index.ts", "docs-src/shared/src/index.md"),
        ("Shared i18n", "shared/src/i18n.ts", "docs-src/shared/src/i18n.md"),
        ("Platform abstraction", "web/src/platform/index.ts", "docs-src/web/src/platform/index.md"),
    ]
    for area, src, doc in quick:
        lines.append(f"| {area} | `{src}` | `{doc}` |")
    lines.append("")

    missing: list[tuple[str, str]] = []
    for src_dir in SRC_DIRS:
        full_dir = ROOT / src_dir
        if not full_dir.exists():
            continue
        section = src_dir.split("/")[0].upper()
        lines.append(f"## {section} — `{src_dir}/`")
        lines.append("")
        lines.append("| Source | Documentation | Status |")
        lines.append("|--------|---------------|--------|")
        for f in sorted(full_dir.rglob("*")):
            if f.suffix not in EXTS:
                continue
            rel = str(f.relative_to(ROOT))
            doc_rel = "docs-src/" + source_to_doc(rel)
            status = "OK" if (ROOT / doc_rel).exists() else "MISSING"
            if status == "MISSING":
                missing.append((rel, doc_rel))
            lines.append(f"| `{rel}` | `{doc_rel}` | {status} |")
        lines.append("")

    if missing:
        lines.append("## Files Missing Documentation")
        lines.append("")
        lines.append("These source files have no corresponding `docs-src/` entry.")
        lines.append("")
        for src, doc in missing:
            lines.append(f"- `{src}` → expected `{doc}`")
        lines.append("")

    lines.extend([
        "## Architecture Overview",
        "",
        "```",
        "shared/          @navo/shared — types, i18n keys",
        "  └── src/index.ts, i18n.ts",
        "",
        "server/          @navo/server — Express + ws + MySQL + Redis",
        "  └── src/index.ts  → boot",
        "  └── src/http.ts   → REST API",
        "  └── src/ws.ts     → WebSocket events",
        "  └── src/sfu.ts    → WebRTC SFU",
        "  └── src/db.ts     → MySQL schema + queries",
        "  └── src/redis.ts  → pub/sub + presence",
        "",
        "web/             @navo/web — React + Vite + Tailwind + Zustand",
        "  └── src/main.tsx  → entry",
        "  └── src/App.tsx   → auth gate + WS lifecycle",
        "  └── src/lib/store.ts → central state",
        "  └── src/lib/ws-client.ts → WS client",
        "  └── src/components/ → UI",
        "  └── src/platform/ → web vs Capacitor abstraction",
        "",
        "tests/           WebRTC SFU integration tests",
        "android/         Capacitor Android app (Gradle)",
        "```",
        "",
        "## Data Flow",
        "",
        "1. Client connects via `ws-client.ts` with JWT token.",
        "2. Server sends `ready` bootstrap via `ws.ts`.",
        "3. `store.ts` hydrates from bootstrap, manages all `ServerEvent` dispatch.",
        "4. REST calls go through `web/src/lib/api.ts`.",
        "5. WebRTC calls use `web/src/lib/call.ts` + `server/src/sfu.ts`.",
        "",
        "## Build & Commands",
        "",
        "| Command | Purpose |",
        "|---------|---------|",
        "| `npm run dev` | Server (8080) + Web (5173) |",
        "| `npm run build` | shared → server → web (order mandatory) |",
        "| `npm run typecheck` | Type check server + web |",
        "| `npm run cap:sync` | Build web + sync Capacitor Android |",
        "| `npm run apk` | Build debug APK |",
        "",
        "## Doc Lookup Rule",
        "",
        "To find docs for `path/to/file.ts`: replace repo root with `docs-src/`, change extension to `.md`.",
        "For test files `foo.test.ts`, use `foo.md` (drop `.test`).",
    ])

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Written {OUT} ({len(missing)} missing docs)")


if __name__ == "__main__":
    main()

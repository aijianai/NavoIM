# server/scripts/nsfw-bench.ts

## Purpose

CLI benchmark for single-image NSFW inference latency on the server stack (sharp preprocess + nsfwjs + tfjs-node).

## Usage

From repository root:

```bash
npm run nsfw:bench
npm run nsfw:bench -- web/public/navo.svg
```

Default image: `web/public/navo.svg` (Navo app icon).

## Output

- **Cold start**: first `benchNsfw` call (includes model load if not warmed).
- **Warmup**: `warmupNsfw()` duration.
- **Hot path**: 10 runs — avg / median / min / max milliseconds.

## Dependencies

- `dotenv` (root `.env` for optional DB threshold read)
- `server/src/nsfw.ts` — `benchNsfw`, `warmupNsfw`, `reloadNsfwConfig`

# oss-upload.ts — S3-Compatible Object Storage Upload

## Purpose

Uploads files to an S3-compatible object storage service (e.g., Alibaba OSS, MinIO, AWS S3) using user-configured or global credentials.

## Exports

- `getDefaultOssBinding(userId)` — returns the default OSS binding for a specific user from `oss_bindings` table, or `null`.
- `getDefaultGlobalOssBinding()` — returns the global default OSS binding (any user), or `null`.
- `uploadToOss(binding, filePath, fileName, mimeType)` — uploads a local file to the configured S3 endpoint. Returns the public URL of the uploaded object.

## Key Logic

- Reads the entire file into memory with `readFileSync`.
- Constructs an S3 key as `uploads/{fileName}`.
- Creates an `S3Client` with `forcePathStyle: true` (required for non-AWS S3-compatible services).
- Uploads via `PutObjectCommand` with the specified `ContentType`.
- Returns the URL as `{endpoint}/{bucket}/uploads/{fileName}`.

## Dependencies

- `@aws-sdk/client-s3` (npm)
- `node:fs` (`readFileSync`)
- `server/src/db.js` — `queryOne()` (dynamic import)

## Constraints and Gotchas

- Files are read entirely into memory. Large files may cause memory pressure.
- `readFileSync` is blocking. Concurrent large uploads can stall the event loop.
- The returned URL is constructed by concatenating endpoint + bucket + key. No CDN or presigned URL support.
- No error handling around `readFileSync` or the S3 upload; errors propagate to the caller.
- `fileName` is used directly in the S3 key with no sanitization.

## Interactions

Called by the file upload endpoint after local storage. The binding is resolved per-user or globally. The returned URL is stored as the message attachment URL.

# OssTab.tsx — Object Storage (OSS) Binding Management

## Purpose

Manages per-user cloud storage bindings (Alibaba Cloud OSS, MinIO, AWS S3, Tencent COS, Qiniu, Huawei OBS). Allows admin to create, delete, and set default bindings.

## Exports

- `OssTab` — React component (no props).

## Key Logic

- **Binding list**: Fetches all bindings via `api.admin.getAllOssBindings()`. Table shows name, provider, bucket, endpoint, user ID (truncated), default status, creation time, and delete button.
- **Add binding**: Modal form with fields: user ID (required), name (required), provider (dropdown of 6 providers), region (optional), endpoint (required), bucket (required), access key ID (required), access key secret (password, required).
- **Set default**: Calls `api.admin.setDefaultOssBinding(id)`.
- **Delete**: Native `confirm()`, then `api.admin.deleteOssBinding()`.

## Dependencies

- `api` from `../../lib/api` — `getAllOssBindings`, `createOssBinding`, `deleteOssBinding`, `setDefaultOssBinding`.
- `toast` from `./shared`.
- `useT`, `getT` from `../../lib/i18n`.
- `OssBinding` from `@navo/shared`.

## Constraints and Gotchas

- `PROVIDERS` array uses module-level `getT()` for some labels, others are hardcoded strings.
- Access key secret uses `type="password"` but no masking is enforced server-side on return.
- Form validation is client-side only (checks required fields).
- No pagination — all bindings are loaded at once.
- `confirm()` uses native browser dialog.

## Interactions

- Self-contained; no props required.
- After add, the modal closes and the list refreshes.

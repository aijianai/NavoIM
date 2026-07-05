# server/src/sms.ts — SMS Sending (Tencent Cloud & Aliyun)

## Purpose

Sends verification-code SMS through either Tencent Cloud SMS (TC3-HMAC-SHA256 signature) or Aliyun Dysmsapi (HMAC-SHA1 RPC signature). Configuration is read dynamically from `system_settings` table; no third-party npm packages are used.

## Exports

| Export | Type | Description |
|---|---|---|
| `sendSmsCode(phone, code)` | `(phone: string, code: string) => Promise<SmsSendResult>` | Sends a verification-code SMS to the given phone. Returns `{ ok, requestId?, message? }`. |
| `sendSmsTest(phone)` | `(phone: string) => Promise<SmsSendResult>` | Sends a test SMS (still uses the verification-code template, code is hardcoded `000000`). |
| `getSmsConfig()` | `() => Promise<SmsConfig \| null>` | Returns the current SMS configuration, or `null` if the provider is set to `none`. |
| `isConfigComplete(cfg)` | Type guard | Checks that all required fields for the selected provider are present. |
| `isValidPhone(phone)` | `(phone: string) => boolean` | E.164-ish check: `+` followed by 6-20 digits. |
| `normalizePhone(phone)` | `(phone: string) => string` | Adds `+86` country code when missing. |
| `SmsConfig` | Interface | `{ provider, sdkAppId, accessKeyId, accessKeySecret, signName, templateCode, region, endpoint }` |
| `SmsSendResult` | Interface | `{ ok: boolean; requestId?: string; message?: string }` |
| `SmsProvider` | Type | `"tencent" \| "aliyun" \| "none"` |

## Key Logic

### Provider dispatch

- `provider === "tencent"` → `sendTencentSms` with TC3-HMAC-SHA256 signature.
- `provider === "aliyun"` → `sendAliyunSms` with HMAC-SHA1 RPC signature.
- `provider === "none"` or missing config → returns `{ ok: false, message: "SMS not configured" }`.

### Tencent Cloud TC3-HMAC-SHA256

1. Build canonical request: HTTP method + URI + sorted query + canonical headers + signed headers + hashed request payload.
2. Build `stringToSign`: `TC3-HMAC-SHA256\n<timestamp>\n<credentialScope>\n<sha256(canonicalRequest)>`.
3. Derive signing key: `HMAC-SHA256("TC3" + secretKey, date) → HMAC-SHA256(_, service) → HMAC-SHA256(_, "tc3_request")`.
4. Compute final signature: `HMAC-SHA256(derivedKey, stringToSign)`.
5. Send `POST https://<host>` with `Authorization: TC3-HMAC-SHA256 ...`, `X-TC-Action: SendSms`, `X-TC-Version: 2021-01-11`, `X-TC-Region`, body = `{ PhoneNumberSet, SmsSdkAppId, SignName, TemplateId, TemplateParamSet: [code] }`.
6. Check `Response.SendStatusSet[0].Code === "Ok"`. Any non-Ok code returns `{ ok: false }`.

### Aliyun HMAC-SHA1 RPC

1. Build common parameters: `AccessKeyId, Action=SendSms, Format=JSON, PhoneNumbers, RegionId, SignName, SignatureMethod=HMAC-SHA1, SignatureNonce, SignatureVersion=1.0, TemplateCode, TemplateParam={"code":"..."}, Timestamp, Version=2017-05-25`.
2. Sort keys, percent-encode, join with `&`.
3. Build `stringToSign = "POST&%2F&" + percentEncode(canonicalizedQueryString)`.
4. Sign with `HMAC-SHA1(accessKeySecret + "&", stringToSign)` returning base64.
5. Send `POST https://<host>` with `Content-Type: application/x-www-form-urlencoded`.
6. Check `Code === "OK"`.

### Phone normalization

- Strip whitespace, reject if length not 6-20 digits.
- If starts with `+`, keep as-is.
- If matches `^\d{11}$` (CN mobile), prepend `+86`.
- If starts with `86\d{11}`, prepend `+`.

### Configuration storage

| DB key | Mapped to | Notes |
|---|---|---|
| `sms_provider` | `provider` | `tencent` \| `aliyun` \| `none` |
| `sms_sdk_app_id` | `sdkAppId` | Tencent only |
| `sms_access_key_id` | `accessKeyId` | SecretId / AccessKeyId |
| `sms_access_key_secret` | `accessKeySecret` | SecretKey (masked as `***` on GET) |
| `sms_sign_name` | `signName` | Approved signature |
| `sms_template_code` | `templateCode` | Template ID (must contain `{code}`) |
| `sms_region` | `region` | Aliyun regionId, e.g. `cn-hangzhou` |
| `sms_endpoint` | `endpoint` | Optional API endpoint override |

## Dependencies

- `node:crypto` — HMAC-SHA1 / HMAC-SHA256 / SHA-256
- `server/src/db.js` — `query()` for settings
- No npm dependencies added.

## Constraints and Gotchas

- Tencent template uses `TemplateParamSet: [code]` (the SMS template must declare `{1}`).
- Aliyun template uses `TemplateParam: '{"code":"..."}'` (the SMS template must declare `{code}`).
- No retry logic — a single failed send bubbles up to the caller. The `/api/auth/verification-code` endpoint applies its own rate limiting; this module is stateless.
- Tencent signature is timestamp-sensitive — clock skew over 5 minutes will cause auth failure. Server's NTP must be correct.
- Aliyun `SignatureNonce` is `crypto.randomBytes(16).toString("hex")` per request to prevent replay.
- `sendSmsTest` reuses the verification template; it does NOT have its own template. If a different message is needed, set up a separate template.
- Provider defaults: Tencent endpoint `sms.tencentcloudapi.com`, region `ap-guangzhou`; Aliyun endpoint `dysmsapi.aliyuncs.com`, region `cn-hangzhou`.
- Phone is normalized to E.164 with `+` prefix. `+8613800138000` is the canonical form.

## Interactions

- **`/api/auth/verification-code` (http.ts)** — calls `sendSmsCode` after generating a code via `verification.ts`.
- **`POST /api/admin/sms-test` (admin-routes.ts)** — calls `sendSmsTest` for the admin UI test button.
- **`system_settings` table** — all configuration is stored there. `admin-routes.ts` `GET/PUT /api/admin/sms-config` reads/writes the keys. The `accessKeySecret` is masked as `***` on GET and is only updated when the value is not `***` on PUT.

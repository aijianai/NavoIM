# settings/SmsSettings.tsx — SMS Service Settings

## Purpose

Admin form for configuring the SMS service provider and credentials. Supports both Tencent Cloud SMS and Aliyun Dysmsapi. Includes a built-in test-send action.

## Exports

- `SmsConfig` — Interface matching the server-side shape.
- `SmsSettings` — React component with `smsConfig` and `setSmsConfig` props.

## Key Logic

- **Provider selector**: `none` / `tencent` / `aliyun`. Switches the visible fields based on the chosen provider.
- **Tencent-specific**: `sdkAppId` field.
- **Aliyun-specific**: `region` field (e.g. `cn-hangzhou`).
- **Common fields**: `accessKeyId`, `accessKeySecret` (password input), `signName`, `templateCode`, `endpoint` (optional override).
- **Test send**: Text input for a phone number (E.164 with country code), button to call `api.admin.testSms`. Result shown below the input.

## Dependencies

- `Sec`, `Field` from `../shared`.
- `useT` from `../../../lib/i18n`.
- `api` from `../../../lib/api`.

## Constraints and Gotchas

- The endpoint field is optional. When blank, the server uses defaults (`sms.tencentcloudapi.com` for Tencent, `dysmsapi.aliyuncs.com` for Aliyun).
- The `accessKeySecret` is masked as `***` when fetched from the server. Sending `***` on PUT does not overwrite the stored value.
- Test send uses the verification-code template with code `000000`; admins should verify the message format before enabling phone registration.

## Interactions

- Receives `SmsConfig` object and a setter from `SettingsTab`.
- Saved via `api.admin.updateSmsConfig` (separate endpoint from the general settings, called sequentially in `SettingsTab.handleSave`).
- `GET /api/admin/sms-config` masks `accessKeySecret` as `***`.

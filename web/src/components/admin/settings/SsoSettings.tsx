import { useState } from "react";
import { api } from "../../../lib/api";
import { Sec, Field, Switch } from "../shared";
import { useT } from "../../../lib/i18n";
import { resolveAttachmentUrl } from "../../../lib/utils";
import { Upload, X, Loader2, Eye, EyeOff } from "lucide-react";

export interface SsoConfig {
  ssoEnabled: boolean;
  ssoCompanyName: string;
  ssoCompanyFormalName: string;
  ssoIconUrl: string;
  ssoAuthorizationEndpoint: string;
  ssoTokenEndpoint: string;
  ssoUserInfoEndpoint: string;
  ssoClientId: string;
  ssoClientSecret: string;
  ssoScopes: string;
}

const FORMAL_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,30}$/;
const URL_RE = /^https?:\/\/.+/;

export function SsoSettings({
  ssoConfig,
  setSsoConfig,
}: {
  ssoConfig: SsoConfig;
  setSsoConfig: (c: SsoConfig) => void;
}) {
  const t = useT();
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  const formalNameValid = !ssoConfig.ssoCompanyFormalName || FORMAL_NAME_RE.test(ssoConfig.ssoCompanyFormalName);
  const hasSecret = !!ssoConfig.ssoClientSecret && ssoConfig.ssoClientSecret !== "***";
  const authUrlValid = !ssoConfig.ssoAuthorizationEndpoint || URL_RE.test(ssoConfig.ssoAuthorizationEndpoint);
  const tokenUrlValid = !ssoConfig.ssoTokenEndpoint || URL_RE.test(ssoConfig.ssoTokenEndpoint);
  const userInfoUrlValid = !ssoConfig.ssoUserInfoEndpoint || URL_RE.test(ssoConfig.ssoUserInfoEndpoint);
  const oauthValid = authUrlValid && tokenUrlValid && userInfoUrlValid && ssoConfig.ssoAuthorizationEndpoint && ssoConfig.ssoTokenEndpoint && ssoConfig.ssoClientId;

  async function handleIconUpload(file: File) {
    setUploadError(null);
    if (!file.type.startsWith("image/")) {
      setUploadError(t("adminSettings.ssoIconImageOnly"));
      return;
    }
    setUploadingIcon(true);
    try {
      const attachment = await api.upload(file);
      setSsoConfig({ ...ssoConfig, ssoIconUrl: attachment.url });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : t("error.uploadFailed"));
    } finally {
      setUploadingIcon(false);
    }
  }

  return (
    <Sec title={t("adminSettings.sso")}>
      <Field label={t("adminSettings.ssoEnable")}>
        <Switch
          checked={ssoConfig.ssoEnabled}
          onChange={(v) => setSsoConfig({ ...ssoConfig, ssoEnabled: v })}
          label={t("adminSettings.ssoEnableDesc")}
        />
      </Field>

      <Field label={t("adminSettings.ssoCompanyName")}>
        <input
          type="text"
          value={ssoConfig.ssoCompanyName}
          onChange={(e) => setSsoConfig({ ...ssoConfig, ssoCompanyName: e.target.value })}
          placeholder={t("adminSettings.ssoCompanyNamePlaceholder")}
          maxLength={64}
          className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
        />
        <div className="mt-1 text-xs text-ink-muted">{t("adminSettings.ssoCompanyNameDesc")}</div>
      </Field>

      <Field label={t("adminSettings.ssoCompanyFormalName")}>
        <input
          type="text"
          value={ssoConfig.ssoCompanyFormalName}
          onChange={(e) => setSsoConfig({ ...ssoConfig, ssoCompanyFormalName: e.target.value })}
          placeholder={t("adminSettings.ssoCompanyFormalNamePlaceholder")}
          maxLength={31}
          className={`w-full rounded-xl border bg-surface px-3 py-2 text-sm font-mono outline-none focus:border-aqua ${
            formalNameValid ? "border-line-light/70" : "border-danger"
          }`}
        />
        <div className={`mt-1 text-xs ${formalNameValid ? "text-ink-muted" : "text-danger"}`}>
          {t("adminSettings.ssoCompanyFormalNameDesc")}
        </div>
      </Field>

      <Field label={t("adminSettings.ssoIcon")}>
        <div className="flex items-center gap-3">
          {ssoConfig.ssoIconUrl ? (
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-line-light/70 bg-surface-soft">
              <img
                src={resolveAttachmentUrl(ssoConfig.ssoIconUrl)}
                alt="SSO icon"
                className="h-full w-full object-contain"
              />
              <button
                onClick={() => setSsoConfig({ ...ssoConfig, ssoIconUrl: "" })}
                className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-danger text-white shadow"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-dashed border-line-light bg-surface-soft text-ink-muted">
              <Upload className="h-4 w-4" />
            </div>
          )}
          <label className="flex-1 cursor-pointer rounded-xl border border-dashed border-line-light bg-surface-soft px-3 py-2 text-center text-xs text-ink-secondary hover:border-aqua hover:text-aqua">
            {uploadingIcon ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("common.loading")}
              </span>
            ) : (
              t("adminSettings.ssoIconUpload")
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleIconUpload(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {uploadError && <div className="mt-1 text-xs text-danger">{uploadError}</div>}
        <div className="mt-1 text-xs text-ink-muted">{t("adminSettings.ssoIconDesc")}</div>
      </Field>

      <div className="mt-2 border-t border-line-light/70 pt-4">
        <h4 className="mb-2 text-sm font-medium text-ink-primary">{t("adminSettings.ssoOauth")}</h4>
        <p className="mb-3 text-xs text-ink-muted">{t("adminSettings.ssoOauthHint")}</p>

        <Field label={t("adminSettings.ssoAuthorizationEndpoint")}>
          <input
            type="url"
            value={ssoConfig.ssoAuthorizationEndpoint}
            onChange={(e) => setSsoConfig({ ...ssoConfig, ssoAuthorizationEndpoint: e.target.value })}
            placeholder="https://idp.example.com/oauth2/authorize"
            className={`w-full rounded-xl border bg-surface px-3 py-2 text-sm outline-none focus:border-aqua ${
              authUrlValid ? "border-line-light/70" : "border-danger"
            }`}
          />
        </Field>

        <Field label={t("adminSettings.ssoTokenEndpoint")}>
          <input
            type="url"
            value={ssoConfig.ssoTokenEndpoint}
            onChange={(e) => setSsoConfig({ ...ssoConfig, ssoTokenEndpoint: e.target.value })}
            placeholder="https://idp.example.com/oauth2/token"
            className={`w-full rounded-xl border bg-surface px-3 py-2 text-sm outline-none focus:border-aqua ${
              tokenUrlValid ? "border-line-light/70" : "border-danger"
            }`}
          />
        </Field>

        <Field label={t("adminSettings.ssoUserInfoEndpoint")}>
          <input
            type="url"
            value={ssoConfig.ssoUserInfoEndpoint}
            onChange={(e) => setSsoConfig({ ...ssoConfig, ssoUserInfoEndpoint: e.target.value })}
            placeholder="https://idp.example.com/oauth2/userinfo"
            className={`w-full rounded-xl border bg-surface px-3 py-2 text-sm outline-none focus:border-aqua ${
              userInfoUrlValid ? "border-line-light/70" : "border-danger"
            }`}
          />
        </Field>

        <Field label={t("adminSettings.ssoClientId")}>
          <input
            type="text"
            value={ssoConfig.ssoClientId}
            onChange={(e) => setSsoConfig({ ...ssoConfig, ssoClientId: e.target.value })}
            placeholder="navo-im"
            className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm font-mono outline-none focus:border-aqua"
          />
        </Field>

        <Field label={t("adminSettings.ssoClientSecret")}>
          <div className="flex gap-2">
            <input
              type={showSecret ? "text" : "password"}
              value={ssoConfig.ssoClientSecret}
              onChange={(e) => setSsoConfig({ ...ssoConfig, ssoClientSecret: e.target.value })}
              placeholder={hasSecret ? "（已设置，填写以更新）" : "客户端密钥（公开客户端可留空）"}
              className="flex-1 rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm font-mono outline-none focus:border-aqua"
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="rounded-xl border border-line-light/70 bg-surface-soft px-3 text-ink-secondary hover:text-ink-primary"
            >
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>

        <Field label={t("adminSettings.ssoScopes")}>
          <input
            type="text"
            value={ssoConfig.ssoScopes}
            onChange={(e) => setSsoConfig({ ...ssoConfig, ssoScopes: e.target.value })}
            placeholder="openid profile email"
            className="w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm font-mono outline-none focus:border-aqua"
          />
        </Field>

        <div className="rounded-xl border border-line-light/70 bg-surface-soft p-3 text-xs text-ink-muted">
          <div className="font-medium text-ink-primary mb-1">{t("adminSettings.ssoRedirectUri")}</div>
          <code className="block break-all text-[11px]">{`{PUBLIC_BASE_URL}/api/auth/sso/callback`}</code>
          <div className="mt-2">{t("adminSettings.ssoRedirectUriDesc")}</div>
        </div>
        {!oauthValid && ssoConfig.ssoEnabled && (
          <div className="mt-2 rounded-xl border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
            {t("adminSettings.ssoConfigIncomplete")}
          </div>
        )}
      </div>
    </Sec>
  );
}

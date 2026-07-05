import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "../../../lib/api";
import { toast } from "../shared";
import type { SystemSettings, CaptchaConfig } from "@navo/shared";
import { useT } from "../../../lib/i18n";
import { BasicSettings } from "./BasicSettings";
import { RegistrationSettings } from "./RegistrationSettings";
import { MessageSettings } from "./MessageSettings";
import { NsfwSettings, type NsfwConfig } from "./NsfwSettings";
import { CaptchaSettings } from "./CaptchaSettings";
import { AiSettings } from "./AiSettings";
import { TranslationSettings } from "./TranslationSettings";
import { CdnSettings } from "./CdnSettings";
import { IceSettings } from "./IceSettings";
import { MaintenanceSettings } from "./MaintenanceSettings";
import { GetuiSettings } from "./GetuiSettings";
import { SmsSettings, type SmsConfig } from "./SmsSettings";
import { EmailSettings, type EmailConfig } from "./EmailSettings";
import { SsoSettings, type SsoConfig } from "./SsoSettings";

type SettingsSubTab = "basic" | "registration" | "message" | "nsfw" | "captcha" | "ai" | "translation" | "cdn" | "ice" | "maintenance" | "getui" | "sms" | "email" | "sso";

export function SettingsTab({ subTab = "basic" }: { subTab?: SettingsSubTab }) {
  const t = useT();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [captchaConfig, setCaptchaConfig] = useState<CaptchaConfig>({
    enabled: false,
    provider: "cap-pow",
    backendUrl: "",
    frontendUrl: "",
  });
  const [aiConfig, setAiConfig] = useState({
    enabled: false,
    baseUrl: "",
    apiKey: "",
    model: "",
    systemPrompt: "",
    name: "Navo 助手",
    bio: "",
    avatarUrl: "",
  });
  const [translationConfig, setTranslationConfig] = useState({
    provider: "bing",
    deeplApiKey: "",
    googleApiKey: "",
    bingApiKey: "",
  });
  const [cdnConfig, setCdnConfig] = useState({
    fontsGoogleCssUrl: "",
    vconsoleEnabled: false,
  });
  const [iceConfig, setIceConfig] = useState({
    stunServers: [] as { url: string; username?: string; credential?: string }[],
    turnServers: [] as { url: string; username?: string; credential?: string }[],
  });
  const [getuiConfig, setGetuiConfig] = useState({
    appId: "",
    appKey: "",
    appSecret: "",
    masterSecret: "",
  });
  const [smsConfig, setSmsConfig] = useState<SmsConfig>({
    provider: "none",
    sdkAppId: "",
    accessKeyId: "",
    accessKeySecret: "",
    signName: "",
    templateCode: "",
    region: "",
    endpoint: "",
  });
  const [emailConfig, setEmailConfig] = useState<EmailConfig>({
    host: "",
    port: 465,
    secure: true,
    user: "",
    password: "",
    fromName: "",
    fromEmail: "",
  });
  const [ssoConfig, setSsoConfig] = useState<SsoConfig>({
    ssoEnabled: false,
    ssoCompanyName: "",
    ssoCompanyFormalName: "",
    ssoIconUrl: "",
    ssoAuthorizationEndpoint: "",
    ssoTokenEndpoint: "",
    ssoUserInfoEndpoint: "",
    ssoClientId: "",
    ssoClientSecret: "",
    ssoScopes: "openid profile email",
  });
  const [nsfwConfig, setNsfwConfig] = useState<NsfwConfig>({
    nsfwEnabled: false,
    nsfwThreshold: 0.6,
  });

  useEffect(() => {
    Promise.all([
      api.admin.getSettings(),
      api.admin.getCaptchaConfig().catch((): CaptchaConfig => ({
        enabled: false,
        provider: "cap-pow",
        backendUrl: "",
        frontendUrl: "",
      })),
      api.admin.getAiConfig().catch(() => ({
        enabled: false,
        baseUrl: "",
        apiKey: "",
        model: "",
        systemPrompt: "",
        name: "Navo 助手",
        bio: "",
        avatarUrl: "",
      })),
      api.admin.getIceConfig().catch(() => ({
        stunServers: [],
        turnServers: [],
      })),
      api.admin.getTranslationConfig().catch(() => ({
        provider: "bing",
        deeplApiKey: "",
        googleApiKey: "",
        bingApiKey: "",
      })),
      api.admin.getGetuiConfig().catch(() => ({ appId: "", appKey: "", appSecret: "", masterSecret: "" })),
      api.admin.getSmsConfig().catch(() => ({
        provider: "none" as const,
        sdkAppId: "",
        accessKeyId: "",
        accessKeySecret: "",
        signName: "",
        templateCode: "",
        region: "",
        endpoint: "",
      })),
      api.admin.getEmailConfig().catch(() => ({
        host: "",
        port: 465,
        secure: true,
        user: "",
        password: "",
        fromName: "",
        fromEmail: "",
      })),
      api.admin.getSsoConfig().catch(() => ({
        ssoEnabled: false,
        ssoCompanyName: "",
        ssoCompanyFormalName: "",
        ssoIconUrl: "",
        ssoAuthorizationEndpoint: "",
        ssoTokenEndpoint: "",
        ssoUserInfoEndpoint: "",
        ssoClientId: "",
        ssoClientSecret: "",
        ssoScopes: "openid profile email",
      })),
      api.admin.getNsfwConfig().catch(() => ({ nsfwEnabled: false, nsfwThreshold: 0.6 })),
    ])
      .then(([settingsData, captchaData, aiData, iceData, transData, getuiData, smsData, emailData, ssoData, nsfwData]) => {
        setSettings(settingsData);
        setCaptchaConfig(captchaData);
        setAiConfig(aiData);
        setTranslationConfig(transData);
        setGetuiConfig(getuiData);
        setSmsConfig(smsData);
        setEmailConfig(emailData);
        setSsoConfig({
          ssoEnabled: ssoData.ssoEnabled,
          ssoCompanyName: ssoData.ssoCompanyName,
          ssoCompanyFormalName: ssoData.ssoCompanyFormalName,
          ssoIconUrl: ssoData.ssoIconUrl,
          ssoAuthorizationEndpoint: ssoData.ssoAuthorizationEndpoint,
          ssoTokenEndpoint: ssoData.ssoTokenEndpoint,
          ssoUserInfoEndpoint: ssoData.ssoUserInfoEndpoint,
          ssoClientId: ssoData.ssoClientId,
          ssoClientSecret: ssoData.ssoClientSecret,
          ssoScopes: ssoData.ssoScopes,
        });
        setCdnConfig({
          fontsGoogleCssUrl: (settingsData as any).cdnFontsGoogleCssUrl || "",
          vconsoleEnabled: (settingsData as any).cdnVconsoleEnabled ?? false,
        });
        setIceConfig(iceData);
        setNsfwConfig({
          nsfwEnabled: nsfwData.nsfwEnabled,
          nsfwThreshold: nsfwData.nsfwThreshold,
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      // 通用系统设置：仅写入 siteName/registration/captcha/ai/ice/translation/rate limit/maintenance/CDN 等核心字段
      const settingsWithCdn = {
        ...settings,
        cdnFontsGoogleCssUrl: cdnConfig.fontsGoogleCssUrl,
        cdnVconsoleEnabled: cdnConfig.vconsoleEnabled,
      };
      const updated = await api.admin.updateSettings(settingsWithCdn);
      setSettings(updated);
      // 各种独立配置走各自端点
      await api.admin.updateCaptchaConfig(captchaConfig);
      await api.admin.updateAiConfig(aiConfig);
      await api.admin.updateTranslationConfig(translationConfig);
      await api.admin.updateIceConfig(iceConfig);
      await api.admin.updateGetuiConfig(getuiConfig);
      await api.admin.updateSmsConfig(smsConfig);
      await api.admin.updateEmailConfig(emailConfig);
      await api.admin.updateSsoConfig(ssoConfig);
      await api.admin.updateNsfwConfig(nsfwConfig);
      toast(t("common.saved"));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("common.unknown"), "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-ocean" />
      </div>
    );
  }

  if (!settings) {
    return <div className="py-12 text-center text-ink-muted">{t("adminSettings.loadFailed")}</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold md:text-xl">
          {t("admin.systemSettings")}
        </h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-ocean px-4 py-2 text-sm font-medium text-white hover:bg-ocean/90 disabled:opacity-50"
        >
          {saving ? t("common.saving") : t("common.confirm")}
        </button>
      </div>

      {subTab === "basic" && (
        <BasicSettings settings={settings} setSettings={setSettings} />
      )}
      {subTab === "registration" && (
        <RegistrationSettings settings={settings} setSettings={setSettings} />
      )}
      {subTab === "message" && (
        <MessageSettings settings={settings} setSettings={setSettings} />
      )}
      {subTab === "nsfw" && (
        <NsfwSettings nsfwConfig={nsfwConfig} setNsfwConfig={setNsfwConfig} />
      )}
      {subTab === "captcha" && (
        <CaptchaSettings captchaConfig={captchaConfig} setCaptchaConfig={setCaptchaConfig} />
      )}
      {subTab === "ai" && (
        <AiSettings aiConfig={aiConfig} setAiConfig={setAiConfig} />
      )}
      {subTab === "translation" && (
        <TranslationSettings translationConfig={translationConfig} setTranslationConfig={setTranslationConfig} />
      )}
      {subTab === "cdn" && (
        <CdnSettings cdnConfig={cdnConfig} setCdnConfig={setCdnConfig} />
      )}
      {subTab === "ice" && (
        <IceSettings iceConfig={iceConfig} setIceConfig={setIceConfig} />
      )}
      {subTab === "maintenance" && (
        <MaintenanceSettings settings={settings} setSettings={setSettings} />
      )}
      {subTab === "getui" && (
        <GetuiSettings getuiConfig={getuiConfig} setGetuiConfig={setGetuiConfig} />
      )}
      {subTab === "sms" && (
        <SmsSettings smsConfig={smsConfig} setSmsConfig={setSmsConfig} />
      )}
      {subTab === "email" && (
        <EmailSettings emailConfig={emailConfig} setEmailConfig={setEmailConfig} />
      )}
      {subTab === "sso" && (
        <SsoSettings ssoConfig={ssoConfig} setSsoConfig={setSsoConfig} />
      )}

      <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-line-light/70 bg-surface/80 px-4 py-3 backdrop-blur">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-ocean px-6 py-2.5 text-sm font-medium text-white hover:bg-ocean/90 disabled:opacity-50"
        >
          {saving ? t("common.saving") : t("common.confirm")}
        </button>
      </div>
    </div>
  );
}

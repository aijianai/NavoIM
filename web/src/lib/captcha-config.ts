import { apiFetch } from "./utils";

/**
 * Captcha 配置管理
 * frontendUrl 是基础 URL（如 https://captcha.example.com）
 * 脚本路径：${frontendUrl}/cap.min.js
 * Widget API：${frontendUrl}/api/
 */

interface CaptchaConfig {
  enabled: boolean;
  provider: string;
  frontendUrl: string; // 基础 URL，如 https://captcha.example.com
}

let config: CaptchaConfig = {
  enabled: false,
  provider: "cap-pow",
  frontendUrl: "",
};

let loaded = false;

/** 获取 captcha 脚本完整 URL */
export function getCaptchaScriptUrl(): string {
  return `${config.frontendUrl}/cap.min.js`;
}

/** 获取 captcha widget API endpoint */
export function getCaptchaApiEndpoint(): string {
  return `${config.frontendUrl}/api/`;
}

export async function loadCaptchaConfig(): Promise<CaptchaConfig> {
  if (loaded) return config;
  try {
    const res = await apiFetch("/api/system/captcha-config");
    if (res.ok) {
      const data = await res.json();
      config = {
        enabled: data.enabled ?? false,
        provider: data.provider ?? "cap-pow",
        frontendUrl: data.frontendUrl || "",
      };
    }
  } catch {
    // 使用t("admin.oss.isDefault")值
  }
  loaded = true;
  return config;
}

export function getCaptchaConfig(): CaptchaConfig {
  return config;
}

/** 动态加载 captcha 脚本（cap.min.js） */
export function loadCaptchaScript(frontendUrl: string): void {
  const scriptUrl = `${frontendUrl}/cap.min.js`;
  if (document.querySelector(`script[src="${scriptUrl}"]`)) return;
  const script = document.createElement("script");
  script.src = scriptUrl;
  document.head.appendChild(script);
}

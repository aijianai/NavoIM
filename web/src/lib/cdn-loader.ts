/**
 * CDN 资源动态加载器
 * 根据后台配置动态加载 Google Fonts、VConsole 等资源
 */

import { apiFetch } from "./utils";

let loaded = false;

export async function loadCdnResources(): Promise<void> {
  if (loaded) return;
  loaded = true;

  try {
    const res = await apiFetch("/api/system/cdn-config");
    if (!res.ok) return;
    const config = (await res.json()) as {
      fontsGoogleCssUrl: string;
      vconsoleEnabled: boolean;
    };

    // Google Fonts
    if (config.fontsGoogleCssUrl) {
      const preconnect1 = document.createElement("link");
      preconnect1.rel = "preconnect";
      preconnect1.href = "https://fonts.googleapis.com";
      document.head.appendChild(preconnect1);

      const preconnect2 = document.createElement("link");
      preconnect2.rel = "preconnect";
      preconnect2.href = "https://fonts.gstatic.com";
      preconnect2.crossOrigin = "anonymous";
      document.head.appendChild(preconnect2);

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = config.fontsGoogleCssUrl;
      document.head.appendChild(link);
    }

    // VConsole
    if (config.vconsoleEnabled) {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/vconsole@latest/dist/vconsole.min.js";
      script.onload = () => {
        if (typeof window !== "undefined" && (window as any).VConsole) {
          new (window as any).VConsole();
        }
      };
      document.head.appendChild(script);
    }
  } catch {
    // 加载失败时静默处理
  }
}

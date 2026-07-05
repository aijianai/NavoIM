const TARGET_LANGS = ["zh-CN", "en", "ja", "ko", "fr", "de", "es"] as const;
export type TranslateTargetLang = typeof TARGET_LANGS[number];
export type TranslationProvider = "deepl" | "bing" | "google" | "bingReverse";

export async function translate(
  text: string,
  targetLang: TranslateTargetLang,
  provider: TranslationProvider,
  apiKey: string
): Promise<string> {
  switch (provider) {
    case "deepl": return deeplTranslate(text, targetLang, apiKey);
    case "bing": return bingTranslate(text, targetLang);
    case "google": return googleTranslate(text, targetLang, apiKey);
    case "bingReverse": return bingReverseTranslate(text, targetLang);
    default: throw new Error(`Unknown translation provider: ${provider}`);
  }
}

function htmlUnescape(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#x2F;/g, "/");
}

// DeepL - official API
async function deeplTranslate(text: string, targetLang: string, apiKey: string): Promise<string> {
  const url = "https://api-free.deepl.com/v2/translate";
  const params = new URLSearchParams({ auth_key: apiKey, text, target_lang: targetLang === "en" ? "EN-US" : targetLang });
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params });
  if (!res.ok) throw new Error(`DeepL error: ${res.status}`);
  const data = await res.json();
  return data.translations?.[0]?.text ?? "";
}

// Bing - free unofficial API via bing translator
async function bingTranslate(text: string, targetLang: string): Promise<string> {
  const fromLang = "auto-detect";
  const toLang = targetLang === "zh-CN" ? "zh-Hans" : targetLang;
  const url = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=${fromLang}&to=${toLang}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Ocp-Apim-Subscription-Key": "" },
    body: JSON.stringify([{ text }]),
  });
  if (!res.ok) throw new Error(`Bing error: ${res.status}`);
  const data = await res.json();
  return data[0]?.translations?.[0]?.text ?? "";
}

// Google - official REST API
async function googleTranslate(text: string, targetLang: string, apiKey: string): Promise<string> {
  const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: text, target: targetLang, format: "text" }),
  });
  if (!res.ok) throw new Error(`Google error: ${res.status}`);
  const data = await res.json();
  return data.data?.translations?.[0]?.translatedText ?? "";
}

// Bing Reverse - scrapes cn.bing.com/translator (no API key needed)
interface BingReverseCache {
  ig: string;
  iid: string;
  token: string;
  key: string;
  expires: number;
  cookies: string[];
}
let bingReverseCache: BingReverseCache | null = null;

const BING_BROWSER_HEADERS: Record<string, string> = {
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
  "cache-control": "no-cache",
  "pragma": "no-cache",
  "sec-ch-ua": '"Microsoft Edge";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
};

const BING_API_HEADERS: Record<string, string> = {
  "accept": "*/*",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
  "content-type": "application/x-www-form-urlencoded",
  "origin": "https://cn.bing.com",
  "referer": "https://cn.bing.com/translator",
  "sec-ch-ua": '"Microsoft Edge";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
};

async function fetchWithCookies(url: string, options: RequestInit = {}, isApi = false): Promise<{ res: Response; cookies: string[] }> {
  const defaultHeaders = isApi ? BING_API_HEADERS : BING_BROWSER_HEADERS;
  const headers: Record<string, string> = { ...defaultHeaders };

  if (bingReverseCache?.cookies.length) {
    headers["cookie"] = bingReverseCache.cookies.join("; ");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal, headers: { ...headers, ...(options.headers as Record<string, string> || {}) } });
    clearTimeout(timeout);

    const setCookie = res.headers.get("set-cookie");
    const cookies: string[] = bingReverseCache?.cookies ? [...bingReverseCache.cookies] : [];
    if (setCookie) {
      const parsed = setCookie.split(",").map((c) => c.split(";")[0].trim()).filter(Boolean);
      for (const p of parsed) {
        const key = p.split("=")[0];
        const idx = cookies.findIndex((c) => c.startsWith(key + "="));
        if (idx >= 0) cookies[idx] = p;
        else cookies.push(p);
      }
    }

    return { res, cookies };
  } finally {
    clearTimeout(timeout);
  }
}

async function bingReverseTranslate(text: string, targetLang: string): Promise<string> {
  const toLang = targetLang === "zh-CN" ? "zh-Hans" : targetLang;

  if (!bingReverseCache || Date.now() > bingReverseCache.expires) {
    await refreshBingReverseParams();
  }
  if (!bingReverseCache) throw new Error("Failed to init Bing Reverse");

  const url = `https://cn.bing.com/ttranslatev3?IG=${bingReverseCache.ig}&IID=${bingReverseCache.iid}&SFX=3&ajaxreq=1`;
  const body = new URLSearchParams({
    fromLang: "auto-detect",
    to: toLang,
    text,
    token: bingReverseCache.token,
    key: bingReverseCache.key,
    tryFetchingGenderDebiasedTranslations: "true",
    fetchAuxiliaryInfo: "true",
    isMainlineACF: "false",
  });

  const { res, cookies } = await fetchWithCookies(url, { method: "POST", body }, true);
  bingReverseCache.cookies = cookies;

  if (res.status === 205 || res.status === 400) {
    bingReverseCache = null;
    await refreshBingReverseParams();
    return bingReverseTranslate(text, targetLang);
  }
  if (!res.ok) throw new Error(`Bing Reverse error: ${res.status}`);

  const text_res = await res.text();

  // Try data-translation attribute (HTML response)
  const match = text_res.match(/data-translation="(.*?)"/);
  if (match) {
    const rawMatch = htmlUnescape(match[1]);
    try {
      const decoded = JSON.parse(rawMatch);
      return htmlUnescape(decoded[0]?.translations?.[0]?.text ?? "");
    } catch {
      // fall through to direct JSON parse
    }
  }

  // Try JSON response
  try {
    const data = JSON.parse(text_res);
    return htmlUnescape(data[0]?.translations?.[0]?.text ?? "");
  } catch {
    throw new Error("Bing Reverse: failed to parse response");
  }
}

async function refreshBingReverseParams() {
  const { res, cookies } = await fetchWithCookies("https://cn.bing.com/translator");
  const html = await res.text();

  const igMatch = html.match(/"ig"\s*:\s*"([^"]+)"/);
  if (!igMatch) throw new Error("Cannot find IG param");

  const ig = igMatch[1];

  // Find IID: look for data-iid attribute containing 'translator'
  let iid = "";
  const iidAttr = html.match(/data-iid="([^"]*translator[^"]*)"/);
  if (iidAttr) {
    iid = iidAttr[1];
  } else {
    // Try script content
    const iidScript = html.match(/data-iid\s*=\s*["']([^"']*(?:translator\.\d+|translator)[^"']*)["']/);
    if (iidScript) {
      iid = iidScript[1];
    } else {
      throw new Error("Cannot find IID param");
    }
  }

  const paramsMatch = html.match(/params_AbusePreventionHelper\s*=\s*\[\s*([0-9]+)\s*,\s*"([^"]+)"\s*,\s*([0-9]+)\s*\]/);
  if (!paramsMatch) throw new Error("Cannot find AbusePreventionHelper params");

  bingReverseCache = {
    ig,
    iid,
    key: paramsMatch[1],
    token: paramsMatch[2],
    expires: Date.now() + Math.min(parseInt(paramsMatch[3]), 3600000),
    cookies,
  };
}

export { TARGET_LANGS };

import type { Language, TranslationKey } from "@navo/shared";
import { t as sharedT, LANGUAGES, detectBrowserLanguage } from "@navo/shared";
import { useChatStore } from "./store";

export function useT() {
  const lang = useChatStore((s) => s.language);
  return (key: TranslationKey, params?: Record<string, string | number>) => {
    return sharedT(lang, key, params);
  };
}

export function useLanguage(): Language {
  return useChatStore((s) => s.language);
}

export function setLanguage(lang: Language) {
  useChatStore.getState().setLanguage(lang);
}

export function getT() {
  return (key: TranslationKey, params?: Record<string, string | number>) => {
    const lang = useChatStore.getState().language || "zh-CN";
    return sharedT(lang, key, params);
  };
}

export { LANGUAGES, detectBrowserLanguage };
export type { Language, TranslationKey };

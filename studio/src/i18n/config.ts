export const LOCALES = ["en", "es", "fr", "de", "pt", "it", "ja", "ko", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "zh";
export const LOCALE_STORAGE_KEY = "ai_costume_studio_locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  it: "Italiano",
  ja: "日本語",
  ko: "한국어",
  zh: "中文",
};

export const HTML_LANGS: Record<Locale, string> = {
  en: "en",
  es: "es",
  fr: "fr",
  de: "de",
  pt: "pt-BR",
  it: "it",
  ja: "ja",
  ko: "ko",
  zh: "zh-CN",
};

export const INTL_LOCALES: Record<Locale, string> = {
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  pt: "pt-BR",
  it: "it-IT",
  ja: "ja-JP",
  ko: "ko-KR",
  zh: "zh-CN",
};

export function isLocale(value: string | null): value is Locale {
  return LOCALES.includes(value as Locale);
}

export function resolveStoredLocale(value: string | null): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

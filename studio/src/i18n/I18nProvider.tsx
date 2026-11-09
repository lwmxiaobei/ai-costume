import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_LOCALE,
  HTML_LANGS,
  INTL_LOCALES,
  LOCALE_STORAGE_KEY,
  resolveStoredLocale,
  type Locale,
} from "./config";
import { MESSAGES, type Messages } from "./messages";

interface I18nContextValue {
  locale: Locale;
  messages: Messages;
  setLocale: (locale: Locale) => void;
  formatNumber: (value: number) => string;
  formatCurrency: (cents: number, currency?: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function storedLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    return resolveStoredLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(storedLocale);

  useEffect(() => {
    document.documentElement.lang = HTML_LANGS[locale];
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // Storage can be unavailable in privacy modes.
    }
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    messages: MESSAGES[locale],
    setLocale,
    formatNumber: (number) => new Intl.NumberFormat(INTL_LOCALES[locale]).format(number),
    formatCurrency: (cents, currency = "USD") => new Intl.NumberFormat(INTL_LOCALES[locale], {
      style: "currency",
      currency,
    }).format(cents / 100),
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider.");
  return context;
}

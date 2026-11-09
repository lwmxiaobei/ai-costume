import { ChevronDown, Languages } from "lucide-react";
import { LOCALE_LABELS, LOCALES, type Locale } from "../i18n/config";
import { useI18n } from "../i18n/I18nProvider";

export function LanguageSwitcher() {
  const { locale, messages, setLocale } = useI18n();
  return (
    <label className="language-switcher">
      <span className="sr-only">{messages.language}</span>
      <Languages size={16} aria-hidden="true" />
      <span className="language-current" aria-hidden="true">{LOCALE_LABELS[locale]}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        aria-label={messages.language}
      >
        {LOCALES.map((item) => <option key={item} value={item}>{LOCALE_LABELS[item]}</option>)}
      </select>
      <ChevronDown size={13} aria-hidden="true" />
    </label>
  );
}

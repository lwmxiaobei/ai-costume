import { readFileSync } from 'node:fs';

const { colors, translations } = JSON.parse(readFileSync(new URL('./keyword-translations.json', import.meta.url), 'utf8'));
const colorPrefix = new RegExp(`^(内搭)?(${[...colors].sort((a, b) => b.length - a.length).join('|')})(.*)$`);

function localizeToken(token, locale) {
  if (translations[token]) return translations[token][locale];
  const match = token.match(colorPrefix);
  if (!match) return token;
  const [, inner, color, rest] = match;
  const phrase = translations[inner ? `内搭{color}${rest}` : rest];
  if (!phrase) return token;
  const translatedColor = translations[color][locale];
  if (inner) return phrase[locale].replace('{color}', translatedColor);
  const separator = locale === 'en' ? ' ' : locale === 'ja' ? 'の' : '';
  return translatedColor + separator + phrase[locale];
}

export function localizeKeywords(keywords) {
  const tokens = keywords.trim().split(/\s+/);
  return Object.fromEntries(['zh-TW', 'en', 'ja'].map(locale => [locale, tokens.map(token => localizeToken(token, locale))]));
}

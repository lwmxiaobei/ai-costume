import { useEffect } from "react";
import { HTML_LANGS, type Locale } from "./config";

function setMeta(selector: string, content: string): void {
  document.querySelector<HTMLMetaElement>(selector)?.setAttribute("content", content);
}

export function useDocumentMetadata(title: string, description: string, locale?: Locale): void {
  useEffect(() => {
    document.title = title;
    setMeta('meta[name="description"]', description);
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[name="twitter:title"]', title);
    setMeta('meta[name="twitter:description"]', description);

    const canonical = window.location.origin + window.location.pathname.replace(/\/+$/, "");
    const href = canonical === window.location.origin ? canonical + "/" : canonical;
    document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute("href", href);
    setMeta('meta[property="og:url"]', href);
    setMeta('meta[property="og:image"]', window.location.origin + "/og.png");
    setMeta('meta[name="twitter:image"]', window.location.origin + "/og.png");

    if (locale) document.documentElement.lang = HTML_LANGS[locale];
  }, [description, locale, title]);
}

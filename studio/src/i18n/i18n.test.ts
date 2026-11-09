import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  HTML_LANGS,
  INTL_LOCALES,
  isLocale,
  LOCALE_LABELS,
  LOCALES,
  resolveStoredLocale,
} from "./config";
import { MESSAGES } from "./messages";
import { apiErrorMessage, interpolate } from "./utils";

function objectShape(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return typeof value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, objectShape(child)]),
  );
}

describe("internationalization", () => {
  it("uses Chinese when storage is missing or invalid", () => {
    expect(DEFAULT_LOCALE).toBe("zh");
    expect(resolveStoredLocale(null)).toBe("zh");
    expect(resolveStoredLocale("ar")).toBe("zh");
    expect(resolveStoredLocale("fr")).toBe("fr");
    expect(resolveStoredLocale("zh")).toBe("zh");
    expect(isLocale("es")).toBe(true);
    expect(isLocale("de")).toBe(true);
    expect(isLocale("pt")).toBe(true);
    expect(isLocale("it")).toBe(true);
    expect(isLocale("ja")).toBe(true);
  });

  it("defines labels and formatting locales for every supported locale", () => {
    expect(Object.keys(LOCALE_LABELS)).toEqual([...LOCALES]);
    expect(Object.keys(HTML_LANGS)).toEqual([...LOCALES]);
    expect(Object.keys(INTL_LOCALES)).toEqual([...LOCALES]);
    expect(HTML_LANGS.pt).toBe("pt-BR");
    expect(INTL_LOCALES.de).toBe("de-DE");
  });

  it("keeps every locale structurally identical", () => {
    const expectedShape = objectShape(MESSAGES.en);
    for (const locale of LOCALES) {
      expect(objectShape(MESSAGES[locale])).toEqual(expectedShape);
      expect(MESSAGES[locale].hero.title).not.toBe("");
      expect(MESSAGES[locale].meta.description).not.toBe("");
    }
  });

  it("interpolates variables without changing unknown placeholders", () => {
    expect(interpolate("{appName} uses {provider}", { appName: "Starter", provider: "Stripe" }))
      .toBe("Starter uses Stripe");
    expect(interpolate("Hello {name} {missing}", { name: "Codex" })).toBe("Hello Codex {missing}");
  });

  it("translates stable API error codes and falls back safely", () => {
    expect(apiErrorMessage("invalid_project_url", MESSAGES.zh)).toBe("请输入有效的公开项目域名。");
    expect(apiErrorMessage("unknown", MESSAGES.zh)).toBe(MESSAGES.zh.errors.create);
  });
});

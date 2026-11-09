import { describe, expect, it } from "vitest";
import { LOCALES } from "../../i18n/config";
import {
  activeEmailProvider,
  isEmailAddress,
  isEmailProviderConfigured,
} from "./provider";
import { EMAIL_COPY, escapeHtml, isSafeActionUrl, renderEmail } from "./templates";

const db = {} as D1Database;
const base = { DB: db, EMAIL_FROM: "hello@example.com" };

describe("email provider selection", () => {
  it("requires a sender address and provider credentials", () => {
    expect(isEmailProviderConfigured({ DB: db, RESEND_API_KEY: "re_1" }, "resend")).toBe(false);
    expect(isEmailProviderConfigured({ ...base, RESEND_API_KEY: "re_1" }, "resend")).toBe(true);
    expect(isEmailProviderConfigured({ ...base, MAILGUN_API_KEY: "key" }, "mailgun")).toBe(false);
    expect(isEmailProviderConfigured({ ...base, MAILGUN_API_KEY: "key", MAILGUN_DOMAIN: "m.example.com" }, "mailgun"))
      .toBe(true);
  });

  it("honours an explicit provider and falls back only when it is unset", () => {
    expect(activeEmailProvider({ ...base, EMAIL_PROVIDER: "postmark", RESEND_API_KEY: "re_1" })).toBeNull();
    expect(activeEmailProvider({ ...base, RESEND_API_KEY: "re_1" })).toBe("resend");
    expect(activeEmailProvider({ ...base, POSTMARK_SERVER_TOKEN: "token" })).toBe("postmark");
    expect(activeEmailProvider(base)).toBeNull();
  });

  it("rejects malformed recipients", () => {
    expect(isEmailAddress("ada@example.com")).toBe(true);
    expect(isEmailAddress("ada@example")).toBe(false);
    expect(isEmailAddress("ada <ada@example.com>")).toBe(false);
    expect(isEmailAddress("a".repeat(250) + "@example.com")).toBe(false);
  });
});

describe("email rendering", () => {
  it("covers every template in every supported locale", () => {
    const templates = Object.keys(EMAIL_COPY.en);
    for (const locale of LOCALES) {
      expect(Object.keys(EMAIL_COPY[locale]).sort()).toEqual(templates.sort());
    }
  });

  it("interpolates variables into subject and body", () => {
    const rendered = renderEmail("subscription_started", "en", {
      appName: "Acme",
      plan: "Pro",
      date: "2026-09-01",
    });
    expect(rendered.subject).toBe("Your Acme Pro plan is active");
    expect(rendered.text).toContain("2026-09-01");
  });

  it("falls back to the default locale for an unknown one", () => {
    const rendered = renderEmail("welcome", "xx" as "en", { appName: "Acme", name: "Ada" });
    expect(rendered.subject).toBe("欢迎使用 Acme");
  });

  it("escapes interpolated values and drops unsafe action links", () => {
    const rendered = renderEmail("welcome", "en", {
      appName: "<script>alert(1)</script>",
      name: "Ada",
      url: "javascript:alert(1)",
    });
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain("&lt;script&gt;");
    expect(rendered.html).not.toContain("javascript:");
  });

  it("keeps HTTPS and loopback action links", () => {
    expect(isSafeActionUrl("https://example.com/verify")).toBe(true);
    expect(isSafeActionUrl("http://localhost:8787/verify")).toBe(true);
    expect(isSafeActionUrl("http://example.com/verify")).toBe(false);
    expect(escapeHtml('a"b')).toBe("a&quot;b");
  });
});

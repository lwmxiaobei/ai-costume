import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AGENT_FILES, ASSISTANTS } from "../../content/agents";
import { LEGAL_DOCUMENTS } from "../../content/legal";
import { MESSAGES } from "../../i18n/messages";
import type { PlanView } from "../billing/plans";
import {
  faqMarkdown,
  indexMarkdown,
  legalMarkdown,
  llmsFullTxt,
  llmsTxt,
  pricingMarkdown,
  productMarkdown,
} from "./markdown";

const site = { name: "Acme", origin: "https://acme.test" };

const plans: PlanView[] = [
  {
    id: "free",
    name: "Free",
    description: "Try it out.",
    isDefault: true,
    seatBased: false,
    trialDays: 0,
    features: ["core"],
    quotas: { projects: 3 },
    prices: [],
  },
  {
    id: "team",
    name: "Team",
    description: "",
    isDefault: false,
    seatBased: true,
    trialDays: 14,
    features: ["core", "priority_support"],
    quotas: { projects: -1, api_calls: 100_000 },
    prices: [
      {
        id: "team_monthly",
        provider: "stripe",
        providerPriceId: "price_1",
        interval: "month",
        amountCents: 1_900,
        currency: "USD",
        usageType: "licensed",
      },
    ],
  },
];

describe("agent-readable content", () => {
  it("follows the llms.txt layout with absolute links", () => {
    const body = llmsTxt(site);
    expect(body.startsWith("# Acme\n\n> ")).toBe(true);
    for (const path of ["/index.md", "/product.md", "/pricing.md", "/faq.md", "/terms.md", "/llms-full.txt"]) {
      expect(body).toContain("(https://acme.test" + path + ")");
    }
  });

  it("serves every file the footer links to", () => {
    const routes = readFileSync("src/lib/agents/routes.ts", "utf8");
    for (const path of AGENT_FILES) expect(routes).toContain('app.get("' + path + '"');
  });

  it("mirrors the landing page copy", () => {
    const body = indexMarkdown(site);
    expect(body).toContain(MESSAGES.en.hero.description);
    expect(body).toContain("### " + MESSAGES.en.landing.feature4Title);
    expect(productMarkdown(site)).toContain("**" + MESSAGES.en.landing.feature1Title + "**");
  });

  it("fills the product name into the FAQ", () => {
    const body = faqMarkdown(site);
    expect(body).toContain("## What is Acme?");
    expect(body).not.toContain("{appName}");
  });

  it("renders prices, trials, seats and limits", () => {
    const body = pricingMarkdown(site, plans);
    expect(body).toContain("## Free\n\nTry it out.\n\n- Free");
    expect(body).toContain("- $19.00 per month per seat");
    expect(body).toContain("- 14-day free trial");
    expect(body).toContain("- Features: core, priority support");
    expect(body).toContain("- Limits: unlimited projects, 100,000 api calls");
    expect(pricingMarkdown(site, [])).toContain("No plans are published yet.");
  });

  it("bundles every page into llms-full.txt", () => {
    const body = llmsFullTxt(site, plans);
    expect(body).toContain("# Acme pricing");
    expect(body).toContain("# Acme FAQ");
    expect(body).toContain(legalMarkdown(LEGAL_DOCUMENTS["/privacy"]).trim());
  });

  it("encodes the prompt into each assistant link", () => {
    const prompt = "What is Acme (https://acme.test/)? Pricing & plans";
    for (const assistant of ASSISTANTS) {
      const url = new URL(assistant.askUrl(prompt));
      expect(url.protocol).toBe("https:");
      expect(url.searchParams.get("q")).toBe(prompt);
    }
  });
});

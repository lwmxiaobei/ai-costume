import { FAQ, PRODUCT } from "../../content/agents";
import { LEGAL_DOCUMENTS, type LegalDocument } from "../../content/legal";
import { MESSAGES } from "../../i18n/messages";
import { interpolate } from "../../i18n/utils";
import { LEGAL_ROUTES } from "../../routes";
import type { PlanView } from "../billing/plans";

export interface SiteInfo {
  name: string;
  origin: string;
}

// Home page copy is reused so index.md and product.md change when the landing page does.
const copy = MESSAGES.en;

function fill(text: string, site: SiteInfo): string {
  return interpolate(text, { appName: site.name });
}

function features(): [string, string][] {
  const landing = copy.landing;
  return [
    [landing.feature1Title, landing.feature1Body],
    [landing.feature2Title, landing.feature2Body],
    [landing.feature3Title, landing.feature3Body],
    [landing.feature4Title, landing.feature4Body],
  ];
}

function document(blocks: (string | false)[]): string {
  return blocks.filter(Boolean).join("\n\n") + "\n";
}

function pageLinks(site: SiteInfo): string {
  return [
    "- [Overview](" + site.origin + "/index.md): What " + site.name + " is and what it includes",
    "- [Product](" + site.origin + "/product.md): Who it is for and how it works",
    "- [Pricing](" + site.origin + "/pricing.md): Plans, prices, trials and limits",
    "- [FAQ](" + site.origin + "/faq.md): Answers to common questions",
  ].join("\n");
}

export function llmsTxt(site: SiteInfo): string {
  const legal = LEGAL_ROUTES.map((route) =>
    "- [" + LEGAL_DOCUMENTS[route].title + "](" + site.origin + route + ".md)").join("\n");
  return document([
    "# " + site.name,
    "> " + copy.meta.description,
    copy.hero.description,
    "## Pages\n\n" + pageLinks(site),
    "## Legal\n\n" + legal,
    "## Optional\n\n- [Full text](" + site.origin + "/llms-full.txt): Every page above in one file",
  ]);
}

export function indexMarkdown(site: SiteInfo): string {
  return document([
    "# " + site.name,
    "> " + copy.meta.description,
    copy.hero.title + " " + copy.hero.description,
    "## " + copy.landing.featuresTitle,
    ...features().map(([title, body]) => "### " + title + "\n\n" + body),
    "## " + copy.landing.ctaTitle,
    copy.landing.ctaBody,
    pageLinks(site),
  ]);
}

export function productMarkdown(site: SiteInfo): string {
  return document([
    "# " + site.name,
    copy.hero.description,
    "## Who it is for\n\n" + PRODUCT.audience.map((line) => "- " + line).join("\n"),
    "## What is included\n\n" + features().map(([title, body]) => "- **" + title + "**: " + body).join("\n"),
    "## How it works\n\n" + PRODUCT.howItWorks.map((line, index) => (index + 1) + ". " + line).join("\n"),
    "## Built with\n\n" + PRODUCT.stack,
  ]);
}

export function faqMarkdown(site: SiteInfo): string {
  return document([
    "# " + site.name + " FAQ",
    ...FAQ.map((entry) => "## " + fill(entry.question, site) + "\n\n" + fill(entry.answer, site)),
  ]);
}

function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function planMarkdown(plan: PlanView): string {
  const lines: string[] = [];
  for (const price of plan.prices) {
    lines.push("- " + formatAmount(price.amountCents, price.currency) + " per " + price.interval
      + (plan.seatBased ? " per seat" : ""));
  }
  if (plan.prices.length === 0 && plan.isDefault) lines.push("- Free");
  if (plan.trialDays > 0) lines.push("- " + plan.trialDays + "-day free trial");
  if (plan.features.length > 0) {
    lines.push("- Features: " + plan.features.map((feature) => feature.replaceAll("_", " ")).join(", "));
  }
  const limits = Object.entries(plan.quotas).map(([key, value]) =>
    (value < 0 ? "unlimited" : value.toLocaleString("en-US")) + " " + key.replaceAll("_", " "));
  if (limits.length > 0) lines.push("- Limits: " + limits.join(", "));
  return document([
    "## " + plan.name,
    plan.description,
    lines.length > 0 && lines.join("\n"),
  ]).trimEnd();
}

export function pricingMarkdown(site: SiteInfo, plans: PlanView[]): string {
  return document([
    "# " + site.name + " pricing",
    copy.pricing.description,
    plans.length === 0 ? "No plans are published yet." : plans.map(planMarkdown).join("\n\n"),
  ]);
}

export function legalMarkdown(legal: LegalDocument): string {
  return document([
    "# " + legal.title,
    "Last updated: " + legal.updated,
    legal.intro,
    ...legal.sections.map((section) => "## " + section.heading + "\n\n" + section.body.join("\n\n")),
  ]);
}

export function llmsFullTxt(site: SiteInfo, plans: PlanView[]): string {
  return [
    productMarkdown(site),
    pricingMarkdown(site, plans),
    faqMarkdown(site),
    ...LEGAL_ROUTES.map((route) => legalMarkdown(LEGAL_DOCUMENTS[route])),
  ].join("\n");
}

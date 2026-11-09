import type { Context, Hono } from "hono";
import type { AppBindings } from "../../env";
import { LEGAL_DOCUMENTS } from "../../content/legal";
import { LEGAL_ROUTES } from "../../routes";
import { listPlans, type PlanView } from "../billing/plans";
import { activePaymentProvider, appOrigin } from "../payments/config";
import {
  faqMarkdown,
  indexMarkdown,
  legalMarkdown,
  llmsFullTxt,
  llmsTxt,
  pricingMarkdown,
  productMarkdown,
  type SiteInfo,
} from "./markdown";

type AgentContext = Context<AppBindings>;

function site(context: AgentContext): SiteInfo {
  return {
    name: context.env.APP_NAME || "Cloudflare SaaS Template",
    origin: appOrigin(context.env, context.req.url),
  };
}

// Same filter as /api/billing/plans: only prices for the active provider are shown.
async function publishedPlans(context: AgentContext): Promise<PlanView[]> {
  try {
    const provider = activePaymentProvider(context.env);
    const plans = await listPlans(context.env);
    return plans.map((plan) => ({ ...plan, prices: plan.prices.filter((price) => price.provider === provider) }));
  } catch (error) {
    console.error("agent_plans_error", error instanceof Error ? error.message : "unknown");
    return [];
  }
}

function send(context: AgentContext, body: string, type: string, canonicalPath?: string) {
  const headers: Record<string, string> = {
    "content-type": type + "; charset=utf-8",
    "cache-control": "public, max-age=300",
  };
  if (canonicalPath) headers.link = "<" + site(context).origin + canonicalPath + '>; rel="canonical"';
  return context.body(body, 200, headers);
}

export function registerAgentRoutes(app: Hono<AppBindings>): void {
  app.get("/llms.txt", (context) => send(context, llmsTxt(site(context)), "text/plain"));
  app.get("/llms-full.txt", async (context) =>
    send(context, llmsFullTxt(site(context), await publishedPlans(context)), "text/plain"));
  app.get("/index.md", (context) => send(context, indexMarkdown(site(context)), "text/markdown", "/"));
  app.get("/product.md", (context) => send(context, productMarkdown(site(context)), "text/markdown"));
  app.get("/faq.md", (context) => send(context, faqMarkdown(site(context)), "text/markdown"));
  app.get("/pricing.md", async (context) =>
    send(context, pricingMarkdown(site(context), await publishedPlans(context)), "text/markdown", "/pricing"));
  for (const route of LEGAL_ROUTES) {
    app.get(route + ".md", (context) =>
      send(context, legalMarkdown(LEGAL_DOCUMENTS[route]), "text/markdown", route));
  }
}

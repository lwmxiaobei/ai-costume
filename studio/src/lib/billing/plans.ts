import type { PaymentProvider, ServiceEnv } from "../../env";

export interface PlanRow {
  id: string;
  name: string;
  description: string;
  sort_order: number;
  is_default: number;
  is_active: number;
  seat_based: number;
  trial_days: number;
  features: string;
  quotas: string;
}

export interface PlanPriceRow {
  id: string;
  plan_id: string;
  payment_provider: PaymentProvider;
  provider_price_id: string;
  billing_interval: "month" | "year";
  amount_cents: number;
  currency: string;
  usage_type: "licensed" | "metered";
  is_active: number;
}

export interface PlanPriceView {
  id: string;
  provider: PaymentProvider;
  providerPriceId: string;
  interval: "month" | "year";
  amountCents: number;
  currency: string;
  usageType: "licensed" | "metered";
}

export interface PlanView {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  seatBased: boolean;
  trialDays: number;
  features: string[];
  quotas: Record<string, number>;
  prices: PlanPriceView[];
}

export function parseFeatures(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function parseQuotas(value: string): Record<string, number> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter((entry): entry is [string, number] => Number.isInteger(entry[1])),
    );
  } catch {
    return {};
  }
}

function toPriceView(row: PlanPriceRow): PlanPriceView {
  return {
    id: row.id,
    provider: row.payment_provider,
    providerPriceId: row.provider_price_id,
    interval: row.billing_interval,
    amountCents: row.amount_cents,
    currency: row.currency,
    usageType: row.usage_type,
  };
}

export function toPlanView(plan: PlanRow, prices: PlanPriceRow[]): PlanView {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    isDefault: plan.is_default === 1,
    seatBased: plan.seat_based === 1,
    trialDays: plan.trial_days,
    features: parseFeatures(plan.features),
    quotas: parseQuotas(plan.quotas),
    prices: prices.filter((price) => price.plan_id === plan.id).map(toPriceView),
  };
}

export async function listPlans(env: ServiceEnv, includeInactive = false): Promise<PlanView[]> {
  const plans = await env.DB.prepare(
    "SELECT * FROM plans" + (includeInactive ? "" : " WHERE is_active = 1")
    + " ORDER BY sort_order ASC, id ASC",
  ).all<PlanRow>();
  const prices = await env.DB.prepare(
    "SELECT * FROM plan_prices" + (includeInactive ? "" : " WHERE is_active = 1")
    + " ORDER BY amount_cents ASC",
  ).all<PlanPriceRow>();
  return plans.results.map((plan) => toPlanView(plan, prices.results));
}

export async function getPlan(env: ServiceEnv, planId: string): Promise<PlanRow | null> {
  return env.DB.prepare("SELECT * FROM plans WHERE id = ?").bind(planId).first<PlanRow>();
}

export async function defaultPlan(env: ServiceEnv): Promise<PlanRow | null> {
  return env.DB.prepare(
    "SELECT * FROM plans WHERE is_default = 1 AND is_active = 1 ORDER BY sort_order ASC LIMIT 1",
  ).first<PlanRow>();
}

export async function findPriceById(env: ServiceEnv, priceId: string): Promise<PlanPriceRow | null> {
  return env.DB.prepare("SELECT * FROM plan_prices WHERE id = ? AND is_active = 1")
    .bind(priceId)
    .first<PlanPriceRow>();
}

export async function findPriceByProvider(
  env: ServiceEnv,
  provider: PaymentProvider,
  providerPriceId: string,
): Promise<PlanPriceRow | null> {
  return env.DB.prepare(
    "SELECT * FROM plan_prices WHERE payment_provider = ? AND provider_price_id = ?",
  ).bind(provider, providerPriceId).first<PlanPriceRow>();
}

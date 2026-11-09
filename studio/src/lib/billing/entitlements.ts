import { createMiddleware } from "hono/factory";
import type { AppBindings, ServiceEnv } from "../../env";
import { defaultPlan, getPlan, parseFeatures, parseQuotas, type PlanRow } from "./plans";

export const ACTIVE_SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due"] as const;
export const UNLIMITED = -1;

export interface Entitlement {
  planId: string;
  planName: string;
  status: string;
  source: "subscription" | "default" | "none";
  features: string[];
  quotas: Record<string, number>;
  seats: number;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

interface SubscriptionSummary {
  plan_id: string;
  status: string;
  quantity: number;
  trial_end: string | null;
  current_period_end: string | null;
  cancel_at_period_end: number;
}

export const EMPTY_ENTITLEMENT: Entitlement = {
  planId: "none",
  planName: "None",
  status: "none",
  source: "none",
  features: [],
  quotas: {},
  seats: 0,
  trialEnd: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};

export function currentPeriod(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

export function hasFeature(entitlement: Entitlement, feature: string): boolean {
  return entitlement.features.includes(feature);
}

export function quotaLimit(entitlement: Entitlement, metric: string): number {
  const limit = entitlement.quotas[metric];
  return Number.isInteger(limit) ? limit : 0;
}

export function withinQuota(entitlement: Entitlement, metric: string, used: number, requested = 1): boolean {
  const limit = quotaLimit(entitlement, metric);
  if (limit === UNLIMITED) return true;
  return used + requested <= limit * Math.max(1, entitlement.seats);
}

function planEntitlement(
  plan: PlanRow,
  subscription: SubscriptionSummary | null,
): Entitlement {
  return {
    planId: plan.id,
    planName: plan.name,
    status: subscription?.status || "default",
    source: subscription ? "subscription" : "default",
    features: parseFeatures(plan.features),
    quotas: parseQuotas(plan.quotas),
    seats: subscription?.quantity || 1,
    trialEnd: subscription?.trial_end || null,
    currentPeriodEnd: subscription?.current_period_end || null,
    cancelAtPeriodEnd: subscription?.cancel_at_period_end === 1,
  };
}

export async function userEntitlement(env: ServiceEnv, userId: string): Promise<Entitlement> {
  const subscription = await env.DB.prepare(
    "SELECT plan_id, status, quantity, trial_end, current_period_end, cancel_at_period_end "
    + "FROM subscriptions WHERE user_id = ? AND status IN ('trialing', 'active', 'past_due') "
    + "ORDER BY updated_at DESC LIMIT 1",
  ).bind(userId).first<SubscriptionSummary>();

  if (subscription) {
    const plan = await getPlan(env, subscription.plan_id);
    if (plan) return planEntitlement(plan, subscription);
  }
  const fallback = await defaultPlan(env);
  return fallback ? planEntitlement(fallback, null) : EMPTY_ENTITLEMENT;
}

export async function usageFor(
  env: ServiceEnv,
  userId: string,
  metric: string,
  period = currentPeriod(),
): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT quantity FROM usage_records WHERE user_id = ? AND metric = ? AND period = ?",
  ).bind(userId, metric, period).first<{ quantity: number }>();
  return row?.quantity || 0;
}

export async function recordUsage(
  env: ServiceEnv,
  userId: string,
  metric: string,
  amount = 1,
  period = currentPeriod(),
): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO usage_records (id, user_id, metric, period, quantity) VALUES (?, ?, ?, ?, ?) "
    + "ON CONFLICT(user_id, metric, period) DO UPDATE SET quantity = quantity + excluded.quantity, "
    + "updated_at = CURRENT_TIMESTAMP RETURNING quantity",
  ).bind("usage_" + crypto.randomUUID(), userId, metric, period, Math.max(0, amount))
    .first<{ quantity: number }>();
  return row?.quantity || 0;
}

export type QuotaCounter = (env: ServiceEnv, userId: string) => Promise<number>;

export const QUOTA_COUNTERS: Record<string, QuotaCounter> = {
  projects: async (env, userId) => {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM projects WHERE user_id = ? AND status != 'suspended'",
    ).bind(userId).first<{ total: number }>();
    return row?.total || 0;
  },
};

export async function metricUsage(
  env: ServiceEnv,
  userId: string,
  metric: string,
  period = currentPeriod(),
): Promise<number> {
  const counter = QUOTA_COUNTERS[metric];
  return counter ? counter(env, userId) : usageFor(env, userId, metric, period);
}

export interface QuotaDecision {
  allowed: boolean;
  used: number;
  limit: number;
}

export async function consumeQuota(
  env: ServiceEnv,
  userId: string,
  metric: string,
  amount = 1,
): Promise<QuotaDecision> {
  const entitlement = await userEntitlement(env, userId);
  const period = currentPeriod();
  const used = await metricUsage(env, userId, metric, period);
  const limit = quotaLimit(entitlement, metric);
  if (!withinQuota(entitlement, metric, used, amount)) {
    return { allowed: false, used, limit };
  }
  if (QUOTA_COUNTERS[metric]) return { allowed: true, used: used + amount, limit };
  const next = await recordUsage(env, userId, metric, amount, period);
  return { allowed: true, used: next, limit };
}

export const requireFeature = (feature: string) => createMiddleware<AppBindings>(
  async (context, next) => {
    const entitlement = await userEntitlement(context.env, context.get("user").id);
    if (!hasFeature(entitlement, feature)) {
      return context.json({
        code: "feature_not_included",
        error: "Your plan does not include this feature.",
        feature,
        planId: entitlement.planId,
      }, 402);
    }
    await next();
  },
);

export const requireQuota = (metric: string, amount = 1) => createMiddleware<AppBindings>(
  async (context, next) => {
    const decision = await consumeQuota(context.env, context.get("user").id, metric, amount);
    if (!decision.allowed) {
      return context.json({
        code: "quota_exceeded",
        error: "You reached the limit for your plan.",
        metric,
        used: decision.used,
        limit: decision.limit,
      }, 402);
    }
    await next();
  },
);

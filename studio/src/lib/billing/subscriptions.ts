import type { PaymentProvider, ServiceEnv } from "../../env";

export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "paused",
  "unpaid",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface SubscriptionRow {
  id: string;
  user_id: string;
  plan_id: string;
  price_id: string | null;
  payment_provider: PaymentProvider;
  provider_subscription_id: string;
  provider_customer_id: string | null;
  status: SubscriptionStatus;
  quantity: number;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: number;
  trial_end: string | null;
  canceled_at: string | null;
}

export interface SubscriptionInput {
  userId: string;
  planId: string;
  priceId: string | null;
  provider: PaymentProvider;
  providerSubscriptionId: string;
  providerCustomerId: string | null;
  status: SubscriptionStatus;
  quantity: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: string | null;
  canceledAt: string | null;
}

export function normalizeSubscriptionStatus(value: unknown): SubscriptionStatus | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase();
  if (normalized === "incomplete_expired") return "incomplete";
  if (normalized === "revoked" || normalized === "expired") return "canceled";
  return SUBSCRIPTION_STATUSES.includes(normalized as SubscriptionStatus)
    ? normalized as SubscriptionStatus
    : null;
}

export function isoFromEpochSeconds(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1_000).toISOString();
}

export function isoFromDateString(value: unknown): string | null {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

export async function upsertSubscription(env: ServiceEnv, input: SubscriptionInput): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO subscriptions (id, user_id, plan_id, price_id, payment_provider, "
    + "provider_subscription_id, provider_customer_id, status, quantity, current_period_start, "
    + "current_period_end, cancel_at_period_end, trial_end, canceled_at) "
    + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
    + "ON CONFLICT(payment_provider, provider_subscription_id) DO UPDATE SET "
    + "plan_id = excluded.plan_id, price_id = excluded.price_id, "
    + "provider_customer_id = COALESCE(excluded.provider_customer_id, subscriptions.provider_customer_id), "
    + "status = excluded.status, quantity = excluded.quantity, "
    + "current_period_start = excluded.current_period_start, "
    + "current_period_end = excluded.current_period_end, "
    + "cancel_at_period_end = excluded.cancel_at_period_end, trial_end = excluded.trial_end, "
    + "canceled_at = excluded.canceled_at, updated_at = CURRENT_TIMESTAMP",
  ).bind(
    "subscription_" + input.provider + "_" + input.providerSubscriptionId,
    input.userId,
    input.planId,
    input.priceId,
    input.provider,
    input.providerSubscriptionId,
    input.providerCustomerId,
    input.status,
    Math.max(1, input.quantity),
    input.currentPeriodStart,
    input.currentPeriodEnd,
    input.cancelAtPeriodEnd ? 1 : 0,
    input.trialEnd,
    input.canceledAt,
  ).run();
}

export async function markSubscriptionCanceled(
  env: ServiceEnv,
  provider: PaymentProvider,
  providerSubscriptionId: string,
  canceledAt: string,
): Promise<SubscriptionRow | null> {
  const row = await env.DB.prepare(
    "UPDATE subscriptions SET status = 'canceled', canceled_at = ?, cancel_at_period_end = 0, "
    + "updated_at = CURRENT_TIMESTAMP WHERE payment_provider = ? AND provider_subscription_id = ? "
    + "RETURNING *",
  ).bind(canceledAt, provider, providerSubscriptionId).first<SubscriptionRow>();
  return row;
}

export async function subscriptionByProviderId(
  env: ServiceEnv,
  provider: PaymentProvider,
  providerSubscriptionId: string,
): Promise<SubscriptionRow | null> {
  return env.DB.prepare(
    "SELECT * FROM subscriptions WHERE payment_provider = ? AND provider_subscription_id = ?",
  ).bind(provider, providerSubscriptionId).first<SubscriptionRow>();
}

export async function activeSubscription(
  env: ServiceEnv,
  userId: string,
): Promise<SubscriptionRow | null> {
  return env.DB.prepare(
    "SELECT * FROM subscriptions WHERE user_id = ? AND status IN ('trialing', 'active', 'past_due') "
    + "ORDER BY updated_at DESC LIMIT 1",
  ).bind(userId).first<SubscriptionRow>();
}

export async function linkBillingCustomer(
  env: ServiceEnv,
  userId: string,
  provider: PaymentProvider,
  providerCustomerId: string,
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO billing_customers (user_id, payment_provider, provider_customer_id) VALUES (?, ?, ?) "
    + "ON CONFLICT(user_id, payment_provider) DO UPDATE SET provider_customer_id = excluded.provider_customer_id",
  ).bind(userId, provider, providerCustomerId).run();
}

export async function billingCustomerId(
  env: ServiceEnv,
  userId: string,
  provider: PaymentProvider,
): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT provider_customer_id FROM billing_customers WHERE user_id = ? AND payment_provider = ?",
  ).bind(userId, provider).first<{ provider_customer_id: string }>();
  return row?.provider_customer_id || null;
}

export async function userIdForCustomer(
  env: ServiceEnv,
  provider: PaymentProvider,
  providerCustomerId: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT user_id FROM billing_customers WHERE payment_provider = ? AND provider_customer_id = ?",
  ).bind(provider, providerCustomerId).first<{ user_id: string }>();
  return row?.user_id || null;
}

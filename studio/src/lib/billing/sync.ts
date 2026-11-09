import type { PaymentProvider, ServiceEnv } from "../../env";
import { sendEmail } from "../email/send";
import { findPriceByProvider } from "./plans";
import {
  isoFromDateString,
  isoFromEpochSeconds,
  linkBillingCustomer,
  normalizeSubscriptionStatus,
  subscriptionByProviderId,
  upsertSubscription,
  userIdForCustomer,
  type SubscriptionStatus,
} from "./subscriptions";
import type { StripeSubscription } from "./stripe-billing";

export interface SyncResult {
  synced: boolean;
  reason?: string;
  status?: SubscriptionStatus;
  planId?: string;
}

async function notifyStatusChange(
  env: ServiceEnv,
  userId: string,
  planId: string,
  status: SubscriptionStatus,
  previousStatus: SubscriptionStatus | null,
  providerSubscriptionId: string,
  periodEnd: string | null,
): Promise<void> {
  if (status === previousStatus) return;
  const user = await env.DB.prepare("SELECT email, name, locale FROM users WHERE id = ?")
    .bind(userId)
    .first<{ email: string; name: string; locale: string | null }>();
  if (!user) return;

  const plan = await env.DB.prepare("SELECT name FROM plans WHERE id = ?")
    .bind(planId)
    .first<{ name: string }>();
  const variables = {
    plan: plan?.name || planId,
    name: user.name,
    date: periodEnd ? periodEnd.slice(0, 10) : "",
  };

  if (status === "active" || status === "trialing") {
    await sendEmail(env, {
      to: user.email,
      template: "subscription_started",
      idempotencyKey: "subscription_started:" + providerSubscriptionId,
      locale: user.locale,
      variables,
    });
    return;
  }
  if (status === "canceled") {
    await sendEmail(env, {
      to: user.email,
      template: "subscription_canceled",
      idempotencyKey: "subscription_canceled:" + providerSubscriptionId + ":" + (periodEnd || ""),
      locale: user.locale,
      variables,
    });
  }
}

export interface GenericSubscriptionEvent {
  provider: PaymentProvider;
  providerSubscriptionId: string;
  providerCustomerId: string | null;
  providerPriceId: string | null;
  status: unknown;
  quantity?: number;
  userId?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  trialEnd?: string | null;
  canceledAt?: string | null;
  cancelAtPeriodEnd?: boolean;
}

export async function syncSubscriptionEvent(
  env: ServiceEnv,
  event: GenericSubscriptionEvent,
): Promise<SyncResult> {
  const status = normalizeSubscriptionStatus(event.status);
  if (!status) return { synced: false, reason: "unknown_status" };

  const existing = await subscriptionByProviderId(env, event.provider, event.providerSubscriptionId);
  const userId = event.userId
    || existing?.user_id
    || (event.providerCustomerId
      ? await userIdForCustomer(env, event.provider, event.providerCustomerId)
      : null);
  if (!userId) return { synced: false, reason: "unknown_user" };

  const price = event.providerPriceId
    ? await findPriceByProvider(env, event.provider, event.providerPriceId)
    : null;
  const planId = price?.plan_id || existing?.plan_id;
  if (!planId) return { synced: false, reason: "unknown_plan" };

  if (event.providerCustomerId) {
    await linkBillingCustomer(env, userId, event.provider, event.providerCustomerId);
  }

  await upsertSubscription(env, {
    userId,
    planId,
    priceId: price?.id || existing?.price_id || null,
    provider: event.provider,
    providerSubscriptionId: event.providerSubscriptionId,
    providerCustomerId: event.providerCustomerId,
    status,
    quantity: event.quantity || existing?.quantity || 1,
    currentPeriodStart: event.currentPeriodStart ?? existing?.current_period_start ?? null,
    currentPeriodEnd: event.currentPeriodEnd ?? existing?.current_period_end ?? null,
    cancelAtPeriodEnd: event.cancelAtPeriodEnd ?? existing?.cancel_at_period_end === 1,
    trialEnd: event.trialEnd ?? existing?.trial_end ?? null,
    canceledAt: event.canceledAt ?? existing?.canceled_at ?? null,
  });

  await notifyStatusChange(
    env,
    userId,
    planId,
    status,
    existing?.status || null,
    event.providerSubscriptionId,
    event.currentPeriodEnd ?? existing?.current_period_end ?? null,
  );
  return { synced: true, status, planId };
}

export function stripeSubscriptionEvent(
  subscription: StripeSubscription,
): GenericSubscriptionEvent {
  const item = subscription.items?.data?.[0];
  return {
    provider: "stripe",
    providerSubscriptionId: subscription.id,
    providerCustomerId: typeof subscription.customer === "string" ? subscription.customer : null,
    providerPriceId: item?.price?.id || null,
    status: subscription.status,
    quantity: item?.quantity || subscription.quantity || 1,
    userId: subscription.metadata?.userId || null,
    currentPeriodStart: isoFromEpochSeconds(subscription.current_period_start),
    currentPeriodEnd: isoFromEpochSeconds(subscription.current_period_end),
    trialEnd: isoFromEpochSeconds(subscription.trial_end),
    canceledAt: isoFromEpochSeconds(subscription.canceled_at),
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
  };
}

export async function syncStripeSubscription(
  env: ServiceEnv,
  subscription: StripeSubscription,
): Promise<SyncResult> {
  return syncSubscriptionEvent(env, stripeSubscriptionEvent(subscription));
}

export function polarSubscriptionEvent(data: Record<string, unknown>): GenericSubscriptionEvent {
  const price = data.price as Record<string, unknown> | undefined;
  const metadata = data.metadata as Record<string, unknown> | undefined;
  return {
    provider: "polar",
    providerSubscriptionId: String(data.id || ""),
    providerCustomerId: typeof data.customer_id === "string" ? data.customer_id : null,
    providerPriceId: typeof price?.id === "string"
      ? price.id
      : typeof data.product_id === "string" ? data.product_id : null,
    status: data.status,
    quantity: 1,
    userId: typeof metadata?.userId === "string" ? metadata.userId : null,
    currentPeriodStart: isoFromDateString(data.current_period_start),
    currentPeriodEnd: isoFromDateString(data.current_period_end),
    trialEnd: null,
    canceledAt: isoFromDateString(data.canceled_at),
    cancelAtPeriodEnd: data.cancel_at_period_end === true,
  };
}

export function creemSubscriptionEvent(object: Record<string, unknown>): GenericSubscriptionEvent {
  const product = object.product as Record<string, unknown> | string | undefined;
  const customer = object.customer as Record<string, unknown> | string | undefined;
  const metadata = object.metadata as Record<string, unknown> | undefined;
  return {
    provider: "creem",
    providerSubscriptionId: String(object.id || ""),
    providerCustomerId: typeof customer === "string"
      ? customer
      : typeof customer?.id === "string" ? customer.id : null,
    providerPriceId: typeof product === "string"
      ? product
      : typeof product?.id === "string" ? product.id : null,
    status: object.status,
    quantity: typeof object.units === "number" ? object.units : 1,
    userId: typeof metadata?.userId === "string" ? metadata.userId : null,
    currentPeriodStart: isoFromDateString(object.current_period_start_date),
    currentPeriodEnd: isoFromDateString(object.current_period_end_date),
    trialEnd: null,
    canceledAt: isoFromDateString(object.canceled_at),
    cancelAtPeriodEnd: object.cancel_at_period_end === true,
  };
}

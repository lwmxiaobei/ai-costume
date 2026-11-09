import type { ServiceEnv } from "../../env";

export interface StripeSubscriptionItem {
  id: string;
  price: { id: string };
  quantity?: number;
}

export interface StripeSubscription {
  id: string;
  status: string;
  customer: string;
  quantity?: number;
  cancel_at_period_end?: boolean;
  current_period_start?: number;
  current_period_end?: number;
  trial_end?: number | null;
  canceled_at?: number | null;
  items?: { data: StripeSubscriptionItem[] };
  metadata?: Record<string, string>;
}

export class StripeApiError extends Error {
  readonly status: number;

  constructor(status: number, code: string) {
    super(code);
    this.name = "StripeApiError";
    this.status = status;
  }
}

export function isStripeBillingPortalUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "billing.stripe.com";
  } catch {
    return false;
  }
}

async function stripeRequest<T>(
  env: ServiceEnv,
  path: string,
  init: { method?: "GET" | "POST"; body?: URLSearchParams; idempotencyKey?: string } = {},
): Promise<T> {
  const method = init.method || "POST";
  const base = env.STRIPE_API_BASE || "https://api.stripe.com";
  const url = base + path + (method === "GET" && init.body ? "?" + init.body.toString() : "");
  const response = await fetch(url, {
    method,
    headers: {
      authorization: "Bearer " + env.STRIPE_SECRET_KEY,
      "content-type": "application/x-www-form-urlencoded",
      ...(init.idempotencyKey ? { "idempotency-key": init.idempotencyKey } : {}),
    },
    ...(method === "POST" && init.body ? { body: init.body.toString() } : {}),
  });
  if (!response.ok) throw new StripeApiError(response.status, "stripe_" + response.status);
  return response.json<T>();
}

export async function createStripeCustomer(
  env: ServiceEnv,
  user: { id: string; email: string; name: string },
): Promise<string> {
  const body = new URLSearchParams({
    email: user.email,
    name: user.name,
    "metadata[userId]": user.id,
  });
  const customer = await stripeRequest<{ id: string }>(env, "/v1/customers", {
    body,
    idempotencyKey: "customer_" + user.id,
  });
  if (!customer.id) throw new StripeApiError(502, "stripe_customer_missing_id");
  return customer.id;
}

export interface SubscriptionCheckoutParams {
  customerId: string;
  providerPriceId: string;
  quantity: number;
  trialDays: number;
  seatBased: boolean;
  userId: string;
  planId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}

export function stripeSubscriptionCheckoutRequest(params: SubscriptionCheckoutParams): URLSearchParams {
  const body = new URLSearchParams({
    mode: "subscription",
    customer: params.customerId,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    client_reference_id: params.userId,
    billing_address_collection: "auto",
    "automatic_tax[enabled]": "true",
    "tax_id_collection[enabled]": "true",
    "line_items[0][price]": params.providerPriceId,
    "line_items[0][quantity]": String(params.quantity),
    "metadata[userId]": params.userId,
    "metadata[planId]": params.planId,
    "metadata[priceId]": params.priceId,
    "subscription_data[metadata][userId]": params.userId,
    "subscription_data[metadata][planId]": params.planId,
    "subscription_data[metadata][priceId]": params.priceId,
  });
  if (params.seatBased) body.set("line_items[0][adjustable_quantity][enabled]", "true");
  if (params.trialDays > 0) {
    body.set("subscription_data[trial_period_days]", String(params.trialDays));
    body.set("subscription_data[trial_settings][end_behavior][missing_payment_method]", "cancel");
  }
  return body;
}

export async function createStripeSubscriptionCheckout(
  env: ServiceEnv,
  params: SubscriptionCheckoutParams,
): Promise<{ id: string; url: string }> {
  const session = await stripeRequest<{ id: string; url: string }>(env, "/v1/checkout/sessions", {
    body: stripeSubscriptionCheckoutRequest(params),
  });
  if (!session.id || typeof session.url !== "string") {
    throw new StripeApiError(502, "stripe_checkout_missing_url");
  }
  return { id: session.id, url: session.url };
}

export async function createStripePortalSession(
  env: ServiceEnv,
  customerId: string,
  returnUrl: string,
): Promise<string> {
  const body = new URLSearchParams({ customer: customerId, return_url: returnUrl });
  if (env.STRIPE_PORTAL_CONFIGURATION_ID) {
    body.set("configuration", env.STRIPE_PORTAL_CONFIGURATION_ID);
  }
  const session = await stripeRequest<{ url: string }>(env, "/v1/billing_portal/sessions", { body });
  if (!isStripeBillingPortalUrl(session.url)) throw new StripeApiError(502, "stripe_portal_invalid_url");
  return session.url;
}

export async function fetchStripeSubscription(
  env: ServiceEnv,
  subscriptionId: string,
): Promise<StripeSubscription> {
  return stripeRequest<StripeSubscription>(env, "/v1/subscriptions/" + encodeURIComponent(subscriptionId), {
    method: "GET",
  });
}

export async function setStripeCancelAtPeriodEnd(
  env: ServiceEnv,
  subscriptionId: string,
  cancelAtPeriodEnd: boolean,
): Promise<StripeSubscription> {
  return stripeRequest<StripeSubscription>(env, "/v1/subscriptions/" + encodeURIComponent(subscriptionId), {
    body: new URLSearchParams({ cancel_at_period_end: cancelAtPeriodEnd ? "true" : "false" }),
  });
}

export async function cancelStripeSubscriptionNow(
  env: ServiceEnv,
  subscriptionId: string,
): Promise<StripeSubscription> {
  const base = env.STRIPE_API_BASE || "https://api.stripe.com";
  const response = await fetch(base + "/v1/subscriptions/" + encodeURIComponent(subscriptionId), {
    method: "DELETE",
    headers: { authorization: "Bearer " + env.STRIPE_SECRET_KEY },
  });
  if (!response.ok) throw new StripeApiError(response.status, "stripe_" + response.status);
  return response.json<StripeSubscription>();
}

export async function changeStripeSubscriptionPrice(
  env: ServiceEnv,
  subscriptionId: string,
  providerPriceId: string,
  quantity: number,
): Promise<StripeSubscription> {
  const current = await fetchStripeSubscription(env, subscriptionId);
  const item = current.items?.data?.[0];
  if (!item) throw new StripeApiError(422, "stripe_subscription_without_items");
  const body = new URLSearchParams({
    "items[0][id]": item.id,
    "items[0][price]": providerPriceId,
    "items[0][quantity]": String(quantity),
    proration_behavior: "create_prorations",
    payment_behavior: "error_if_incomplete",
    cancel_at_period_end: "false",
  });
  return stripeRequest<StripeSubscription>(
    env,
    "/v1/subscriptions/" + encodeURIComponent(subscriptionId),
    { body },
  );
}

export async function reportStripeMeterEvent(
  env: ServiceEnv,
  params: { eventName: string; customerId: string; value: number; identifier: string },
): Promise<void> {
  const body = new URLSearchParams({
    event_name: params.eventName,
    identifier: params.identifier,
    "payload[stripe_customer_id]": params.customerId,
    "payload[value]": String(Math.max(0, Math.trunc(params.value))),
  });
  await stripeRequest(env, "/v1/billing/meter_events", { body });
}

import type { Env, PaymentProvider, ServiceEnv } from "../../env";
import { fulfillPurchase, reversePurchase, type PaymentRow } from "../../domain/fulfillment";
import {
  creemSubscriptionEvent,
  polarSubscriptionEvent,
  stripeSubscriptionEvent,
  syncSubscriptionEvent,
} from "../billing/sync";
import type { StripeSubscription } from "../billing/stripe-billing";
import { sendEmail } from "../email/send";
import { creemOrderId, refundedProductCents } from "./creem";
import { polarRefundedProductCents } from "./polar";
import { stripeRefundedCents } from "./stripe";
import { applyWaffoEvent } from "./waffo-events";

export type JsonObject = Record<string, unknown>;

export function getString(object: JsonObject | null | undefined, key: string): string | null {
  const value = object?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function getObject(object: JsonObject | null | undefined, key: string): JsonObject | null {
  const value = object?.[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

export function creemProductId(object: JsonObject): string | null {
  const product = object.product;
  if (typeof product === "string") return product;
  if (product && typeof product === "object") return getString(product as JsonObject, "id");
  return getString(getObject(object, "order"), "product");
}

async function paymentByOrder(
  env: ServiceEnv,
  provider: PaymentProvider,
  orderId: string,
): Promise<PaymentRow> {
  const payment = await env.DB.prepare("SELECT * FROM payments WHERE payment_provider = ? AND order_id = ?")
    .bind(provider, orderId)
    .first<PaymentRow>();
  if (!payment) throw new Error("payment_not_found");
  return payment;
}

async function recordUnhandled(
  env: ServiceEnv,
  provider: PaymentProvider,
  id: string,
  type: string,
  objectId: string | null,
): Promise<void> {
  await env.DB.prepare("INSERT OR IGNORE INTO payment_events (id, event_type, object_id) VALUES (?, ?, ?)")
    .bind(provider + ":" + id, type, objectId)
    .run();
}

function formatAmount(amountCents: number, currency: string): string {
  return (amountCents / 100).toFixed(2) + " " + currency.toUpperCase();
}

async function notifyPayment(
  env: ServiceEnv,
  pendingId: string,
  template: "payment_succeeded" | "payment_refunded",
  idempotencyKey: string,
  amountCents: number,
  currency: string,
): Promise<void> {
  const row = await env.DB.prepare(
    "SELECT u.email AS email, u.name AS name, u.locale AS locale FROM pending_checkouts p "
    + "JOIN users u ON u.id = p.user_id WHERE p.id = ?",
  ).bind(pendingId).first<{ email: string; name: string; locale: string | null }>();
  if (!row) return;
  await sendEmail(env, {
    to: row.email,
    template,
    idempotencyKey,
    locale: row.locale,
    variables: { name: row.name, amount: formatAmount(amountCents, currency) },
  });
}

export async function applyStripeEvent(env: Env, rawBody: string): Promise<void> {
  const event = JSON.parse(rawBody) as {
    id?: string;
    type?: string;
    created?: number;
    data?: { object?: JsonObject };
  };
  const object = event.data?.object;
  if (!event.id || !event.type || !object) throw new Error("incomplete_event");

  if (event.type.startsWith("customer.subscription.")) {
    const result = await syncSubscriptionEvent(
      env,
      stripeSubscriptionEvent(object as unknown as StripeSubscription),
    );
    if (!result.synced) throw new Error("subscription_" + (result.reason || "sync_failed"));
    await recordUnhandled(env, "stripe", event.id, event.type, getString(object, "id"));
    return;
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    if (getString(object, "mode") === "subscription") {
      await recordUnhandled(env, "stripe", event.id, event.type, getString(object, "id"));
      return;
    }
    const metadata = getObject(object, "metadata");
    if (getString(object, "payment_status") !== "paid") {
      await recordUnhandled(env, "stripe", event.id, event.type, getString(object, "id"));
      return;
    }
    const paid = {
      eventId: event.id,
      eventType: event.type,
      provider: "stripe" as const,
      pendingId: getString(object, "client_reference_id") || getString(metadata, "pendingCheckoutId"),
      checkoutId: getString(object, "id"),
      orderId: getString(object, "payment_intent"),
      productId: getString(metadata, "providerProductId"),
      amountCents: object.amount_subtotal,
      currency: getString(object, "currency")?.toUpperCase(),
      paidAt: new Date((event.created || Math.floor(Date.now() / 1_000)) * 1_000).toISOString(),
    };
    if (!paid.pendingId || !paid.checkoutId || !paid.orderId || !paid.productId
      || typeof paid.amountCents !== "number" || !paid.currency) {
      throw new Error("incomplete_order");
    }
    const fulfilled = await fulfillPurchase(env, paid as Parameters<typeof fulfillPurchase>[1]);
    if (fulfilled) {
      await notifyPayment(
        env,
        paid.pendingId,
        "payment_succeeded",
        "payment_succeeded:stripe:" + paid.orderId,
        paid.amountCents,
        paid.currency,
      );
    }
    return;
  }

  if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
    const orderId = getString(object, "payment_intent");
    if (!orderId) throw new Error("missing_payment_intent_id");
    const payment = await paymentByOrder(env, "stripe", orderId);
    const target = event.type === "charge.dispute.created"
      ? payment.amount_cents
      : stripeRefundedCents(payment.amount_cents, object);
    await reversePurchase(env, "stripe", event.id, event.type, orderId, target);
    await notifyPayment(
      env,
      payment.pending_checkout_id,
      "payment_refunded",
      "payment_refunded:stripe:" + event.id,
      target,
      "USD",
    );
    return;
  }

  await recordUnhandled(env, "stripe", event.id, event.type, getString(object, "id"));
}

export async function applyPolarEvent(env: Env, rawBody: string, webhookId: string): Promise<void> {
  const event = JSON.parse(rawBody) as { type?: string; timestamp?: string; data?: JsonObject };
  if (!webhookId || !event.type || !event.data) throw new Error("incomplete_event");

  if (event.type.startsWith("subscription.")) {
    const result = await syncSubscriptionEvent(env, polarSubscriptionEvent(event.data));
    if (!result.synced) throw new Error("subscription_" + (result.reason || "sync_failed"));
    await recordUnhandled(env, "polar", webhookId, event.type, getString(event.data, "id"));
    return;
  }

  if (event.type === "order.paid") {
    const metadata = getObject(event.data, "metadata");
    const paid = {
      eventId: webhookId,
      eventType: event.type,
      provider: "polar" as const,
      pendingId: getString(metadata, "pendingCheckoutId"),
      checkoutId: getString(event.data, "checkout_id"),
      orderId: getString(event.data, "id"),
      productId: getString(event.data, "product_id"),
      amountCents: event.data.subtotal_amount,
      currency: getString(event.data, "currency")?.toUpperCase(),
      paidAt: event.timestamp && !Number.isNaN(Date.parse(event.timestamp))
        ? new Date(event.timestamp).toISOString()
        : new Date().toISOString(),
    };
    if (!paid.pendingId || !paid.checkoutId || !paid.orderId || !paid.productId
      || typeof paid.amountCents !== "number" || !paid.currency
      || getString(event.data, "status") !== "paid" || event.data.paid !== true) {
      throw new Error("incomplete_or_unpaid_order");
    }
    const fulfilled = await fulfillPurchase(env, paid as Parameters<typeof fulfillPurchase>[1]);
    if (fulfilled) {
      await notifyPayment(
        env,
        paid.pendingId,
        "payment_succeeded",
        "payment_succeeded:polar:" + paid.orderId,
        paid.amountCents,
        paid.currency,
      );
    }
    return;
  }

  if (event.type === "order.refunded") {
    const orderId = getString(event.data, "id");
    if (!orderId) throw new Error("missing_order_id");
    const payment = await paymentByOrder(env, "polar", orderId);
    const target = polarRefundedProductCents(payment.amount_cents, event.data);
    await reversePurchase(env, "polar", webhookId, event.type, orderId, target);
    await notifyPayment(
      env,
      payment.pending_checkout_id,
      "payment_refunded",
      "payment_refunded:polar:" + webhookId,
      target,
      "USD",
    );
    return;
  }

  await recordUnhandled(env, "polar", webhookId, event.type, getString(event.data, "id"));
}

export async function applyCreemEvent(env: Env, rawBody: string): Promise<void> {
  const event = JSON.parse(rawBody) as {
    id?: string;
    eventType?: string;
    created_at?: number;
    object?: JsonObject;
  };
  if (!event.id || !event.eventType || !event.object) throw new Error("incomplete_event");

  if (event.eventType.startsWith("subscription.")) {
    const result = await syncSubscriptionEvent(env, creemSubscriptionEvent(event.object));
    if (!result.synced) throw new Error("subscription_" + (result.reason || "sync_failed"));
    await recordUnhandled(env, "creem", event.id, event.eventType, getString(event.object, "id"));
    return;
  }

  if (event.eventType === "checkout.completed") {
    const order = getObject(event.object, "order");
    const paid = {
      eventId: event.id,
      eventType: event.eventType,
      provider: "creem" as const,
      pendingId: getString(event.object, "request_id")
        || getString(getObject(event.object, "metadata"), "pendingCheckoutId"),
      checkoutId: getString(event.object, "id"),
      orderId: creemOrderId(event.object),
      productId: creemProductId(event.object),
      amountCents: order?.amount,
      currency: getString(order, "currency")?.toUpperCase(),
      paidAt: new Date(event.created_at || Date.now()).toISOString(),
    };
    if (!paid.pendingId || !paid.checkoutId || !paid.orderId || !paid.productId
      || typeof paid.amountCents !== "number" || !paid.currency || getString(order, "status") !== "paid") {
      throw new Error("incomplete_or_unpaid_order");
    }
    const fulfilled = await fulfillPurchase(env, paid as Parameters<typeof fulfillPurchase>[1]);
    if (fulfilled) {
      await notifyPayment(
        env,
        paid.pendingId,
        "payment_succeeded",
        "payment_succeeded:creem:" + paid.orderId,
        paid.amountCents,
        paid.currency,
      );
    }
    return;
  }

  if (event.eventType === "refund.created" || event.eventType === "dispute.created") {
    const orderId = creemOrderId(event.object);
    if (!orderId) throw new Error("missing_order_id");
    const payment = await paymentByOrder(env, "creem", orderId);
    const target = event.eventType === "dispute.created"
      ? payment.amount_cents
      : refundedProductCents(payment.amount_cents, event.object);
    await reversePurchase(env, "creem", event.id, event.eventType, orderId, target);
    await notifyPayment(
      env,
      payment.pending_checkout_id,
      "payment_refunded",
      "payment_refunded:creem:" + event.id,
      target,
      "USD",
    );
    return;
  }

  await recordUnhandled(env, "creem", event.id, event.eventType, getString(event.object, "id"));
}

export async function applyWebhookEvent(
  env: Env,
  provider: PaymentProvider,
  rawBody: string,
  eventId: string | null,
): Promise<void> {
  if (provider === "stripe") return applyStripeEvent(env, rawBody);
  if (provider === "polar") return applyPolarEvent(env, rawBody, eventId || "");
  if (provider === "waffo") return applyWaffoEvent(env, rawBody);
  return applyCreemEvent(env, rawBody);
}

export async function recordWebhookFailure(
  env: ServiceEnv,
  provider: PaymentProvider,
  eventId: string | null,
  eventType: string | null,
  errorCode: string,
  rawBody: string,
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO webhook_deliveries (id, payment_provider, event_id, event_type, status, error_code, payload) "
    + "VALUES (?, ?, ?, ?, 'failed', ?, ?) "
    + "ON CONFLICT(payment_provider, event_id) DO UPDATE SET attempts = attempts + 1, "
    + "status = 'failed', error_code = excluded.error_code, updated_at = CURRENT_TIMESTAMP",
  ).bind(
    "delivery_" + crypto.randomUUID(),
    provider,
    eventId,
    eventType,
    errorCode.slice(0, 120),
    rawBody.slice(0, 60_000),
  ).run();
}

import type { WebhookEvent, WebhookEventData } from "@waffo/pancake-ts";
import type { Env } from "../../env";
import { fulfillPurchase, type PendingPurchase, type PaymentRow } from "../../domain/fulfillment";
import { findPriceById } from "../billing/plans";
import { isoFromDateString, markSubscriptionCanceled, subscriptionByProviderId } from "../billing/subscriptions";
import { syncSubscriptionEvent } from "../billing/sync";
import { assertWaffoEvent, waffoAmountCents } from "./waffo";

type WaffoEvent = WebhookEvent<WebhookEventData>;

async function recordEvent(env: Env, event: WaffoEvent): Promise<void> {
  await env.DB.prepare("INSERT OR IGNORE INTO payment_events (id, event_type, object_id) VALUES (?, ?, ?)")
    .bind("waffo:" + event.id, event.eventType, event.data.orderId).run();
}

async function applyOrder(env: Env, event: WaffoEvent): Promise<void> {
  const data = event.data;
  const metadata = data.orderMetadata;
  const pendingId = data.orderMerchantExternalId || metadata?.pendingCheckoutId;
  const pending = await env.DB.prepare("SELECT * FROM pending_checkouts WHERE id = ?")
    .bind(pendingId || "").first<PendingPurchase & { provider_checkout_id: string; user_id: string }>();
  if (!pending || !pending.provider_checkout_id) throw new Error("checkout_not_found");
  if (data.paymentStatus !== "succeeded" || data.orderStatus !== "completed") throw new Error("incomplete_or_unpaid_order");
  if (!metadata?.providerProductId || data.merchantProvidedBuyerIdentity !== pending.user_id
    || metadata.pendingCheckoutId !== pending.id || metadata.projectId !== pending.project_id) {
    throw new Error("waffo_order_mismatch");
  }
  const gross = waffoAmountCents(data.chargedAmount ?? data.amount);
  const tax = waffoAmountCents(data.listPrice?.taxAmount ?? data.taxAmount);
  const subtotal = data.listPrice?.subtotal ?? data.subtotal;
  const amountCents = subtotal === undefined ? gross - tax : waffoAmountCents(subtotal);
  if (gross !== amountCents + tax) throw new Error("amount_mismatch");
  await fulfillPurchase(env, {
    eventId: event.id,
    eventType: event.eventType,
    provider: "waffo",
    pendingId: pending.id,
    checkoutId: pending.provider_checkout_id,
    orderId: data.orderId,
    productId: metadata.providerProductId,
    amountCents,
    currency: data.currency.toUpperCase(),
    paidAt: event.timestamp,
  });
}

async function applySubscription(env: Env, event: WaffoEvent): Promise<void> {
  // 收款、待生效和失败事件不代表订阅权益已变更。
  if (["subscription.payment_succeeded", "subscription.plan_change_scheduled", "subscription.plan_change_failed"]
    .includes(event.eventType)) {
    await recordEvent(env, event);
    return;
  }
  const data = event.data;
  const existing = await subscriptionByProviderId(env, "waffo", data.orderId);
  const metadata = data.orderMetadata;
  const priceId = data.productMetadata?.priceId || metadata?.priceId;
  const price = priceId ? await findPriceById(env, priceId) : null;
  if (!existing && (!price || price.payment_provider !== "waffo")) throw new Error("subscription_unknown_price");
  if (price && (price.payment_provider !== "waffo"
    || (!data.productMetadata?.priceId && price.provider_price_id !== metadata?.providerProductId))) {
    throw new Error("product_mismatch");
  }
  const userId = existing?.user_id || metadata?.userId;
  if (!userId || data.merchantProvidedBuyerIdentity !== userId) throw new Error("subscription_unknown_user");
  if (data.currency.toUpperCase() !== (price?.currency || "USD").toUpperCase()) throw new Error("currency_mismatch");
  const status = data.orderStatus === "canceling" ? "active" : data.orderStatus;
  const result = await syncSubscriptionEvent(env, {
    provider: "waffo",
    providerSubscriptionId: data.orderId,
    providerCustomerId: userId,
    providerPriceId: price?.provider_price_id || null,
    userId,
    status,
    quantity: 1,
    currentPeriodStart: isoFromDateString(data.currentPeriodStart),
    currentPeriodEnd: isoFromDateString(data.currentPeriodEnd),
    cancelAtPeriodEnd: data.orderStatus === "canceling",
    canceledAt: isoFromDateString(data.canceledAt),
  });
  if (!result.synced) throw new Error("subscription_" + result.reason);
  if (event.eventType === "subscription.plan_changed" && metadata?.originOrderId
    && metadata.originOrderId !== data.orderId) {
    const origin = await subscriptionByProviderId(env, "waffo", metadata.originOrderId);
    if (origin?.user_id === userId) await markSubscriptionCanceled(env, "waffo", metadata.originOrderId, event.timestamp);
  }
  await recordEvent(env, event);
}

async function applyRefund(env: Env, event: WaffoEvent): Promise<void> {
  const data = event.data;
  const payment = await env.DB.prepare("SELECT * FROM payments WHERE payment_provider = 'waffo' AND order_id = ?")
    .bind(data.orderId).first<PaymentRow>();
  // 订阅退款保留事件，订阅权益由订阅生命周期事件更新。
  if (!payment && await subscriptionByProviderId(env, "waffo", data.orderId)) {
    await recordEvent(env, event);
    return;
  }
  if (!payment) throw new Error("payment_not_found");
  if (data.refundStatus !== "succeeded" || data.currency.toUpperCase() !== "USD") throw new Error("incomplete_refund");
  const amount = waffoAmountCents(data.refundedAmount ?? data.amount);
  const total = waffoAmountCents(data.originalChargedAmount ?? data.originalPayment?.total ?? data.total);
  if (total <= 0 || amount > total) throw new Error("waffo_refund_amount_invalid");

  // 每笔退款独立去重，累计退款按原实收金额折算商品金额，在同一批次中回滚权益。
  const target = "MIN(amount_cents, CAST(ROUND((SELECT COALESCE(SUM(amount_cents), 0) "
    + "FROM waffo_refunds WHERE order_id = payments.order_id) * 1.0 * amount_cents / ?) AS INTEGER))";
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO waffo_refunds (id, order_id, amount_cents) VALUES (?, ?, ?)")
      .bind(event.eventId, data.orderId, amount),
    env.DB.prepare("INSERT OR IGNORE INTO payment_events (id, event_type, object_id) VALUES (?, ?, ?)")
      .bind("waffo:" + event.id, event.eventType, data.orderId),
    env.DB.prepare(
      "UPDATE projects SET support_cents = MAX(0, support_cents - (SELECT MAX(0, " + target
      + " - reversed_cents) FROM payments WHERE id = ?)), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(total, payment.id, payment.project_id),
    env.DB.prepare(
      "UPDATE payments SET reversed_cents = " + target + ", status = CASE WHEN " + target
      + " >= amount_cents THEN 'refunded' ELSE 'paid' END, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(total, total, payment.id),
    env.DB.prepare(
      "UPDATE pending_checkouts SET status = (SELECT status FROM payments WHERE id = ?) WHERE id = ?",
    ).bind(payment.id, payment.pending_checkout_id),
  ]);
}

export async function applyWaffoEvent(env: Env, rawBody: string): Promise<void> {
  const event = JSON.parse(rawBody) as WaffoEvent;
  assertWaffoEvent(env, event);
  if (await env.DB.prepare("SELECT id FROM payment_events WHERE id = ?").bind("waffo:" + event.id).first()) return;
  if (event.eventType === "order.completed") return applyOrder(env, event);
  if (event.eventType === "refund.succeeded") return applyRefund(env, event);
  if (event.eventType.startsWith("subscription.")) return applySubscription(env, event);
  await recordEvent(env, event);
}

import type { Env, PaymentProvider } from "../env";

export interface PendingPurchase {
  id: string;
  project_id: string;
  amount_cents: number;
  provider_product_id: string;
  payment_provider: PaymentProvider;
  status: string;
}

export interface PaidEvent {
  eventId: string;
  eventType: string;
  provider: PaymentProvider;
  pendingId: string;
  checkoutId: string;
  orderId: string;
  productId: string;
  amountCents: number;
  currency: string;
  paidAt: string;
}

export interface PaymentRow {
  id: string;
  project_id: string;
  pending_checkout_id: string;
  amount_cents: number;
  reversed_cents: number;
  status: string;
}

export async function fulfillPurchase(env: Env, event: PaidEvent): Promise<boolean> {
  const pending = await env.DB.prepare("SELECT * FROM pending_checkouts WHERE id = ?")
    .bind(event.pendingId)
    .first<PendingPurchase>();
  if (!pending) throw new Error("checkout_not_found");

  const storedEventId = event.provider + ":" + event.eventId;
  if (await env.DB.prepare("SELECT id FROM payment_events WHERE id = ?").bind(storedEventId).first()) {
    return false;
  }
  if (event.provider !== pending.payment_provider) throw new Error("provider_mismatch");
  if (event.amountCents !== pending.amount_cents) throw new Error("amount_mismatch");
  if (event.currency !== "USD") throw new Error("currency_mismatch");
  if (event.productId !== pending.provider_product_id) throw new Error("product_mismatch");
  if (pending.status !== "creating" && pending.status !== "pending") {
    await env.DB.prepare("INSERT OR IGNORE INTO payment_events (id, event_type, object_id) VALUES (?, ?, ?)")
      .bind(storedEventId, event.eventType, event.checkoutId)
      .run();
    return false;
  }

  const paymentId = "payment_" + event.provider + "_" + event.orderId;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO payment_events (id, event_type, object_id) VALUES (?, ?, ?)")
      .bind(storedEventId, event.eventType, event.checkoutId),
    env.DB.prepare(
      "INSERT INTO payments (id, checkout_id, order_id, pending_checkout_id, project_id, amount_cents, currency, status, payment_provider, paid_at) "
      + "VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?)",
    ).bind(
      paymentId,
      event.checkoutId,
      event.orderId,
      pending.id,
      pending.project_id,
      pending.amount_cents,
      event.currency,
      event.provider,
      event.paidAt,
    ),
    env.DB.prepare(
      "UPDATE projects SET support_cents = support_cents + ?, "
      + "status = CASE WHEN status = 'draft' THEN 'active' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(pending.amount_cents, pending.project_id),
    env.DB.prepare(
      "UPDATE pending_checkouts SET status = 'paid', order_id = ?, provider_checkout_id = ?, completed_at = ? WHERE id = ?",
    ).bind(event.orderId, event.checkoutId, event.paidAt, pending.id),
  ]);
  return true;
}

export async function reversePurchase(
  env: Env,
  provider: PaymentProvider,
  eventId: string,
  eventType: string,
  orderId: string,
  reversalTarget: number,
): Promise<void> {
  const storedEventId = provider + ":" + eventId;
  if (await env.DB.prepare("SELECT id FROM payment_events WHERE id = ?").bind(storedEventId).first()) return;
  const payment = await env.DB.prepare("SELECT * FROM payments WHERE payment_provider = ? AND order_id = ?")
    .bind(provider, orderId)
    .first<PaymentRow>();
  if (!payment) throw new Error("payment_not_found");
  if (payment.status === "disputed" || payment.status === "refunded") return;

  const effectiveTarget = Math.max(
    payment.reversed_cents,
    Math.min(payment.amount_cents, Math.max(0, reversalTarget)),
  );
  const delta = effectiveTarget - payment.reversed_cents;
  const disputed = eventType.includes("dispute");
  const nextStatus = disputed ? "disputed" : effectiveTarget >= payment.amount_cents ? "refunded" : "paid";

  await env.DB.batch([
    env.DB.prepare("INSERT INTO payment_events (id, event_type, object_id) VALUES (?, ?, ?)")
      .bind(storedEventId, eventType, orderId),
    env.DB.prepare("UPDATE payments SET status = ?, reversed_cents = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(nextStatus, effectiveTarget, payment.id),
    env.DB.prepare(
      "UPDATE projects SET support_cents = MAX(0, support_cents - ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(delta, payment.project_id),
    env.DB.prepare(
      "UPDATE pending_checkouts SET status = ? WHERE id = (SELECT pending_checkout_id FROM payments WHERE id = ?)",
    ).bind(nextStatus, payment.id),
  ]);
}

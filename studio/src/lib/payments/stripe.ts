type StripeCheckoutParams = {
  productId: string;
  unitAmountCents: number;
  quantity: number;
  pendingId: string;
  projectId: string;
  successUrl: string;
  cancelUrl: string;
};

export function stripeCheckoutRequest(params: StripeCheckoutParams): URLSearchParams {
  return new URLSearchParams({
    mode: "payment",
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    customer_creation: "always",
    billing_address_collection: "auto",
    "automatic_tax[enabled]": "true",
    "tax_id_collection[enabled]": "true",
    "invoice_creation[enabled]": "true",
    client_reference_id: params.pendingId,
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][product]": params.productId,
    "line_items[0][price_data][unit_amount]": String(params.unitAmountCents),
    "line_items[0][price_data][tax_behavior]": "exclusive",
    "line_items[0][quantity]": String(params.quantity),
    "metadata[pendingCheckoutId]": params.pendingId,
    "metadata[projectId]": params.projectId,
    "metadata[providerProductId]": params.productId,
    "payment_intent_data[metadata][pendingCheckoutId]": params.pendingId,
    "payment_intent_data[metadata][projectId]": params.projectId,
  });
}

export function isStripeCheckoutUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "checkout.stripe.com";
  } catch {
    return false;
  }
}

export function stripeRefundedCents(paymentCents: number, charge: Record<string, unknown>): number {
  const chargedAmount = charge.amount;
  const refundedAmount = charge.amount_refunded;
  if (!Number.isInteger(paymentCents) || paymentCents <= 0
    || typeof chargedAmount !== "number" || !Number.isInteger(chargedAmount) || chargedAmount <= 0
    || typeof refundedAmount !== "number" || !Number.isInteger(refundedAmount) || refundedAmount < 0) {
    return 0;
  }
  return Math.min(paymentCents, Math.round((paymentCents * refundedAmount) / chargedAmount));
}

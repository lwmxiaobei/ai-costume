type JsonObject = Record<string, unknown>;

export function polarCheckoutRequest(
  productId: string,
  amountCents: number,
  pendingId: string,
  projectId: string,
  successUrl: string,
  returnUrl: string,
  customerIpAddress?: string,
): JsonObject {
  return {
    products: [productId],
    prices: {
      [productId]: [{
        amount_type: "fixed",
        price_amount: amountCents,
        price_currency: "usd",
      }],
    },
    success_url: successUrl,
    return_url: returnUrl,
    allow_discount_codes: false,
    metadata: { pendingCheckoutId: pendingId, projectId },
    ...(customerIpAddress ? { customer_ip_address: customerIpAddress } : {}),
  };
}

export function isPolarCheckoutUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "polar.sh" || url.hostname.endsWith(".polar.sh"));
  } catch {
    return false;
  }
}

export function polarRefundedProductCents(paymentCents: number, order: JsonObject): number {
  const refunded = order.refunded_amount;
  if (!Number.isInteger(paymentCents) || paymentCents <= 0
    || typeof refunded !== "number" || !Number.isInteger(refunded) || refunded < 0) {
    return 0;
  }
  return Math.min(paymentCents, refunded);
}

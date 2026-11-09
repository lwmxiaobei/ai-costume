type JsonObject = Record<string, unknown>;

function record(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function creemOrderId(object: JsonObject): string | null {
  const directOrder = object.order;
  const directOrderId = stringValue(directOrder) || stringValue(record(directOrder)?.id);
  if (directOrderId) return directOrderId;
  const transaction = record(object.transaction);
  return stringValue(transaction?.order)
    || stringValue(record(transaction?.order)?.id)
    || stringValue(object.order_id);
}

export function refundedProductCents(paymentCents: number, object: JsonObject): number {
  if (!Number.isInteger(paymentCents) || paymentCents <= 0) return 0;
  const transaction = record(object.transaction);
  const cumulative = transaction?.refunded_amount;
  const totalPaid = transaction?.amount_paid;
  if (typeof cumulative === "number" && cumulative >= 0 && typeof totalPaid === "number" && totalPaid > 0) {
    return Math.min(paymentCents, Math.round((paymentCents * cumulative) / totalPaid));
  }
  const eventRefund = object.refund_amount;
  return typeof eventRefund === "number" && eventRefund >= 0
    ? Math.min(paymentCents, Math.round(eventRefund))
    : 0;
}

export function isCreemCheckoutUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "creem.io" || url.hostname.endsWith(".creem.io"));
  } catch {
    return false;
  }
}

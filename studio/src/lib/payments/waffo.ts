import { TaxCategory, WaffoPancake, verifyWebhook, type WebhookEvent, type WebhookEventData } from "@waffo/pancake-ts";
import type { ServiceEnv } from "../../env";

export function waffoEnvironment(env: ServiceEnv): "test" | "prod" {
  if (env.WAFFO_ENVIRONMENT === "test" || env.WAFFO_ENVIRONMENT === "prod") return env.WAFFO_ENVIRONMENT;
  throw new Error("waffo_environment_invalid");
}

export function isWaffoConfigured(env: ServiceEnv): boolean {
  if (!env.WAFFO_MERCHANT_ID || !env.WAFFO_STORE_ID || !env.WAFFO_PRIVATE_KEY
    || (env.WAFFO_ENVIRONMENT !== "test" && env.WAFFO_ENVIRONMENT !== "prod")) return false;
  try {
    waffoClient(env);
    return true;
  } catch {
    return false;
  }
}

export function waffoClient(env: ServiceEnv): WaffoPancake {
  return new WaffoPancake({
    merchantId: env.WAFFO_MERCHANT_ID!,
    privateKey: env.WAFFO_PRIVATE_KEY!,
    environment: waffoEnvironment(env),
  });
}

export function waffoDisplayAmount(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("waffo_amount_invalid");
  return (cents / 100).toFixed(2);
}

export function waffoAmountCents(value: unknown): number {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error("waffo_amount_invalid");
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error("waffo_amount_invalid");
  return cents;
}

export function waffoCheckoutUrl(value: string, env: ServiceEnv): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || !["pancake.waffo.ai", "checkout.waffo.ai"].includes(url.hostname)
    || url.username || url.password || url.port) {
    throw new Error("waffo_checkout_url_invalid");
  }
  if (waffoEnvironment(env) === "test") url.searchParams.set("test", "true");
  return url.toString();
}

// Waffo 的支付渠道要求 HTTPS 回跳，本地 HTTP 开发时保留收银台完成页。
export function waffoSuccessUrl(value: string): string | undefined {
  return new URL(value).protocol === "https:" ? value : undefined;
}

export function assertWaffoEvent(env: ServiceEnv, event: WebhookEvent<WebhookEventData>): void {
  if (event.storeId !== env.WAFFO_STORE_ID || event.mode !== waffoEnvironment(env)) {
    throw new Error("waffo_event_scope_mismatch");
  }
  if (!event.id || !event.eventId || !event.eventType || !event.data?.orderId
    || !event.timestamp || Number.isNaN(Date.parse(event.timestamp))) throw new Error("incomplete_event");
}

export function verifyWaffoEvent(env: ServiceEnv, body: string, signature: string | undefined) {
  const event = verifyWebhook<WebhookEventData>(body, signature, { environment: waffoEnvironment(env) });
  assertWaffoEvent(env, event);
  return event;
}

export async function createWaffoCheckout(params: {
  env: ServiceEnv;
  productId: string;
  pendingId: string;
  projectId: string;
  quantity: number;
  unitAmountCents: number;
  userId: string;
  buyerEmail: string;
  successUrl: string;
}): Promise<{ id: string; url: string }> {
  const session = await waffoClient(params.env).checkout.authenticated.create({
    productId: params.productId,
    currency: "USD",
    buyerIdentity: params.userId,
    buyerEmail: params.buyerEmail,
    successUrl: waffoSuccessUrl(params.successUrl),
    orderMerchantExternalId: params.pendingId,
    priceSnapshot: {
      amount: waffoDisplayAmount(params.quantity * params.unitAmountCents),
      taxCategory: TaxCategory.SaaS,
    },
    metadata: {
      pendingCheckoutId: params.pendingId,
      projectId: params.projectId,
      userId: params.userId,
      providerProductId: params.productId,
    },
  }, { idempotencyKey: params.pendingId });
  if (!session.sessionId) throw new Error("waffo_checkout_missing_id");
  return { id: session.sessionId, url: waffoCheckoutUrl(session.checkoutUrl, params.env) };
}

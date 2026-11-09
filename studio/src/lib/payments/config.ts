import type { Env, PaymentProvider } from "../../env";
import { isWaffoConfigured } from "./waffo";

export function isProviderConfigured(env: Env, provider: PaymentProvider): boolean {
  if (provider === "waffo") return isWaffoConfigured(env);
  if (provider === "stripe") {
    return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && env.STRIPE_PRODUCT_ID);
  }
  if (provider === "polar") {
    return Boolean(env.POLAR_ACCESS_TOKEN && env.POLAR_WEBHOOK_SECRET && env.POLAR_PRODUCT_ID);
  }
  return Boolean(env.CREEM_API_KEY && env.CREEM_WEBHOOK_SECRET && env.CREEM_PRODUCT_ID);
}

export function activePaymentProvider(env: Env): PaymentProvider | null {
  const preferred = env.PAYMENT_PROVIDER?.toLowerCase();
  if (preferred === "stripe" || preferred === "polar" || preferred === "creem" || preferred === "waffo") {
    return isProviderConfigured(env, preferred) ? preferred : null;
  }
  if (isProviderConfigured(env, "stripe")) return "stripe";
  if (isProviderConfigured(env, "polar")) return "polar";
  if (isProviderConfigured(env, "creem")) return "creem";
  if (isProviderConfigured(env, "waffo")) return "waffo";
  return null;
}

export function providerProductId(env: Env, provider: PaymentProvider): string {
  if (provider === "waffo") return env.WAFFO_PRODUCT_ID!;
  if (provider === "stripe") return env.STRIPE_PRODUCT_ID!;
  if (provider === "polar") return env.POLAR_PRODUCT_ID!;
  return env.CREEM_PRODUCT_ID!;
}

export function unitPriceCents(env: Env): number {
  const value = Number(env.UNIT_PRICE_CENTS || 100);
  return Number.isInteger(value) && value >= 50 && value <= 100_000 ? value : 100;
}

export function appOrigin(env: Env, requestUrl: string): string {
  const configured = env.PUBLIC_APP_URL?.trim();
  if (!configured) return new URL(requestUrl).origin;
  const parsed = new URL(configured);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("PUBLIC_APP_URL must use HTTPS outside localhost.");
  }
  return parsed.origin;
}

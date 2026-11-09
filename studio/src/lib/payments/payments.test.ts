import { describe, expect, it } from "vitest";
import type { Env } from "../../env";
import { activePaymentProvider, unitPriceCents } from "./config";
import { polarRefundedProductCents } from "./polar";
import { stripeCheckoutRequest, stripeRefundedCents } from "./stripe";

describe("payment provider selection", () => {
  it("uses the explicitly configured provider", () => {
    const env = {
      PAYMENT_PROVIDER: "polar",
      POLAR_ACCESS_TOKEN: "token",
      POLAR_WEBHOOK_SECRET: "secret",
      POLAR_PRODUCT_ID: "product",
    } as Env;
    expect(activePaymentProvider(env)).toBe("polar");
  });

  it("does not silently fall through when the preferred provider is incomplete", () => {
    const env = {
      PAYMENT_PROVIDER: "polar",
      STRIPE_SECRET_KEY: "key",
      STRIPE_WEBHOOK_SECRET: "secret",
      STRIPE_PRODUCT_ID: "product",
    } as Env;
    expect(activePaymentProvider(env)).toBeNull();
  });

  it("validates the configured unit price", () => {
    expect(unitPriceCents({ UNIT_PRICE_CENTS: "250" } as Env)).toBe(250);
    expect(unitPriceCents({ UNIT_PRICE_CENTS: "oops" } as Env)).toBe(100);
  });
});

describe("provider contracts", () => {
  it("creates Stripe quantity and metadata fields", () => {
    const request = stripeCheckoutRequest({
      productId: "prod_123",
      unitAmountCents: 125,
      quantity: 3,
      pendingId: "checkout_123",
      projectId: "project_123",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/",
    });
    expect(request.get("line_items[0][quantity]")).toBe("3");
    expect(request.get("line_items[0][price_data][unit_amount]")).toBe("125");
    expect(request.get("metadata[pendingCheckoutId]")).toBe("checkout_123");
  });

  it("caps cumulative refunds to the paid product amount", () => {
    expect(stripeRefundedCents(1_000, { amount: 1_200, amount_refunded: 600 })).toBe(500);
    expect(polarRefundedProductCents(1_000, { refunded_amount: 1_500 })).toBe(1_000);
  });
});

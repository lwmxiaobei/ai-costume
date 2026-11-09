import { describe, expect, it } from "vitest";
import {
  EMPTY_ENTITLEMENT,
  currentPeriod,
  hasFeature,
  quotaLimit,
  withinQuota,
  type Entitlement,
} from "./entitlements";
import { parseFeatures, parseQuotas, toPlanView, type PlanPriceRow, type PlanRow } from "./plans";
import {
  isoFromDateString,
  isoFromEpochSeconds,
  normalizeSubscriptionStatus,
} from "./subscriptions";
import { isStripeBillingPortalUrl, stripeSubscriptionCheckoutRequest } from "./stripe-billing";
import { stripeSubscriptionEvent } from "./sync";

const plan: PlanRow = {
  id: "pro",
  name: "Pro",
  description: "",
  sort_order: 1,
  is_default: 0,
  is_active: 1,
  seat_based: 1,
  trial_days: 14,
  features: '["core","analytics"]',
  quotas: '{"projects":50,"api_calls":-1}',
};

const price: PlanPriceRow = {
  id: "pro_monthly",
  plan_id: "pro",
  payment_provider: "stripe",
  provider_price_id: "price_123",
  billing_interval: "month",
  amount_cents: 1_900,
  currency: "USD",
  usage_type: "licensed",
  is_active: 1,
};

function entitlement(overrides: Partial<Entitlement> = {}): Entitlement {
  return {
    ...EMPTY_ENTITLEMENT,
    planId: "pro",
    features: ["core", "analytics"],
    quotas: { projects: 3, api_calls: -1 },
    seats: 1,
    ...overrides,
  };
}

describe("plan catalog", () => {
  it("parses feature and quota JSON defensively", () => {
    expect(parseFeatures('["a","b"]')).toEqual(["a", "b"]);
    expect(parseFeatures('{"a":1}')).toEqual([]);
    expect(parseFeatures("not json")).toEqual([]);
    expect(parseQuotas('{"projects":5,"bad":1.5}')).toEqual({ projects: 5 });
    expect(parseQuotas("[]")).toEqual({});
  });

  it("attaches only the prices that belong to the plan", () => {
    const view = toPlanView(plan, [price, { ...price, id: "other", plan_id: "free" }]);
    expect(view.prices).toHaveLength(1);
    expect(view.prices[0]).toMatchObject({ id: "pro_monthly", interval: "month", amountCents: 1_900 });
    expect(view.seatBased).toBe(true);
    expect(view.trialDays).toBe(14);
  });
});

describe("entitlements", () => {
  it("reports features from the effective plan", () => {
    expect(hasFeature(entitlement(), "analytics")).toBe(true);
    expect(hasFeature(entitlement(), "sso")).toBe(false);
  });

  it("treats a missing quota as zero and -1 as unlimited", () => {
    expect(quotaLimit(entitlement(), "projects")).toBe(3);
    expect(quotaLimit(entitlement(), "unknown")).toBe(0);
    expect(withinQuota(entitlement(), "api_calls", 999_999)).toBe(true);
    expect(withinQuota(entitlement(), "unknown", 0)).toBe(false);
  });

  it("stops at the quota boundary and scales limits by seats", () => {
    expect(withinQuota(entitlement(), "projects", 2)).toBe(true);
    expect(withinQuota(entitlement(), "projects", 3)).toBe(false);
    expect(withinQuota(entitlement({ seats: 3 }), "projects", 8)).toBe(true);
  });

  it("formats the usage period as a calendar month", () => {
    expect(currentPeriod(new Date("2026-08-25T10:00:00Z"))).toBe("2026-08");
  });
});

describe("subscription normalization", () => {
  it("maps provider statuses onto the stored set", () => {
    expect(normalizeSubscriptionStatus("active")).toBe("active");
    expect(normalizeSubscriptionStatus("incomplete_expired")).toBe("incomplete");
    expect(normalizeSubscriptionStatus("revoked")).toBe("canceled");
    expect(normalizeSubscriptionStatus("something_else")).toBeNull();
    expect(normalizeSubscriptionStatus(undefined)).toBeNull();
  });

  it("converts provider timestamps or returns null", () => {
    expect(isoFromEpochSeconds(1_767_225_600)).toBe("2026-01-01T00:00:00.000Z");
    expect(isoFromEpochSeconds(0)).toBeNull();
    expect(isoFromEpochSeconds("2026-01-01")).toBeNull();
    expect(isoFromDateString("2026-01-01T00:00:00Z")).toBe("2026-01-01T00:00:00.000Z");
    expect(isoFromDateString("not a date")).toBeNull();
  });

  it("reads price, seats and cancellation from a Stripe subscription", () => {
    const event = stripeSubscriptionEvent({
      id: "sub_1",
      status: "trialing",
      customer: "cus_1",
      cancel_at_period_end: true,
      current_period_end: 1_767_225_600,
      trial_end: 1_764_547_200,
      metadata: { userId: "user_1" },
      items: { data: [{ id: "si_1", price: { id: "price_123" }, quantity: 5 }] },
    });
    expect(event).toMatchObject({
      provider: "stripe",
      providerSubscriptionId: "sub_1",
      providerCustomerId: "cus_1",
      providerPriceId: "price_123",
      quantity: 5,
      userId: "user_1",
      cancelAtPeriodEnd: true,
    });
    expect(event.currentPeriodEnd).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("Stripe subscription checkout", () => {
  it("sends a trial, seat control and the identifiers needed to sync back", () => {
    const body = stripeSubscriptionCheckoutRequest({
      customerId: "cus_1",
      providerPriceId: "price_123",
      quantity: 3,
      trialDays: 14,
      seatBased: true,
      userId: "user_1",
      planId: "pro",
      priceId: "pro_monthly",
      successUrl: "https://example.com/account",
      cancelUrl: "https://example.com/pricing",
    });
    expect(body.get("mode")).toBe("subscription");
    expect(body.get("line_items[0][quantity]")).toBe("3");
    expect(body.get("line_items[0][adjustable_quantity][enabled]")).toBe("true");
    expect(body.get("subscription_data[trial_period_days]")).toBe("14");
    expect(body.get("subscription_data[metadata][userId]")).toBe("user_1");
    expect(body.get("subscription_data[metadata][priceId]")).toBe("pro_monthly");
  });

  it("omits trial and seat controls for a fixed single seat price", () => {
    const body = stripeSubscriptionCheckoutRequest({
      customerId: "cus_1",
      providerPriceId: "price_123",
      quantity: 1,
      trialDays: 0,
      seatBased: false,
      userId: "user_1",
      planId: "pro",
      priceId: "pro_monthly",
      successUrl: "https://example.com/account",
      cancelUrl: "https://example.com/pricing",
    });
    expect(body.get("subscription_data[trial_period_days]")).toBeNull();
    expect(body.get("line_items[0][adjustable_quantity][enabled]")).toBeNull();
  });

  it("only accepts a Stripe hosted portal URL", () => {
    expect(isStripeBillingPortalUrl("https://billing.stripe.com/session/abc")).toBe(true);
    expect(isStripeBillingPortalUrl("https://evil.example.com/session")).toBe(false);
    expect(isStripeBillingPortalUrl(null)).toBe(false);
  });
});

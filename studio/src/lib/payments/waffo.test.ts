import { generateKeyPairSync, sign, verify } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppBindings, Env } from "../../env";
import type { SessionAccount } from "../auth";
import { registerBillingRoutes } from "../billing/routes";
import { userEntitlement } from "../billing/entitlements";
import { activePaymentProvider } from "./config";
import { registerPaymentRoutes } from "./routes";
import { applyWaffoEvent } from "./waffo-events";
import { waffoAmountCents, waffoCheckoutUrl, waffoDisplayAmount } from "./waffo";

const sessionUserMock = vi.hoisted(() => vi.fn<() => Promise<SessionAccount | null>>());
vi.mock("../auth", async () => ({
  ...(await vi.importActual<typeof import("../auth")>("../auth")),
  isBetterAuthConfigured: () => true,
  sessionUser: () => sessionUserMock(),
}));
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKey = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
const user: SessionAccount = {
  id: "user_1", sessionId: "session_1", name: "Test", email: "buyer@example.test",
  emailVerified: true, image: null, role: "user", banned: false, twoFactorEnabled: false, locale: "en",
};

function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const name of readdirSync("migrations").filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync("migrations/" + name, "utf8"));
  }
  function prepare(sql: string, values: SQLInputValue[] = []) {
    const execute = () => ({ success: true, meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } });
    return {
      bind: (...bound: SQLInputValue[]) => prepare(sql, bound),
      first: async () => sqlite.prepare(sql).get(...values) || null,
      all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
      run: async () => execute(),
      execute,
    };
  }
  const binding = {
    prepare,
    batch: async (statements: ReturnType<typeof prepare>[]) => {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((statement) => statement.execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
  sqlite.prepare("INSERT INTO users (id, name, email) VALUES (?, ?, ?)").run(user.id, user.name, user.email);
  sqlite.exec("INSERT INTO projects (id, canonical_url, url, name) VALUES ('project_550e8400-e29b-41d4-a716-446655440000', 'https://example.test', 'https://example.test', 'Example')");
  sqlite.exec("INSERT INTO plan_prices (id, plan_id, payment_provider, provider_price_id, billing_interval, amount_cents) "
    + "VALUES ('waffo_pro_monthly', 'pro', 'waffo', 'PROD_5WS25jzojdmu39spZ2Q57R', 'month', 1900), "
    + "('waffo_business_monthly', 'business', 'waffo', 'PROD_6WS25jzojdmu39spZ2Q57R', 'month', 4900), "
    + "('stripe_pro_monthly', 'pro', 'stripe', 'price_pro', 'month', 1900)");
  return { sqlite, binding };
}

describe("Waffo payment integration", () => {
  let db: ReturnType<typeof database>;
  let env: Env;
  let app: Hono<AppBindings>;
  let pending: Promise<unknown>[];
  const sdkRequests: { path: string; body: Record<string, unknown>; headers: Headers }[] = [];
  beforeEach(() => {
    db = database();
    env = {
      DB: db.binding, APP_ENV: "development", RATE_LIMIT_DISABLED: "true", PAYMENT_PROVIDER: "waffo",
      WAFFO_MERCHANT_ID: "MER_7dpBd17AoO1Z8ROUXNvKMw", WAFFO_STORE_ID: "STO_5WS25jzojdmu39spZ2Q57R",
      WAFFO_ENVIRONMENT: "test", WAFFO_PRIVATE_KEY: privateKey, WAFFO_PRODUCT_ID: "PROD_7dpBd17AoO1Z8ROUXNvKMw",
    } as Env;
    sessionUserMock.mockResolvedValue(user);
    vi.stubEnv("WAFFO_WEBHOOK_TEST_PUBLIC_KEY", publicKey);
    sdkRequests.length = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: string, init: RequestInit) => {
      const path = new URL(input).pathname;
      const headers = new Headers(init.headers);
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      sdkRequests.push({ path, headers, body });
      if (headers.has("authorization")) {
        expect(headers.get("authorization")).toBe("Bearer test-token");
        expect(headers.get("x-environment")).toBe("test");
      } else {
        const canonical = "POST\n" + path + "\n" + headers.get("x-timestamp") + "\n"
          + (await import("node:crypto")).createHash("sha256").update(String(init.body)).digest("base64");
        expect(verify("RSA-SHA256", Buffer.from(canonical), publicKey, Buffer.from(headers.get("x-signature")!, "base64"))).toBe(true);
        expect(headers.get("x-merchant-id")).toBe(env.WAFFO_MERCHANT_ID);
      }
      const response = path.includes("issue-session-token")
        ? { token: "test-token", expiresAt: "2027-01-01T00:00:00Z", portalUrl: "https://pancake.waffo.ai/consumer/portal/store/STO_test" }
        : path.includes("subscription-order/cancel-order")
          ? { orderId: "ORD_7dpBd17AoO1Z8ROUXNvKMw", status: "canceling" }
          : path.includes("reactivate-order")
            ? { orderId: "ORD_7dpBd17AoO1Z8ROUXNvKMw", status: "active" }
          : { sessionId: "cs_test", checkoutUrl: "https://checkout.waffo.ai/store/test/checkout/cs_test", expiresAt: "2027-01-01T00:00:00Z" };
      return Response.json({ data: response });
    }));
    pending = [];
    app = new Hono<AppBindings>();
    registerPaymentRoutes(app);
    registerBillingRoutes(app);
  });
  afterEach(async () => {
    await Promise.all(pending);
    db.sqlite.close();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  function request(path: string, init: RequestInit = {}) {
    return app.request(path, init, env, {
      waitUntil: (promise: Promise<unknown>) => { pending.push(promise); },
      passThroughOnException: () => undefined,
      props: {},
    });
  }
  function event(type = "order.completed", changes: Record<string, unknown> = {}, id = "delivery_1") {
    return {
      id, eventId: id, eventType: type, timestamp: new Date().toISOString(), storeId: env.WAFFO_STORE_ID,
      mode: "test", data: {
        orderId: "ORD_order", orderStatus: "completed", paymentStatus: "succeeded", buyerEmail: user.email,
        merchantProvidedBuyerIdentity: user.id, orderMerchantExternalId: "checkout_test", currency: "USD",
        amount: "3.30", taxAmount: "0.30", listPrice: { total: "3.30", subtotal: "3.00", taxAmount: "0.30" },
        orderMetadata: { pendingCheckoutId: "checkout_test", projectId: "project_550e8400-e29b-41d4-a716-446655440000", providerProductId: "PROD_7dpBd17AoO1Z8ROUXNvKMw", userId: user.id },
        ...changes,
      },
    };
  }
  function pendingCheckout() {
    db.sqlite.exec("INSERT INTO pending_checkouts (id, project_id, user_id, quantity, unit_amount_cents, amount_cents, "
      + "provider_checkout_id, provider_product_id, payment_provider, status) "
      + "VALUES ('checkout_test', 'project_550e8400-e29b-41d4-a716-446655440000', 'user_1', 3, 100, 300, 'cs_test', 'PROD_7dpBd17AoO1Z8ROUXNvKMw', 'waffo', 'pending')");
  }
  async function webhook(payload: ReturnType<typeof event>, signatureBody?: string) {
    const body = JSON.stringify(payload, null, 2);
    const timestamp = Date.now().toString();
    const signature = Buffer.from(sign("RSA-SHA256", Buffer.from(timestamp + "." + (signatureBody ?? body)), keys.privateKey)).toString("base64");
    return request("/api/webhooks/waffo", { method: "POST", body, headers: { "x-waffo-signature": "t=" + timestamp + ",v1=" + signature } });
  }

  it("keeps incomplete credentials disabled and converts USD without losing cents", () => {
    expect(activePaymentProvider(env)).toBe("waffo");
    expect(activePaymentProvider({ ...env, WAFFO_PRIVATE_KEY: "<paste-your-private-key>" })).toBeNull();
    expect(waffoDisplayAmount(101)).toBe("1.01");
    expect(waffoAmountCents("19.90")).toBe(1990);
    expect(() => waffoAmountCents("1.001")).toThrow();
    expect(() => waffoCheckoutUrl("https://checkout.waffo.ai.attacker.test/pay", env)).toThrow();
  });

  it("uses the real SDK to sign checkout, total the quantity, and preserve server identity", async () => {
    const init = { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "checkout-test-key" }, body: JSON.stringify({ projectId: "project_550e8400-e29b-41d4-a716-446655440000", quantity: 3 }) };
    const response = await request("/api/checkout", init);
    expect(response.status).toBe(200);
    const result = await response.json() as { checkoutUrl: string; requestId: string };
    expect(result.checkoutUrl).toContain("?test=true#token=test-token");
    expect(result.checkoutUrl).not.toContain(privateKey);
    const checkout = sdkRequests.find((entry) => entry.path.includes("checkout/create-session"))!;
    expect(checkout.body.priceSnapshot).toEqual({ amount: "3.00", taxCategory: "saas" });
    expect(checkout.body).not.toHaveProperty("successUrl");
    expect(checkout.headers.get("x-idempotency-key")).toBe(result.requestId);
    expect(sdkRequests.find((entry) => entry.path.includes("issue-session-token"))?.body.buyerIdentity).toBe(user.id);
    expect((await request("/api/checkout", init)).status).toBe(200);
    expect(sdkRequests).toHaveLength(2);
  });

  it("authenticates checkout and refuses prices belonging to another provider", async () => {
    sessionUserMock.mockResolvedValue(null);
    expect((await request("/api/billing/checkout", { method: "POST" })).status).toBe(401);
    sessionUserMock.mockResolvedValue(user);
    expect((await request("/api/billing/checkout", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ priceId: "stripe_pro_monthly" }),
    })).status).toBe(404);
    const plans = await (await request("/api/billing/plans")).json() as { plans: { prices: { provider: string }[] }[] };
    expect(plans.plans.flatMap((plan: { prices: { provider: string }[] }) => plan.prices).every((price: { provider: string }) => price.provider === "waffo")).toBe(true);
    expect(sdkRequests).toHaveLength(0);
  });

  it("verifies raw signed webhooks, persists before background work, and deduplicates fulfillment", async () => {
    pendingCheckout();
    const payload = event();
    const response = await webhook(payload);
    expect(response.status).toBe(200);
    expect(db.sqlite.prepare("SELECT payload FROM webhook_deliveries").get()?.payload).toBe(JSON.stringify(payload, null, 2));
    await Promise.all(pending);
    expect(db.sqlite.prepare("SELECT support_cents FROM projects").get()?.support_cents).toBe(300);
    expect(db.sqlite.prepare("SELECT status FROM webhook_deliveries").get()?.status).toBe("resolved");
    expect((await webhook(payload)).status).toBe(200);
    expect(db.sqlite.prepare("SELECT COUNT(*) AS total FROM payments").get()?.total).toBe(1);
    expect((await webhook(event(), "{}")).status).toBe(401);
    expect((await webhook({ ...event(), mode: "prod" })).status).toBe(401);
    expect((await webhook({ ...event(), storeId: "STO_other" })).status).toBe(401);
  });

  it("retains failed fulfillment for replay without changing a project's balance", async () => {
    pendingCheckout();
    await webhook(event("order.completed", { amount: "1.10", listPrice: { total: "1.10", subtotal: "1.00", taxAmount: "0.10" } }));
    await Promise.all(pending);
    expect(db.sqlite.prepare("SELECT status, error_code FROM webhook_deliveries").get()).toMatchObject({ status: "failed", error_code: "amount_mismatch" });
    expect(db.sqlite.prepare("SELECT support_cents FROM projects").get()?.support_cents).toBe(0);
  });

  it("accumulates separate refunds, prorates tax, and ignores repeated business refund IDs", async () => {
    pendingCheckout();
    await applyWaffoEvent(env, JSON.stringify(event()));
    const refund = (id: string, amount: string) => event("refund.succeeded", {
      refundStatus: "succeeded", refundedAmount: amount, originalChargedAmount: "3.30",
    }, id);
    await applyWaffoEvent(env, JSON.stringify(refund("refund_1", "1.10")));
    expect(db.sqlite.prepare("SELECT support_cents FROM projects").get()?.support_cents).toBe(200);
    await applyWaffoEvent(env, JSON.stringify({ ...refund("refund_1", "1.10"), id: "redelivery_1" }));
    expect(db.sqlite.prepare("SELECT support_cents FROM projects").get()?.support_cents).toBe(200);
    await applyWaffoEvent(env, JSON.stringify(refund("refund_2", "2.20")));
    expect(db.sqlite.prepare("SELECT support_cents FROM projects").get()?.support_cents).toBe(0);
    expect(db.sqlite.prepare("SELECT reversed_cents, status FROM payments").get()).toMatchObject({ reversed_cents: 300, status: "refunded" });
  });

  it("syncs activation, renewal, cancellation and plan changes without granting scheduled changes early", async () => {
    const subscription = (type: string, id: string, changes: Record<string, unknown> = {}) => event(type, {
      orderId: "ORD_7dpBd17AoO1Z8ROUXNvKMw", orderStatus: "active", amount: "19.00", taxAmount: "0.00",
      orderMetadata: { userId: user.id, priceId: "waffo_pro_monthly", providerProductId: "PROD_5WS25jzojdmu39spZ2Q57R" },
      currentPeriodStart: "2026-10-20", currentPeriodEnd: "2026-11-20", ...changes,
    }, id);
    await applyWaffoEvent(env, JSON.stringify(subscription("subscription.activated", "activated")));
    expect((await userEntitlement(env, user.id)).planId).toBe("pro");
    await applyWaffoEvent(env, JSON.stringify(subscription("subscription.payment_succeeded", "payment", { orderStatus: undefined, currentPeriodEnd: undefined })));
    expect((await userEntitlement(env, user.id)).currentPeriodEnd).toBe("2026-11-20T00:00:00.000Z");
    await applyWaffoEvent(env, JSON.stringify(subscription("subscription.renewed", "renewed", { currentPeriodEnd: "2026-12-20" })));
    expect((await userEntitlement(env, user.id)).currentPeriodEnd).toBe("2026-12-20T00:00:00.000Z");
    await applyWaffoEvent(env, JSON.stringify(subscription("subscription.canceling", "canceling", { orderStatus: "canceling" })));
    expect((await userEntitlement(env, user.id)).cancelAtPeriodEnd).toBe(true);
    await applyWaffoEvent(env, JSON.stringify(subscription("subscription.uncanceled", "uncanceled")));
    expect((await userEntitlement(env, user.id)).cancelAtPeriodEnd).toBe(false);
    await applyWaffoEvent(env, JSON.stringify(subscription("subscription.plan_change_scheduled", "scheduled", { productMetadata: { priceId: "waffo_business_monthly" } })));
    expect((await userEntitlement(env, user.id)).planId).toBe("pro");
    await applyWaffoEvent(env, JSON.stringify(subscription("subscription.plan_changed", "changed", { productMetadata: { priceId: "waffo_business_monthly" } })));
    expect((await userEntitlement(env, user.id)).planId).toBe("business");
    await applyWaffoEvent(env, JSON.stringify(subscription("subscription.canceled", "canceled", { orderStatus: "canceled" })));
    expect((await userEntitlement(env, user.id)).planId).toBe("free");
  });

  it("runs subscription checkout, portal, cancel, resume and plan-change through the SDK", async () => {
    const post = (path: string, body: unknown = {}) => request(path, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const checkout = await post("/api/billing/checkout", { priceId: "waffo_pro_monthly" });
    expect(checkout.status).toBe(200);
    expect(sdkRequests.find((entry) => entry.path.includes("checkout/create-session"))?.body).toMatchObject({
      productId: "PROD_5WS25jzojdmu39spZ2Q57R", metadata: { userId: user.id, priceId: "waffo_pro_monthly" },
    });
    await applyWaffoEvent(env, JSON.stringify(event("subscription.activated", {
      orderId: "ORD_7dpBd17AoO1Z8ROUXNvKMw", orderStatus: "active",
      orderMetadata: { userId: user.id, priceId: "waffo_pro_monthly", providerProductId: "PROD_5WS25jzojdmu39spZ2Q57R" },
      currentPeriodEnd: "2026-11-20",
    })));
    expect((await post("/api/billing/cancel", { atPeriodEnd: false })).status).toBe(400);
    const cancel = await post("/api/billing/cancel", { atPeriodEnd: true });
    expect(cancel.status).toBe(200);
    expect((await userEntitlement(env, user.id)).cancelAtPeriodEnd).toBe(true);
    expect((await post("/api/billing/resume")).status).toBe(200);
    expect((await userEntitlement(env, user.id)).cancelAtPeriodEnd).toBe(false);
    const portal = await post("/api/billing/portal");
    expect(portal.status).toBe(200);
    expect(await portal.json()).toMatchObject({ portalUrl: expect.stringContaining("#token=test-token") });
    const change = await post("/api/billing/change", { priceId: "waffo_business_monthly" });
    expect(change.status).toBe(200);
    expect(await change.json()).toMatchObject({ checkoutUrl: expect.stringContaining("#token=test-token") });
    expect(sdkRequests.filter((entry) => entry.path.includes("checkout/create-session")).at(-1)?.body).toMatchObject({
      originOrderId: "ORD_7dpBd17AoO1Z8ROUXNvKMw", withTrial: false,
    });
    expect((await userEntitlement(env, user.id)).planId).toBe("pro");
  });
});

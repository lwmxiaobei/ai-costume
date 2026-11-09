import type { Context, Hono } from "hono";
import type { AppBindings } from "../../env";
import { auditActor, recordAudit } from "../audit";
import { requireJsonBody, requireSession, requireVerifiedEmail } from "../guard";
import { appOrigin, activePaymentProvider } from "../payments/config";
import { rateLimit } from "../security/rate-limit";
import {
  subscriptionCancelSchema,
  subscriptionChangeSchema,
  subscriptionCheckoutSchema,
} from "../validation";
import { currentPeriod, metricUsage, userEntitlement } from "./entitlements";
import { findPriceById, getPlan, listPlans } from "./plans";
import {
  activeSubscription,
  billingCustomerId,
  linkBillingCustomer,
} from "./subscriptions";
import {
  cancelStripeSubscriptionNow,
  changeStripeSubscriptionPrice,
  createStripeCustomer,
  createStripePortalSession,
  createStripeSubscriptionCheckout,
  setStripeCancelAtPeriodEnd,
  StripeApiError,
} from "./stripe-billing";
import { syncStripeSubscription } from "./sync";
import { createWaffoPortalLink, createWaffoSubscriptionCheckout, resumeWaffoSubscription } from "./waffo-billing";
import { waffoClient } from "../payments/waffo";

function stripeUnavailable(context: Context<AppBindings>) {
  return context.json(
    { code: "subscriptions_unavailable", error: "Subscription billing requires Stripe or Waffo." },
    503,
  );
}

export function registerBillingRoutes(app: Hono<AppBindings>): void {
  app.get("/api/billing/plans", async (context) => {
    const plans = await listPlans(context.env);
    const provider = activePaymentProvider(context.env);
    return context.json({
      provider,
      plans: plans.map((plan) => ({ ...plan, prices: plan.prices.filter((price) => price.provider === provider) })),
    });
  });

  app.get("/api/billing/subscription", requireSession(), async (context) => {
    const user = context.get("user");
    const [entitlement, subscription] = await Promise.all([
      userEntitlement(context.env, user.id),
      activeSubscription(context.env, user.id),
    ]);
    const period = currentPeriod();
    const usage = await Promise.all(
      Object.keys(entitlement.quotas).map(async (metric) => [
        metric,
        await metricUsage(context.env, user.id, metric, period),
      ] as const),
    );
    return context.json({
      entitlement,
      usage: { period, metrics: Object.fromEntries(usage) },
      subscription: subscription
        ? {
            id: subscription.id,
            planId: subscription.plan_id,
            priceId: subscription.price_id,
            provider: subscription.payment_provider,
            status: subscription.status,
            quantity: subscription.quantity,
            currentPeriodEnd: subscription.current_period_end,
            cancelAtPeriodEnd: subscription.cancel_at_period_end === 1,
            trialEnd: subscription.trial_end,
          }
        : null,
    });
  });

  app.post(
    "/api/billing/checkout",
    requireSession(),
    requireVerifiedEmail(),
    rateLimit({ scope: "billing_checkout", limit: 10, windowSeconds: 300, by: "user" }),
    requireJsonBody(),
    async (context) => {
      const provider = activePaymentProvider(context.env);
      if (provider !== "stripe" && provider !== "waffo") return stripeUnavailable(context);
      const parsed = subscriptionCheckoutSchema.safeParse(await context.req.json().catch(() => null));
      if (!parsed.success) {
        return context.json({ code: "invalid_checkout", error: "Invalid checkout details." }, 400);
      }
      const price = await findPriceById(context.env, parsed.data.priceId);
      if (!price || price.payment_provider !== provider) {
        return context.json({ code: "price_not_found", error: "Price not found." }, 404);
      }
      const plan = await getPlan(context.env, price.plan_id);
      if (!plan || plan.is_active !== 1) {
        return context.json({ code: "plan_not_found", error: "Plan not found." }, 404);
      }

      const user = context.get("user");
      if (await activeSubscription(context.env, user.id)) {
        return context.json({
          code: "subscription_exists",
          error: "Change the current subscription instead of starting a new one.",
        }, 409);
      }

      if (provider === "waffo" && (parsed.data.quantity || 1) !== 1) {
        return context.json({ code: "invalid_checkout", error: "Waffo subscriptions support one seat per checkout." }, 400);
      }

      try {
        if (provider === "waffo") {
          const checkout = await createWaffoSubscriptionCheckout(context.env, {
            price,
            userId: user.id,
            buyerEmail: user.email,
            successUrl: appOrigin(context.env, context.req.url) + "/account?subscription=success",
          });
          await recordAudit(context.env, auditActor(user), context.req.raw.headers, {
            action: "billing.checkout_started",
            targetType: "plan",
            targetId: plan.id,
            metadata: { priceId: price.id, checkoutId: checkout.id },
          });
          context.header("Cache-Control", "no-store");
          return context.json({ checkoutUrl: checkout.url });
        }
        let customerId = await billingCustomerId(context.env, user.id, "stripe");
        if (!customerId) {
          customerId = await createStripeCustomer(context.env, user);
          await linkBillingCustomer(context.env, user.id, "stripe", customerId);
        }
        const origin = appOrigin(context.env, context.req.url);
        const checkout = await createStripeSubscriptionCheckout(context.env, {
          customerId,
          providerPriceId: price.provider_price_id,
          quantity: plan.seat_based === 1 ? parsed.data.quantity || 1 : 1,
          trialDays: plan.trial_days,
          seatBased: plan.seat_based === 1,
          userId: user.id,
          planId: plan.id,
          priceId: price.id,
          successUrl: origin + "/account?subscription=success",
          cancelUrl: origin + "/pricing?subscription=canceled",
        });
        await recordAudit(context.env, auditActor(user), context.req.raw.headers, {
          action: "billing.checkout_started",
          targetType: "plan",
          targetId: plan.id,
          metadata: { priceId: price.id, checkoutId: checkout.id },
        });
        return context.json({ checkoutUrl: checkout.url });
      } catch (error) {
        console.error("billing_checkout_error", error instanceof Error ? error.message : "unknown");
        return context.json({ code: "provider_error", error: "The payment provider could not start checkout." }, 502);
      }
    },
  );

  app.post(
    "/api/billing/portal",
    requireSession(),
    rateLimit({ scope: "billing_portal", limit: 10, windowSeconds: 300, by: "user" }),
    async (context) => {
      if (activePaymentProvider(context.env) === "waffo") {
        try {
          const url = await createWaffoPortalLink(context.env, context.get("user").id);
          context.header("Cache-Control", "no-store");
          return context.json({ portalUrl: url });
        } catch {
          return context.json({ code: "provider_error", error: "Waffo could not open the portal." }, 502);
        }
      }
      if (activePaymentProvider(context.env) !== "stripe") return stripeUnavailable(context);
      const user = context.get("user");
      const customerId = await billingCustomerId(context.env, user.id, "stripe");
      if (!customerId) {
        return context.json({ code: "no_billing_account", error: "No billing account yet." }, 404);
      }
      try {
        const origin = appOrigin(context.env, context.req.url);
        const url = await createStripePortalSession(context.env, customerId, origin + "/account");
        return context.json({ portalUrl: url });
      } catch (error) {
        console.error("billing_portal_error", error instanceof Error ? error.message : "unknown");
        return context.json({ code: "provider_error", error: "Stripe could not open the portal." }, 502);
      }
    },
  );

  app.post(
    "/api/billing/cancel",
    requireSession(),
    rateLimit({ scope: "billing_cancel", limit: 10, windowSeconds: 300, by: "user" }),
    requireJsonBody(),
    async (context) => {
      const provider = activePaymentProvider(context.env);
      if (provider !== "stripe" && provider !== "waffo") return stripeUnavailable(context);
      const parsed = subscriptionCancelSchema.safeParse(await context.req.json().catch(() => ({})));
      if (!parsed.success) {
        return context.json({ code: "invalid_request", error: "Invalid cancellation request." }, 400);
      }
      const user = context.get("user");
      const subscription = await activeSubscription(context.env, user.id);
      if (!subscription || subscription.payment_provider !== provider) {
        return context.json({ code: "no_subscription", error: "No active subscription." }, 404);
      }
      const atPeriodEnd = parsed.data.atPeriodEnd !== false;
      if (provider === "waffo" && !atPeriodEnd) {
        return context.json({ code: "invalid_request", error: "Waffo cancels active subscriptions at period end." }, 400);
      }
      try {
        if (provider === "waffo") {
          const result = await waffoClient(context.env).orders.cancelSubscription({ orderId: subscription.provider_subscription_id });
          await context.env.DB.prepare(
            "UPDATE subscriptions SET cancel_at_period_end = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).bind(result.status === "canceling" ? 1 : 0, result.status === "canceling" ? subscription.status : "canceled", subscription.id).run();
          await recordAudit(context.env, auditActor(user), context.req.raw.headers, {
            action: "billing.subscription_canceled",
            targetType: "subscription",
            targetId: subscription.id,
            metadata: { atPeriodEnd: result.status === "canceling", reason: parsed.data.reason || "" },
          });
          return context.json({ canceled: true, atPeriodEnd: result.status === "canceling" });
        }
        const updated = atPeriodEnd
          ? await setStripeCancelAtPeriodEnd(context.env, subscription.provider_subscription_id, true)
          : await cancelStripeSubscriptionNow(context.env, subscription.provider_subscription_id);
        await syncStripeSubscription(context.env, updated);
        await recordAudit(context.env, auditActor(user), context.req.raw.headers, {
          action: "billing.subscription_canceled",
          targetType: "subscription",
          targetId: subscription.id,
          metadata: { atPeriodEnd, reason: parsed.data.reason || "" },
        });
        return context.json({ canceled: true, atPeriodEnd });
      } catch (error) {
        const status = error instanceof StripeApiError ? error.status : 502;
        console.error("billing_cancel_error", status);
        return context.json({ code: "provider_error", error: "The payment provider could not cancel." }, 502);
      }
    },
  );

  app.post(
    "/api/billing/resume",
    requireSession(),
    rateLimit({ scope: "billing_resume", limit: 10, windowSeconds: 300, by: "user" }),
    async (context) => {
      const provider = activePaymentProvider(context.env);
      if (provider !== "stripe" && provider !== "waffo") return stripeUnavailable(context);
      const user = context.get("user");
      const subscription = await activeSubscription(context.env, user.id);
      if (!subscription || subscription.payment_provider !== provider || subscription.cancel_at_period_end !== 1) {
        return context.json({ code: "not_canceling", error: "Nothing to resume." }, 409);
      }
      try {
        if (provider === "waffo") {
          await resumeWaffoSubscription(context.env, user.id, subscription.provider_subscription_id);
          await context.env.DB.prepare(
            "UPDATE subscriptions SET cancel_at_period_end = 0, canceled_at = NULL, status = 'active', "
            + "updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).bind(subscription.id).run();
          await recordAudit(context.env, auditActor(user), context.req.raw.headers, {
            action: "billing.subscription_resumed",
            targetType: "subscription",
            targetId: subscription.id,
          });
          return context.json({ resumed: true });
        }
        const updated = await setStripeCancelAtPeriodEnd(
          context.env,
          subscription.provider_subscription_id,
          false,
        );
        await syncStripeSubscription(context.env, updated);
        await recordAudit(context.env, auditActor(user), context.req.raw.headers, {
          action: "billing.subscription_resumed",
          targetType: "subscription",
          targetId: subscription.id,
        });
        return context.json({ resumed: true });
      } catch (error) {
        console.error("billing_resume_error", error instanceof Error ? error.message : "unknown");
        return context.json({ code: "provider_error", error: "The payment provider could not resume." }, 502);
      }
    },
  );

  app.post(
    "/api/billing/change",
    requireSession(),
    requireVerifiedEmail(),
    rateLimit({ scope: "billing_change", limit: 10, windowSeconds: 300, by: "user" }),
    requireJsonBody(),
    async (context) => {
      const provider = activePaymentProvider(context.env);
      if (provider !== "stripe" && provider !== "waffo") return stripeUnavailable(context);
      const parsed = subscriptionChangeSchema.safeParse(await context.req.json().catch(() => null));
      if (!parsed.success) {
        return context.json({ code: "invalid_request", error: "Invalid plan change." }, 400);
      }
      const user = context.get("user");
      const subscription = await activeSubscription(context.env, user.id);
      if (!subscription || subscription.payment_provider !== provider) {
        return context.json({ code: "no_subscription", error: "No active subscription." }, 404);
      }
      const price = await findPriceById(context.env, parsed.data.priceId);
      if (!price || price.payment_provider !== provider) {
        return context.json({ code: "price_not_found", error: "Price not found." }, 404);
      }
      if (price.id === subscription.price_id && !parsed.data.quantity) {
        return context.json({ code: "already_on_plan", error: "Already on this price." }, 409);
      }
      const plan = await getPlan(context.env, price.plan_id);
      if (!plan || plan.is_active !== 1) {
        return context.json({ code: "plan_not_found", error: "Plan not found." }, 404);
      }
      const quantity = plan?.seat_based === 1 ? parsed.data.quantity || subscription.quantity : 1;
      try {
        if (provider === "waffo") {
          if (quantity !== 1) {
            return context.json({ code: "invalid_request", error: "Waffo subscriptions support one seat." }, 400);
          }
          const checkout = await createWaffoSubscriptionCheckout(context.env, {
            price,
            userId: user.id,
            buyerEmail: user.email,
            originOrderId: subscription.provider_subscription_id,
            successUrl: appOrigin(context.env, context.req.url) + "/account?subscription=success",
          });
          context.header("Cache-Control", "no-store");
          return context.json({ checkoutUrl: checkout.url });
        }
        const updated = await changeStripeSubscriptionPrice(
          context.env,
          subscription.provider_subscription_id,
          price.provider_price_id,
          quantity,
        );
        await syncStripeSubscription(context.env, updated);
        await recordAudit(context.env, auditActor(user), context.req.raw.headers, {
          action: "billing.subscription_changed",
          targetType: "subscription",
          targetId: subscription.id,
          metadata: { fromPriceId: subscription.price_id, toPriceId: price.id, quantity },
        });
        return context.json({ changed: true, planId: price.plan_id, quantity });
      } catch (error) {
        console.error("billing_change_error", error instanceof Error ? error.message : "unknown");
        return context.json({ code: "provider_error", error: "The payment provider could not change the plan." }, 502);
      }
    },
  );
}

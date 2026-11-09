import type { Hono } from "hono";
import type { AppBindings, Env, PaymentProvider } from "../../env";
import { auditActor, recordAudit } from "../audit";
import { requireJsonBody, requireSession, requireVerifiedEmail } from "../guard";
import {
  verifyCreemWebhookSignature,
  verifyPolarWebhookSignature,
  verifyStripeWebhookSignature,
} from "../crypto";
import { idempotent } from "../security/idempotency";
import { rateLimit } from "../security/rate-limit";
import { checkoutInputSchema } from "../validation";
import { activePaymentProvider, appOrigin, providerProductId, unitPriceCents } from "./config";
import { createHostedCheckout } from "./create-checkout";
import { applyWebhookEvent, recordWebhookFailure } from "./handlers";
import { verifyWaffoEvent } from "./waffo";

interface WebhookOutcome {
  ok: boolean;
  code?: string;
}

async function runWebhook(
  env: Env,
  provider: PaymentProvider,
  rawBody: string,
  eventId: string | null,
  eventType: string | null,
): Promise<WebhookOutcome> {
  try {
    await applyWebhookEvent(env, provider, rawBody, eventId);
    if (eventId) {
      await env.DB.prepare(
        "UPDATE webhook_deliveries SET status = 'resolved', error_code = NULL, updated_at = CURRENT_TIMESTAMP "
        + "WHERE payment_provider = ? AND event_id = ?",
      ).bind(provider, eventId).run();
    }
    return { ok: true };
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown";
    console.error(provider + "_webhook_error", code);
    await recordWebhookFailure(env, provider, eventId, eventType, code, rawBody).catch(() => undefined);
    return { ok: false, code };
  }
}

function eventSummary(rawBody: string, provider: PaymentProvider, headerId: string | null) {
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    if (provider === "stripe") {
      return {
        id: typeof parsed.id === "string" ? parsed.id : null,
        type: typeof parsed.type === "string" ? parsed.type : null,
      };
    }
    if (provider === "polar") {
      return { id: headerId, type: typeof parsed.type === "string" ? parsed.type : null };
    }
    return {
      id: typeof parsed.id === "string" ? parsed.id : null,
      type: typeof parsed.eventType === "string" ? parsed.eventType : null,
    };
  } catch {
    return { id: headerId, type: null };
  }
}

export function registerPaymentRoutes(app: Hono<AppBindings>): void {
  app.post(
    "/api/checkout",
    requireSession(),
    requireVerifiedEmail(),
    rateLimit({ scope: "checkout", limit: 10, windowSeconds: 300, by: "user" }),
    requireJsonBody(),
    idempotent(),
    async (context) => {
      const provider = activePaymentProvider(context.env);
      if (!provider || !providerProductId(context.env, provider)) {
        return context.json({ code: "payments_disabled", error: "Payments are not configured." }, 503);
      }

      const parsed = checkoutInputSchema.safeParse(await context.req.json().catch(() => null));
      if (!parsed.success) {
        return context.json({
          code: "invalid_checkout",
          error: parsed.error.issues[0]?.message || "Invalid checkout details.",
        }, 400);
      }
      // 配置了 CHECKOUT_PROJECT_ID 时只允许购买该项目（本站即积分包）；挂起的项目不能付款
      const onlyProject = context.env.CHECKOUT_PROJECT_ID;
      const project = onlyProject && parsed.data.projectId !== onlyProject
        ? null
        : await context.env.DB.prepare("SELECT id FROM projects WHERE id = ? AND status <> 'suspended'")
          .bind(parsed.data.projectId)
          .first<{ id: string }>();
      if (!project) return context.json({ code: "project_not_found", error: "Project not found." }, 404);

      const user = context.get("user");
      const pendingId = "checkout_" + crypto.randomUUID();
      const unitAmount = unitPriceCents(context.env);
      const amount = unitAmount * parsed.data.quantity;
      const productId = providerProductId(context.env, provider);
      await context.env.DB.prepare(
        "INSERT INTO pending_checkouts "
        + "(id, project_id, user_id, quantity, unit_amount_cents, amount_cents, provider_product_id, "
        + "payment_provider, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'creating')",
      ).bind(
        pendingId,
        project.id,
        user.id,
        parsed.data.quantity,
        unitAmount,
        amount,
        productId,
        provider,
      ).run();

      try {
        const origin = appOrigin(context.env, context.req.url);
        const checkout = await createHostedCheckout({
          env: context.env,
          provider,
          productId,
          pendingId,
          projectId: project.id,
          quantity: parsed.data.quantity,
          unitAmountCents: unitAmount,
          successUrl: origin + "/?checkout=" + encodeURIComponent(pendingId),
          cancelUrl: origin + "/",
          customerIpAddress: context.req.header("CF-Connecting-IP") || undefined,
          userId: user.id,
          buyerEmail: user.email,
        });
        await context.env.DB.prepare(
          "UPDATE pending_checkouts SET status = 'pending', provider_checkout_id = ? WHERE id = ?",
        ).bind(checkout.id, pendingId).run();
        await recordAudit(context.env, auditActor(user), context.req.raw.headers, {
          action: "payment.checkout_started",
          targetType: "project",
          targetId: project.id,
          metadata: { pendingId, amountCents: amount },
        });
        return context.json({ checkoutUrl: checkout.url, requestId: pendingId });
      } catch (error) {
        const code = error instanceof Error ? error.message.slice(0, 80) : "provider_unreachable";
        await context.env.DB.prepare(
          "UPDATE pending_checkouts SET status = 'failed', error_code = ? WHERE id = ?",
        ).bind(code, pendingId).run();
        return context.json({ code: "provider_error", error: "The payment provider could not start checkout." }, 502);
      }
    },
  );

  app.get("/api/checkout/status", requireSession(), async (context) => {
    const requestId = context.req.query("request_id");
    if (!requestId || !/^checkout_[0-9a-f-]{36}$/i.test(requestId)) {
      return context.json({ code: "invalid_checkout", error: "Invalid checkout request." }, 400);
    }
    const row = await context.env.DB.prepare(
      "SELECT status, project_id, user_id FROM pending_checkouts WHERE id = ?",
    ).bind(requestId).first<{ status: string; project_id: string; user_id: string | null }>();
    if (!row) return context.json({ code: "not_found", error: "Checkout not found." }, 404);
    const user = context.get("user");
    if (row.user_id && row.user_id !== user.id && user.role !== "admin") {
      return context.json({ code: "forbidden", error: "You do not have access." }, 403);
    }
    return context.json({ status: row.status, projectId: row.project_id });
  });

  app.post("/api/webhooks/waffo", async (context) => {
    if (!context.env.WAFFO_STORE_ID || !context.env.WAFFO_ENVIRONMENT) {
      return context.json({ error: "Webhook is not configured." }, 503);
    }
    const rawBody = await context.req.text();
    let event;
    try {
      event = verifyWaffoEvent(context.env, rawBody, context.req.header("x-waffo-signature"));
    } catch {
      return context.json({ error: "Invalid signature or event scope." }, 401);
    }
    const delivery = await context.env.DB.prepare(
      "SELECT status FROM webhook_deliveries WHERE payment_provider = 'waffo' AND event_id = ?",
    ).bind(event.id).first<{ status: string }>();
    if (delivery?.status === "resolved") return context.json({ received: true });

    // 先持久化已验签的原始事件，再返回 200；后台失败可沿用管理后台重放。
    await context.env.DB.prepare(
      "INSERT INTO webhook_deliveries (id, payment_provider, event_id, event_type, status, error_code, payload) "
      + "VALUES (?, 'waffo', ?, ?, 'failed', 'processing', ?) "
      + "ON CONFLICT(payment_provider, event_id) DO NOTHING",
    ).bind("delivery_" + crypto.randomUUID(), event.id, event.eventType, rawBody).run();
    context.executionCtx.waitUntil(runWebhook(context.env, "waffo", rawBody, event.id, event.eventType));
    return context.json({ received: true });
  });

  app.post("/api/webhooks/creem", async (context) => {
    const rawBody = await context.req.text();
    const secret = context.env.CREEM_WEBHOOK_SECRET;
    if (!secret) return context.json({ error: "Webhook is not configured." }, 503);
    if (!(await verifyCreemWebhookSignature(rawBody, context.req.header("creem-signature") || null, secret))) {
      return context.json({ error: "Invalid signature." }, 401);
    }
    const summary = eventSummary(rawBody, "creem", null);
    const outcome = await runWebhook(context.env, "creem", rawBody, summary.id, summary.type);
    return outcome.ok
      ? context.json({ received: true })
      : context.json({ error: "Event could not be applied." }, 422);
  });

  app.post("/api/webhooks/polar", async (context) => {
    const rawBody = await context.req.text();
    const secret = context.env.POLAR_WEBHOOK_SECRET;
    const webhookId = context.req.header("webhook-id") || null;
    const webhookTimestamp = context.req.header("webhook-timestamp") || null;
    if (!secret) return context.json({ error: "Webhook is not configured." }, 503);
    if (!(await verifyPolarWebhookSignature(
      rawBody,
      webhookId,
      webhookTimestamp,
      context.req.header("webhook-signature") || null,
      secret,
    ))) return context.json({ error: "Invalid signature." }, 401);

    const summary = eventSummary(rawBody, "polar", webhookId);
    const outcome = await runWebhook(context.env, "polar", rawBody, summary.id, summary.type);
    return outcome.ok
      ? context.json({ received: true })
      : context.json({ error: "Event could not be applied." }, 422);
  });

  app.post("/api/webhooks/stripe", async (context) => {
    const rawBody = await context.req.text();
    const secret = context.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return context.json({ error: "Webhook is not configured." }, 503);
    if (!(await verifyStripeWebhookSignature(
      rawBody,
      context.req.header("stripe-signature") || null,
      secret,
    ))) return context.json({ error: "Invalid signature." }, 401);

    const summary = eventSummary(rawBody, "stripe", null);
    const outcome = await runWebhook(context.env, "stripe", rawBody, summary.id, summary.type);
    return outcome.ok
      ? context.json({ received: true })
      : context.json({ error: "Event could not be applied." }, 422);
  });
}

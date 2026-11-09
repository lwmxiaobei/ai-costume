import type { Hono } from "hono";
import type { AppBindings } from "../../env";
import { auditActor, recordAudit } from "../audit";
import { userEntitlement } from "../billing/entitlements";
import { activeSubscription, billingCustomerId } from "../billing/subscriptions";
import { cancelStripeSubscriptionNow } from "../billing/stripe-billing";
import { sendEmail } from "../email/send";
import { requireJsonBody, requireSession } from "../guard";
import { rateLimit } from "../security/rate-limit";
import { updateProfileSchema } from "../validation";
import { waffoClient } from "../payments/waffo";

interface SessionRow {
  id: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

export function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const browser = /Edg\//.test(userAgent) ? "Edge"
    : /OPR\//.test(userAgent) ? "Opera"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Safari\//.test(userAgent) ? "Safari"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : "Browser";
  const platform = /iPhone|iPad/.test(userAgent) ? "iOS"
    : /Android/.test(userAgent) ? "Android"
    : /Mac OS X/.test(userAgent) ? "macOS"
    : /Windows/.test(userAgent) ? "Windows"
    : /Linux/.test(userAgent) ? "Linux"
    : "Unknown";
  return browser + " on " + platform;
}

export function registerAccountRoutes(app: Hono<AppBindings>): void {
  app.get("/api/account/profile", requireSession(), async (context) => {
    const user = context.get("user");
    const row = await context.env.DB.prepare(
      "SELECT created_at FROM users WHERE id = ?",
    ).bind(user.id).first<{ created_at: string }>();
    const entitlement = await userEntitlement(context.env, user.id);
    return context.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        role: user.role,
        locale: user.locale,
        twoFactorEnabled: user.twoFactorEnabled,
        createdAt: row?.created_at || null,
      },
      entitlement,
    });
  });

  app.patch(
    "/api/account/profile",
    requireSession(),
    rateLimit({ scope: "profile_update", limit: 20, windowSeconds: 300, by: "user" }),
    requireJsonBody(),
    async (context) => {
      const parsed = updateProfileSchema.safeParse(await context.req.json().catch(() => null));
      if (!parsed.success) {
        return context.json({ code: "invalid_profile", error: "Invalid profile values." }, 400);
      }
      const updates: string[] = [];
      const values: (string | null)[] = [];
      if (parsed.data.name !== undefined) {
        updates.push("name = ?");
        values.push(parsed.data.name);
      }
      if (parsed.data.image !== undefined) {
        updates.push("image = ?");
        values.push(parsed.data.image);
      }
      if (parsed.data.locale !== undefined) {
        updates.push("locale = ?");
        values.push(parsed.data.locale);
      }
      if (updates.length === 0) return context.json({ code: "no_changes", error: "Nothing to update." }, 400);

      const user = context.get("user");
      await context.env.DB.prepare(
        "UPDATE users SET " + updates.join(", ") + ", updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).bind(...values, user.id).run();
      await recordAudit(context.env, auditActor(user), context.req.raw.headers, {
        action: "account.profile_updated",
        targetType: "user",
        targetId: user.id,
        metadata: { fields: Object.keys(parsed.data) },
      });
      return context.json({ updated: true });
    },
  );

  app.get("/api/account/sessions", requireSession(), async (context) => {
    const user = context.get("user");
    const rows = await context.env.DB.prepare(
      "SELECT id, created_at, updated_at, expires_at, ip_address, user_agent FROM sessions "
      + "WHERE user_id = ? AND expires_at > CURRENT_TIMESTAMP ORDER BY updated_at DESC LIMIT 50",
    ).bind(user.id).all<SessionRow>();
    return context.json({
      sessions: rows.results.map((row) => ({
        id: row.id,
        current: row.id === user.sessionId,
        device: describeUserAgent(row.user_agent),
        ipAddress: row.ip_address,
        createdAt: row.created_at,
        lastActiveAt: row.updated_at,
        expiresAt: row.expires_at,
      })),
    });
  });

  app.delete("/api/account/sessions/:id", requireSession(), async (context) => {
    const user = context.get("user");
    const sessionId = context.req.param("id");
    if (sessionId === user.sessionId) {
      return context.json({ code: "current_session", error: "Sign out instead of revoking this session." }, 409);
    }
    const result = await context.env.DB.prepare("DELETE FROM sessions WHERE id = ? AND user_id = ?")
      .bind(sessionId, user.id)
      .run();
    if (result.meta.changes === 0) {
      return context.json({ code: "not_found", error: "Session not found." }, 404);
    }
    await recordAudit(context.env, auditActor(user), context.req.raw.headers, {
      action: "account.session_revoked",
      targetType: "session",
      targetId: sessionId,
    });
    return context.json({ revoked: true });
  });

  app.post("/api/account/sessions/revoke-others", requireSession(), async (context) => {
    const user = context.get("user");
    const result = await context.env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?")
      .bind(user.id, user.sessionId)
      .run();
    await recordAudit(context.env, auditActor(user), context.req.raw.headers, {
      action: "account.sessions_revoked",
      targetType: "user",
      targetId: user.id,
      metadata: { revoked: result.meta.changes },
    });
    return context.json({ revoked: result.meta.changes });
  });

  app.get(
    "/api/account/export",
    requireSession(),
    rateLimit({ scope: "account_export", limit: 3, windowSeconds: 3_600, by: "user" }),
    async (context) => {
      const user = context.get("user");
      const database = context.env.DB;
      const [profile, sessions, accounts, projects, payments, subscriptions, usage, audits, generationTasks] =
        await database.batch<Record<string, unknown>>([
          database.prepare(
            "SELECT id, name, email, email_verified, image, role, locale, created_at, updated_at "
            + "FROM users WHERE id = ?",
          ).bind(user.id),
          database.prepare(
            "SELECT id, created_at, updated_at, expires_at, ip_address, user_agent FROM sessions WHERE user_id = ?",
          ).bind(user.id),
          database.prepare(
            "SELECT provider_id, account_id, created_at FROM accounts WHERE user_id = ?",
          ).bind(user.id),
          database.prepare(
            "SELECT id, url, name, description, support_cents, status, created_at FROM projects WHERE user_id = ?",
          ).bind(user.id),
          database.prepare(
            "SELECT id, order_id, amount_cents, reversed_cents, currency, status, payment_provider, paid_at "
            + "FROM payments WHERE user_id = ?",
          ).bind(user.id),
          database.prepare(
            "SELECT id, plan_id, status, quantity, current_period_start, current_period_end, "
            + "cancel_at_period_end, trial_end, canceled_at, created_at FROM subscriptions WHERE user_id = ?",
          ).bind(user.id),
          database.prepare(
            "SELECT metric, period, quantity, updated_at FROM usage_records WHERE user_id = ?",
          ).bind(user.id),
          database.prepare(
            "SELECT action, target_type, target_id, created_at FROM audit_logs WHERE actor_id = ? "
            + "ORDER BY created_at DESC LIMIT 500",
          ).bind(user.id),
          database.prepare(
            "SELECT id, type, model_id, model_name, prompt, input, status, outputs, error_code, "
            + "created_at, updated_at, started_at, completed_at FROM generation_tasks WHERE user_id = ?",
          ).bind(user.id),
        ]);

      await recordAudit(context.env, auditActor(user), context.req.raw.headers, {
        action: "account.data_exported",
        targetType: "user",
        targetId: user.id,
      });
      context.header("Content-Disposition", 'attachment; filename="account-export.json"');
      return context.json({
        exportedAt: new Date().toISOString(),
        profile: profile.results[0] || null,
        sessions: sessions.results,
        linkedAccounts: accounts.results,
        projects: projects.results,
        payments: payments.results,
        subscriptions: subscriptions.results,
        usage: usage.results,
        auditLogs: audits.results,
        generationTasks: generationTasks.results,
      });
    },
  );

  app.post(
    "/api/account/delete",
    requireSession(),
    rateLimit({ scope: "account_delete", limit: 5, windowSeconds: 3_600, by: "user" }),
    requireJsonBody(),
    async (context) => {
      const body = await context.req.json().catch(() => null) as { confirm?: unknown } | null;
      const user = context.get("user");
      if (typeof body?.confirm !== "string" || body.confirm.trim().toLowerCase() !== user.email.toLowerCase()) {
        return context.json({
          code: "confirmation_required",
          error: "Type your email address to confirm deletion.",
        }, 400);
      }

      const subscription = await activeSubscription(context.env, user.id);
      if (subscription?.payment_provider === "waffo") {
        await waffoClient(context.env).orders.cancelSubscription({ orderId: subscription.provider_subscription_id });
      }
      if (subscription?.payment_provider === "stripe" && context.env.STRIPE_SECRET_KEY) {
        await cancelStripeSubscriptionNow(context.env, subscription.provider_subscription_id)
          .catch((error: unknown) => {
            console.error("account_delete_cancel_error", error instanceof Error ? error.message : "unknown");
          });
      }
      const customerId = await billingCustomerId(context.env, user.id, "stripe");

      await recordAudit(context.env, auditActor(user), context.req.raw.headers, {
        action: "account.deleted",
        targetType: "user",
        targetId: user.id,
        metadata: { hadSubscription: Boolean(subscription), stripeCustomerId: customerId || "" },
      });
      await sendEmail(context.env, {
        to: user.email,
        template: "account_deleted",
        idempotencyKey: "account_deleted:" + user.id,
        locale: user.locale,
        variables: { url: context.env.BETTER_AUTH_URL || "" },
      });
      await context.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id).run();
      return context.json({ deleted: true });
    },
  );
}

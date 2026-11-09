import type { Hono } from "hono";
import type { AppBindings, PaymentProvider } from "../../env";
import { auditActor, recordAudit } from "../audit";
import { listPlans } from "../billing/plans";
import { retryFailedEmails } from "../email/send";
import { requireJsonBody, requireRole, requireSession } from "../guard";
import { applyWebhookEvent } from "../payments/handlers";
import {
  adminBanSchema,
  adminPlanSchema,
  adminRoleSchema,
  adminSettingSchema,
  adminUserQuerySchema,
} from "../validation";

const MAX_PAGE = 100;

function pagination(context: { req: { query: (key: string) => string | undefined } }) {
  const limit = Math.min(Math.max(Number(context.req.query("limit") || 25), 1), MAX_PAGE);
  const offset = Math.min(Math.max(Number(context.req.query("offset") || 0), 0), 100_000);
  return { limit, offset };
}

export function registerAdminRoutes(app: Hono<AppBindings>): void {
  app.use("/api/admin/*", requireSession(), requireRole("admin"));

  app.get("/api/admin/overview", async (context) => {
    const database = context.env.DB;
    const [users, subscriptions, payments, webhooks, emails] = await database.batch<{ total: number }>([
      database.prepare("SELECT COUNT(*) AS total FROM users WHERE deleted_at IS NULL"),
      database.prepare(
        "SELECT COUNT(*) AS total FROM subscriptions WHERE status IN ('trialing', 'active', 'past_due')",
      ),
      database.prepare("SELECT COALESCE(SUM(amount_cents - reversed_cents), 0) AS total FROM payments"),
      database.prepare("SELECT COUNT(*) AS total FROM webhook_deliveries WHERE status = 'failed'"),
      database.prepare("SELECT COUNT(*) AS total FROM email_messages WHERE status = 'failed'"),
    ]);
    return context.json({
      users: users.results[0]?.total || 0,
      activeSubscriptions: subscriptions.results[0]?.total || 0,
      netRevenueCents: payments.results[0]?.total || 0,
      failedWebhooks: webhooks.results[0]?.total || 0,
      failedEmails: emails.results[0]?.total || 0,
    });
  });

  app.get("/api/admin/users", async (context) => {
    const parsed = adminUserQuerySchema.safeParse({
      query: context.req.query("query"),
      role: context.req.query("role"),
      banned: context.req.query("banned"),
      limit: context.req.query("limit"),
      offset: context.req.query("offset"),
    });
    if (!parsed.success) return context.json({ code: "invalid_query", error: "Invalid filters." }, 400);

    const filters: string[] = ["deleted_at IS NULL"];
    const values: (string | number)[] = [];
    if (parsed.data.query) {
      filters.push("(email LIKE ? OR name LIKE ? OR id = ?)");
      values.push("%" + parsed.data.query + "%", "%" + parsed.data.query + "%", parsed.data.query);
    }
    if (parsed.data.role) {
      filters.push("role = ?");
      values.push(parsed.data.role);
    }
    if (parsed.data.banned) {
      filters.push("banned = ?");
      values.push(parsed.data.banned === "true" ? 1 : 0);
    }
    const limit = parsed.data.limit || 25;
    const offset = parsed.data.offset || 0;

    const rows = await context.env.DB.prepare(
      "SELECT u.id, u.name, u.email, u.email_verified, u.role, u.banned, u.ban_reason, u.ban_expires, "
      + "u.created_at, s.plan_id AS plan_id, s.status AS subscription_status "
      + "FROM users u LEFT JOIN subscriptions s ON s.user_id = u.id "
      + "AND s.status IN ('trialing', 'active', 'past_due') "
      + "WHERE " + filters.join(" AND ")
      + " ORDER BY u.created_at DESC LIMIT ? OFFSET ?",
    ).bind(...values, limit, offset).all<Record<string, unknown>>();
    const total = await context.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM users WHERE " + filters.join(" AND "),
    ).bind(...values).first<{ total: number }>();
    return context.json({ users: rows.results, total: total?.total || 0, limit, offset });
  });

  app.post("/api/admin/users/:id/ban", requireJsonBody(), async (context) => {
    const parsed = adminBanSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ code: "invalid_request", error: "Invalid ban request." }, 400);
    const actor = context.get("user");
    const targetId = context.req.param("id");
    if (targetId === actor.id) {
      return context.json({ code: "self_action", error: "You cannot ban your own account." }, 409);
    }
    const expires = parsed.data.banned && parsed.data.expiresInDays
      ? new Date(Date.now() + parsed.data.expiresInDays * 86_400_000).toISOString()
      : null;
    const result = await context.env.DB.prepare(
      "UPDATE users SET banned = ?, ban_reason = ?, ban_expires = ?, updated_at = CURRENT_TIMESTAMP "
      + "WHERE id = ? AND deleted_at IS NULL",
    ).bind(
      parsed.data.banned ? 1 : 0,
      parsed.data.banned ? parsed.data.reason || null : null,
      expires,
      targetId,
    ).run();
    if (result.meta.changes === 0) return context.json({ code: "not_found", error: "User not found." }, 404);
    if (parsed.data.banned) {
      await context.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(targetId).run();
    }
    await recordAudit(context.env, auditActor(actor), context.req.raw.headers, {
      action: parsed.data.banned ? "admin.user_banned" : "admin.user_unbanned",
      targetType: "user",
      targetId,
      metadata: { reason: parsed.data.reason || "", expires: expires || "" },
    });
    return context.json({ banned: parsed.data.banned });
  });

  app.post("/api/admin/users/:id/role", requireJsonBody(), async (context) => {
    const parsed = adminRoleSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ code: "invalid_request", error: "Invalid role." }, 400);
    const actor = context.get("user");
    const targetId = context.req.param("id");
    if (targetId === actor.id) {
      return context.json({ code: "self_action", error: "You cannot change your own role." }, 409);
    }
    const result = await context.env.DB.prepare(
      "UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL",
    ).bind(parsed.data.role, targetId).run();
    if (result.meta.changes === 0) return context.json({ code: "not_found", error: "User not found." }, 404);
    await recordAudit(context.env, auditActor(actor), context.req.raw.headers, {
      action: "admin.user_role_changed",
      targetType: "user",
      targetId,
      metadata: { role: parsed.data.role },
    });
    return context.json({ role: parsed.data.role });
  });

  app.get("/api/admin/payments", async (context) => {
    const { limit, offset } = pagination(context);
    const rows = await context.env.DB.prepare(
      "SELECT p.id, p.order_id, p.user_id, u.email AS user_email, p.project_id, p.amount_cents, "
      + "p.reversed_cents, p.currency, p.status, p.payment_provider, p.paid_at "
      + "FROM payments p LEFT JOIN users u ON u.id = p.user_id "
      + "ORDER BY p.paid_at DESC LIMIT ? OFFSET ?",
    ).bind(limit, offset).all<Record<string, unknown>>();
    return context.json({ payments: rows.results, limit, offset });
  });

  app.get("/api/admin/subscriptions", async (context) => {
    const { limit, offset } = pagination(context);
    const rows = await context.env.DB.prepare(
      "SELECT s.*, u.email AS user_email FROM subscriptions s LEFT JOIN users u ON u.id = s.user_id "
      + "ORDER BY s.updated_at DESC LIMIT ? OFFSET ?",
    ).bind(limit, offset).all<Record<string, unknown>>();
    return context.json({ subscriptions: rows.results, limit, offset });
  });

  app.get("/api/admin/payment-events", async (context) => {
    const { limit, offset } = pagination(context);
    const rows = await context.env.DB.prepare(
      "SELECT id, event_type, object_id, received_at FROM payment_events "
      + "ORDER BY received_at DESC LIMIT ? OFFSET ?",
    ).bind(limit, offset).all<Record<string, unknown>>();
    return context.json({ events: rows.results, limit, offset });
  });

  app.get("/api/admin/webhooks", async (context) => {
    const { limit, offset } = pagination(context);
    const status = context.req.query("status") === "resolved" ? "resolved" : "failed";
    const rows = await context.env.DB.prepare(
      "SELECT id, payment_provider, event_id, event_type, status, attempts, error_code, created_at, updated_at "
      + "FROM webhook_deliveries WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
    ).bind(status, limit, offset).all<Record<string, unknown>>();
    return context.json({ deliveries: rows.results, status, limit, offset });
  });

  app.post("/api/admin/webhooks/:id/replay", async (context) => {
    const deliveryId = context.req.param("id");
    const row = await context.env.DB.prepare(
      "SELECT id, payment_provider, event_id, event_type, payload FROM webhook_deliveries WHERE id = ?",
    ).bind(deliveryId).first<{
      id: string;
      payment_provider: PaymentProvider;
      event_id: string | null;
      event_type: string | null;
      payload: string;
    }>();
    if (!row) return context.json({ code: "not_found", error: "Delivery not found." }, 404);

    const actor = context.get("user");
    try {
      await applyWebhookEvent(context.env, row.payment_provider, row.payload, row.event_id);
      await context.env.DB.prepare(
        "UPDATE webhook_deliveries SET status = 'resolved', attempts = attempts + 1, error_code = NULL, "
        + "updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).bind(row.id).run();
      await recordAudit(context.env, auditActor(actor), context.req.raw.headers, {
        action: "admin.webhook_replayed",
        targetType: "webhook_delivery",
        targetId: row.id,
        metadata: { provider: row.payment_provider, eventType: row.event_type || "" },
      });
      return context.json({ replayed: true });
    } catch (error) {
      const code = error instanceof Error ? error.message.slice(0, 120) : "unknown";
      await context.env.DB.prepare(
        "UPDATE webhook_deliveries SET attempts = attempts + 1, error_code = ?, "
        + "updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).bind(code, row.id).run();
      await recordAudit(context.env, auditActor(actor), context.req.raw.headers, {
        action: "admin.webhook_replay_failed",
        targetType: "webhook_delivery",
        targetId: row.id,
        metadata: { error: code },
      });
      return context.json({ code: "replay_failed", error: "The event could not be applied." }, 422);
    }
  });

  app.get("/api/admin/plans", async (context) => {
    return context.json({ plans: await listPlans(context.env, true) });
  });

  app.patch("/api/admin/plans/:id", requireJsonBody(), async (context) => {
    const parsed = adminPlanSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ code: "invalid_request", error: "Invalid plan values." }, 400);
    const updates: string[] = [];
    const values: (string | number)[] = [];
    if (parsed.data.name !== undefined) {
      updates.push("name = ?");
      values.push(parsed.data.name);
    }
    if (parsed.data.description !== undefined) {
      updates.push("description = ?");
      values.push(parsed.data.description);
    }
    if (parsed.data.isActive !== undefined) {
      updates.push("is_active = ?");
      values.push(parsed.data.isActive ? 1 : 0);
    }
    if (parsed.data.trialDays !== undefined) {
      updates.push("trial_days = ?");
      values.push(parsed.data.trialDays);
    }
    if (parsed.data.features !== undefined) {
      updates.push("features = ?");
      values.push(JSON.stringify(parsed.data.features));
    }
    if (parsed.data.quotas !== undefined) {
      updates.push("quotas = ?");
      values.push(JSON.stringify(parsed.data.quotas));
    }
    if (updates.length === 0) return context.json({ code: "no_changes", error: "Nothing to update." }, 400);

    const planId = context.req.param("id");
    const result = await context.env.DB.prepare(
      "UPDATE plans SET " + updates.join(", ") + ", updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(...values, planId).run();
    if (result.meta.changes === 0) return context.json({ code: "not_found", error: "Plan not found." }, 404);
    await recordAudit(context.env, auditActor(context.get("user")), context.req.raw.headers, {
      action: "admin.plan_updated",
      targetType: "plan",
      targetId: planId,
      metadata: { fields: Object.keys(parsed.data) },
    });
    return context.json({ updated: true });
  });

  app.get("/api/admin/settings", async (context) => {
    const rows = await context.env.DB.prepare(
      "SELECT key, value, updated_at, updated_by FROM app_settings ORDER BY key ASC",
    ).all<Record<string, unknown>>();
    return context.json({ settings: rows.results });
  });

  app.put("/api/admin/settings/:key", requireJsonBody(), async (context) => {
    const parsed = adminSettingSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ code: "invalid_request", error: "Invalid setting." }, 400);
    const key = context.req.param("key");
    if (!/^[a-z0-9_]{1,60}$/.test(key)) {
      return context.json({ code: "invalid_key", error: "Invalid setting key." }, 400);
    }
    const actor = context.get("user");
    await context.env.DB.prepare(
      "INSERT INTO app_settings (key, value, updated_by) VALUES (?, ?, ?) "
      + "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, "
      + "updated_at = CURRENT_TIMESTAMP",
    ).bind(key, parsed.data.value, actor.id).run();
    await recordAudit(context.env, auditActor(actor), context.req.raw.headers, {
      action: "admin.setting_updated",
      targetType: "setting",
      targetId: key,
      metadata: { value: parsed.data.value.slice(0, 200) },
    });
    return context.json({ updated: true });
  });

  app.get("/api/admin/emails", async (context) => {
    const { limit, offset } = pagination(context);
    const status = ["pending", "sent", "failed"].includes(context.req.query("status") || "")
      ? context.req.query("status")!
      : "failed";
    const rows = await context.env.DB.prepare(
      "SELECT id, to_email, template, locale, subject, status, attempts, email_provider, last_error, "
      + "created_at, sent_at FROM email_messages WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
    ).bind(status, limit, offset).all<Record<string, unknown>>();
    return context.json({ emails: rows.results, status, limit, offset });
  });

  app.post("/api/admin/emails/retry", async (context) => {
    const result = await retryFailedEmails(context.env, 20);
    await recordAudit(context.env, auditActor(context.get("user")), context.req.raw.headers, {
      action: "admin.emails_retried",
      targetType: "email",
      metadata: result,
    });
    return context.json(result);
  });

  app.get("/api/admin/audit-logs", async (context) => {
    const { limit, offset } = pagination(context);
    const action = context.req.query("action");
    const filters = action && /^[a-z0-9_.]{1,80}$/.test(action) ? " WHERE action = ?" : "";
    const statement = context.env.DB.prepare(
      "SELECT id, actor_id, actor_email, actor_role, action, target_type, target_id, metadata, "
      + "ip_address, created_at FROM audit_logs" + filters
      + " ORDER BY created_at DESC LIMIT ? OFFSET ?",
    );
    const rows = filters
      ? await statement.bind(action, limit, offset).all<Record<string, unknown>>()
      : await statement.bind(limit, offset).all<Record<string, unknown>>();
    return context.json({ logs: rows.results, limit, offset });
  });
}

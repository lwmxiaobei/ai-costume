import { Hono } from "hono";
import type { AppBindings, Env } from "./env";
import { registerAccountRoutes } from "./lib/account/routes";
import { registerAgentRoutes } from "./lib/agents/routes";
import { registerAdminRoutes } from "./lib/admin/routes";
import { registerBillingRoutes } from "./lib/billing/routes";
import { registerGenerationRoutes } from "./lib/generation/routes";
import { GENERATION_CRON, runGenerationTasks } from "./lib/generation/service";
import { generationRuntime } from "./domain/generation";
import { metricUsage, userEntitlement, withinQuota } from "./lib/billing/entitlements";
import { auditActor, recordAudit } from "./lib/audit";
import { activePaymentProvider, appOrigin, unitPriceCents } from "./lib/payments/config";
import { registerPaymentRoutes } from "./lib/payments/routes";
import { registerTryonRoutes } from "./lib/tryon/routes";
import { refundFailedCharges } from "./lib/credits";
import {
  createAuth,
  isBetterAuthConfigured,
  isEmailPasswordEnabled,
  isGoogleAuthConfigured,
  isMagicLinkEnabled,
  sessionUser,
} from "./lib/auth";
import { isEmailEnabled } from "./lib/email/provider";
import { requireJsonBody, requireOwnership, requireSession } from "./lib/guard";
import { runScheduledTasks } from "./lib/scheduled";
import { rateLimit } from "./lib/security/rate-limit";
import { isTurnstileEnabled, verifyTurnstileToken } from "./lib/security/turnstile";
import { normalizeProjectUrl } from "./lib/project-url";
import { INDEXABLE_ROUTES, isAppRoute } from "./routes";
import { createProjectSchema } from "./lib/validation";
import { fallbackWebsiteName, fetchWebsiteMetadata } from "./lib/website-metadata";

const app = new Hono<AppBindings>();

app.use("*", async (context, next) => {
  const canonicalHost = context.env.CANONICAL_HOST?.trim().toLowerCase();
  const requestUrl = new URL(context.req.url);
  if (canonicalHost && requestUrl.hostname.toLowerCase() === "www." + canonicalHost) {
    requestUrl.hostname = canonicalHost;
    return context.redirect(requestUrl.toString(), 308);
  }
  await next();
  context.header("X-Content-Type-Options", "nosniff");
  context.header("Referrer-Policy", "strict-origin-when-cross-origin");
  context.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  context.header("Cross-Origin-Opener-Policy", "same-origin");
  context.header("X-Request-Id", context.req.header("CF-Ray") || crypto.randomUUID());
  if (context.req.path.startsWith("/api/")) context.header("Cache-Control", "no-store");
});

app.get("/robots.txt", (context) => {
  const origin = appOrigin(context.env, context.req.url);
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /account",
    "Disallow: /generate",
    "Disallow: /admin",
    "Disallow: /signin",
    "Disallow: /api/",
    "",
    "Sitemap: " + origin + "/sitemap.xml",
    "",
  ].join("\n");
  return context.body(body, 200, { "content-type": "text/plain; charset=utf-8" });
});

app.get("/sitemap.xml", (context) => {
  const origin = appOrigin(context.env, context.req.url);
  const urls = INDEXABLE_ROUTES.map((route) =>
    "  <url><loc>" + origin + (route === "/" ? "/" : route) + "</loc></url>").join("\n");
  const body = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls + "\n</urlset>\n";
  return context.body(body, 200, { "content-type": "application/xml; charset=utf-8" });
});

app.get("/api/health", (context) => context.json({
  ok: true,
  service: context.env.APP_NAME || "ai-costume-studio",
  time: new Date().toISOString(),
}));

app.all(
  "/api/auth/*",
  rateLimit({ scope: "auth", limit: 60, windowSeconds: 300 }),
  (context) => {
    if (!isBetterAuthConfigured(context.env)) {
      return context.json({ code: "auth_not_configured", error: "Better Auth is not configured." }, 503);
    }
    return createAuth(context.env).handler(context.req.raw);
  },
);

app.get("/api/me", async (context) => {
  const user = await sessionUser(context.env, context.req.raw.headers);
  return context.json({ user });
});

app.get("/api/config", async (context) => {
  const provider = activePaymentProvider(context.env);
  const settings = await context.env.DB.prepare(
    "SELECT key, value FROM app_settings WHERE key IN ('signups_enabled', 'maintenance_message')",
  ).all<{ key: string; value: string }>().catch(() => ({ results: [] as { key: string; value: string }[] }));
  const settingMap = Object.fromEntries(settings.results.map((row) => [row.key, row.value]));

  return context.json({
    appName: context.env.APP_NAME || "衣装集 试穿",
    paymentsEnabled: provider !== null && (provider !== "waffo" || Boolean(context.env.WAFFO_PRODUCT_ID)),
    paymentProvider: provider,
    subscriptionsEnabled: provider === "stripe" || provider === "waffo",
    unitPriceCents: unitPriceCents(context.env),
    googleSignInEnabled: isGoogleAuthConfigured(context.env),
    emailPasswordEnabled: isEmailPasswordEnabled(context.env),
    magicLinkEnabled: isMagicLinkEnabled(context.env),
    emailEnabled: isEmailEnabled(context.env),
    turnstileSiteKey: isTurnstileEnabled(context.env) ? context.env.TURNSTILE_SITE_KEY! : null,
    signupsEnabled: settingMap.signups_enabled !== "false",
    maintenanceMessage: settingMap.maintenance_message || "",
  });
});

app.get("/api/projects", async (context) => {
  const rows = await context.env.DB.prepare(
    "SELECT id, url, name, description, image_url, support_cents, status, user_id "
    + "FROM projects WHERE status != 'suspended' ORDER BY support_cents DESC, created_at ASC LIMIT 100",
  ).all<{
    id: string;
    url: string;
    name: string;
    description: string;
    image_url: string | null;
    support_cents: number;
    status: "draft" | "active";
    user_id: string | null;
  }>();
  return context.json({
    projects: rows.results.map((row) => ({
      id: row.id,
      url: row.url,
      name: row.name,
      description: row.description,
      imageUrl: row.image_url,
      supportCents: row.support_cents,
      status: row.status,
      ownerId: row.user_id,
    })),
  });
});

app.post(
  "/api/projects",
  requireSession(),
  rateLimit({ scope: "project_create", limit: 20, windowSeconds: 3_600, by: "ip+user" }),
  requireJsonBody(),
  async (context) => {
    const parsed = createProjectSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) {
      return context.json({
        code: "invalid_project",
        error: parsed.error.issues[0]?.message || "Invalid project.",
      }, 400);
    }

    const verified = await verifyTurnstileToken(
      context.env,
      parsed.data.turnstileToken,
      context.req.header("CF-Connecting-IP"),
    );
    if (!verified) {
      return context.json({ code: "captcha_failed", error: "Complete the challenge and try again." }, 403);
    }

    let normalized: ReturnType<typeof normalizeProjectUrl>;
    try {
      normalized = normalizeProjectUrl(parsed.data.url);
    } catch (error) {
      return context.json({
        code: "invalid_project_url",
        error: error instanceof Error ? error.message : "Invalid project URL.",
      }, 400);
    }

    const existing = await context.env.DB.prepare(
      "SELECT id FROM projects WHERE canonical_url = ?",
    ).bind(normalized.canonicalUrl).first<{ id: string }>();
    if (existing) return context.json({ projectId: existing.id, created: false });

    const user = context.get("user");
    const entitlement = await userEntitlement(context.env, user.id);
    const used = await metricUsage(context.env, user.id, "projects");
    if (!withinQuota(entitlement, "projects", used)) {
      return context.json({
        code: "quota_exceeded",
        error: "You reached the project limit for your plan.",
        used,
        limit: entitlement.quotas.projects ?? 0,
      }, 402);
    }

    const id = "project_" + crypto.randomUUID();
    let metadata = {
      name: fallbackWebsiteName(normalized.url),
      description: "",
      imageUrl: new URL("/favicon.ico", normalized.url).toString(),
    };
    try {
      metadata = await fetchWebsiteMetadata(normalized.url);
    } catch (error) {
      console.error(
        "website_metadata_error",
        normalized.canonicalUrl,
        error instanceof Error ? error.message : "unknown",
      );
    }
    await context.env.DB.prepare(
      "INSERT INTO projects (id, canonical_url, url, name, description, image_url, user_id) "
      + "VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      id,
      normalized.canonicalUrl,
      normalized.url,
      metadata.name,
      metadata.description,
      metadata.imageUrl,
      user.id,
    ).run();
    await recordAudit(context.env, auditActor(user), context.req.raw.headers, {
      action: "project.created",
      targetType: "project",
      targetId: id,
      metadata: { canonicalUrl: normalized.canonicalUrl },
    });
    return context.json({ projectId: id, created: true }, 201);
  },
);

app.delete(
  "/api/projects/:id",
  requireSession(),
  requireOwnership({ table: "projects" }),
  async (context) => {
    const user = context.get("user");
    const projectId = context.req.param("id");
    await context.env.DB.prepare(
      "UPDATE projects SET status = 'suspended', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(projectId).run();
    await recordAudit(context.env, auditActor(user), context.req.raw.headers, {
      action: "project.suspended",
      targetType: "project",
      targetId: projectId,
    });
    return context.json({ suspended: true });
  },
);

registerPaymentRoutes(app);
registerBillingRoutes(app);
registerAccountRoutes(app);
registerAdminRoutes(app);
// 通用创建接口不开放模型，试穿必须走会扣积分的 /api/tryon
registerGenerationRoutes(app, () => ({ models: [], providers: {} }));
registerTryonRoutes(app);
registerAgentRoutes(app);

app.notFound(async (context) => {
  if (context.req.path.startsWith("/api/")) return context.json({ error: "Not found." }, 404);
  const response = await context.env.ASSETS.fetch(context.req.raw);
  if (response.status !== 200 || isAppRoute(context.req.path)) return response;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;
  return new Response(response.body, {
    status: 404,
    headers: response.headers,
  });
});

app.onError((error, context) => {
  console.error("request_error", error instanceof Error ? error.message : "unknown");
  return context.json({ error: "Internal server error." }, 500);
});

export default {
  fetch: app.fetch,
  scheduled: async (event: ScheduledController, env: Env, context: ExecutionContext) => {
    if (event.cron === GENERATION_CRON) {
      context.waitUntil(
        runGenerationTasks(env, generationRuntime(env)).then(() => refundFailedCharges(env)),
      );
      return;
    }
    context.waitUntil(
      runScheduledTasks(env, event.cron).then((summary) => {
        console.log("scheduled_done", JSON.stringify(summary));
      }).catch((error: unknown) => {
        console.error("scheduled_error", error instanceof Error ? error.message : "unknown");
      }),
    );
  },
} satisfies ExportedHandler<Env>;

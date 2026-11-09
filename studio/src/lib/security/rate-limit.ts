import { createMiddleware } from "hono/factory";
import type { AppBindings, ServiceEnv } from "../../env";

export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export function windowStart(nowMs: number, windowSeconds: number): number {
  return Math.floor(nowMs / (windowSeconds * 1_000)) * windowSeconds * 1_000;
}

export function isRateLimitDisabled(env: ServiceEnv): boolean {
  return env.RATE_LIMIT_DISABLED === "true";
}

export async function consumeRateLimit(
  env: ServiceEnv,
  key: string,
  rule: RateLimitRule,
  nowMs = Date.now(),
): Promise<RateLimitDecision> {
  const started = windowStart(nowMs, rule.windowSeconds);
  const expiresAt = started + rule.windowSeconds * 1_000;
  const bucket = key + ":" + started;

  const row = await env.DB.prepare(
    "INSERT INTO rate_limits (bucket, hits, window_started_at, expires_at) VALUES (?, 1, ?, ?) "
    + "ON CONFLICT(bucket) DO UPDATE SET hits = hits + 1 RETURNING hits",
  ).bind(bucket, started, expiresAt).first<{ hits: number }>();

  const hits = row?.hits ?? 1;
  if (hits === 1) {
    await env.DB.prepare("DELETE FROM rate_limits WHERE expires_at < ?").bind(nowMs).run();
  }
  return {
    allowed: hits <= rule.limit,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - hits),
    resetAt: expiresAt,
    retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - nowMs) / 1_000)),
  };
}

export interface RateLimitOptions extends RateLimitRule {
  scope: string;
  by?: "ip" | "user" | "ip+user";
}

export function rateLimitIdentity(
  by: "ip" | "user" | "ip+user",
  ip: string,
  userId: string | null,
): string {
  if (by === "user") return "user:" + (userId || "anonymous");
  if (by === "ip+user") return "ip:" + ip + "|user:" + (userId || "anonymous");
  return "ip:" + ip;
}

export const rateLimit = (options: RateLimitOptions) => createMiddleware<AppBindings>(
  async (context, next) => {
    if (isRateLimitDisabled(context.env)) return next();
    const ip = context.req.header("CF-Connecting-IP") || "unknown";
    const identity = rateLimitIdentity(
      options.by || "ip",
      ip,
      context.get("user")?.id || null,
    );
    const decision = await consumeRateLimit(
      context.env,
      options.scope + ":" + identity,
      { limit: options.limit, windowSeconds: options.windowSeconds },
    );
    context.header("X-RateLimit-Limit", String(decision.limit));
    context.header("X-RateLimit-Remaining", String(decision.remaining));
    context.header("X-RateLimit-Reset", String(Math.ceil(decision.resetAt / 1_000)));
    if (!decision.allowed) {
      context.header("Retry-After", String(decision.retryAfterSeconds));
      return context.json({ code: "rate_limited", error: "Too many requests. Try again later." }, 429);
    }
    await next();
  },
);

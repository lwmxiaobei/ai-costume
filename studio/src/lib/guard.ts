import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../env";
import { isBetterAuthConfigured, sessionUser, type SessionAccount } from "./auth";
import { isEmailEnabled } from "./email/provider";

const IDENTIFIER = /^[a-z0-9_-]{1,64}$/i;
const TABLE_NAME = /^[a-z_][a-z0-9_]{0,63}$/i;

export interface OwnershipOptions {
  table: string;
  param?: string;
  idColumn?: string;
  ownerColumn?: string;
  adminBypass?: boolean;
}

export function hasRole(user: SessionAccount | null, roles: readonly string[]): boolean {
  if (!user || user.banned) return false;
  return roles.includes(user.role);
}

export function ownsResource(
  user: SessionAccount | null,
  ownerId: string | null | undefined,
  adminBypass = true,
): boolean {
  if (!user || user.banned) return false;
  if (adminBypass && user.role === "admin") return true;
  return Boolean(ownerId) && ownerId === user.id;
}

export const requireSession = () => createMiddleware<AppBindings>(async (context, next) => {
  if (!isBetterAuthConfigured(context.env)) {
    return context.json({ code: "auth_not_configured", error: "Sign-in is not configured." }, 503);
  }
  const user = await sessionUser(context.env, context.req.raw.headers);
  if (!user) {
    return context.json({ code: "unauthenticated", error: "Sign in to continue." }, 401);
  }
  if (user.banned) {
    return context.json({ code: "account_banned", error: "This account is suspended." }, 403);
  }
  context.set("user", user);
  await next();
});

export const requireVerifiedEmail = () => createMiddleware<AppBindings>(async (context, next) => {
  const user = context.get("user");
  if (!user.emailVerified && isEmailEnabled(context.env)) {
    return context.json({ code: "email_unverified", error: "Verify your email to continue." }, 403);
  }
  await next();
});

export const requireRole = (...roles: string[]) => createMiddleware<AppBindings>(
  async (context, next) => {
    if (!hasRole(context.get("user"), roles)) {
      return context.json({ code: "forbidden", error: "You do not have access." }, 403);
    }
    await next();
  },
);

export const requireOwnership = (options: OwnershipOptions) => createMiddleware<AppBindings>(
  async (context, next) => {
    const idColumn = options.idColumn || "id";
    const ownerColumn = options.ownerColumn || "user_id";
    if (!TABLE_NAME.test(options.table) || !IDENTIFIER.test(idColumn) || !IDENTIFIER.test(ownerColumn)) {
      throw new Error("invalid_ownership_options");
    }
    const identifier = context.req.param(options.param || "id");
    if (!identifier || identifier.length > 128) {
      return context.json({ code: "not_found", error: "Not found." }, 404);
    }
    const row = await context.env.DB.prepare(
      "SELECT * FROM " + options.table + " WHERE " + idColumn + " = ?",
    ).bind(identifier).first<Record<string, unknown>>();
    if (!row) return context.json({ code: "not_found", error: "Not found." }, 404);

    const ownerId = row[ownerColumn];
    if (!ownsResource(context.get("user"), typeof ownerId === "string" ? ownerId : null, options.adminBypass)) {
      return context.json({ code: "forbidden", error: "You do not have access." }, 403);
    }
    context.set("resource", row);
    await next();
  },
);

export const requireJsonBody = (maxBytes = 8_192) => createMiddleware<AppBindings>(
  async (context, next) => {
    if (!context.req.header("content-type")?.includes("application/json")) {
      return context.json({ code: "expected_json", error: "Expected a JSON request." }, 415);
    }
    if (Number(context.req.header("content-length") || 0) > maxBytes) {
      return context.json({ code: "request_too_large", error: "Request is too large." }, 413);
    }
    await next();
  },
);

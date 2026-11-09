import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../../env";
import { sha256Hex } from "../crypto";

const KEY_PATTERN = /^[A-Za-z0-9_:.-]{8,128}$/;
const TTL_SECONDS = 60 * 60 * 24;

export function isIdempotencyKey(value: string | null | undefined): value is string {
  return typeof value === "string" && KEY_PATTERN.test(value);
}

export const idempotent = (options: { required?: boolean } = {}) => createMiddleware<AppBindings>(
  async (context, next) => {
    const key = context.req.header("idempotency-key");
    if (!isIdempotencyKey(key)) {
      if (!options.required) return next();
      return context.json(
        { code: "idempotency_key_required", error: "Send a valid Idempotency-Key header." },
        400,
      );
    }

    const endpoint = context.req.method + " " + context.req.path;
    const rawBody = await context.req.raw.clone().text();
    const requestHash = await sha256Hex(endpoint + "\n" + rawBody);
    const userId = context.get("user")?.id || null;
    const recordId = (userId || "anonymous") + ":" + key;
    const expiresAt = Date.now() + TTL_SECONDS * 1_000;

    const inserted = await context.env.DB.prepare(
      "INSERT OR IGNORE INTO idempotency_keys (id, user_id, endpoint, request_hash, expires_at) "
      + "VALUES (?, ?, ?, ?, ?)",
    ).bind(recordId, userId, endpoint, requestHash, expiresAt).run();

    if (inserted.meta.changes === 0) {
      const existing = await context.env.DB.prepare(
        "SELECT request_hash, status_code, response_body FROM idempotency_keys WHERE id = ?",
      ).bind(recordId).first<{
        request_hash: string;
        status_code: number | null;
        response_body: string | null;
      }>();
      if (existing && existing.request_hash !== requestHash) {
        return context.json(
          { code: "idempotency_key_reused", error: "This Idempotency-Key was used for another request." },
          409,
        );
      }
      if (existing?.status_code && existing.response_body) {
        context.header("Idempotent-Replay", "true");
        return context.newResponse(
          existing.response_body,
          existing.status_code as 200,
          { "content-type": "application/json" },
        );
      }
      return context.json(
        { code: "idempotent_request_in_flight", error: "The first request is still running." },
        409,
      );
    }

    await next();

    const response = context.res.clone();
    if (response.status >= 500) {
      await context.env.DB.prepare("DELETE FROM idempotency_keys WHERE id = ?").bind(recordId).run();
      return;
    }
    const body = await response.text();
    await context.env.DB.prepare(
      "UPDATE idempotency_keys SET status_code = ?, response_body = ? WHERE id = ?",
    ).bind(response.status, body.slice(0, 16_000), recordId).run();
  },
);

export async function purgeExpiredIdempotencyKeys(env: AppBindings["Bindings"]): Promise<number> {
  const result = await env.DB.prepare("DELETE FROM idempotency_keys WHERE expires_at < ?")
    .bind(Date.now())
    .run();
  return result.meta.changes;
}

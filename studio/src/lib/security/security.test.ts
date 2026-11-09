import { describe, expect, it, vi } from "vitest";
import { consumeRateLimit, isRateLimitDisabled, rateLimitIdentity, windowStart } from "./rate-limit";
import { isIdempotencyKey } from "./idempotency";
import { isTurnstileEnabled, verifyTurnstileToken } from "./turnstile";

function stubDatabase(hits: number[]) {
  const queue = [...hits];
  const run = vi.fn(async () => ({ meta: { changes: 0 } }));
  const database = {
    prepare: vi.fn((sql: string) => ({
      bind: () => ({
        first: async () => (sql.includes("INSERT INTO rate_limits") ? { hits: queue.shift() ?? 1 } : null),
        run,
      }),
    })),
  } as unknown as D1Database;
  return { database, run };
}

describe("rate limiting", () => {
  it("pins a window to a fixed boundary", () => {
    expect(windowStart(1_000_500, 60)).toBe(960_000);
    expect(windowStart(1_020_000, 60)).toBe(1_020_000);
  });

  it("builds an identity from ip, user or both", () => {
    expect(rateLimitIdentity("ip", "1.2.3.4", "user_1")).toBe("ip:1.2.3.4");
    expect(rateLimitIdentity("user", "1.2.3.4", null)).toBe("user:anonymous");
    expect(rateLimitIdentity("ip+user", "1.2.3.4", "user_1")).toBe("ip:1.2.3.4|user:user_1");
  });

  it("allows hits up to the limit and denies the next one", async () => {
    const { database } = stubDatabase([1, 2, 3]);
    const rule = { limit: 2, windowSeconds: 60 };
    const first = await consumeRateLimit({ DB: database }, "scope:ip", rule, 0);
    const second = await consumeRateLimit({ DB: database }, "scope:ip", rule, 0);
    const third = await consumeRateLimit({ DB: database }, "scope:ip", rule, 0);
    expect(first).toMatchObject({ allowed: true, remaining: 1 });
    expect(second).toMatchObject({ allowed: true, remaining: 0 });
    expect(third).toMatchObject({ allowed: false, remaining: 0 });
    expect(third.retryAfterSeconds).toBe(60);
  });

  it("purges expired buckets only when a window opens", async () => {
    const { database, run } = stubDatabase([1, 2]);
    await consumeRateLimit({ DB: database }, "scope:ip", { limit: 5, windowSeconds: 60 }, 0);
    expect(run).toHaveBeenCalledTimes(1);
    await consumeRateLimit({ DB: database }, "scope:ip", { limit: 5, windowSeconds: 60 }, 0);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("can be switched off for local development", () => {
    expect(isRateLimitDisabled({ DB: {} as D1Database, RATE_LIMIT_DISABLED: "true" })).toBe(true);
    expect(isRateLimitDisabled({ DB: {} as D1Database })).toBe(false);
  });
});

describe("idempotency keys", () => {
  it("accepts opaque keys and rejects short or unsafe ones", () => {
    expect(isIdempotencyKey("checkout-2026-08-25-abc")).toBe(true);
    expect(isIdempotencyKey("short")).toBe(false);
    expect(isIdempotencyKey("has space in it")).toBe(false);
    expect(isIdempotencyKey(undefined)).toBe(false);
  });
});

describe("Turnstile", () => {
  const env = { DB: {} as D1Database, TURNSTILE_SECRET_KEY: "secret", TURNSTILE_SITE_KEY: "site" };

  it("passes through when Turnstile is not configured", async () => {
    expect(isTurnstileEnabled({ DB: {} as D1Database })).toBe(false);
    await expect(verifyTurnstileToken({ DB: {} as D1Database }, null)).resolves.toBe(true);
  });

  it("requires a token once configured", async () => {
    await expect(verifyTurnstileToken(env, null)).resolves.toBe(false);
  });

  it("accepts only a successful verification response", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyTurnstileToken(env, "token", "1.2.3.4")).resolves.toBe(true);

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 200 })));
    await expect(verifyTurnstileToken(env, "token")).resolves.toBe(false);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    await expect(verifyTurnstileToken(env, "token")).resolves.toBe(false);
    vi.unstubAllGlobals();
  });
});

import { describe, expect, it, vi } from "vitest";
import type { ServiceEnv } from "../env";
import {
  DAILY_CRON,
  HOURLY_CRON,
  notifyExpiringSubscriptions,
  purgeExpiredRecords,
  reminderWindow,
  runScheduledTasks,
} from "./scheduled";

const NOW = Date.parse("2026-08-25T03:00:00.000Z");

function fakeDatabase(expiring: Record<string, unknown>[] = []) {
  const binds: unknown[][] = [];
  const database = {
    prepare: (sql: string) => ({
      bind: (...values: unknown[]) => {
        binds.push([sql, ...values]);
        return {
          all: async () => ({ results: sql.includes("FROM subscriptions") ? expiring : [] }),
          first: async () => null,
          run: async () => ({
            meta: { changes: sql.startsWith("INSERT OR IGNORE INTO email_messages") ? 1 : 0 },
          }),
        };
      },
    }),
    batch: async (statements: unknown[]) =>
      statements.map((_, index) => ({ meta: { changes: index + 1 } })),
  } as unknown as D1Database;
  return { database, binds };
}

function env(database: D1Database): ServiceEnv {
  return {
    DB: database,
    APP_NAME: "Acme",
    EMAIL_FROM: "hello@acme.test",
    RESEND_API_KEY: "re_test",
    RESEND_API_BASE: "https://resend.test",
  };
}

describe("reminder window", () => {
  it("covers from now to the configured number of days ahead", () => {
    expect(reminderWindow(NOW, 3)).toEqual({
      from: "2026-08-25T03:00:00.000Z",
      to: "2026-08-28T03:00:00.000Z",
    });
  });
});

describe("expiring subscription reminders", () => {
  it("only looks at subscriptions that will actually end inside the window", async () => {
    const { database, binds } = fakeDatabase();
    await notifyExpiringSubscriptions(env(database), NOW);
    const [sql, from, to] = binds[0] as [string, string, string];
    expect(sql).toContain("cancel_at_period_end = 1");
    expect(sql).toContain("s.status IN ('trialing', 'active')");
    expect(sql).toContain("u.deleted_at IS NULL");
    expect(from).toBe("2026-08-25T03:00:00.000Z");
    expect(to).toBe("2026-08-28T03:00:00.000Z");
  });

  it("sends one reminder per subscription period", async () => {
    const { database } = fakeDatabase([{
      provider_subscription_id: "sub_1",
      current_period_end: "2026-08-27T00:00:00.000Z",
      plan_name: "Pro",
      email: "ada@example.com",
      name: "Ada",
      locale: "zh",
    }]);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "m1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const sent = await notifyExpiringSubscriptions(env(database), NOW);
    expect(sent).toBe(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { subject: string; text: string };
    expect(body.subject).toContain("Acme");
    expect(body.text).toContain("2026-08-27");
    vi.unstubAllGlobals();
  });

  it("does nothing when email delivery is not configured", async () => {
    const { database } = fakeDatabase([{
      provider_subscription_id: "sub_1",
      current_period_end: "2026-08-27T00:00:00.000Z",
      plan_name: "Pro",
      email: "ada@example.com",
      name: "Ada",
      locale: null,
    }]);
    expect(await notifyExpiringSubscriptions({ DB: database }, NOW)).toBe(0);
  });
});

describe("purge", () => {
  it("uses epoch milliseconds for counters and ISO timestamps for auth tables", async () => {
    const { database, binds } = fakeDatabase();
    const purged = await purgeExpiredRecords(env(database), NOW);
    expect(purged).toEqual({ idempotencyKeys: 1, rateLimits: 2, sessions: 3, verifications: 4 });

    const byTable = Object.fromEntries(binds.map(([sql, value]) => [String(sql).split(" ")[2], value]));
    expect(byTable.idempotency_keys).toBe(NOW);
    expect(byTable.rate_limits).toBe(NOW);
    expect(byTable.sessions).toBe("2026-08-25T03:00:00.000Z");
    expect(byTable.verifications).toBe("2026-08-25T03:00:00.000Z");
  });
});

describe("cron dispatch", () => {
  it("runs reminders and purges only on the daily schedule", async () => {
    const { database, binds } = fakeDatabase();
    const hourly = await runScheduledTasks(env(database), HOURLY_CRON, NOW);
    expect(hourly.purged).toEqual({});
    expect(binds.some(([sql]) => String(sql).includes("FROM subscriptions"))).toBe(false);

    const daily = await runScheduledTasks(env(database), DAILY_CRON, NOW);
    expect(daily.purged.sessions).toBe(3);
    expect(binds.some(([sql]) => String(sql).includes("FROM subscriptions"))).toBe(true);
  });
});

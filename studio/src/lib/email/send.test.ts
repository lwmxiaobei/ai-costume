import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServiceEnv } from "../../env";
import { sendEmail } from "./send";

interface Stored {
  id: string;
  status: string;
  attempts: number;
}

function fakeDatabase() {
  const rows = new Map<string, Stored>();
  const statements: string[] = [];
  const database = {
    prepare: (sql: string) => {
      statements.push(sql);
      return {
        bind: (...values: unknown[]) => ({
          run: async () => {
            if (sql.startsWith("INSERT OR IGNORE INTO email_messages")) {
              const key = String(values[1]);
              if (rows.has(key)) return { meta: { changes: 0 } };
              rows.set(key, { id: String(values[0]), status: "pending", attempts: 0 });
              return { meta: { changes: 1 } };
            }
            if (sql.includes("UPDATE email_messages")) {
              const status = sql.includes("status = 'sent'") ? "sent" : "failed";
              for (const row of rows.values()) {
                if (row.id === values[values.length - 1]) {
                  row.status = status;
                  row.attempts = Number(values[0]);
                }
              }
            }
            return { meta: { changes: 1 } };
          },
          first: async () => rows.get(String(values[0])) || null,
          all: async () => ({ results: [] }),
        }),
      };
    },
  } as unknown as D1Database;
  return { database, rows, statements };
}

function env(database: D1Database): ServiceEnv {
  return {
    DB: database,
    APP_NAME: "Acme",
    EMAIL_FROM: "hello@acme.test",
    EMAIL_PROVIDER: "resend",
    RESEND_API_KEY: "re_test",
    RESEND_API_BASE: "https://resend.test",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendEmail", () => {
  it("does nothing when no provider is configured", async () => {
    const { database, rows } = fakeDatabase();
    const result = await sendEmail({ DB: database }, {
      to: "ada@example.com",
      template: "welcome",
      idempotencyKey: "welcome:user_1",
    });
    expect(result).toBe("disabled");
    expect(rows.size).toBe(0);
  });

  it("refuses an invalid recipient before recording anything", async () => {
    const { database, rows } = fakeDatabase();
    const result = await sendEmail(env(database), {
      to: "not-an-address",
      template: "welcome",
      idempotencyKey: "welcome:user_1",
    });
    expect(result).toBe("failed");
    expect(rows.size).toBe(0);
  });

  it("sends once and skips a repeat with the same idempotency key", async () => {
    const { database, rows } = fakeDatabase();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "msg_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const options = {
      to: "ada@example.com",
      template: "welcome" as const,
      idempotencyKey: "welcome:user_1",
      variables: { name: "Ada" },
    };
    expect(await sendEmail(env(database), options)).toBe("sent");
    expect(await sendEmail(env(database), options)).toBe("skipped");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect([...rows.values()][0]).toMatchObject({ status: "sent", attempts: 1 });
  });

  it("retries a retryable failure up to the attempt limit", async () => {
    const { database, rows } = fakeDatabase();
    const fetchMock = vi.fn(async () => new Response("busy", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmail(env(database), {
      to: "ada@example.com",
      template: "password_reset",
      idempotencyKey: "password_reset:token",
      variables: { url: "https://acme.test/reset" },
    });
    expect(result).toBe("failed");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect([...rows.values()][0]).toMatchObject({ status: "failed", attempts: 3 });
  });

  it("stops immediately on a permanent failure", async () => {
    const { database } = fakeDatabase();
    const fetchMock = vi.fn(async () => new Response("bad request", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmail(env(database), {
      to: "ada@example.com",
      template: "welcome",
      idempotencyKey: "welcome:user_2",
    });
    expect(result).toBe("failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("posts the rendered subject and html to the provider", async () => {
    const { database } = fakeDatabase();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "msg_2" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail(env(database), {
      to: "ada@example.com",
      template: "subscription_started",
      idempotencyKey: "subscription_started:sub_1",
      locale: "zh",
      variables: { plan: "Pro", date: "2026-09-01" },
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://resend.test/emails");
    const body = JSON.parse(String(init.body)) as { subject: string; html: string; from: string };
    expect(body.from).toBe("hello@acme.test");
    expect(body.subject).toBe("Acme Pro 套餐已生效");
    expect(body.html).toContain("2026-09-01");
  });
});

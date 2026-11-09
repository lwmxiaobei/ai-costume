import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppBindings } from "../env";
import { requireOwnership, requireRole, requireSession } from "./guard";
import type { SessionAccount } from "./auth";

const sessionUserMock = vi.fn<() => Promise<SessionAccount | null>>();

vi.mock("./auth", async () => {
  const actual = await vi.importActual<typeof import("./auth")>("./auth");
  return {
    ...actual,
    isBetterAuthConfigured: () => true,
    sessionUser: () => sessionUserMock(),
  };
});

function account(overrides: Partial<SessionAccount> = {}): SessionAccount {
  return {
    id: "user_1",
    sessionId: "session_1",
    name: "Ada",
    email: "ada@example.com",
    emailVerified: true,
    image: null,
    role: "user",
    banned: false,
    twoFactorEnabled: false,
    locale: "en",
    ...overrides,
  };
}

function database(row: Record<string, unknown> | null) {
  return {
    prepare: vi.fn(() => ({ bind: () => ({ first: async () => row }) })),
  } as unknown as D1Database;
}

function buildApp(row: Record<string, unknown> | null) {
  const app = new Hono<AppBindings>();
  app.get(
    "/projects/:id",
    requireSession(),
    requireOwnership({ table: "projects" }),
    (context) => context.json({ resource: context.get("resource") }),
  );
  app.get(
    "/admin",
    requireSession(),
    requireRole("admin"),
    (context) => context.json({ ok: true }),
  );
  return {
    request: (path: string) => app.request(path, {}, { DB: database(row) } as AppBindings["Bindings"]),
  };
}

describe("guard middleware", () => {
  beforeEach(() => {
    sessionUserMock.mockReset();
  });

  it("rejects an anonymous request before touching the database", async () => {
    sessionUserMock.mockResolvedValue(null);
    const response = await buildApp({ id: "p1", user_id: "user_1" }).request("/projects/p1");
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects a banned account even when it owns the resource", async () => {
    sessionUserMock.mockResolvedValue(account({ banned: true }));
    const response = await buildApp({ id: "p1", user_id: "user_1" }).request("/projects/p1");
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "account_banned" });
  });

  it("passes the loaded row to the handler when the caller owns it", async () => {
    sessionUserMock.mockResolvedValue(account());
    const response = await buildApp({ id: "p1", user_id: "user_1" }).request("/projects/p1");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ resource: { id: "p1", user_id: "user_1" } });
  });

  it("hides another owner's resource behind 403 and a missing one behind 404", async () => {
    sessionUserMock.mockResolvedValue(account());
    const forbidden = await buildApp({ id: "p1", user_id: "user_2" }).request("/projects/p1");
    expect(forbidden.status).toBe(403);
    const missing = await buildApp(null).request("/projects/p1");
    expect(missing.status).toBe(404);
  });

  it("guards a role protected route", async () => {
    sessionUserMock.mockResolvedValue(account());
    expect((await buildApp(null).request("/admin")).status).toBe(403);
    sessionUserMock.mockResolvedValue(account({ role: "admin" }));
    expect((await buildApp(null).request("/admin")).status).toBe(200);
  });
});

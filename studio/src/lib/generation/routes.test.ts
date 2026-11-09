import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { AppBindings } from "../../env";
import type { SessionAccount } from "../auth";
import { registerGenerationRoutes } from "./routes";
import { createGenerationTask } from "./service";
import { generationTestDatabase } from "./test-database";
import type { GenerationModelDefinition, GenerationRuntime } from "./types";

const sessionUserMock = vi.hoisted(() =>
  vi.fn<() => Promise<SessionAccount | null>>(),
);
vi.mock("../auth", async () => ({
  ...(await vi.importActual<typeof import("../auth")>("../auth")),
  isBetterAuthConfigured: () => true,
  sessionUser: () => sessionUserMock(),
}));
const user: SessionAccount = {
  id: "user_1",
  sessionId: "session_1",
  name: "Test",
  email: "user_1@example.test",
  emailVerified: true,
  image: null,
  role: "user",
  banned: false,
  twoFactorEnabled: false,
  locale: "en",
};
const model: GenerationModelDefinition = {
  id: "test-image",
  name: "Test Image",
  type: "image",
  providerId: "test",
  timeoutSeconds: 180,
  parseInput: (input) =>
    z
      .object({ ratio: z.enum(["1:1", "16:9"]).optional() })
      .strict()
      .parse(input),
};

describe("generation HTTP routes", () => {
  let db: ReturnType<typeof generationTestDatabase>;
  let runtime: GenerationRuntime;
  let pending: Promise<unknown>[];
  let app: Hono<AppBindings>;
  beforeEach(() => {
    db = generationTestDatabase();
    sessionUserMock.mockResolvedValue(user);
    runtime = {
      models: [model],
      providers: {
        test: {
          submit: vi.fn(async () => ({
            status: "running" as const,
            taskId: "job_1",
          })),
          poll: vi.fn(async () => ({ status: "running" as const })),
        },
      },
    };
    pending = [];
    app = new Hono<AppBindings>();
    registerGenerationRoutes(app, () => runtime);
  });
  afterEach(async () => {
    await Promise.all(pending);
    db.sqlite.close();
  });
  function request(path: string, init: RequestInit = {}) {
    return app.request(
      path,
      init,
      {
        DB: db.binding,
        RATE_LIMIT_DISABLED: "true",
      } as AppBindings["Bindings"],
      {
        waitUntil: (promise: Promise<unknown>) => {
          pending.push(promise);
        },
        passThroughOnException: () => undefined,
        props: {},
      },
    );
  }
  function post(body: unknown, key = "request_key_1") {
    return request("/api/generation/tasks", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify(body),
    });
  }

  it("exposes only public model fields", async () => {
    const response = await request("/api/generation/models");
    expect(await response.json()).toEqual({
      models: [{ id: model.id, name: model.name, type: "image" }],
    });
  });
  it("rejects anonymous and banned users", async () => {
    sessionUserMock.mockResolvedValue(null);
    expect((await post({ modelId: model.id, prompt: "test" })).status).toBe(
      401,
    );
    expect((await request("/api/generation/tasks")).status).toBe(401);
    sessionUserMock.mockResolvedValue({ ...user, banned: true });
    expect((await post({ modelId: model.id, prompt: "test" })).status).toBe(
      403,
    );
  });
  it("enforces a valid idempotency key before creating anything", async () => {
    expect(
      (await post({ modelId: model.id, prompt: "test" }, "bad")).status,
    ).toBe(400);
    expect(
      db.sqlite.prepare("SELECT COUNT(*) AS count FROM generation_tasks").get()
        ?.count,
    ).toBe(0);
  });
  it("requires email verification when email delivery is configured", async () => {
    sessionUserMock.mockResolvedValue({ ...user, emailVerified: false });
    const response = await app.request(
      "/api/generation/tasks",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "verified_email_1",
        },
        body: JSON.stringify({ modelId: model.id, prompt: "test" }),
      },
      {
        DB: db.binding,
        EMAIL_FROM: "test@example.test",
        RESEND_API_KEY: "local_test_only",
        RATE_LIMIT_DISABLED: "true",
      } as AppBindings["Bindings"],
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "email_unverified" });
  });
  it("creates one task and replays the original HTTP response for retries", async () => {
    const body = { modelId: model.id, prompt: "A cloud" };
    const first = await post(body);
    expect(first.status).toBe(201);
    const replay = await post(body);
    expect(replay.headers.get("Idempotent-Replay")).toBe("true");
    expect(await replay.json()).toEqual(await first.json());
    await Promise.all(pending);
    expect(runtime.providers.test.submit).toHaveBeenCalledTimes(1);
    expect(
      db.sqlite.prepare("SELECT COUNT(*) AS count FROM generation_tasks").get()
        ?.count,
    ).toBe(1);
    expect((await post({ ...body, prompt: "different" })).status).toBe(409);
  });
  it("deduplicates even after the middleware's response cache expires", async () => {
    const body = { modelId: model.id, prompt: "A cloud" };
    await post(body);
    await Promise.all(pending);
    db.sqlite.exec("DELETE FROM idempotency_keys");
    const retry = await post(body);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ created: false });
    expect(runtime.providers.test.submit).toHaveBeenCalledTimes(1);
  });
  it("does not persist unavailable or invalid models and options", async () => {
    expect(
      (await post({ modelId: "unknown", prompt: "test" }, "request_unknown"))
        .status,
    ).toBe(400);
    expect(
      (
        await post(
          { modelId: model.id, prompt: "test", input: { ratio: "invalid" } },
          "request_badinput",
        )
      ).status,
    ).toBe(400);
    expect(
      (await post({ modelId: model.id, prompt: "   " }, "request_blank"))
        .status,
    ).toBe(400);
    runtime = { models: [], providers: {} };
    expect(
      (await post({ modelId: model.id, prompt: "test" }, "request_disabled"))
        .status,
    ).toBe(503);
    expect(
      db.sqlite.prepare("SELECT COUNT(*) AS count FROM generation_tasks").get()
        ?.count,
    ).toBe(0);
  });
  it("checks pagination and hides another user's task even from an admin", async () => {
    const saved = (await createGenerationTask(
      { DB: db.binding },
      "user_2",
      "owner_key",
      model,
      "private prompt",
      {},
    ))!;
    sessionUserMock.mockResolvedValue({ ...user, role: "admin" });
    expect(
      (await request("/api/generation/tasks/" + saved.task.id)).status,
    ).toBe(404);
    expect(await (await request("/api/generation/tasks")).json()).toEqual({
      tasks: [],
      hasMore: false,
    });
    expect((await request("/api/generation/tasks?limit=1000")).status).toBe(
      400,
    );
  });
  it("rejects oversized input and unsupported fields", async () => {
    expect(
      (
        await post({
          modelId: model.id,
          prompt: "test",
          input: { large: "a".repeat(20_000) },
        })
      ).status,
    ).toBe(413);
    expect(
      (
        await post(
          { modelId: model.id, prompt: "test", providerId: "untrusted" },
          "request_untrusted",
        )
      ).status,
    ).toBe(400);
  });
});

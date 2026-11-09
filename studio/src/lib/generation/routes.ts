import type { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../../env";
import { generationRuntime } from "../../domain/generation";
import {
  requireJsonBody,
  requireSession,
  requireVerifiedEmail,
} from "../guard";
import { idempotent } from "../security/idempotency";
import { rateLimit } from "../security/rate-limit";
import {
  availableModels,
  createGenerationTask,
  getGenerationTask,
  listGenerationTasks,
  processGenerationTask,
} from "./service";
import type { GenerationRuntimeFactory } from "./types";

const createSchema = z
  .object({
    modelId: z.string().trim().min(1).max(128),
    prompt: z.string().trim().min(1).max(4_000),
    input: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

export function registerGenerationRoutes(
  app: Hono<AppBindings>,
  runtimeFactory: GenerationRuntimeFactory = generationRuntime,
): void {
  app.get("/api/generation/models", (context) => {
    const models = availableModels(runtimeFactory(context.env));
    return context.json({
      models: models.map(({ id, name, type }) => ({ id, name, type })),
    });
  });

  app.get("/api/generation/tasks", requireSession(), async (context) => {
    const parsed = listSchema.safeParse(context.req.query());
    if (!parsed.success)
      return context.json(
        { code: "invalid_query", error: "Invalid pagination." },
        400,
      );
    const { limit, offset } = parsed.data;
    return context.json(
      await listGenerationTasks(
        context.env,
        context.get("user").id,
        limit,
        offset,
      ),
    );
  });

  app.get("/api/generation/tasks/:id", requireSession(), async (context) => {
    const id = context.req.param("id");
    const task =
      id.length <= 128
        ? await getGenerationTask(context.env, context.get("user").id, id)
        : null;
    if (!task)
      return context.json({ code: "not_found", error: "Task not found." }, 404);
    return context.json({ task });
  });

  app.post(
    "/api/generation/tasks",
    requireSession(),
    requireVerifiedEmail(),
    rateLimit({
      scope: "generation_create",
      limit: 20,
      windowSeconds: 3_600,
      by: "ip+user",
    }),
    requireJsonBody(16_384),
    idempotent({ required: true }),
    async (context) => {
      const raw = await context.req.text();
      if (new TextEncoder().encode(raw).length > 16_384) {
        return context.json(
          { code: "request_too_large", error: "Request is too large." },
          413,
        );
      }
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        body = null;
      }
      const parsed = createSchema.safeParse(body);
      if (!parsed.success) {
        return context.json(
          { code: "invalid_generation", error: "Invalid generation request." },
          400,
        );
      }
      const runtime = runtimeFactory(context.env);
      const models = availableModels(runtime);
      if (!models.length) {
        return context.json(
          {
            code: "generation_unavailable",
            error: "Generation is not configured.",
          },
          503,
        );
      }
      const model = models.find((entry) => entry.id === parsed.data.modelId);
      if (!model) {
        return context.json(
          {
            code: "invalid_generation_model",
            error: "Model is not available.",
          },
          400,
        );
      }
      let input: Record<string, unknown>;
      try {
        input = model.parseInput(parsed.data.input);
        if (new TextEncoder().encode(JSON.stringify(input)).length > 8_192)
          throw new Error("input_too_large");
      } catch {
        return context.json(
          { code: "invalid_generation_input", error: "Invalid model options." },
          400,
        );
      }
      const result = await createGenerationTask(
        context.env,
        context.get("user").id,
        context.req.header("idempotency-key")!,
        model,
        parsed.data.prompt,
        input,
      );
      if (!result) {
        return context.json(
          {
            code: "idempotency_key_reused",
            error: "This key belongs to another request.",
          },
          409,
        );
      }
      if (result.task.status === "queued") {
        context.executionCtx.waitUntil(
          processGenerationTask(context.env, runtime, result.task.id),
        );
      }
      return context.json(result, result.created ? 201 : 200);
    },
  );
}

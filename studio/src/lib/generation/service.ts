import { z } from "zod";
import type { ServiceEnv } from "../../env";
import { sha256Hex } from "../crypto";
import type {
  GenerationModelDefinition,
  GenerationRequest,
  GenerationRuntime,
  GenerationTask,
  GenerationTaskRow,
  GenerationUpdate,
  GenerationErrorCode,
} from "./types";

export const GENERATION_CRON = "* * * * *";
const LEASE_MS = 60_000;
const POLL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 20_000;
const outputSchema = z
  .array(
    z.object({
      url: z
        .string()
        .max(8_192)
        .url()
        .refine((value) => new URL(value).protocol === "https:"),
    }),
  )
  .min(1)
  .max(20);

export function publicTask(row: GenerationTaskRow): GenerationTask {
  return {
    id: row.id,
    type: row.type,
    modelId: row.model_id,
    modelName: row.model_name,
    prompt: row.prompt,
    input: JSON.parse(row.input) as Record<string, unknown>,
    status: row.status,
    outputs: JSON.parse(row.outputs) as GenerationTask["outputs"],
    errorCode: row.error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

export function availableModels(runtime: GenerationRuntime) {
  return runtime.models.filter(
    (model) =>
      runtime.providers[model.providerId] &&
      Number.isSafeInteger(model.timeoutSeconds) &&
      model.timeoutSeconds > 0,
  );
}

export async function createGenerationTask(
  env: ServiceEnv,
  userId: string,
  requestKey: string,
  model: GenerationModelDefinition,
  prompt: string,
  input: Record<string, unknown>,
  nowMs = Date.now(),
): Promise<{ task: GenerationTask; created: boolean } | null> {
  const id = "generation_" + crypto.randomUUID();
  const now = new Date(nowMs).toISOString();
  const requestHash = await sha256Hex(
    JSON.stringify({ modelId: model.id, prompt, input }),
  );
  const result = await env.DB.prepare(
    "INSERT INTO generation_tasks " +
      "(id, user_id, request_key, request_hash, type, model_id, model_name, provider_id, prompt, input, " +
      "timeout_seconds, next_poll_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(user_id, request_key) DO NOTHING",
  )
    .bind(
      id,
      userId,
      requestKey,
      requestHash,
      model.type,
      model.id,
      model.name,
      model.providerId,
      prompt,
      JSON.stringify(input),
      model.timeoutSeconds,
      nowMs,
      now,
      now,
    )
    .run();
  const row = await env.DB.prepare(
    "SELECT * FROM generation_tasks WHERE user_id = ? AND request_key = ?",
  )
    .bind(userId, requestKey)
    .first<GenerationTaskRow>();
  if (!row) throw new Error("generation_task_missing");
  if (row.request_hash !== requestHash) return null;
  return { task: publicTask(row), created: result.meta.changes === 1 };
}

export async function listGenerationTasks(
  env: ServiceEnv,
  userId: string,
  limit: number,
  offset: number,
) {
  const rows = await env.DB.prepare(
    "SELECT * FROM generation_tasks WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
  )
    .bind(userId, limit + 1, offset)
    .all<GenerationTaskRow>();
  return {
    tasks: rows.results.slice(0, limit).map(publicTask),
    hasMore: rows.results.length > limit,
  };
}

export async function getGenerationTask(
  env: ServiceEnv,
  userId: string,
  id: string,
) {
  const row = await env.DB.prepare(
    "SELECT * FROM generation_tasks WHERE id = ? AND user_id = ?",
  )
    .bind(id, userId)
    .first<GenerationTaskRow>();
  return row ? publicTask(row) : null;
}

async function failTask(
  env: ServiceEnv,
  row: GenerationTaskRow,
  errorCode: GenerationErrorCode,
  nowMs: number,
) {
  const now = new Date(nowMs).toISOString();
  await env.DB.prepare(
    "UPDATE generation_tasks SET status = 'failed', error_code = ?, updated_at = ?, completed_at = ?, " +
      "lease_token = NULL, lease_until = NULL WHERE id = ? AND lease_token = ? " +
      "AND status IN ('submitting', 'running')",
  )
    .bind(errorCode, now, now, row.id, row.lease_token)
    .run();
}

async function applyUpdate(
  env: ServiceEnv,
  row: GenerationTaskRow,
  update: GenerationUpdate,
  nowMs: number,
  providerTaskId: string | null,
) {
  if (update.status === "failed")
    return failTask(env, row, "provider_failed", nowMs);
  const outputs =
    update.status === "succeeded"
      ? outputSchema.safeParse(update.outputs)
      : null;
  if (outputs && !outputs.success)
    return failTask(env, row, "invalid_result", nowMs);
  const now = new Date(nowMs).toISOString();
  await env.DB.prepare(
    "UPDATE generation_tasks SET status = ?, provider_task_id = ?, outputs = ?, error_code = NULL, " +
      "updated_at = ?, completed_at = ?, next_poll_at = ?, lease_token = NULL, lease_until = NULL " +
      "WHERE id = ? AND lease_token = ? AND status IN ('submitting', 'running')",
  )
    .bind(
      update.status,
      providerTaskId,
      JSON.stringify(outputs?.success ? outputs.data : []),
      now,
      update.status === "succeeded" ? now : null,
      nowMs + POLL_MS,
      row.id,
      row.lease_token,
    )
    .run();
}

export async function processGenerationTask(
  env: ServiceEnv,
  runtime: GenerationRuntime,
  id: string,
  nowMs = Date.now(),
): Promise<void> {
  const row = await env.DB.prepare(
    "UPDATE generation_tasks SET lease_token = ?, lease_until = ?, updated_at = ?, " +
      "status = CASE WHEN status = 'queued' THEN 'submitting' ELSE status END, " +
      "started_at = COALESCE(started_at, ?), expires_at = COALESCE(expires_at, ? + timeout_seconds * 1000) " +
      "WHERE id = ? AND status IN ('queued', 'running') AND next_poll_at <= ? " +
      "AND (lease_until IS NULL OR lease_until <= ?) RETURNING *",
  )
    .bind(
      crypto.randomUUID(),
      nowMs + LEASE_MS,
      new Date(nowMs).toISOString(),
      new Date(nowMs).toISOString(),
      nowMs,
      id,
      nowMs,
      nowMs,
    )
    .first<GenerationTaskRow>();
  if (!row) return;
  if (row.expires_at !== null && row.expires_at <= nowMs) {
    return failTask(env, row, "generation_timeout", nowMs);
  }
  const provider = runtime.providers[row.provider_id];
  if (!provider) return failTask(env, row, "provider_unavailable", nowMs);

  const request: GenerationRequest = {
    id: row.id,
    modelId: row.model_id,
    type: row.type,
    prompt: row.prompt,
    input: JSON.parse(row.input) as Record<string, unknown>,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };
  try {
    if (row.status === "submitting") {
      const result = await provider.submit(request);
      if (
        result.status === "running" &&
        (typeof result.taskId !== "string" ||
          !result.taskId ||
          result.taskId.length > 512)
      ) {
        return failTask(env, row, "invalid_result", Date.now());
      }
      await applyUpdate(
        env,
        row,
        result,
        Date.now(),
        result.status === "running" ? result.taskId : null,
      );
    } else if (row.provider_task_id) {
      const result = await provider.poll({
        ...request,
        taskId: row.provider_task_id,
      });
      await applyUpdate(env, row, result, Date.now(), row.provider_task_id);
    } else {
      await failTask(env, row, "invalid_result", Date.now());
    }
  } catch {
    if (row.status === "submitting") {
      // 提交结果不确定时不自动重发，避免模型服务重复计费。
      await failTask(env, row, "submission_interrupted", Date.now());
    } else {
      // 查询失败保留运行状态，后台会在下一轮继续查询。
      await env.DB.prepare(
        "UPDATE generation_tasks SET lease_token = NULL, lease_until = NULL, next_poll_at = ? " +
          "WHERE id = ? AND lease_token = ? AND status = 'running'",
      )
        .bind(Date.now() + POLL_MS, row.id, row.lease_token)
        .run();
    }
  }
}

export async function runGenerationTasks(
  env: ServiceEnv,
  runtime: GenerationRuntime,
  nowMs = Date.now(),
) {
  const now = new Date(nowMs).toISOString();
  // 提交过程中进程中断时不重发，任务保留明确的失败原因供后续核对。
  await env.DB.prepare(
    "UPDATE generation_tasks SET status = 'failed', error_code = 'submission_interrupted', " +
      "completed_at = ?, updated_at = ?, lease_token = NULL, lease_until = NULL " +
      "WHERE status = 'submitting' AND lease_until <= ?",
  )
    .bind(now, now, nowMs)
    .run();
  const rows = await env.DB.prepare(
    "SELECT id FROM generation_tasks WHERE status IN ('queued', 'running') AND next_poll_at <= ? " +
      "AND (lease_until IS NULL OR lease_until <= ?) ORDER BY next_poll_at, created_at LIMIT 10",
  )
    .bind(nowMs, nowMs)
    .all<{ id: string }>();
  await Promise.all(
    rows.results.map((row) =>
      processGenerationTask(env, runtime, row.id, nowMs),
    ),
  );
  return rows.results.length;
}

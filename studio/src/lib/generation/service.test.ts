import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  availableModels,
  createGenerationTask,
  getGenerationTask,
  listGenerationTasks,
  processGenerationTask,
  runGenerationTasks,
} from "./service";
import { generationTestDatabase } from "./test-database";
import type {
  GenerationModelDefinition,
  GenerationProvider,
  GenerationRuntime,
  GenerationUpdate,
} from "./types";

export const testModel: GenerationModelDefinition = {
  id: "image-test",
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
const NOW = Date.parse("2026-10-20T01:00:00Z");

describe("generation task lifecycle with SQLite", () => {
  let db: ReturnType<typeof generationTestDatabase>;
  let provider: GenerationProvider;
  let runtime: GenerationRuntime;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    db = generationTestDatabase();
    provider = {
      submit: vi.fn(async () => ({
        status: "running" as const,
        taskId: "upstream_1",
      })),
      poll: vi.fn(async () => ({
        status: "succeeded" as const,
        outputs: [{ url: "https://media.example.test/result.png" }],
      })),
    };
    runtime = { models: [testModel], providers: { test: provider } };
  });
  afterEach(() => {
    db.sqlite.close();
    vi.useRealTimers();
  });
  const create = (binding: D1Database, key = "request_1", userId = "user_1") =>
    createGenerationTask(
      { DB: binding },
      userId,
      key,
      testModel,
      "A red cloud",
      {},
    );

  it("deduplicates the same user's key and rejects a changed request", async () => {
    const first = (await create(db.binding))!;
    const replay = (await create(db.binding))!;
    expect(first.created).toBe(true);
    expect(replay).toMatchObject({
      created: false,
      task: { id: first.task.id },
    });
    expect(
      await createGenerationTask(
        { DB: db.binding },
        "user_1",
        "request_1",
        testModel,
        "Different",
        {},
      ),
    ).toBeNull();
    expect((await create(db.binding, "request_1", "user_2"))!.task.id).not.toBe(
      first.task.id,
    );
  });

  it("keeps prompts and results private and supports stable pagination", async () => {
    const first = (await create(db.binding))!.task;
    await create(db.binding, "request_2");
    await create(db.binding, "other_user", "user_2");
    expect(
      await getGenerationTask({ DB: db.binding }, "user_2", first.id),
    ).toBeNull();
    const page = await listGenerationTasks({ DB: db.binding }, "user_1", 1, 0);
    const next = await listGenerationTasks({ DB: db.binding }, "user_1", 1, 1);
    expect(page.hasMore).toBe(true);
    expect(next.hasMore).toBe(false);
    expect(page.tasks[0].id).not.toBe(next.tasks[0].id);
    expect(page.tasks[0]).not.toHaveProperty("provider_task_id");
  });

  it("allows only one worker to submit a queued task", async () => {
    const task = (await create(db.binding))!.task;
    await Promise.all([
      processGenerationTask({ DB: db.binding }, runtime, task.id),
      processGenerationTask({ DB: db.binding }, runtime, task.id),
    ]);
    expect(provider.submit).toHaveBeenCalledTimes(1);
    expect(
      await getGenerationTask({ DB: db.binding }, "user_1", task.id),
    ).toMatchObject({ status: "running", outputs: [] });
    expect(provider.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        id: task.id,
        prompt: "A red cloud",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("supports immediate image results", async () => {
    provider.submit = vi.fn<GenerationProvider["submit"]>(async () => ({
      status: "succeeded",
      outputs: [{ url: "https://media.example.test/image.png" }],
    }));
    const task = (await create(db.binding))!.task;
    await processGenerationTask({ DB: db.binding }, runtime, task.id);
    expect(
      await getGenerationTask({ DB: db.binding }, "user_1", task.id),
    ).toMatchObject({
      status: "succeeded",
      completedAt: expect.any(String),
      outputs: [{ url: "https://media.example.test/image.png" }],
    });
  });

  it("persists video model identity and completes an asynchronous video task", async () => {
    const videoModel: GenerationModelDefinition = {
      ...testModel,
      id: "video-test",
      name: "Test Video",
      type: "video",
    };
    const task = (await createGenerationTask(
      { DB: db.binding },
      "user_1",
      "video_request",
      videoModel,
      "A moving cloud",
      {},
    ))!.task;
    vi.mocked(provider.poll).mockResolvedValue({
      status: "succeeded",
      outputs: [{ url: "https://media.example.test/result.mp4" }],
    });
    await processGenerationTask({ DB: db.binding }, runtime, task.id);
    vi.setSystemTime(NOW + 16_000);
    await processGenerationTask({ DB: db.binding }, runtime, task.id);
    expect(
      await getGenerationTask({ DB: db.binding }, "user_1", task.id),
    ).toMatchObject({
      type: "video",
      modelId: "video-test",
      status: "succeeded",
      outputs: [{ url: "https://media.example.test/result.mp4" }],
    });
  });

  it("polls an asynchronous task and leaves terminal states unchanged", async () => {
    const task = (await create(db.binding))!.task;
    await processGenerationTask({ DB: db.binding }, runtime, task.id);
    vi.setSystemTime(NOW + 16_000);
    await runGenerationTasks({ DB: db.binding }, runtime);
    await runGenerationTasks({ DB: db.binding }, runtime);
    expect(provider.poll).toHaveBeenCalledTimes(1);
    expect(
      await getGenerationTask({ DB: db.binding }, "user_1", task.id),
    ).toMatchObject({ status: "succeeded" });
    expect(provider.submit).toHaveBeenCalledTimes(1);
  });

  it("continues polling after a temporary status-query failure without resubmitting", async () => {
    vi.mocked(provider.poll).mockRejectedValueOnce(new Error("temporary"));
    const task = (await create(db.binding))!.task;
    await processGenerationTask({ DB: db.binding }, runtime, task.id);
    vi.setSystemTime(NOW + 16_000);
    await processGenerationTask({ DB: db.binding }, runtime, task.id);
    expect(
      await getGenerationTask({ DB: db.binding }, "user_1", task.id),
    ).toMatchObject({ status: "running" });
    vi.setSystemTime(NOW + 32_000);
    await processGenerationTask({ DB: db.binding }, runtime, task.id);
    expect(
      await getGenerationTask({ DB: db.binding }, "user_1", task.id),
    ).toMatchObject({ status: "succeeded" });
    expect(provider.submit).toHaveBeenCalledTimes(1);
  });

  it.each([
    { outputs: [] },
    { outputs: [{ url: "javascript:alert(1)" }] },
    { outputs: [{ url: "http://insecure.test/result.png" }] },
  ])("rejects invalid successful output $outputs", async ({ outputs }) => {
    provider.submit = vi.fn<GenerationProvider["submit"]>(async () => ({
      status: "succeeded",
      outputs,
    }));
    const task = (await create(db.binding))!.task;
    await processGenerationTask({ DB: db.binding }, runtime, task.id);
    expect(
      await getGenerationTask({ DB: db.binding }, "user_1", task.id),
    ).toMatchObject({
      status: "failed",
      errorCode: "invalid_result",
      outputs: [],
    });
  });

  it("keeps upstream exception details out of user-visible records and does not repeat uncertain submissions", async () => {
    provider.submit = vi.fn(async () => {
      throw new Error("upstream secret=private-token");
    });
    const task = (await create(db.binding))!.task;
    await processGenerationTask({ DB: db.binding }, runtime, task.id);
    await runGenerationTasks({ DB: db.binding }, runtime);
    const saved = await getGenerationTask(
      { DB: db.binding },
      "user_1",
      task.id,
    );
    expect(saved).toMatchObject({
      status: "failed",
      errorCode: "submission_interrupted",
    });
    expect(JSON.stringify(saved)).not.toContain("private-token");
    expect(provider.submit).toHaveBeenCalledTimes(1);
  });

  it("recovers an interrupted submit without issuing another upstream job", async () => {
    const task = (await create(db.binding))!.task;
    db.sqlite
      .prepare(
        "UPDATE generation_tasks SET status = 'submitting', lease_token = 'old', lease_until = ? WHERE id = ?",
      )
      .run(NOW - 1, task.id);
    await runGenerationTasks({ DB: db.binding }, runtime);
    expect(provider.submit).not.toHaveBeenCalled();
    expect(
      await getGenerationTask({ DB: db.binding }, "user_1", task.id),
    ).toMatchObject({ status: "failed", errorCode: "submission_interrupted" });
  });

  it("does not let a slow worker overwrite a result saved by a newer lease", async () => {
    const task = (await create(db.binding))!.task;
    await processGenerationTask({ DB: db.binding }, runtime, task.id);
    let finishOld!: (result: GenerationUpdate) => void;
    vi.mocked(provider.poll).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    );
    vi.setSystemTime(NOW + 16_000);
    const oldWorker = processGenerationTask(
      { DB: db.binding },
      runtime,
      task.id,
    );
    await Promise.resolve();
    expect(provider.poll).toHaveBeenCalledTimes(1);
    vi.setSystemTime(NOW + 80_000);
    await processGenerationTask({ DB: db.binding }, runtime, task.id);
    finishOld({ status: "failed" });
    await oldWorker;
    expect(
      await getGenerationTask({ DB: db.binding }, "user_1", task.id),
    ).toMatchObject({ status: "succeeded", errorCode: null });
  });

  it("honors the model's time limit", async () => {
    const task = (await create(db.binding))!.task;
    await processGenerationTask({ DB: db.binding }, runtime, task.id);
    vi.setSystemTime(NOW + 181_000);
    await processGenerationTask({ DB: db.binding }, runtime, task.id);
    expect(provider.poll).not.toHaveBeenCalled();
    expect(
      await getGenerationTask({ DB: db.binding }, "user_1", task.id),
    ).toMatchObject({ status: "failed", errorCode: "generation_timeout" });
  });

  it("fails explicitly if the registered provider is removed", async () => {
    expect(availableModels({ models: [testModel], providers: {} })).toEqual([]);
    const task = (await create(db.binding))!.task;
    await processGenerationTask(
      { DB: db.binding },
      { models: [], providers: {} },
      task.id,
    );
    expect(
      await getGenerationTask({ DB: db.binding }, "user_1", task.id),
    ).toMatchObject({ status: "failed", errorCode: "provider_unavailable" });
  });

  it("removes tasks when their account is deleted", async () => {
    await create(db.binding);
    db.sqlite.prepare("DELETE FROM users WHERE id = 'user_1'").run();
    expect(
      db.sqlite.prepare("SELECT COUNT(*) AS count FROM generation_tasks").get()
        ?.count,
    ).toBe(0);
  });
});

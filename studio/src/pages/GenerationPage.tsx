import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Image,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  Video,
} from "lucide-react";
import { useSession } from "../hooks/useSession";
import type { Route } from "../hooks/useRoute";
import { useI18n } from "../i18n/I18nProvider";
import { INTL_LOCALES } from "../i18n/config";
import { apiErrorMessage } from "../i18n/utils";
import { api, ApiRequestError } from "../lib/api";
import type { GenerationModel, GenerationTask } from "../lib/generation/types";

const PAGE_SIZE = 20;
const active = (task: GenerationTask) =>
  ["queued", "submitting", "running"].includes(task.status);

export function GenerationPage({
  onNavigate,
}: {
  onNavigate: (route: Route) => void;
}) {
  const { user, isPending } = useSession();
  const { messages, locale } = useI18n();
  const copy = messages.generation;
  const [models, setModels] = useState<GenerationModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [tasks, setTasks] = useState<GenerationTask[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef<{ signature: string; key: string } | null>(null);
  const userId = user?.id;

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const [catalog, history] = await Promise.all([
        api<{ models: GenerationModel[] }>("/api/generation/models", {
          signal,
        }),
        userId
          ? api<{ tasks: GenerationTask[]; hasMore: boolean }>(
              "/api/generation/tasks?limit=" + PAGE_SIZE + "&offset=" + offset,
              { signal },
            )
          : Promise.resolve({ tasks: [], hasMore: false }),
      ]);
      setModels(catalog.models);
      setModelId((current) =>
        catalog.models.some((model) => model.id === current)
          ? current
          : catalog.models[0]?.id || "",
      );
      setTasks(history.tasks);
      setHasMore(history.hasMore);
    },
    [offset, userId],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setMessage("");
    load(controller.signal)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setMessage(messages.errors.load);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [load, messages.errors.load]);

  const hasActive = tasks.some(active);
  useEffect(() => {
    if (!userId || !hasActive) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      void load(controller.signal).catch(() => undefined);
    }, 5_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [hasActive, load, userId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const payload = { modelId, prompt: prompt.trim() };
    const signature = JSON.stringify(payload);
    if (request.current?.signature !== signature)
      request.current = { signature, key: crypto.randomUUID() };
    setBusy(true);
    setMessage("");
    try {
      const { task } = await api<{ task: GenerationTask }>(
        "/api/generation/tasks",
        {
          method: "POST",
          headers: { "idempotency-key": request.current.key },
          body: signature,
        },
      );
      request.current = null;
      setPrompt("");
      if (offset === 0) {
        setTasks((current) =>
          [task, ...current.filter((entry) => entry.id !== task.id)].slice(
            0,
            PAGE_SIZE,
          ),
        );
        await load().catch(() => setMessage(messages.errors.load));
      } else setOffset(0);
    } catch (error) {
      setMessage(
        error instanceof ApiRequestError &&
          error.code === "generation_unavailable"
          ? copy.unavailable
          : error instanceof ApiRequestError &&
              [401, 403, 429].includes(error.status)
            ? apiErrorMessage(error.code, messages)
            : error instanceof ApiRequestError && [400, 413].includes(error.status)
              ? copy.invalidRequest
              : copy.submitError,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="generation-page">
      <div className="page-heading">
        <p className="section-label">{copy.title}</p>
        <h1>{copy.history}</h1>
        <p className="lede">{copy.description}</p>
      </div>
      <div className="generation-workspace">
        <div className="panel generation-composer">
          <div className="generation-panel-heading">
            <Sparkles size={19} aria-hidden="true" />
            <h2>{copy.title}</h2>
          </div>
          {!isPending && !user && (
            <p className="hint">{messages.errors.unauthenticated}</p>
          )}
          {!loading && models.length === 0 && (
            <p className="generation-notice" role="status">
              {copy.unavailable}
            </p>
          )}
          <form
            onSubmit={(event) => {
              void submit(event);
            }}
          >
            <label htmlFor="generation-model">{copy.model}</label>
            <select
              id="generation-model"
              value={modelId}
              onChange={(event) => setModelId(event.target.value)}
              disabled={busy || loading || !models.length}
              required
            >
              {!models.length && <option value="">{copy.model}</option>}
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
            <label htmlFor="generation-prompt">{copy.prompt}</label>
            <textarea
              id="generation-prompt"
              rows={6}
              maxLength={4_000}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={copy.placeholder}
              disabled={busy}
              required
            />
            {user ? (
              <button
                className="auth-primary"
                type="submit"
                disabled={busy || loading || !modelId || !prompt.trim()}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={16} aria-hidden="true" />
                ) : (
                  <Sparkles size={16} aria-hidden="true" />
                )}
                {busy ? copy.submitting : copy.submit}
              </button>
            ) : (
              <button
                className="auth-primary"
                type="button"
                disabled={isPending}
                onClick={() => onNavigate("/signin")}
              >
                {messages.authPage.signIn}
              </button>
            )}
          </form>
          {message && (
            <p className="message" role="status">
              {message}
            </p>
          )}
        </div>
        <div className="generation-history">
          <div className="generation-panel-heading">
            <h2>{copy.history}</h2>
            <button
              className="auth-secondary"
              type="button"
              disabled={loading || !user}
              onClick={() => {
                setLoading(true);
                void load()
                  .catch(() => setMessage(messages.errors.load))
                  .finally(() => setLoading(false));
              }}
            >
              <RefreshCw size={14} aria-hidden="true" />
              {copy.refresh}
            </button>
          </div>
          {loading ? (
            <p className="empty" role="status">
              {messages.auth.loading}
            </p>
          ) : (
            !tasks.length && (
              <div className="panel generation-empty">
                <Sparkles size={28} aria-hidden="true" />
                <p>{copy.empty}</p>
              </div>
            )
          )}
          <div className="generation-task-list">
            {tasks.map((task) => (
              <article className="panel generation-task" key={task.id}>
                <div className="generation-task-heading">
                  <span>
                    {task.type === "image" ? (
                      <Image size={16} aria-hidden="true" />
                    ) : (
                      <Video size={16} aria-hidden="true" />
                    )}
                    {task.modelName}
                  </span>
                  <span className="generation-status" data-status={task.status}>
                    {active(task) && (
                      <LoaderCircle
                        className="spin"
                        size={12}
                        aria-hidden="true"
                      />
                    )}
                    {copy.status[task.status]}
                  </span>
                </div>
                <p className="generation-task-prompt">{task.prompt}</p>
                <time dateTime={task.createdAt}>
                  {new Intl.DateTimeFormat(INTL_LOCALES[locale], {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(task.createdAt))}
                </time>
                {task.errorCode && (
                  <p className="generation-failure">
                    {copy.failure[task.errorCode]}
                  </p>
                )}
                {!!task.outputs.length && (
                  <div className="generation-results">
                    {task.outputs.map((output, index) => (
                      <div key={index}>
                        {task.type === "image" ? (
                          <img
                            src={output.url}
                            alt={task.prompt}
                            loading="lazy"
                          />
                        ) : (
                          <video
                            src={output.url}
                            controls
                            preload="metadata"
                            aria-label={task.prompt}
                          />
                        )}
                        <a href={output.url} target="_blank" rel="noreferrer">
                          {copy.result}
                          <ArrowUpRight size={13} aria-hidden="true" />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
          {(offset > 0 || hasMore) && (
            <div className="generation-pagination">
              <button
                className="auth-secondary"
                type="button"
                disabled={loading || offset === 0}
                onClick={() =>
                  setOffset((value) => Math.max(0, value - PAGE_SIZE))
                }
              >
                {copy.previous}
              </button>
              <button
                className="auth-secondary"
                type="button"
                disabled={loading || !hasMore}
                onClick={() => setOffset((value) => value + PAGE_SIZE)}
              >
                {copy.next}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

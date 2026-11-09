import type { ServiceEnv } from "../../env";

export type GenerationType = "image" | "video";
export type GenerationStatus =
  "queued" | "submitting" | "running" | "succeeded" | "failed";
export type GenerationErrorCode =
  | "provider_failed"
  | "invalid_result"
  | "provider_unavailable"
  | "submission_interrupted"
  | "generation_timeout";

export interface GenerationOutput {
  url: string;
}

export interface GenerationTask {
  id: string;
  type: GenerationType;
  modelId: string;
  modelName: string;
  prompt: string;
  input: Record<string, unknown>;
  status: GenerationStatus;
  outputs: GenerationOutput[];
  errorCode: GenerationErrorCode | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface GenerationModel {
  id: string;
  name: string;
  type: GenerationType;
}

export interface GenerationModelDefinition extends GenerationModel {
  providerId: string;
  timeoutSeconds: number;
  parseInput: (input: Record<string, unknown>) => Record<string, unknown>;
}

export type GenerationUpdate =
  | { status: "running" }
  | { status: "succeeded"; outputs: GenerationOutput[] }
  | { status: "failed" };

export interface GenerationRequest {
  id: string;
  modelId: string;
  type: GenerationType;
  prompt: string;
  input: Record<string, unknown>;
  signal: AbortSignal;
}

export interface GenerationProvider {
  submit: (
    request: GenerationRequest,
  ) => Promise<
    | { status: "running"; taskId: string }
    | Exclude<GenerationUpdate, { status: "running" }>
  >;
  poll: (
    request: GenerationRequest & { taskId: string },
  ) => Promise<GenerationUpdate>;
}

export interface GenerationRuntime {
  models: readonly GenerationModelDefinition[];
  providers: Readonly<Record<string, GenerationProvider>>;
}

export type GenerationRuntimeFactory = (env: ServiceEnv) => GenerationRuntime;

export interface GenerationTaskRow {
  id: string;
  user_id: string;
  request_key: string;
  request_hash: string;
  type: GenerationType;
  model_id: string;
  model_name: string;
  provider_id: string;
  provider_task_id: string | null;
  prompt: string;
  input: string;
  status: GenerationStatus;
  outputs: string;
  error_code: GenerationErrorCode | null;
  timeout_seconds: number;
  lease_token: string | null;
  lease_until: number | null;
  next_poll_at: number;
  expires_at: number | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

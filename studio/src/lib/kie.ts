import type { ServiceEnv } from "../env";
import type { GenerationProvider, GenerationUpdate } from "./generation/types";

const API_BASE = "https://api.kie.ai";
const UPLOAD_BASE = "https://kieai.redpandaai.co";
// KIE 临时文件和生成结果所在的域名，提交前和收结果时都只认这些
export const KIE_FILE_HOSTS = ["tempfile.redpandaai.co", "tempfile.aiquickdraw.com"];

interface KieBody<T> {
  code?: number;
  msg?: string;
  data?: T;
}

async function kie<T>(env: ServiceEnv, url: string, init: RequestInit): Promise<T> {
  if (!env.KIE_API_KEY) throw new Error("kie_not_configured");
  const response = await fetch(url, {
    ...init,
    headers: { authorization: "Bearer " + env.KIE_API_KEY, "content-type": "application/json", ...init.headers },
  });
  const body = await response.json<KieBody<T>>().catch((): KieBody<T> => ({}));
  // KIE 的业务错误码在响应体里，HTTP 200 不代表成功
  if (!response.ok || body.code !== 200 || body.data === undefined) {
    throw new Error("kie_" + (body.code ?? response.status));
  }
  return body.data;
}

export function isKieFileUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && KIE_FILE_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

// 上传到 KIE 临时文件服务，24 小时后自动删除
export async function uploadToKie(
  env: ServiceEnv,
  bytes: Uint8Array,
  mimeType: string,
  fileName: string,
  signal?: AbortSignal,
): Promise<string> {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const data = await kie<{ downloadUrl?: string }>(env, UPLOAD_BASE + "/api/file-base64-upload", {
    method: "POST",
    body: JSON.stringify({
      base64Data: "data:" + mimeType + ";base64," + btoa(binary),
      uploadPath: "tryon/" + crypto.randomUUID(),
      fileName,
    }),
    signal,
  });
  if (!isKieFileUrl(data.downloadUrl)) throw new Error("kie_upload_invalid_url");
  return data.downloadUrl;
}

interface RecordInfo {
  state?: string;
  failCode?: string | null;
  response?: { resultUrls?: unknown };
  resultJson?: string;
}

function resultUrls(record: RecordInfo): string[] {
  let urls = record.response?.resultUrls;
  if (!Array.isArray(urls) && record.resultJson) {
    try {
      urls = (JSON.parse(record.resultJson) as { resultUrls?: unknown }).resultUrls;
    } catch {
      urls = undefined;
    }
  }
  return Array.isArray(urls) ? urls.filter((u): u is string => typeof u === "string" && u.startsWith("https://")) : [];
}

function toUpdate(record: RecordInfo): GenerationUpdate {
  if (record.state === "success") {
    const urls = resultUrls(record);
    return urls.length ? { status: "succeeded", outputs: urls.slice(0, 20).map((url) => ({ url })) } : { status: "failed" };
  }
  if (record.state === "fail") return { status: "failed" };
  return { status: "running" };
}

// 统一任务接口的服务商：input 里的字段原样交给 KIE 的 createTask
export function kieProvider(env: ServiceEnv): GenerationProvider {
  return {
    async submit(request) {
      const kieModel = request.input.kieModel;
      const kieInput = request.input.kieInput;
      if (typeof kieModel !== "string" || !kieInput || typeof kieInput !== "object") return { status: "failed" };
      const data = await kie<{ taskId?: string }>(env, API_BASE + "/api/v1/jobs/createTask", {
        method: "POST",
        body: JSON.stringify({ model: kieModel, input: kieInput }),
        signal: request.signal,
      });
      if (!data.taskId) return { status: "failed" };
      return { status: "running", taskId: data.taskId };
    },
    async poll(request) {
      const record = await kie<RecordInfo>(
        env,
        API_BASE + "/api/v1/jobs/recordInfo?taskId=" + encodeURIComponent(request.taskId),
        { method: "GET", signal: request.signal },
      );
      return toUpdate(record);
    },
  };
}

export const __test = { toUpdate, resultUrls };

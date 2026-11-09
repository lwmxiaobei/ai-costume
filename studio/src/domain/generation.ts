import { z } from "zod";
import type { GenerationProvider, GenerationRuntimeFactory } from "../lib/generation/types";
import { isKieFileUrl, kieProvider } from "../lib/kie";

export const TRYON_MODEL_ID = "tryon";
export const DEFAULT_KIE_TRYON_MODEL = "google/nano-banana-edit";

// 试穿任务的 input 由服务端拼好（见 src/lib/tryon/routes.ts），这里只做最后一道校验
const tryonInput = z
  .object({
    costumeId: z.string().regex(/^[A-Z]{3}-\d{4}$/),
    kieModel: z.string().min(1).max(128),
    kieInput: z.record(z.string(), z.unknown()),
  })
  .strict();

export const generationRuntime: GenerationRuntimeFactory = (env) => ({
  models: env.KIE_API_KEY
    ? [
        {
          id: TRYON_MODEL_ID,
          name: "虚拟试穿",
          type: "image",
          providerId: "kie",
          timeoutSeconds: 600,
          parseInput: (input) => {
            const parsed = tryonInput.parse(input);
            const images = Object.values(parsed.kieInput).flat().filter((v) => typeof v === "string" && v.startsWith("https://"));
            if (!images.some(isKieFileUrl)) throw new Error("tryon_photo_required");
            return parsed;
          },
        },
      ]
    : [],
  providers: (env.KIE_API_KEY ? { kie: kieProvider(env) } : {}) as Record<string, GenerationProvider>,
});

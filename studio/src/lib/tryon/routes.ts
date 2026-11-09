import type { Hono } from "hono";
import { z } from "zod";
import type { AppBindings, ServiceEnv } from "../../env";
import costumes from "../../content/costumes.json";
import { DEFAULT_KIE_TRYON_MODEL, generationRuntime, TRYON_MODEL_ID } from "../../domain/generation";
import {
  chargeCredits,
  creditBalance,
  creditsPerPack,
  CREDITS_PROJECT_ID,
  grantSignupBonus,
  refundFailedCharges,
  tryonCost,
} from "../credits";
import { requireJsonBody, requireSession, requireVerifiedEmail } from "../guard";
import { createGenerationTask, processGenerationTask } from "../generation/service";
import { isEmailEnabled } from "../email/provider";
import { isKieFileUrl, uploadToKie } from "../kie";
import { activePaymentProvider, providerProductId, unitPriceCents } from "../payments/config";
import { idempotent } from "../security/idempotency";
import { rateLimit } from "../security/rate-limit";

interface Costume {
  id: string;
  cat: string;
  kw: string;
}

const COSTUMES = new Map((costumes as Costume[]).map((c) => [c.id, c]));
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const DEFAULT_GALLERY = "https://ai-costume-zh.lwmlxy520.workers.dev";

// 提示词由服务端固定，用户不能自定义，避免被拿来生成露骨或冒充他人的内容
const PROMPT =
  "Virtual try-on. Image 1 is a photo of a real person. Image 2 is a product image of a complete outfit with no person in it. "
  + "Dress the person from image 1 in the outfit from image 2, including every garment, shoe and accessory shown, "
  + "matching its colors, materials, patterns and details. Keep the person's face, identity, hair, skin tone, body shape, pose "
  + "and the original background unchanged. The person stays fully clothed. Photorealistic, natural lighting, high detail.";

const createSchema = z
  .object({
    costumeId: z.string().regex(/^[A-Z]{3}-\d{4}$/),
    photoUrl: z.string().url().max(512),
    consent: z.literal(true),
  })
  .strict();

const galleryBase = (env: ServiceEnv) => (env.GALLERY_BASE_URL || DEFAULT_GALLERY).replace(/\/+$/, "");

function costumeView(env: ServiceEnv, c: Costume) {
  const base = galleryBase(env);
  return {
    id: c.id,
    cat: c.cat,
    kw: c.kw,
    thumb: base + "/g/thumbs/" + c.id + ".webp",
    img: base + "/g/img/" + c.id + ".webp",
  };
}

function sniffImage(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") {
    return "image/webp";
  }
  return null;
}

// 全站名额只算未失败的任务（失败会退积分，不能用来刷掉名额）；个人名额连失败一起算
async function tasksToday(env: ServiceEnv, nowMs: number, userId: string): Promise<{ site: number; user: number }> {
  const day = new Date(nowMs).toISOString().slice(0, 10) + "T00:00:00.000Z";
  const row = await env.DB.prepare(
    "SELECT SUM(CASE WHEN status <> 'failed' THEN 1 ELSE 0 END) AS site, SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS mine "
    + "FROM generation_tasks WHERE model_id = ? AND created_at >= ?",
  ).bind(userId, TRYON_MODEL_ID, day).first<{ site: number | null; mine: number | null }>();
  return { site: row?.site ?? 0, user: row?.mine ?? 0 };
}

const capVar = (value: string | undefined, fallback: number) => {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function registerTryonRoutes(app: Hono<AppBindings>): void {
  app.get("/api/tryon/costumes", (context) => {
    context.header("cache-control", "public, max-age=3600");
    return context.json({ costumes: (costumes as Costume[]).map((c) => costumeView(context.env, c)) });
  });

  app.get("/api/tryon/me", requireSession(), async (context) => {
    const user = context.get("user");
    // 赠送积分只发给验证过邮箱的账号，防止批量注册领取
    if (user.emailVerified) await grantSignupBonus(context.env, user.id, user.email);
    await refundFailedCharges(context.env);
    const provider = activePaymentProvider(context.env);
    return context.json({
      balance: await creditBalance(context.env, user.id),
      cost: tryonCost(context.env),
      pack: {
        credits: creditsPerPack(context.env),
        priceCents: unitPriceCents(context.env),
        projectId: CREDITS_PROJECT_ID,
        enabled: Boolean(provider && providerProductId(context.env, provider)),
      },
      available: Boolean(context.env.KIE_API_KEY),
      needsVerification: !user.emailVerified && isEmailEnabled(context.env),
    });
  });

  app.post(
    "/api/tryon/photo",
    requireSession(),
    requireVerifiedEmail(),
    rateLimit({ scope: "tryon_photo", limit: 30, windowSeconds: 3_600, by: "ip+user" }),
    async (context) => {
      if (!context.env.KIE_API_KEY) {
        return context.json({ code: "tryon_unavailable", error: "Try-on is not configured." }, 503);
      }
      const length = Number(context.req.header("content-length") || 0);
      if (length > MAX_PHOTO_BYTES + 64 * 1024) {
        return context.json({ code: "photo_too_large", error: "Photo must be 8 MB or smaller." }, 413);
      }
      const form = await context.req.formData().catch(() => null);
      const file = form?.get("photo");
      if (!file || typeof file === "string") {
        return context.json({ code: "photo_required", error: "Choose a photo." }, 400);
      }
      if (file.size > MAX_PHOTO_BYTES) {
        return context.json({ code: "photo_too_large", error: "Photo must be 8 MB or smaller." }, 413);
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = sniffImage(bytes);
      if (!mime) return context.json({ code: "photo_invalid", error: "Use a JPEG, PNG or WebP photo." }, 400);
      try {
        const ext = mime === "image/jpeg" ? "jpg" : mime.slice(6);
        const photoUrl = await uploadToKie(context.env, bytes, mime, "photo." + ext);
        return context.json({ photoUrl });
      } catch (error) {
        console.error("tryon_photo_upload", error instanceof Error ? error.message : "unknown");
        return context.json({ code: "upload_failed", error: "Upload failed. Try again." }, 502);
      }
    },
  );

  app.post(
    "/api/tryon",
    requireSession(),
    requireVerifiedEmail(),
    rateLimit({ scope: "tryon_create", limit: 30, windowSeconds: 3_600, by: "ip+user" }),
    requireJsonBody(4_096),
    idempotent({ required: true }),
    async (context) => {
      const env = context.env;
      const parsed = createSchema.safeParse(await context.req.json().catch(() => null));
      if (!parsed.success) {
        return context.json({ code: "invalid_tryon", error: "Invalid try-on request." }, 400);
      }
      const costume = COSTUMES.get(parsed.data.costumeId);
      if (!costume) {
        return context.json({ code: "costume_not_available", error: "This outfit is not available for try-on." }, 400);
      }
      if (!isKieFileUrl(parsed.data.photoUrl)) {
        return context.json({ code: "photo_required", error: "Upload a photo first." }, 400);
      }
      const runtime = generationRuntime(env);
      const model = runtime.models.find((m) => m.id === TRYON_MODEL_ID);
      if (!model) return context.json({ code: "tryon_unavailable", error: "Try-on is not configured." }, 503);

      const user = context.get("user");
      const today = await tasksToday(env, Date.now(), user.id);
      if (today.site >= capVar(env.TRYON_DAILY_CAP, 500)) {
        return context.json({ code: "tryon_daily_cap", error: "Today's try-on capacity is used up. Try again tomorrow." }, 503);
      }
      if (today.user >= capVar(env.TRYON_USER_DAILY_CAP, 50)) {
        return context.json({ code: "tryon_user_daily_cap", error: "You reached today's try-on limit." }, 429);
      }

      const requestKey = context.req.header("idempotency-key")!;
      const cost = tryonCost(env);
      if (!(await chargeCredits(env, user.id, "tryon:" + requestKey, cost))) {
        return context.json({ code: "insufficient_credits", error: "Not enough credits." }, 402);
      }

      const kieModel = env.KIE_TRYON_MODEL || DEFAULT_KIE_TRYON_MODEL;
      const imagesField = env.KIE_TRYON_IMAGES_FIELD || "image_urls";
      const costumeUrl = galleryBase(env) + "/g/png/" + costume.id + ".png";
      const input = model.parseInput({
        costumeId: costume.id,
        kieModel,
        kieInput: {
          prompt: PROMPT,
          [imagesField]: [parsed.data.photoUrl, costumeUrl],
          output_format: "png",
          image_size: "2:3",
        },
      });
      const result = await createGenerationTask(env, user.id, requestKey, model, "试穿 " + costume.id, input);
      if (!result) {
        return context.json({ code: "idempotency_key_reused", error: "This key belongs to another request." }, 409);
      }
      if (result.task.status === "queued") {
        context.executionCtx.waitUntil(processGenerationTask(env, runtime, result.task.id));
      }
      return context.json(
        { task: result.task, created: result.created, balance: await creditBalance(env, user.id) },
        result.created ? 201 : 200,
      );
    },
  );
}

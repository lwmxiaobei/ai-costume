import { z } from "zod";
import { LOCALES } from "../i18n/config";

export const createProjectSchema = z.object({
  url: z.string().trim().min(1).max(2_048),
  turnstileToken: z.string().max(2_048).optional(),
});

export const checkoutInputSchema = z.object({
  projectId: z.string().regex(/^project_[0-9a-f-]{36}$/i, "Invalid project."),
  quantity: z.number().int().min(1).max(100),
});

const priceIdSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9_-]+$/i, "Invalid price.");

export const subscriptionCheckoutSchema = z.object({
  priceId: priceIdSchema,
  quantity: z.number().int().min(1).max(500).optional(),
});

export const subscriptionChangeSchema = z.object({
  priceId: priceIdSchema,
  quantity: z.number().int().min(1).max(500).optional(),
});

export const subscriptionCancelSchema = z.object({
  atPeriodEnd: z.boolean().optional(),
  reason: z.string().trim().max(500).optional(),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  image: z.string().trim().url().max(2_048).nullable().optional(),
  locale: z.enum(LOCALES).optional(),
});

export const adminUserQuerySchema = z.object({
  query: z.string().trim().max(120).optional(),
  role: z.enum(["user", "admin"]).optional(),
  banned: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(100_000).optional(),
});

export const adminBanSchema = z.object({
  banned: z.boolean(),
  reason: z.string().trim().max(200).optional(),
  expiresInDays: z.number().int().min(1).max(3_650).optional(),
});

export const adminRoleSchema = z.object({
  role: z.enum(["user", "admin"]),
});

export const adminPlanSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().max(300).optional(),
  isActive: z.boolean().optional(),
  trialDays: z.number().int().min(0).max(90).optional(),
  features: z.array(z.string().trim().min(1).max(40)).max(40).optional(),
  quotas: z.record(z.string().trim().min(1).max(40), z.number().int().min(-1)).optional(),
});

export const adminSettingSchema = z.object({
  value: z.string().max(2_000),
});

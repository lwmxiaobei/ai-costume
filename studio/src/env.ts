import type { SessionAccount } from "./lib/auth";

export type PaymentProvider = "creem" | "polar" | "stripe" | "waffo";
export type EmailProvider = "mailgun" | "postmark" | "resend";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_ENV: string;
  APP_NAME?: string;
  PUBLIC_APP_URL?: string;
  CANONICAL_HOST?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ADMIN_EMAILS?: string;
  UNIT_PRICE_CENTS?: string;
  PAYMENT_PROVIDER?: string;
  WAFFO_MERCHANT_ID?: string;
  WAFFO_STORE_ID?: string;
  WAFFO_PRIVATE_KEY?: string;
  WAFFO_ENVIRONMENT?: string;
  WAFFO_PRODUCT_ID?: string;
  CREEM_API_BASE?: string;
  CREEM_API_KEY?: string;
  CREEM_WEBHOOK_SECRET?: string;
  CREEM_PRODUCT_ID?: string;
  POLAR_API_BASE?: string;
  POLAR_ACCESS_TOKEN?: string;
  POLAR_WEBHOOK_SECRET?: string;
  POLAR_PRODUCT_ID?: string;
  STRIPE_API_BASE?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRODUCT_ID?: string;
  STRIPE_PORTAL_CONFIGURATION_ID?: string;
  EMAIL_PROVIDER?: string;
  EMAIL_FROM?: string;
  EMAIL_REPLY_TO?: string;
  RESEND_API_BASE?: string;
  RESEND_API_KEY?: string;
  POSTMARK_API_BASE?: string;
  POSTMARK_SERVER_TOKEN?: string;
  POSTMARK_MESSAGE_STREAM?: string;
  MAILGUN_API_BASE?: string;
  MAILGUN_API_KEY?: string;
  MAILGUN_DOMAIN?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  MAGIC_LINK_ENABLED?: string;
  TURNSTILE_API_BASE?: string;
  RATE_LIMIT_DISABLED?: string;
  KIE_API_KEY?: string;
  KIE_TRYON_MODEL?: string;
  KIE_TRYON_IMAGES_FIELD?: string;
  GALLERY_BASE_URL?: string;
  CREDITS_PER_PACK?: string;
  TRYON_CREDIT_COST?: string;
  TRYON_FREE_CREDITS?: string;
  TRYON_DAILY_CAP?: string;
  TRYON_USER_DAILY_CAP?: string;
  CHECKOUT_PROJECT_ID?: string;
}

export type ServiceEnv = Pick<Env, "DB"> & Partial<Omit<Env, "DB" | "ASSETS">>;

export type AppVariables = {
  user: SessionAccount;
  resource: Record<string, unknown>;
};

export type AppBindings = { Bindings: Env; Variables: AppVariables };

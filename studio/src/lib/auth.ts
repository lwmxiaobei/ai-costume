import { betterAuth } from "better-auth";
import { admin, captcha, magicLink, twoFactor } from "better-auth/plugins";
import type { ServiceEnv } from "../env";
import { isEmailEnabled } from "./email/provider";
import { sendEmail } from "./email/send";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;
const MIN_PASSWORD_LENGTH = 12;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const CAPTCHA_ENDPOINTS = [
  "/sign-up/email",
  "/sign-in/email",
  "/sign-in/magic-link",
  "/forget-password",
  "/request-password-reset",
  "/send-verification-email",
];

export type AuthEnv = ServiceEnv;

export function isLocalHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname);
}

export function isValidAuthBaseUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    const secure = url.protocol === "https:" || (url.protocol === "http:" && isLocalHost(url.hostname));
    return secure && url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isBetterAuthConfigured(env: AuthEnv): boolean {
  return Boolean(
    env.BETTER_AUTH_SECRET
    && env.BETTER_AUTH_SECRET.length >= 32
    && isValidAuthBaseUrl(env.BETTER_AUTH_URL),
  );
}

export function isGoogleAuthConfigured(env: AuthEnv): boolean {
  return Boolean(
    isBetterAuthConfigured(env)
    && env.GOOGLE_CLIENT_ID
    && env.GOOGLE_CLIENT_SECRET,
  );
}

export function isTurnstileConfigured(env: AuthEnv): boolean {
  return Boolean(env.TURNSTILE_SECRET_KEY && env.TURNSTILE_SITE_KEY);
}

export function isEmailPasswordEnabled(env: AuthEnv): boolean {
  return isBetterAuthConfigured(env);
}

export function isMagicLinkEnabled(env: AuthEnv): boolean {
  // Magic Link 登录不经过两步验证，默认关闭，需要时显式打开
  return env.MAGIC_LINK_ENABLED === "true" && isBetterAuthConfigured(env) && isEmailEnabled(env);
}

export function trustedAuthOrigins(env: AuthEnv): string[] {
  if (env.APP_ENV === "production") return [];
  return ["http://localhost:*", "http://127.0.0.1:*"];
}

export function adminEmails(env: AuthEnv): string[] {
  return (env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
}

function authPlugins(env: AuthEnv) {
  const plugins: ReturnType<typeof admin>[] = [];
  const list: unknown[] = [
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
      schema: {
        user: {
          fields: {
            banReason: "ban_reason",
            banExpires: "ban_expires",
          },
        },
        session: { fields: { impersonatedBy: "impersonated_by" } },
      },
    }),
    twoFactor({
      issuer: env.APP_NAME || "衣装集 试穿",
      schema: {
        user: { fields: { twoFactorEnabled: "two_factor_enabled" } },
        twoFactor: {
          modelName: "two_factors",
          fields: {
            backupCodes: "backup_codes",
            userId: "user_id",
            failedVerificationCount: "failed_verification_count",
            lockedUntil: "locked_until",
          },
        },
      },
    }),
  ];

  if (isMagicLinkEnabled(env)) {
    list.push(magicLink({
      expiresIn: 60 * 15,
      sendMagicLink: async ({ email, url, token }) => {
        await sendEmail(env, {
          to: email,
          template: "magic_link",
          idempotencyKey: "magic_link:" + token,
          variables: { url },
        });
      },
    }));
  }

  if (isTurnstileConfigured(env)) {
    list.push(captcha({
      provider: "cloudflare-turnstile",
      secretKey: env.TURNSTILE_SECRET_KEY!,
      endpoints: CAPTCHA_ENDPOINTS,
      ...(env.TURNSTILE_API_BASE ? { siteVerifyURLOverride: env.TURNSTILE_API_BASE } : {}),
    }));
  }

  return list as typeof plugins;
}

export function createAuth(env: AuthEnv) {
  const socialProviders = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
      }
    : {};
  const emailEnabled = isEmailEnabled(env);

  return betterAuth({
    appName: env.APP_NAME || "衣装集 试穿",
    database: env.DB,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: trustedAuthOrigins(env),
    socialProviders,
    plugins: authPlugins(env),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      autoSignIn: !emailEnabled,
      requireEmailVerification: emailEnabled,
      sendResetPassword: async ({ user, url, token }) => {
        await sendEmail(env, {
          to: user.email,
          template: "password_reset",
          idempotencyKey: "password_reset:" + token,
          variables: { url },
        });
      },
    },
    emailVerification: {
      sendOnSignUp: emailEnabled,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url, token }) => {
        await sendEmail(env, {
          to: user.email,
          template: "email_verification",
          idempotencyKey: "email_verification:" + token,
          variables: { url },
        });
      },
    },
    account: {
      accountLinking: { enabled: true, trustedProviders: ["google"] },
      modelName: "accounts",
      fields: {
        accountId: "account_id",
        providerId: "provider_id",
        userId: "user_id",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        idToken: "id_token",
        accessTokenExpiresAt: "access_token_expires_at",
        refreshTokenExpiresAt: "refresh_token_expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    user: {
      modelName: "users",
      fields: {
        emailVerified: "email_verified",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
      deleteUser: {
        enabled: true,
        sendDeleteAccountVerification: emailEnabled
          ? async ({ user, url, token }) => {
              await sendEmail(env, {
                to: user.email,
                template: "account_deleted",
                idempotencyKey: "account_delete_request:" + token,
                variables: { url },
              });
            }
          : undefined,
      },
    },
    session: {
      modelName: "sessions",
      expiresIn: SESSION_TTL_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
      fields: {
        userId: "user_id",
        expiresAt: "expires_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    verification: {
      modelName: "verifications",
      fields: {
        expiresAt: "expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await sendEmail(env, {
              to: user.email,
              template: "welcome",
              idempotencyKey: "welcome:" + user.id,
              variables: { name: user.name || user.email, url: env.BETTER_AUTH_URL || "" },
            });
          },
        },
      },
    },
  });
}

export interface SessionAccount {
  id: string;
  sessionId: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: string;
  banned: boolean;
  twoFactorEnabled: boolean;
  locale: string;
}

export async function sessionUser(env: AuthEnv, headers: Headers): Promise<SessionAccount | null> {
  if (!isBetterAuthConfigured(env)) return null;
  const session = await createAuth(env).api.getSession({ headers });
  if (!session) return null;
  const row = await env.DB.prepare(
    "SELECT role, banned, two_factor_enabled, locale, deleted_at FROM users WHERE id = ?",
  ).bind(session.user.id).first<{
    role: string | null;
    banned: number | null;
    two_factor_enabled: number | null;
    locale: string | null;
    deleted_at: string | null;
  }>();
  if (!row || row.deleted_at) return null;

  const email = session.user.email.toLowerCase();
  // 只有验证过邮箱的账号才按 ADMIN_EMAILS 提权，防止有人抢注管理员邮箱
  const verified = Boolean(session.user.emailVerified);
  const role = verified && adminEmails(env).includes(email) ? "admin" : row.role || "user";
  return {
    id: session.user.id,
    sessionId: session.session.id,
    name: session.user.name,
    email: session.user.email,
    emailVerified: verified,
    image: session.user.image || null,
    role,
    banned: Boolean(row.banned),
    twoFactorEnabled: Boolean(row.two_factor_enabled),
    locale: row.locale || "en",
  };
}

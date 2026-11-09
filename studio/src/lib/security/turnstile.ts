import type { ServiceEnv } from "../../env";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function isTurnstileEnabled(env: ServiceEnv): boolean {
  return Boolean(env.TURNSTILE_SECRET_KEY && env.TURNSTILE_SITE_KEY);
}

export async function verifyTurnstileToken(
  env: ServiceEnv,
  token: string | null | undefined,
  remoteIp?: string | null,
): Promise<boolean> {
  if (!isTurnstileEnabled(env)) return true;
  if (!token || token.length > 2_048) return false;

  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY!, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  const response = await fetch(env.TURNSTILE_API_BASE || VERIFY_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  }).catch(() => null);
  if (!response || !response.ok) return false;

  const payload = await response
    .json<Record<string, unknown>>()
    .catch((): Record<string, unknown> => ({}));
  return payload.success === true;
}

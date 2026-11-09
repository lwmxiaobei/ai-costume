import { createAuthClient } from "better-auth/react";
import { adminClient, magicLinkClient, twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [adminClient(), magicLinkClient(), twoFactorClient()],
});

export interface AuthResult {
  ok: boolean;
  code?: string;
  message?: string;
}

function toResult(error: { code?: string; message?: string } | null | undefined): AuthResult {
  if (!error) return { ok: true };
  return { ok: false, code: error.code, message: error.message };
}

export async function signInWithGoogle(): Promise<void> {
  await authClient.signIn.social({
    provider: "google",
    callbackURL: "/",
    errorCallbackURL: "/?authError=google",
  });
}

export interface SignInResult extends AuthResult {
  twoFactorRequired?: boolean;
}

export async function signInWithPassword(
  email: string,
  password: string,
  captchaToken?: string,
): Promise<SignInResult> {
  const { data, error } = await authClient.signIn.email(
    { email, password, callbackURL: "/account" },
    captchaToken ? { headers: { "x-captcha-response": captchaToken } } : undefined,
  );
  if (error) return toResult(error);
  const twoFactorRequired = Boolean(
    data && typeof data === "object" && "twoFactorRedirect" in data && data.twoFactorRedirect,
  );
  return { ok: true, twoFactorRequired };
}

export async function signUpWithPassword(
  name: string,
  email: string,
  password: string,
  captchaToken?: string,
): Promise<AuthResult> {
  const { error } = await authClient.signUp.email(
    { name, email, password, callbackURL: "/account" },
    captchaToken ? { headers: { "x-captcha-response": captchaToken } } : undefined,
  );
  return toResult(error);
}

export async function sendMagicLink(email: string, captchaToken?: string): Promise<AuthResult> {
  const { error } = await authClient.signIn.magicLink(
    { email, callbackURL: "/account" },
    captchaToken ? { headers: { "x-captcha-response": captchaToken } } : undefined,
  );
  return toResult(error);
}

export async function requestPasswordReset(email: string, captchaToken?: string): Promise<AuthResult> {
  const { error } = await authClient.requestPasswordReset(
    { email, redirectTo: "/signin?mode=reset" },
    captchaToken ? { headers: { "x-captcha-response": captchaToken } } : undefined,
  );
  return toResult(error);
}

export async function resetPassword(newPassword: string, token: string): Promise<AuthResult> {
  const { error } = await authClient.resetPassword({ newPassword, token });
  return toResult(error);
}

export async function resendVerificationEmail(email: string, captchaToken?: string): Promise<AuthResult> {
  const { error } = await authClient.sendVerificationEmail(
    { email, callbackURL: "/account" },
    captchaToken ? { headers: { "x-captcha-response": captchaToken } } : undefined,
  );
  return toResult(error);
}

export interface TwoFactorSetup {
  totpUri: string;
  secret: string;
  backupCodes: string[];
}

export function totpSecretFromUri(totpUri: string): string {
  try {
    return new URL(totpUri).searchParams.get("secret") || "";
  } catch {
    return "";
  }
}

export async function enableTwoFactor(
  password: string,
): Promise<AuthResult & { setup?: TwoFactorSetup }> {
  const { data, error } = await authClient.twoFactor.enable({ password, method: "totp" });
  if (error || !data) return toResult(error);
  if (!("totpURI" in data)) return { ok: false, code: "totp_unavailable" };
  return {
    ok: true,
    setup: {
      totpUri: data.totpURI,
      secret: totpSecretFromUri(data.totpURI),
      backupCodes: data.backupCodes,
    },
  };
}

export function isTotpCode(value: string): boolean {
  return /^\d{6}$/.test(value.trim());
}

export async function confirmTwoFactor(code: string): Promise<AuthResult> {
  const { error } = await authClient.twoFactor.verifyTotp({ code: code.trim() });
  return toResult(error);
}

export async function submitTwoFactorChallenge(code: string): Promise<AuthResult> {
  const trimmed = code.trim();
  if (isTotpCode(trimmed)) return confirmTwoFactor(trimmed);
  const { error } = await authClient.twoFactor.verifyBackupCode({ code: trimmed });
  return toResult(error);
}

export async function disableTwoFactor(password: string): Promise<AuthResult> {
  const { error } = await authClient.twoFactor.disable({ password });
  return toResult(error);
}

export async function signOut(): Promise<void> {
  await authClient.signOut();
}

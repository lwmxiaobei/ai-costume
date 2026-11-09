import type { Messages } from "./messages";

export type ApiErrorCode =
  | "expected_json"
  | "request_too_large"
  | "invalid_project"
  | "invalid_project_url"
  | "unauthenticated"
  | "forbidden"
  | "account_banned"
  | "rate_limited"
  | "quota_exceeded"
  | "captcha_failed"
  | "email_unverified";

export function interpolate(value: string, variables: Record<string, string | number>): string {
  return Object.entries(variables).reduce(
    (result, [key, replacement]) => result.replaceAll("{" + key + "}", String(replacement)),
    value,
  );
}

export function apiErrorMessage(code: string | undefined, messages: Messages): string {
  const translated: Partial<Record<ApiErrorCode, string>> = {
    expected_json: messages.errors.expectedJson,
    request_too_large: messages.errors.tooLarge,
    invalid_project: messages.errors.invalidProject,
    invalid_project_url: messages.errors.invalidUrl,
    unauthenticated: messages.errors.unauthenticated,
    forbidden: messages.errors.forbidden,
    account_banned: messages.errors.forbidden,
    rate_limited: messages.errors.rateLimited,
    quota_exceeded: messages.errors.quotaExceeded,
    captcha_failed: messages.errors.captchaFailed,
    email_unverified: messages.errors.emailUnverified,
  };
  return translated[code as ApiErrorCode] || messages.errors.create;
}

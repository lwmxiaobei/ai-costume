import type { ServiceEnv } from "../../env";
import { DEFAULT_LOCALE, isLocale, type Locale } from "../../i18n/config";
import { activeEmailProvider, deliverEmail, EmailDeliveryError, isEmailAddress } from "./provider";
import { renderEmail, type EmailTemplate } from "./templates";

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [200, 800];

export type SendEmailResult = "sent" | "skipped" | "failed" | "disabled";

export interface SendEmailOptions {
  to: string;
  template: EmailTemplate;
  idempotencyKey: string;
  locale?: string | null;
  variables?: Record<string, string | number>;
}

interface EmailRow {
  id: string;
  status: string;
  attempts: number;
  template: string;
  locale: string;
  to_email: string;
  variables: string;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function resolveLocale(value: string | null | undefined): Locale {
  return isLocale(value ?? null) ? (value as Locale) : DEFAULT_LOCALE;
}

async function attemptDelivery(
  env: ServiceEnv,
  row: Pick<EmailRow, "id" | "attempts">,
  message: { to: string; subject: string; html: string; text: string },
): Promise<SendEmailResult> {
  const provider = activeEmailProvider(env);
  if (!provider) return "disabled";

  let attempts = row.attempts;
  let lastError = "unknown";
  for (let index = 0; attempts < MAX_ATTEMPTS; index += 1) {
    attempts += 1;
    try {
      const messageId = await deliverEmail(env, provider, message);
      await env.DB.prepare(
        "UPDATE email_messages SET status = 'sent', attempts = ?, email_provider = ?, "
        + "provider_message_id = ?, last_error = NULL, sent_at = CURRENT_TIMESTAMP, "
        + "updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).bind(attempts, provider, messageId, row.id).run();
      return "sent";
    } catch (error) {
      lastError = error instanceof EmailDeliveryError ? error.code : "delivery_error";
      const retryable = error instanceof EmailDeliveryError ? error.retryable : true;
      if (!retryable || attempts >= MAX_ATTEMPTS) break;
      await delay(RETRY_DELAYS_MS[Math.min(index, RETRY_DELAYS_MS.length - 1)]);
    }
  }

  await env.DB.prepare(
    "UPDATE email_messages SET status = 'failed', attempts = ?, email_provider = ?, "
    + "last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).bind(attempts, provider, lastError.slice(0, 200), row.id).run();
  return "failed";
}

export async function sendEmail(env: ServiceEnv, options: SendEmailOptions): Promise<SendEmailResult> {
  if (!isEmailAddress(options.to)) return "failed";
  if (!activeEmailProvider(env)) return "disabled";

  const locale = resolveLocale(options.locale);
  const variables = {
    appName: env.APP_NAME || "衣装集 试穿",
    email: options.to,
    ...options.variables,
  };
  const rendered = renderEmail(options.template, locale, variables);
  const id = "email_" + crypto.randomUUID();

  const inserted = await env.DB.prepare(
    "INSERT OR IGNORE INTO email_messages "
    + "(id, idempotency_key, to_email, template, locale, subject, variables) "
    + "VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    id,
    options.idempotencyKey,
    options.to,
    options.template,
    locale,
    rendered.subject,
    JSON.stringify(variables),
  ).run();

  if (inserted.meta.changes === 0) {
    const existing = await env.DB.prepare(
      "SELECT id, status, attempts FROM email_messages WHERE idempotency_key = ?",
    ).bind(options.idempotencyKey).first<Pick<EmailRow, "id" | "status" | "attempts">>();
    if (!existing || existing.status === "sent" || existing.attempts >= MAX_ATTEMPTS) return "skipped";
    return attemptDelivery(env, existing, { to: options.to, ...rendered });
  }

  return attemptDelivery(env, { id, attempts: 0 }, { to: options.to, ...rendered });
}

export async function retryFailedEmails(env: ServiceEnv, limit = 20): Promise<{ retried: number; sent: number }> {
  if (!activeEmailProvider(env)) return { retried: 0, sent: 0 };
  const rows = await env.DB.prepare(
    "SELECT id, status, attempts, template, locale, to_email, variables FROM email_messages "
    + "WHERE status = 'failed' AND attempts < ? ORDER BY created_at ASC LIMIT ?",
  ).bind(MAX_ATTEMPTS, Math.min(Math.max(limit, 1), 100)).all<EmailRow>();

  let sent = 0;
  for (const row of rows.results) {
    const variables = JSON.parse(row.variables || "{}") as Record<string, string | number>;
    const rendered = renderEmail(
      row.template as EmailTemplate,
      resolveLocale(row.locale),
      variables,
    );
    const result = await attemptDelivery(env, row, { to: row.to_email, ...rendered });
    if (result === "sent") sent += 1;
  }
  return { retried: rows.results.length, sent };
}

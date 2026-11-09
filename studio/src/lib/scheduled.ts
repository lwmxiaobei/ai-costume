import type { ServiceEnv } from "../env";
import { retryFailedEmails, sendEmail } from "./email/send";

export const DAILY_CRON = "0 3 * * *";
export const HOURLY_CRON = "15 * * * *";
export const EXPIRY_REMINDER_DAYS = 3;

export interface ScheduledSummary {
  cron: string;
  expiringNotified: number;
  emailsRetried: number;
  emailsSent: number;
  purged: Record<string, number>;
}

interface ExpiringRow {
  provider_subscription_id: string;
  current_period_end: string;
  plan_name: string;
  email: string;
  name: string;
  locale: string | null;
}

export function reminderWindow(nowMs: number, days = EXPIRY_REMINDER_DAYS) {
  return {
    from: new Date(nowMs).toISOString(),
    to: new Date(nowMs + days * 86_400_000).toISOString(),
  };
}

export async function notifyExpiringSubscriptions(
  env: ServiceEnv,
  nowMs = Date.now(),
  days = EXPIRY_REMINDER_DAYS,
): Promise<number> {
  const window = reminderWindow(nowMs, days);
  const rows = await env.DB.prepare(
    "SELECT s.provider_subscription_id, s.current_period_end, p.name AS plan_name, "
    + "u.email AS email, u.name AS name, u.locale AS locale "
    + "FROM subscriptions s "
    + "JOIN users u ON u.id = s.user_id "
    + "JOIN plans p ON p.id = s.plan_id "
    + "WHERE s.status IN ('trialing', 'active') AND s.cancel_at_period_end = 1 "
    + "AND s.current_period_end IS NOT NULL "
    + "AND s.current_period_end >= ? AND s.current_period_end < ? "
    + "AND u.deleted_at IS NULL LIMIT 200",
  ).bind(window.from, window.to).all<ExpiringRow>();

  let sent = 0;
  for (const row of rows.results) {
    const result = await sendEmail(env, {
      to: row.email,
      template: "subscription_expiring",
      idempotencyKey: "subscription_expiring:" + row.provider_subscription_id + ":" + row.current_period_end,
      locale: row.locale,
      variables: {
        name: row.name,
        plan: row.plan_name,
        date: row.current_period_end.slice(0, 10),
      },
    });
    if (result === "sent") sent += 1;
  }
  return sent;
}

export async function purgeExpiredRecords(
  env: ServiceEnv,
  nowMs = Date.now(),
): Promise<Record<string, number>> {
  const epoch = nowMs;
  const iso = new Date(nowMs).toISOString();
  const results = await env.DB.batch<unknown>([
    env.DB.prepare("DELETE FROM idempotency_keys WHERE expires_at < ?").bind(epoch),
    env.DB.prepare("DELETE FROM rate_limits WHERE expires_at < ?").bind(epoch),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(iso),
    env.DB.prepare("DELETE FROM verifications WHERE expires_at < ?").bind(iso),
  ]);
  const names = ["idempotencyKeys", "rateLimits", "sessions", "verifications"];
  return Object.fromEntries(results.map((result, index) => [names[index], result.meta.changes]));
}

export async function runScheduledTasks(
  env: ServiceEnv,
  cron: string,
  nowMs = Date.now(),
): Promise<ScheduledSummary> {
  const summary: ScheduledSummary = {
    cron,
    expiringNotified: 0,
    emailsRetried: 0,
    emailsSent: 0,
    purged: {},
  };

  if (cron === DAILY_CRON) {
    summary.expiringNotified = await notifyExpiringSubscriptions(env, nowMs);
    summary.purged = await purgeExpiredRecords(env, nowMs);
  }

  const retry = await retryFailedEmails(env, 20);
  summary.emailsRetried = retry.retried;
  summary.emailsSent = retry.sent;
  return summary;
}

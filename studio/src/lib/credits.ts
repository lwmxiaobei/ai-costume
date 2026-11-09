import type { ServiceEnv } from "../env";

// 积分包统一挂在迁移 0009 写入的固定项目上
export const CREDITS_PROJECT_ID = "project_00000000-0000-4000-8000-000000000001";

const intVar = (value: string | undefined, fallback: number, min = 0) => {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n >= min ? n : fallback;
};

export const creditsPerPack = (env: ServiceEnv) => intVar(env.CREDITS_PER_PACK, 10, 1);
export const tryonCost = (env: ServiceEnv) => intVar(env.TRYON_CREDIT_COST, 1, 1);
export const signupBonus = (env: ServiceEnv) => intVar(env.TRYON_FREE_CREDITS, 2);

// 余额 = 账本合计 + 已购积分。已购积分按每笔订单未退款的比例折算，争议订单不计。
// 参数顺序：userId, creditsPerPack, CREDITS_PROJECT_ID
const BALANCE_SQL =
  "COALESCE((SELECT SUM(delta) FROM credit_ledger WHERE user_id = ?1), 0) + "
  + "COALESCE((SELECT SUM(CAST(pc.quantity * ?2 * (p.amount_cents - p.reversed_cents) / p.amount_cents AS INTEGER)) "
  + "FROM payments p JOIN pending_checkouts pc ON pc.id = p.pending_checkout_id "
  + "WHERE pc.user_id = ?1 AND p.project_id = ?3 AND p.status <> 'disputed' AND p.amount_cents > 0), 0)";

export async function creditBalance(env: ServiceEnv, userId: string): Promise<number> {
  const row = await env.DB.prepare("SELECT " + BALANCE_SQL + " AS balance")
    .bind(userId, creditsPerPack(env), CREDITS_PROJECT_ID)
    .first<{ balance: number }>();
  return row?.balance ?? 0;
}

// 统一大小写并去掉 +标签，同一个邮箱的变体只算一个人
export function normalizeEmail(email: string): string {
  const [local = "", domain = ""] = email.trim().toLowerCase().split("@");
  return local.split("+")[0] + "@" + domain;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 新用户赠送：每个邮箱只发一次，账号注销后重新注册也不再发
export async function grantSignupBonus(env: ServiceEnv, userId: string, email: string, nowMs = Date.now()): Promise<void> {
  const amount = signupBonus(env);
  if (amount <= 0) return;
  const now = new Date(nowMs).toISOString();
  const claimed = await env.DB.prepare("INSERT OR IGNORE INTO credit_bonus_grants (email_hash, granted_at) VALUES (?, ?)")
    .bind(await sha256Hex(normalizeEmail(email)), now).run();
  if (claimed.meta.changes !== 1) return;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO credit_ledger (id, user_id, delta, reason, ref, created_at) VALUES (?, ?, ?, 'signup_bonus', 'signup_bonus', ?)",
  ).bind("credit_" + crypto.randomUUID(), userId, amount, now).run();
}

// 余额足够才写入扣费记录；同一个 ref 只扣一次。
// 返回这次请求是否持有有效扣费：已被退还的 ref 不能再用来建任务。
export async function chargeCredits(
  env: ServiceEnv,
  userId: string,
  ref: string,
  cost: number,
  nowMs = Date.now(),
): Promise<boolean> {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO credit_ledger (id, user_id, delta, reason, ref, created_at) "
    + "SELECT ?4, ?1, ?5, 'tryon', ?6, ?7 WHERE (" + BALANCE_SQL + ") >= ?8",
  ).bind(
    userId,
    creditsPerPack(env),
    CREDITS_PROJECT_ID,
    "credit_" + crypto.randomUUID(),
    -cost,
    ref,
    new Date(nowMs).toISOString(),
    cost,
  ).run();
  const row = await env.DB.prepare(
    "SELECT (SELECT COUNT(*) FROM credit_ledger WHERE user_id = ?1 AND ref = ?2) AS charged, "
    + "(SELECT COUNT(*) FROM credit_ledger WHERE user_id = ?1 AND ref = 'refund:' || ?2) AS refunded",
  ).bind(userId, ref).first<{ charged: number; refunded: number }>();
  return Boolean(row && row.charged > 0 && row.refunded === 0);
}

// 退还失败任务的扣费，以及扣费后一直没有建成任务的请求（超过 orphanMinutes）
export async function refundFailedCharges(env: ServiceEnv, nowMs = Date.now(), orphanMinutes = 15): Promise<number> {
  const now = new Date(nowMs).toISOString();
  const orphanBefore = new Date(nowMs - orphanMinutes * 60_000).toISOString();
  const result = await env.DB.prepare(
    "INSERT OR IGNORE INTO credit_ledger (id, user_id, delta, reason, ref, created_at) "
    + "SELECT 'credit_' || lower(hex(randomblob(16))), c.user_id, -c.delta, 'refund', 'refund:' || c.ref, ?1 "
    + "FROM credit_ledger c LEFT JOIN generation_tasks t "
    + "ON t.user_id = c.user_id AND 'tryon:' || t.request_key = c.ref "
    + "WHERE c.reason = 'tryon' "
    + "AND NOT EXISTS (SELECT 1 FROM credit_ledger r WHERE r.user_id = c.user_id AND r.ref = 'refund:' || c.ref) "
    + "AND (t.status = 'failed' OR (t.id IS NULL AND c.created_at < ?2))",
  ).bind(now, orphanBefore).run();
  return result.meta.changes ?? 0;
}

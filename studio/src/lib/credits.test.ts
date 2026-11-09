import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  chargeCredits,
  creditBalance,
  CREDITS_PROJECT_ID,
  grantSignupBonus,
  refundFailedCharges,
} from "./credits";
import { generationTestDatabase } from "./generation/test-database";

const NOW = Date.parse("2026-10-30T02:00:00Z");

describe("credit ledger with SQLite", () => {
  let db: ReturnType<typeof generationTestDatabase>;
  let env: { DB: D1Database; CREDITS_PER_PACK: string; TRYON_FREE_CREDITS: string };
  beforeEach(() => {
    db = generationTestDatabase();
    env = { DB: db.binding, CREDITS_PER_PACK: "10", TRYON_FREE_CREDITS: "2" };
  });
  afterEach(() => db.sqlite.close());

  function buyPacks(userId: string, quantity: number, amountCents: number, suffix = "1") {
    db.sqlite.prepare(
      "INSERT INTO pending_checkouts (id, project_id, user_id, quantity, unit_amount_cents, amount_cents, provider_product_id, payment_provider, status) "
      + "VALUES (?, ?, ?, ?, ?, ?, 'PROD_1', 'waffo', 'paid')",
    ).run("checkout_" + suffix, CREDITS_PROJECT_ID, userId, quantity, amountCents / quantity, amountCents);
    db.sqlite.prepare(
      "INSERT INTO payments (id, checkout_id, order_id, pending_checkout_id, project_id, amount_cents, currency, status, payment_provider, paid_at) "
      + "VALUES (?, ?, ?, ?, ?, ?, 'USD', 'paid', 'waffo', ?)",
    ).run("payment_" + suffix, "co_" + suffix, "ord_" + suffix, "checkout_" + suffix, CREDITS_PROJECT_ID, amountCents, new Date(NOW).toISOString());
  }

  function addTask(userId: string, requestKey: string, status: string) {
    db.sqlite.prepare(
      "INSERT INTO generation_tasks (id, user_id, request_key, request_hash, type, model_id, model_name, provider_id, prompt, status, timeout_seconds, created_at, updated_at) "
      + "VALUES (?, ?, ?, 'h', 'image', 'tryon', '虚拟试穿', 'kie', 'p', ?, 600, ?, ?)",
    ).run("generation_" + requestKey, userId, requestKey, status, new Date(NOW).toISOString(), new Date(NOW).toISOString());
  }

  it("grants the signup bonus once per email, even after the account is recreated", async () => {
    await grantSignupBonus(env, "user_1", "Ada@example.test", NOW);
    await grantSignupBonus(env, "user_1", "ada@example.test", NOW);
    expect(await creditBalance(env, "user_1")).toBe(2);
    // 同一邮箱的 +标签变体、或注销后用同一邮箱的新账号都不再赠送
    await grantSignupBonus(env, "user_2", "ada+new@example.test", NOW);
    expect(await creditBalance(env, "user_2")).toBe(0);
    db.sqlite.prepare("DELETE FROM users WHERE id = 'user_1'").run();
    expect(await creditBalance(env, "user_1")).toBe(0);
  });

  it("charges only while the balance covers the cost and never twice for one ref", async () => {
    await grantSignupBonus(env, "user_1", "user_1@example.test", NOW);
    expect(await chargeCredits(env, "user_1", "tryon:a", 1, NOW)).toBe(true);
    expect(await chargeCredits(env, "user_1", "tryon:a", 1, NOW)).toBe(true);
    expect(await creditBalance(env, "user_1")).toBe(1);
    expect(await chargeCredits(env, "user_1", "tryon:b", 1, NOW)).toBe(true);
    expect(await chargeCredits(env, "user_1", "tryon:c", 1, NOW)).toBe(false);
    expect(await creditBalance(env, "user_1")).toBe(0);
  });

  it("counts purchased packs and takes them back on refund or dispute", async () => {
    buyPacks("user_1", 3, 597);
    expect(await creditBalance(env, "user_1")).toBe(30);
    db.sqlite.prepare("UPDATE payments SET reversed_cents = 199 WHERE id = 'payment_1'").run();
    expect(await creditBalance(env, "user_1")).toBe(20);
    db.sqlite.prepare("UPDATE payments SET status = 'disputed' WHERE id = 'payment_1'").run();
    expect(await creditBalance(env, "user_1")).toBe(0);
    expect(await creditBalance(env, "user_2")).toBe(0);
  });

  it("refunds failed tasks and orphaned charges exactly once", async () => {
    buyPacks("user_1", 1, 199);
    await chargeCredits(env, "user_1", "tryon:ok", 1, NOW);
    await chargeCredits(env, "user_1", "tryon:bad", 1, NOW);
    await chargeCredits(env, "user_1", "tryon:lost", 1, NOW);
    addTask("user_1", "ok", "succeeded");
    addTask("user_1", "bad", "failed");
    expect(await creditBalance(env, "user_1")).toBe(7);

    expect(await refundFailedCharges(env, NOW)).toBe(1);
    expect(await creditBalance(env, "user_1")).toBe(8);

    // 扣费后 15 分钟仍没有任务，视为请求丢失并退还
    expect(await refundFailedCharges(env, NOW + 16 * 60_000)).toBe(1);
    expect(await refundFailedCharges(env, NOW + 16 * 60_000)).toBe(0);
    expect(await creditBalance(env, "user_1")).toBe(9);
    // 已退还的请求号不能再用来免费建任务
    expect(await chargeCredits(env, "user_1", "tryon:lost", 1, NOW + 20 * 60_000)).toBe(false);
    expect(await creditBalance(env, "user_1")).toBe(9);
  });
});

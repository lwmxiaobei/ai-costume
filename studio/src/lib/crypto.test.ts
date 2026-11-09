import { describe, expect, it } from "vitest";
import {
  hmacSha256Hex,
  timingSafeEqualHex,
  verifyCreemWebhookSignature,
  verifyStripeWebhookSignature,
} from "./crypto";

describe("webhook crypto", () => {
  it("compares valid hexadecimal digests without early return", () => {
    expect(timingSafeEqualHex("aabb", "aabb")).toBe(true);
    expect(timingSafeEqualHex("aabb", "aabc")).toBe(false);
    expect(timingSafeEqualHex("zz", "zz")).toBe(false);
  });

  it("verifies Creem HMAC signatures", async () => {
    const body = "{\"event\":\"paid\"}";
    const signature = await hmacSha256Hex(body, "secret");
    await expect(verifyCreemWebhookSignature(body, signature, "secret")).resolves.toBe(true);
    await expect(verifyCreemWebhookSignature(body + "x", signature, "secret")).resolves.toBe(false);
  });

  it("verifies Stripe signatures and rejects stale timestamps", async () => {
    const now = 2_000_000_000;
    const body = "{}";
    const digest = await hmacSha256Hex(String(now) + "." + body, "secret");
    await expect(verifyStripeWebhookSignature(body, "t=" + now + ",v1=" + digest, "secret", now)).resolves.toBe(true);
    await expect(verifyStripeWebhookSignature(body, "t=" + (now - 301) + ",v1=" + digest, "secret", now)).resolves.toBe(false);
  });
});

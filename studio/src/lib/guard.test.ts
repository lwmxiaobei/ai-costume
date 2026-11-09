import { describe, expect, it } from "vitest";
import { hasRole, ownsResource } from "./guard";
import type { SessionAccount } from "./auth";

function account(overrides: Partial<SessionAccount> = {}): SessionAccount {
  return {
    id: "user_1",
    sessionId: "session_1",
    name: "Ada",
    email: "ada@example.com",
    emailVerified: true,
    image: null,
    role: "user",
    banned: false,
    twoFactorEnabled: false,
    locale: "en",
    ...overrides,
  };
}

describe("authorization primitives", () => {
  it("grants a role only to a signed-in account that holds it", () => {
    expect(hasRole(account({ role: "admin" }), ["admin"])).toBe(true);
    expect(hasRole(account(), ["admin"])).toBe(false);
    expect(hasRole(null, ["user"])).toBe(false);
  });

  it("refuses every role to a banned account", () => {
    expect(hasRole(account({ role: "admin", banned: true }), ["admin"])).toBe(false);
    expect(ownsResource(account({ banned: true }), "user_1")).toBe(false);
  });

  it("matches ownership by user id", () => {
    expect(ownsResource(account(), "user_1")).toBe(true);
    expect(ownsResource(account(), "user_2")).toBe(false);
    expect(ownsResource(account(), null)).toBe(false);
  });

  it("lets admins bypass ownership unless the check opts out", () => {
    const admin = account({ id: "user_9", role: "admin" });
    expect(ownsResource(admin, "user_1")).toBe(true);
    expect(ownsResource(admin, "user_1", false)).toBe(false);
  });
});

describe("two factor challenge input", () => {
  it("routes six digit input to TOTP and anything else to a backup code", async () => {
    const { isTotpCode } = await import("./auth-client");
    expect(isTotpCode("123456")).toBe(true);
    expect(isTotpCode(" 123456 ")).toBe(true);
    expect(isTotpCode("12345")).toBe(false);
    expect(isTotpCode("gfWa5-dbt71")).toBe(false);
  });
});

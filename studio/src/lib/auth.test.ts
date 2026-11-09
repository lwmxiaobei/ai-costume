import { beforeEach, describe, expect, it, vi } from "vitest";
import { betterAuth } from "better-auth";
import {
  createAuth,
  isBetterAuthConfigured,
  isGoogleAuthConfigured,
  isLocalHost,
  isValidAuthBaseUrl,
  sessionUser,
  trustedAuthOrigins,
} from "./auth";

vi.mock("better-auth", () => ({
  betterAuth: vi.fn(() => ({ api: { getSession: vi.fn() } })),
}));

describe("Better Auth configuration", () => {
  const db = {} as D1Database;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts HTTPS and local HTTP base URLs only", () => {
    expect(isValidAuthBaseUrl("https://example.com")).toBe(true);
    expect(isValidAuthBaseUrl("http://localhost:8787")).toBe(true);
    expect(isValidAuthBaseUrl("http://example.com")).toBe(false);
    expect(isValidAuthBaseUrl("https://example.com/path")).toBe(false);
  });

  it("requires a valid URL and a secret of at least 32 characters", () => {
    expect(isBetterAuthConfigured({ DB: db })).toBe(false);
    expect(isBetterAuthConfigured({
      DB: db,
      BETTER_AUTH_URL: "https://example.com",
      BETTER_AUTH_SECRET: "short",
    })).toBe(false);
    expect(isBetterAuthConfigured({
      DB: db,
      BETTER_AUTH_URL: "https://example.com",
      BETTER_AUTH_SECRET: "a".repeat(32),
    })).toBe(true);
  });

  it("enables Google only when both OAuth values exist", () => {
    const base = {
      DB: db,
      BETTER_AUTH_URL: "https://example.com",
      BETTER_AUTH_SECRET: "a".repeat(32),
      GOOGLE_CLIENT_ID: "client.apps.googleusercontent.com",
    };
    expect(isGoogleAuthConfigured(base)).toBe(false);
    expect(isGoogleAuthConfigured({ ...base, GOOGLE_CLIENT_SECRET: "secret" })).toBe(true);
  });

  it("trusts local development origins but no extra production origin", () => {
    expect(isLocalHost("localhost")).toBe(true);
    expect(isLocalHost("example.com")).toBe(false);
    expect(trustedAuthOrigins({ DB: db, APP_ENV: "development" })).toEqual([
      "http://localhost:*",
      "http://127.0.0.1:*",
    ]);
    expect(trustedAuthOrigins({ DB: db, APP_ENV: "production" })).toEqual([]);
  });

  it("maps the Better Auth schema and keeps hooks limited to lifecycle email", () => {
    createAuth({
      DB: db,
      APP_NAME: "Sample App",
      APP_ENV: "production",
      BETTER_AUTH_URL: "https://example.com",
      BETTER_AUTH_SECRET: "a".repeat(32),
      GOOGLE_CLIENT_ID: "client",
      GOOGLE_CLIENT_SECRET: "secret",
    });
    const options = vi.mocked(betterAuth).mock.calls.at(-1)?.[0] as {
      appName?: string;
      user?: { modelName?: string };
      session?: { modelName?: string };
      account?: { modelName?: string };
      verification?: { modelName?: string };
      databaseHooks?: unknown;
    };
    expect(options.appName).toBe("Sample App");
    expect(options.user?.modelName).toBe("users");
    expect(options.session?.modelName).toBe("sessions");
    expect(options.account?.modelName).toBe("accounts");
    expect(options.verification?.modelName).toBe("verifications");
    expect(Object.keys(options.databaseHooks as Record<string, unknown>)).toEqual(["user"]);
  });

  it("does not query a session when auth is disabled", async () => {
    await expect(sessionUser({ DB: db }, new Headers())).resolves.toBeNull();
    expect(betterAuth).not.toHaveBeenCalled();
  });
});

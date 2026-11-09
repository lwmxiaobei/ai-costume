import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ROUTE_FILES = [
  "src/worker.ts",
  "src/lib/payments/routes.ts",
  "src/lib/billing/routes.ts",
  "src/lib/account/routes.ts",
  "src/lib/admin/routes.ts",
  "src/lib/generation/routes.ts",
  "src/lib/agents/routes.ts",
];

const SERVER_FILES = [
  ...ROUTE_FILES,
  "src/lib/guard.ts",
  "src/lib/security/idempotency.ts",
  "src/lib/security/rate-limit.ts",
  "src/lib/billing/entitlements.ts",
];

function read(paths: string[]): string {
  return paths.map((path) => readFileSync(path, "utf8")).join("\n");
}

function matchAll(source: string, pattern: RegExp, group = 1): Set<string> {
  return new Set([...source.matchAll(pattern)].map((match) => match[group]));
}

const apiDoc = readFileSync("docs/api.md", "utf8");

describe("api reference stays in sync with the routes", () => {
  it("documents every error code the server can return", () => {
    const codes = matchAll(read(SERVER_FILES), /code: "([a-z_]+)"/g);
    const undocumented = [...codes].filter((code) => !apiDoc.includes(code)).sort();
    expect(undocumented).toEqual([]);
  });

  it("documents every registered endpoint", () => {
    const paths = matchAll(read(ROUTE_FILES), /"(\/(?:api|robots|sitemap|llms)[^"]*|\/[a-z-]+\.md)"/g);
    paths.delete("/api/");
    paths.delete("/api/admin/*");
    const undocumented = [...paths].filter((path) => !apiDoc.includes(path)).sort();
    expect(undocumented).toEqual([]);
  });

  it("documents every webhook entry point in the integration guide", () => {
    const integrations = readFileSync("docs/integrations.md", "utf8");
    for (const provider of ["stripe", "polar", "creem", "waffo"]) {
      expect(integrations).toContain("/api/webhooks/" + provider);
    }
  });

  it("tells the reader where to obtain every credential the Worker reads", () => {
    const env = readFileSync("src/env.ts", "utf8");
    const integrations = readFileSync("docs/integrations.md", "utf8");
    const credentials = [...env.matchAll(/^\s{2}([A-Z_]*(?:KEY|SECRET|TOKEN|PRODUCT_ID|DOMAIN))\??:/gm)]
      .map((match) => match[1]);
    expect(credentials.length).toBeGreaterThan(10);
    const undocumented = credentials.filter((name) => !integrations.includes(name)).sort();
    expect(undocumented).toEqual([]);
  });

  it("keeps the rate limit table honest about configured scopes", () => {
    const scopes = matchAll(read(SERVER_FILES), /scope: "([a-z_]+)"/g);
    expect(scopes.size).toBeGreaterThan(0);
    const windows = [...read(SERVER_FILES).matchAll(/limit:\s*(\d+),\s*windowSeconds:\s*([\d_]+)/g)];
    expect(windows.length).toBe(scopes.size);
  });
});

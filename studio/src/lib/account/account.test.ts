import { describe, expect, it } from "vitest";
import { describeUserAgent } from "./routes";
import { NOT_FOUND, resolveRoute } from "../../hooks/useRoute";
import {
  APP_ROUTES,
  INDEXABLE_ROUTES,
  isAppRoute,
  isLegalRoute,
  LEGAL_ROUTES,
} from "../../routes";

describe("device labels", () => {
  it("names the browser and platform from a user agent", () => {
    expect(describeUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
    )).toBe("Chrome on macOS");
    expect(describeUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari/604.1",
    )).toBe("Safari on iOS");
    expect(describeUserAgent("Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/140.0"))
      .toBe("Firefox on Linux");
  });

  it("prefers the more specific engine when several markers appear", () => {
    expect(describeUserAgent("Mozilla/5.0 (Windows NT 10.0) Chrome/140.0 Safari/537.36 Edg/140.0"))
      .toBe("Edge on Windows");
  });

  it("falls back when the header is missing", () => {
    expect(describeUserAgent(null)).toBe("Unknown device");
  });
});

describe("client routes", () => {
  it("maps known paths and marks everything else as not found", () => {
    expect(resolveRoute("/pricing")).toBe("/pricing");
    expect(resolveRoute("/account/")).toBe("/account");
    expect(resolveRoute("/admin")).toBe("/admin");
    expect(resolveRoute("/terms")).toBe("/terms");
    expect(resolveRoute("")).toBe("/");
    expect(resolveRoute("/does-not-exist")).toBe(NOT_FOUND);
  });

  it("agrees with the shared route table the Worker uses", () => {
    for (const route of APP_ROUTES) {
      expect(resolveRoute(route)).toBe(route);
      expect(isAppRoute(route)).toBe(true);
    }
    expect(isAppRoute("/nope")).toBe(false);
    expect(LEGAL_ROUTES.every((route) => isLegalRoute(route))).toBe(true);
    expect(isLegalRoute("/pricing")).toBe(false);
    expect(INDEXABLE_ROUTES).not.toContain("/admin");
    expect(INDEXABLE_ROUTES).not.toContain("/account");
  });
});

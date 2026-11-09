import { describe, expect, it } from "vitest";
import { normalizeProjectUrl } from "./project-url";

describe("normalizeProjectUrl", () => {
  it("normalizes the public domain root", () => {
    expect(normalizeProjectUrl("www.Example.com/path?q=1")).toEqual({
      url: "https://example.com/",
      canonicalUrl: "example.com",
    });
  });

  it.each(["localhost", "127.0.0.1", "10.0.0.1", "192.168.1.1", "user:pass@example.com"])(
    "rejects unsafe target %s",
    (value) => expect(() => normalizeProjectUrl(value)).toThrow(),
  );

  it("keeps exact subdomains independent", () => {
    expect(normalizeProjectUrl("app.example.com").canonicalUrl).toBe("app.example.com");
  });
});

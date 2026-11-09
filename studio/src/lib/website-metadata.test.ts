import { describe, expect, it } from "vitest";
import { fetchWebsiteMetadata, parseWebsiteMetadata } from "./website-metadata";

describe("website metadata", () => {
  it("prefers Open Graph fields", () => {
    const html = '<title>Fallback</title><meta property="og:title" content="Starter">'
      + '<meta name="description" content="Reusable foundation">'
      + '<meta property="og:image" content="/social.png">';
    expect(parseWebsiteMetadata(html, "https://example.com/")).toEqual({
      name: "Starter",
      description: "Reusable foundation",
      imageUrl: "https://example.com/social.png",
    });
  });

  it("rejects non HTML responses", async () => {
    const fetcher = async () => new Response("{}", { headers: { "content-type": "application/json" } });
    await expect(fetchWebsiteMetadata("example.com", fetcher as typeof fetch)).rejects.toThrow("page_not_html");
  });
});

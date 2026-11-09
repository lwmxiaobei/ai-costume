import { normalizeProjectUrl } from "./project-url";

export interface WebsiteMetadata {
  name: string;
  description: string;
  imageUrl: string;
}

function tagAttributes(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function cleanText(value: string, maxLength: number): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function metaContent(html: string, keys: string[]): string {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = tagAttributes(tag);
    const key = (attributes.get("property") || attributes.get("name") || "").toLowerCase();
    if (keys.includes(key) && attributes.get("content")) return attributes.get("content")!;
  }
  return "";
}

export function fallbackWebsiteName(url: string): string {
  const label = new URL(url).hostname.replace(/^www\./, "").split(".")[0].replace(/[-_]+/g, " ").trim();
  return label.replace(/\b\w/g, (letter) => letter.toUpperCase()).slice(0, 60);
}

export function parseWebsiteMetadata(html: string, url: string): WebsiteMetadata {
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const name = cleanText(metaContent(html, ["og:title", "twitter:title"]) || title, 60) || fallbackWebsiteName(url);
  const description = cleanText(metaContent(html, ["og:description", "twitter:description", "description"]), 180);
  let imageUrl = new URL("/favicon.ico", url).toString();
  const image = metaContent(html, ["og:image", "twitter:image"]);
  if (image) {
    try {
      const candidate = new URL(image, url);
      normalizeProjectUrl(candidate.toString());
      imageUrl = candidate.toString();
    } catch {
      imageUrl = new URL("/favicon.ico", url).toString();
    }
  }
  return { name, description, imageUrl };
}

export async function fetchWebsiteMetadata(inputUrl: string, fetcher: typeof fetch = fetch): Promise<WebsiteMetadata> {
  let currentUrl = normalizeProjectUrl(inputUrl).url;
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const response = await fetcher(currentUrl, {
      headers: { accept: "text/html,application/xhtml+xml", "user-agent": "衣装集 试穿 Bot/1.0" },
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === 3) throw new Error("redirect_invalid");
      currentUrl = normalizeProjectUrl(new URL(location, currentUrl).toString()).url;
      continue;
    }
    if (!response.ok) throw new Error("page_http_" + response.status);
    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new Error("page_not_html");
    }
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > 512 * 1024) throw new Error("page_too_large");
    const html = await response.text();
    if (new TextEncoder().encode(html).byteLength > 512 * 1024) throw new Error("page_too_large");
    return parseWebsiteMetadata(html, currentUrl);
  }
  throw new Error("redirect_invalid");
}

const blockedHosts = new Set([
  "localhost",
  "metadata.google.internal",
  "0.0.0.0",
  "127.0.0.1",
  "::1",
]);

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return false;
  const values = parts.map(Number);
  if (values.some((value) => value < 0 || value > 255)) return false;
  const [a, b] = values;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function isValidHostname(host: string): boolean {
  if (host.length > 253 || !host.includes(".")) return false;
  return host.split(".").every((label) => (
    label.length > 0
    && label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  ));
}

export function normalizeProjectUrl(value: string): { url: string; canonicalUrl: string } {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Enter a project domain or URL.");
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : "https://" + trimmed;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error("Enter a valid public project domain.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only HTTP and HTTPS links are allowed.");
  }
  if (parsed.username || parsed.password) throw new Error("Links cannot include credentials.");
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (!isValidHostname(host) || blockedHosts.has(host) || host.endsWith(".local")
    || host.endsWith(".localhost") || isPrivateIpv4(host)) {
    throw new Error("Enter a valid public project domain.");
  }
  return { url: parsed.protocol + "//" + host + "/", canonicalUrl: host };
}

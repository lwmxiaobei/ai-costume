import { readFile, writeFile } from "node:fs/promises";

const [slug, displayName, domain = "", databaseId = ""] = process.argv.slice(2);

if (!slug || !/^[a-z][a-z0-9-]*$/.test(slug)) {
  console.error("Usage: npm run init -- my-app \"My App\" [example.com] [d1-database-id]");
  process.exit(1);
}
if (!displayName || displayName.length > 80) {
  console.error("Provide a display name up to 80 characters.");
  process.exit(1);
}
if (domain && !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain)) {
  console.error("Domain must be an apex hostname such as example.com.");
  process.exit(1);
}
if (databaseId && !/^[0-9a-f-]{36}$/i.test(databaseId)) {
  console.error("D1 database ID must be a UUID.");
  process.exit(1);
}

const databaseName = slug + "-db";
const replacements = [
  ["cloudflare-saas-template-db", databaseName],
  ["cloudflare-saas-template", slug],
  ["Cloudflare SaaS Template", displayName],
  ["Cloudflare SaaS Template Bot/1.0", displayName + " Bot/1.0"],
  ["app_locale", slug.replaceAll("-", "_") + "_locale"],
];

async function replaceIn(path) {
  let content = await readFile(path, "utf8");
  for (const [from, to] of replacements) content = content.split(from).join(to);
  if (path === "index.html" && domain) {
    content = content.split("https://example.com").join("https://" + domain);
  }
  if (path === "wrangler.jsonc") {
    content = content.replace('"CANONICAL_HOST": ""', '"CANONICAL_HOST": "' + domain + '"');
    content = content.replace(
      '"BETTER_AUTH_URL": ""',
      '"BETTER_AUTH_URL": "' + (domain ? "https://" + domain : "") + '"',
    );
    if (databaseId) {
      content = content.replace("00000000-0000-0000-0000-000000000000", databaseId);
    }
    if (domain) {
      content = content.replace(
        '"workers_dev": true,',
        '"workers_dev": true,\n  "routes": [\n'
          + '    { "pattern": "' + domain + '", "custom_domain": true },\n'
          + '    { "pattern": "www.' + domain + '", "custom_domain": true }\n'
          + "  ],",
      );
    }
  }
  await writeFile(path, content);
}

await Promise.all([
  replaceIn("package.json"),
  replaceIn("package-lock.json"),
  replaceIn("wrangler.jsonc"),
  replaceIn("index.html"),
  replaceIn("src/worker.ts"),
  replaceIn("src/App.tsx"),
  replaceIn("src/i18n/config.ts"),
  replaceIn("src/lib/auth.ts"),
  replaceIn("src/lib/email/send.ts"),
  replaceIn("src/lib/website-metadata.ts"),
]);

console.log("Initialized " + displayName + ".");
console.log("Database name: " + databaseName);
if (!databaseId) {
  console.log("Next: run npm run db:create, then paste the returned database_id into wrangler.jsonc.");
}

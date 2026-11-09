import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const PLACEHOLDER = /replace_me/i;
const ID = /^[a-z0-9_-]{1,40}$/;
const PROVIDERS = new Set(["stripe", "polar", "creem", "waffo"]);
const INTERVALS = new Set(["month", "year"]);
const USAGE_TYPES = new Set(["licensed", "metered"]);
const SQL_PATH = ".wrangler/seed.sql";

const args = process.argv.slice(2);
const remote = args.includes("--remote");
const withDemo = args.includes("--demo");
const dryRun = args.includes("--dry-run");
const fileIndex = args.indexOf("--file");
const seedPath = fileIndex === -1 ? "seeds/plans.json" : args[fileIndex + 1];

function fail(message) {
  console.error("seed: " + message);
  process.exit(1);
}

function quote(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}

function databaseName() {
  const config = readFileSync("wrangler.jsonc", "utf8");
  const match = config.match(/"database_name"\s*:\s*"([^"]+)"/);
  if (!match) fail("wrangler.jsonc has no database_name.");
  return match[1];
}

let seed;
try {
  seed = JSON.parse(readFileSync(seedPath, "utf8"));
} catch (error) {
  fail("could not read " + seedPath + ": " + error.message);
}

const plans = Array.isArray(seed.plans) ? seed.plans : [];
if (plans.length === 0) fail("the seed file defines no plans.");
if (plans.filter((plan) => plan.isDefault).length !== 1) {
  fail("exactly one plan must set isDefault to true.");
}

const planIds = new Set();
const priceIds = new Set();
const statements = [];
const skipped = [];

for (const plan of plans) {
  if (!ID.test(plan.id || "")) fail("plan id " + plan.id + " must match " + ID);
  if (planIds.has(plan.id)) fail("duplicate plan id " + plan.id);
  planIds.add(plan.id);
  if (!plan.name) fail("plan " + plan.id + " needs a name.");
  if (!Array.isArray(plan.features)) fail("plan " + plan.id + " needs a features array.");
  if (!plan.quotas || typeof plan.quotas !== "object") fail("plan " + plan.id + " needs a quotas object.");
  for (const [metric, limit] of Object.entries(plan.quotas)) {
    if (!Number.isInteger(limit) || limit < -1) {
      fail("quota " + metric + " on plan " + plan.id + " must be an integer of -1 or more.");
    }
  }

  statements.push(
    "INSERT INTO plans (id, name, description, sort_order, is_default, is_active, seat_based, "
    + "trial_days, features, quotas) VALUES ("
    + [
      quote(plan.id),
      quote(plan.name),
      quote(plan.description || ""),
      Number(plan.sortOrder || 0),
      plan.isDefault ? 1 : 0,
      plan.isActive === false ? 0 : 1,
      plan.seatBased ? 1 : 0,
      Number(plan.trialDays || 0),
      quote(JSON.stringify(plan.features)),
      quote(JSON.stringify(plan.quotas)),
    ].join(", ")
    + ") ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, "
    + "sort_order = excluded.sort_order, is_default = excluded.is_default, is_active = excluded.is_active, "
    + "seat_based = excluded.seat_based, trial_days = excluded.trial_days, features = excluded.features, "
    + "quotas = excluded.quotas, updated_at = CURRENT_TIMESTAMP;",
  );

  for (const price of plan.prices || []) {
    if (!ID.test(price.id || "")) fail("price id " + price.id + " must match " + ID);
    if (priceIds.has(price.id)) fail("duplicate price id " + price.id);
    priceIds.add(price.id);
    if (!PROVIDERS.has(price.provider)) fail("price " + price.id + " has an unknown provider.");
    if (!INTERVALS.has(price.interval)) fail("price " + price.id + " must use month or year.");
    if (!USAGE_TYPES.has(price.usageType || "licensed")) fail("price " + price.id + " has an unknown usageType.");
    if (!Number.isInteger(price.amountCents) || price.amountCents < 0) {
      fail("price " + price.id + " needs a non negative integer amountCents.");
    }
    if (!price.providerPriceId || PLACEHOLDER.test(price.providerPriceId)) {
      skipped.push(plan.id + " / " + price.id);
      continue;
    }

    statements.push(
      "INSERT INTO plan_prices (id, plan_id, payment_provider, provider_price_id, billing_interval, "
      + "amount_cents, currency, usage_type, is_active) VALUES ("
      + [
        quote(price.id),
        quote(plan.id),
        quote(price.provider),
        quote(price.providerPriceId),
        quote(price.interval),
        price.amountCents,
        quote((price.currency || "USD").toUpperCase()),
        quote(price.usageType || "licensed"),
        price.isActive === false ? 0 : 1,
      ].join(", ")
      + ") ON CONFLICT(id) DO UPDATE SET plan_id = excluded.plan_id, "
      + "payment_provider = excluded.payment_provider, provider_price_id = excluded.provider_price_id, "
      + "billing_interval = excluded.billing_interval, amount_cents = excluded.amount_cents, "
      + "currency = excluded.currency, usage_type = excluded.usage_type, is_active = excluded.is_active;",
    );
  }
}

if (withDemo) {
  for (const project of seed.demoProjects || []) {
    let canonical;
    try {
      const url = new URL(project.url);
      if (url.protocol !== "https:") throw new Error("demo projects must use HTTPS.");
      canonical = url.hostname.replace(/^www\./, "") + url.pathname.replace(/\/$/, "");
    } catch (error) {
      fail("demo project " + project.url + " is not a valid URL: " + error.message);
    }
    statements.push(
      "INSERT OR IGNORE INTO projects (id, canonical_url, url, name, description, status) VALUES ("
      + [
        quote("project_seed_" + canonical.replaceAll(/[^a-z0-9]/gi, "_")),
        quote(canonical),
        quote(project.url),
        quote(project.name),
        quote(project.description || ""),
        quote("active"),
      ].join(", ")
      + ");",
    );
  }
}

const sql = statements.join("\n") + "\n";

if (skipped.length > 0) {
  console.warn("seed: skipped " + skipped.length + " price(s) that still hold a placeholder id:");
  for (const entry of skipped) console.warn("  " + entry);
  console.warn("seed: create the price in your payment provider, put its real id in " + seedPath + ", then run seed again.");
}

if (dryRun) {
  process.stdout.write(sql);
  process.exit(0);
}

mkdirSync(dirname(SQL_PATH), { recursive: true });
writeFileSync(SQL_PATH, sql);

const target = remote ? "--remote" : "--local";
console.log("seed: applying " + statements.length + " statement(s) to the " + (remote ? "remote" : "local") + " database.");
try {
  execFileSync(
    "npx",
    ["wrangler", "d1", "execute", databaseName(), target, "--file", SQL_PATH],
    { stdio: "inherit" },
  );
} catch {
  fail("wrangler could not apply the seed. Run the migrations first.");
}
console.log("seed: done. Plans: " + planIds.size + ". Prices written: " + (priceIds.size - skipped.length) + ".");

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { BillingPeriod, TaxCategory, WaffoPancake, WebhookEventType } from "@waffo/pancake-ts";

if (existsSync(".dev.vars")) process.loadEnvFile(".dev.vars");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const urlIndex = args.indexOf("--webhook-url");
const webhookUrl = urlIndex === -1 ? undefined : args[urlIndex + 1];
const env = process.env;
const seed = JSON.parse(readFileSync("seeds/plans.json", "utf8"));
const environment = env.WAFFO_ENVIRONMENT;

async function main() {
  if (environment !== "test") throw new Error("此初始化脚本只允许 WAFFO_ENVIRONMENT=test。");
  if (!env.WAFFO_MERCHANT_ID || !env.WAFFO_STORE_ID) throw new Error("请配置 WAFFO_MERCHANT_ID 和 WAFFO_STORE_ID。");
  if (urlIndex !== -1 && (!webhookUrl || new URL(webhookUrl).protocol !== "https:")) {
    throw new Error("--webhook-url 必须是完整 HTTPS 回调地址。");
  }
  const unitAmount = Number(env.UNIT_PRICE_CENTS || 100);
  if (!Number.isInteger(unitAmount) || unitAmount < 50 || unitAmount > 100000) throw new Error("UNIT_PRICE_CENTS 无效。");
  const products = seed.plans.flatMap((plan) => plan.prices
    .filter((price) => price.provider === "stripe" && price.usageType === "licensed")
    .map((price) => ({ plan, price, id: "waffo_" + price.id })));
  console.log("测试店铺：" + env.WAFFO_STORE_ID);
  console.log("一次性商品：" + (unitAmount / 100).toFixed(2) + " USD，结账时按数量覆盖总价。");
  for (const { plan, price } of products) {
    console.log(plan.name + " / " + price.interval + "：" + (price.amountCents / 100).toFixed(2) + " " + price.currency);
  }
  if (dryRun) {
    console.log("预览完成，未调用远程接口。正式执行会创建测试商品及套餐组，并生成本地 seed 文件。");
    return;
  }
  const client = new WaffoPancake({
    merchantId: env.WAFFO_MERCHANT_ID,
    privateKey: env.WAFFO_PRIVATE_KEY || "",
    environment: "test",
  });
  const result = await client.graphql.query({
    query: "query ($id: String!) { store(id: $id) { id name } }",
    variables: { id: env.WAFFO_STORE_ID },
  });
  if (result.errors?.length || result.data?.store?.id !== env.WAFFO_STORE_ID) {
    throw new Error("无法查询指定店铺，请核对测试私钥和店铺权限。");
  }
  const directory = ".wrangler/waffo";
  mkdirSync(directory, { recursive: true });
  const manifestPath = directory + "/test-" + env.WAFFO_STORE_ID + ".json";
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
  const save = () => writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  const key = (operation, params) => ({
    idempotencyKey: "waffo_" + createHash("sha256").update(JSON.stringify([env.WAFFO_MERCHANT_ID, env.WAFFO_STORE_ID, operation, params])).digest("hex"),
  });
  if (!manifest.onetimeProductId) {
    if (env.WAFFO_PRODUCT_ID) {
      manifest.onetimeProductId = env.WAFFO_PRODUCT_ID;
    } else {
      const params = {
        storeId: env.WAFFO_STORE_ID,
        name: (env.APP_NAME || "My SaaS") + " project support",
        prices: { USD: { amount: (unitAmount / 100).toFixed(2), taxCategory: TaxCategory.SaaS } },
      };
      manifest.onetimeProductId = (await client.onetimeProducts.create(params, key("onetime", params))).product.id;
    }
    save();
  }
  const mappedPlans = structuredClone(seed.plans);
  for (const plan of mappedPlans) plan.prices = [];
  for (const { plan, price, id } of products) {
    if (!manifest[id]) {
      const params = {
        storeId: env.WAFFO_STORE_ID,
        name: plan.name + (price.interval === "month" ? " Monthly" : " Yearly"),
        description: plan.description,
        billingPeriod: price.interval === "month" ? BillingPeriod.Monthly : BillingPeriod.Yearly,
        prices: { [price.currency]: { amount: (price.amountCents / 100).toFixed(2), taxCategory: TaxCategory.SaaS } },
        metadata: { trialDays: plan.trialDays, planId: plan.id, priceId: id },
      };
      manifest[id] = (await client.subscriptionProducts.create(params, key(id, params))).product.id;
      save();
    }
    mappedPlans.find((entry) => entry.id === plan.id).prices.push({
      ...price,
      id,
      provider: "waffo",
      providerPriceId: manifest[id],
    });
  }
  if (!manifest.groupId) {
    const params = {
      storeId: env.WAFFO_STORE_ID,
      name: (env.APP_NAME || "My SaaS") + " plans",
      rules: { sharedTrial: true, selfServicePlanChange: true },
      productIds: products.map(({ id }) => manifest[id]),
    };
    manifest.groupId = (await client.subscriptionProductGroups.create(params, key("group", params))).group.id;
    save();
  }
  if (webhookUrl && manifest.webhookUrl !== webhookUrl) {
    const params = {
      storeId: env.WAFFO_STORE_ID,
      channel: "http",
      url: webhookUrl,
      testMode: true,
      events: Object.values(WebhookEventType),
    };
    if (manifest.webhookId) {
      await client.webhooks.update({ id: manifest.webhookId, url: webhookUrl, events: params.events });
    } else {
      manifest.webhookId = (await client.webhooks.add(params, key("webhook", params))).webhook.id;
    }
    manifest.webhookUrl = webhookUrl;
    save();
  }
  const seedPath = directory + "/test-" + env.WAFFO_STORE_ID + ".seed.json";
  writeFileSync(seedPath, JSON.stringify({ ...seed, plans: mappedPlans }, null, 2) + "\n");
  if (existsSync(".dev.vars")) {
    let local = readFileSync(".dev.vars", "utf8");
    const line = "WAFFO_PRODUCT_ID=" + manifest.onetimeProductId;
    local = /^WAFFO_PRODUCT_ID=.*$/m.test(local) ? local.replace(/^WAFFO_PRODUCT_ID=.*$/m, line) : local.trimEnd() + "\n" + line + "\n";
    writeFileSync(".dev.vars", local, { mode: 0o600 });
  }
  console.log("测试商品已就绪，WAFFO_PRODUCT_ID 已写入本地配置。");
  console.log("写入本地套餐：npm run seed -- --file " + seedPath);
  if (!webhookUrl) console.log("尚未注册回调；准备好 HTTPS 地址后，使用 --webhook-url 再次运行。");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Waffo 初始化失败。");
  process.exitCode = 1;
});

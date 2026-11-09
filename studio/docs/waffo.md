# Waffo Pancake 接入

依赖为 `@waffo/pancake-ts`，运行位置为启用 `nodejs_compat` 的 Cloudflare Worker。代码只在服务端读取私钥。

## 本地测试配置

当前 .dev.vars 已写入商户 MER_7dpBd17AoO1Z8ROUXNvKMw、店铺 STO_5WS25jzojdmu39spZ2Q57R 和 test 环境。填写实际的测试 RSA 私钥后再运行初始化：

```dotenv
PAYMENT_PROVIDER=waffo
WAFFO_ENVIRONMENT=test
WAFFO_MERCHANT_ID=MER_7dpBd17AoO1Z8ROUXNvKMw
WAFFO_STORE_ID=STO_5WS25jzojdmu39spZ2Q57R
WAFFO_PRIVATE_KEY="实际 PEM 内容，可使用转义换行"
WAFFO_PRODUCT_ID=
```

占位符、空私钥或缺少环境时，Waffo 结账关闭。SDK 支持 PEM、转义换行及原始 Base64 密钥格式。测试和正式环境必须使用各自的 API Key。

```sh
npm run db:migrate:local
npm run waffo:setup -- --dry-run
npm run waffo:setup
npm run seed -- --file .wrangler/waffo/test-STO_5WS25jzojdmu39spZ2Q57R.seed.json
```

初始化脚本只允许测试环境。它先检查指定店铺，再创建一个项目支持商品、现有套餐对应的月付和年付商品，以及支持共享试用和自助切换的套餐组。会保留返回的商品 ID 供重试，并给创建请求附加幂等键；不会发布正式商品。一次性商品 ID 写入 .dev.vars，套餐映射生成在 .wrangler/waffo 中，不会覆盖现有 Stripe 价格。

已有商品时可直接填写 WAFFO_PRODUCT_ID，并用单独的 seed JSON 填写订阅映射：provider 使用 waffo，providerPriceId 使用 Waffo 的 PROD_ 商品 ID。平台商品的金额、币种、周期和试用天数应与本地套餐一致。供客户门户切换的商品还应在商品 metadata 中填写本地 priceId，并放入同一套餐组。

## 收款与订阅

一次性付款继续使用 `POST /api/checkout`，传 projectId、quantity，可带 Idempotency-Key。金额由服务端按 UNIT_PRICE_CENTS 计算，以 display amount 字符串传给 SDK。Webhook 按订单的商品金额履约，税费不计入项目支持金额。

定价页使用 `POST /api/billing/checkout` 创建订阅，新标签页打开 Waffo 托管收银台。当前页保持可用。订阅权益由 Webhook 同步；`subscription.payment_succeeded` 只记收款事件，周期延长以 `subscription.renewed` 为准。计划变更等待买家在收银台确认，待生效或失败事件不提前授予新套餐。

`POST /api/billing/portal` 提供按当前登录用户签发的客户门户；cancel 期末取消，resume 撤销取消，change 返回变更确认链接。当前 Waffo 适配只接受单席位订阅，不支持立即取消或按用量上报。Business 套餐在此按单席位销售。

Waffo 支付渠道要求 successUrl 为 HTTPS。本地 HTTP 开发时不传 successUrl，支付后停留在 Waffo 完成页，回到原标签页刷新账户状态；如需验证回跳，使用 HTTPS ngrok 地址作为 PUBLIC_APP_URL。

## 配置回调

```sh
ngrok http 8787
npm run waffo:setup -- --webhook-url https://你的-ngrok-域名/api/webhooks/waffo
```

脚本将注册 SDK 当前支持的订单、订阅、计划变更和退款事件。也可在控制台的设置、Webhooks 中添加 HTTP 测试回调，地址使用 `/api/webhooks/waffo`。

入口读取原始请求体，用 SDK 的内置测试公钥和时间戳窗口验签，并核对 storeId 与 mode。先保存事件，再返回 200 并后台处理。处理失败保留在 webhook_deliveries，管理员可通过现有重放入口补偿。平台重试和人工重放不会重复发放一次性权益；同一退款按业务退款 ID 去重，多次部分退款累计并按实收金额比例回滚商品权益。

订阅退款保留事件，不直接按金额推断订阅是否终止，订阅权益跟随生命周期通知。

## 验证

```sh
npm run check
npm test
npm run build
```

自动测试使用临时 RSA 密钥和真实 SQLite，覆盖实际 SDK 请求签名、原始回调验签、店铺和环境隔离、重复通知、退款累计以及订阅状态变更。它们不调用真实 Waffo API。

真实联调需要有效测试私钥、商品 ID 和公网 HTTPS 回调。测试成功卡为 4576750000000110，拒付卡为 4576750000000220，使用未来有效期和任意 CVC。完成真实支付后，核对本地订单和账户权益，不能只以收银台回跳判断支付成功。

官方参考：[技能指南](https://docs.waffo.ai/zh/integrate/skill)、[SDK 文档](https://docs.waffo.ai/integrate/sdks)、[Webhook 文档](https://docs.waffo.ai/api-reference/webhooks)。

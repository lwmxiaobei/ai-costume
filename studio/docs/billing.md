# 订阅、套餐与权益

模板同时保留一次性支付与订阅两条链路。一次性支付走 src/domain/fulfillment.ts，订阅走 src/lib/billing。

## 数据模型

| 表 | 用途 |
|---|---|
| plans | 套餐目录，含 features 与 quotas 两个 JSON 列 |
| plan_prices | 每个套餐在各提供商下的价格，区分月付与年付、按席位与按用量 |
| billing_customers | 用户与提供商客户号的映射 |
| subscriptions | 订阅状态、周期、席位数、取消标记 |
| usage_records | 按用户、指标、周期累计的用量 |

迁移会预置 free、pro、business 三个套餐。plan_prices 默认为空，需要在提供商后台创建价格后写入映射。

## 权益判断

    const entitlement = await userEntitlement(env, userId);
    hasFeature(entitlement, "analytics");
    withinQuota(entitlement, "projects", used);

有效套餐的取值顺序是：状态属于 trialing、active、past_due 的订阅所对应的套餐；没有则回落到 is_default 的套餐。quotas 中 -1 表示不限量，按席位套餐的额度会乘以订阅席位数。

两个中间件可直接挂在路由上：

    app.post("/api/reports", requireSession(), requireFeature("analytics"), handler);
    app.post("/api/exports", requireSession(), requireQuota("api_calls"), handler);

requireQuota 会在通过时立即记账。如果业务需要先校验再扣减，改用 consumeQuota 显式调用，模板中的建项目接口就是这种写法。

额度指标分两类：

1. 累计型，例如 api_calls，按用户、指标、自然月累加到 usage_records，跨月自动归零
2. 持有型，例如 projects，当前持有数量才是用量，跨月不应归零

持有型指标注册到 entitlements.ts 的 QUOTA_COUNTERS，给出一个直接查表计数的函数。metricUsage 会优先使用注册的计数器，没有注册的指标才回落到 usage_records，账户中心和额度判断因此始终读到同一个口径。

## Stripe 订阅

下表描述 Stripe 的订阅管理行为，除公开套餐接口外全部要求登录。Waffo 的差异见下一节：

| 接口 | 说明 |
|---|---|
| GET /api/billing/plans | 公开的套餐与价格表 |
| GET /api/billing/subscription | 当前权益、用量与订阅摘要 |
| POST /api/billing/checkout | 创建订阅结账会话，自动附带试用天数与席位控件 |
| POST /api/billing/portal | 创建 Customer Portal 会话 |
| POST /api/billing/cancel | 期末取消或立即取消 |
| POST /api/billing/resume | 撤销期末取消 |
| POST /api/billing/change | 升级、降级或调整席位，按比例计费 |

结账会话会把 userId、planId 和 priceId 同时写入 session 与 subscription 的 metadata，Webhook 因此可以在没有客户映射时也定位到用户。

## Waffo 订阅

Waffo 也复用同组计费接口，配置与测试商品初始化见 [Waffo 接入说明](waffo.md)。Waffo 托管收银台在新标签页打开，商品 ID 映射到 plan_prices.provider_price_id。客户门户使用当前登录用户的身份签发，取消在期末生效，升降级需在返回的 checkoutUrl 确认。

Waffo 当前只支持单席位订阅；立即取消和按用量上报仍仅支持 Stripe。subscription.renewed 更新周期，canceling 保留当前权益，canceled 撤销权益，计划变更待生效和失败事件只记账。全部使用 SDK 验签，失败事件可在管理后台重放。

## 状态同步

customer.subscription.created、updated、deleted 事件进入 syncSubscriptionEvent，按 provider 与 provider_subscription_id 做 upsert。Polar 与 Creem 的 subscription.* 事件复用同一条路径，只是字段映射不同。

状态从非活跃变为 active 或 trialing 时发送订阅生效邮件，变为 canceled 时发送取消邮件，两者都带幂等键，重复投递不会重复发信。

## 按用量计费

recordUsage 负责本地累计。需要把用量上报给 Stripe 时调用 reportStripeMeterEvent，传入 Meter 的 event_name、客户号、增量和幂等标识。模板不假设指标名称，由业务自行定义。

## 上线检查

凭据获取与 Webhook 配置见 docs/integrations.md。

1. 在 Stripe 创建产品与价格，把价格写入 seeds/plans.json 后执行 npm run seed:remote
2. 在 Stripe 后台启用 Customer Portal，可选把配置 ID 写入 STRIPE_PORTAL_CONFIGURATION_ID
3. Webhook 订阅 checkout.session.completed、customer.subscription.*、charge.refunded、charge.dispute.created
4. 验证试用、升级、降级、期末取消、恢复与退款

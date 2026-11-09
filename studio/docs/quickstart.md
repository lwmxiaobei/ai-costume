# 上手第一步

这份文档只回答一个问题：拿到模板之后，怎么最快跑出一个属于自己的、能上线的产品。其他文档负责解释某个子系统，这里负责给顺序。

## 一、三十分钟跑通骨架

复制整个目录，然后在副本里执行一次初始化。初始化会改写包名、Worker 名、数据库名、显示名、规范域名和自定义域名路由，只能在干净副本里跑一次。

    cp -r cloudflare-saas-template my-app
    cd my-app
    npm run init -- my-app "My App" example.com
    npm install
    npm run db:create

把返回的 database_id 填进 wrangler.jsonc。本地先跑起来：

    cp .env.example .dev.vars
    npm run db:migrate:local
    npm run seed -- --demo
    npm run dev:worker

.dev.vars 至少要填两项：

    BETTER_AUTH_SECRET=<openssl rand -base64 32 的结果>
    ADMIN_EMAILS=<你自己的邮箱>

打开 http://localhost:8787，用上面那个邮箱注册，就是管理员，导航里会出现 /admin。

这一步已经拿到：邮箱注册登录、账户中心、登录设备管理、数据导出、账号注销、管理后台、操作审计、速率限制、请求幂等、九种语言界面。

每个变量去哪里申请，见 docs/integrations.md 的凭据申请地址总表。

## 二、上线骨架

    npx wrangler secret put BETTER_AUTH_SECRET
    npm run db:migrate:remote
    npm run seed:remote
    npm run deploy

wrangler.jsonc 的 vars 里填好 ADMIN_EMAILS 和 CANONICAL_HOST。秘密一律用 wrangler secret put，不要写进 wrangler.jsonc。

发布后依次检查 /api/health、/api/config、注册、登录、/admin。

## 三、换成自己的业务

模板的示例领域是「项目目录 + 付款累加支持金额」。替换它只需要动三个地方，其余全部复用。

### 1. 加一张自己的业务表

按 migrations 中的最大编号递增创建领域迁移，例如 migrations/0008_<your_domain>.sql。业务表必须带 user_id 列，这是所有权中间件的前提：

    CREATE TABLE things (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_things_user ON things(user_id, created_at DESC);

### 2. 改履约

src/domain/fulfillment.ts 里的 fulfillPurchase 与 reversePurchase 决定「付款成功之后发生什么」和「退款之后怎么回滚」。把累加 support_cents 换成自己的发放逻辑，签名校验、幂等、金额比对不要复制进来，它们已经在支付层做完了。

### 3. 改接口

src/worker.ts 里的 projects 路由是可以照抄的样板。中间件顺序是模板的核心资产：

    app.post("/api/things",
      requireSession(),
      rateLimit({ scope: "thing_create", limit: 20, windowSeconds: 3600, by: "ip+user" }),
      requireJsonBody(),
      idempotent(),
      requireFeature("core"),
      handler);

    app.delete("/api/things/:id",
      requireSession(),
      requireOwnership({ table: "things" }),
      handler);

前端页面在 src/pages 下，新增页面记得在 src/routes.ts 的 APP_ROUTES 里登记。生成任务的 /generate 页面已经登记，模型接入见 docs/generation.md。

## 四、开钱

一次性付款和订阅是两条独立链路，按需要选。

### 一次性付款

在提供商后台建一个产品，把产品 ID 和单价配好就能用：

    PAYMENT_PROVIDER=stripe
    STRIPE_SECRET_KEY=...
    STRIPE_WEBHOOK_SECRET=...
    STRIPE_PRODUCT_ID=prod_...
    UNIT_PRICE_CENTS=100

### 订阅

各家提供商的凭据从哪里拿、Webhook 填哪个地址、要勾选哪些事件，全部在 docs/integrations.md。这里只讲模板这一侧的步骤。

订阅需要把提供商的价格 ID 灌进 plan_prices，否则定价页的按钮全是灰的。流程是：

1. 在 Stripe 建好产品与价格，拿到 price_xxx
2. 把 price_xxx 写进 seeds/plans.json 里对应的 providerPriceId
3. 执行 npm run seed 和 npm run seed:remote

seed 脚本会拒绝写入仍然带 replace_me 的价格，并把跳过的条目打印出来，所以忘了改哪一条一眼能看到。套餐的名称、试用天数、features 和 quotas 之后可以在管理后台直接改，价格改动仍然回到 seeds/plans.json 走 seed。

Stripe 的 Webhook 地址是 https://你的域名/api/webhooks/stripe，需要勾选 checkout.session.completed、checkout.session.async_payment_succeeded、customer.subscription.created、customer.subscription.updated、customer.subscription.deleted、charge.refunded、charge.dispute.created 七个事件。

本地可以用 Stripe CLI 转发：

    stripe listen --forward-to http://localhost:8787/api/webhooks/stripe

接入细节见 docs/integrations.md，计费模型见 docs/billing.md。

## 四点五、上线前必须替换的占位内容

| 位置 | 内容 |
|---|---|
| src/content/legal.ts | 四份合规文本，当前是「每节该写什么」的提纲，不是可生效的条款 |
| public/og.png、public/icon.png、public/favicon.svg | 纯几何占位图，用 npm run brand 重新生成或直接替换 |
| src/i18n/messages.ts 的 landing 段 | 四张能力卡与行动号召的文案 |
| index.html 的 https://example.com | 初始化脚本传了域名就会自动替换，没传要手工改 |

## 五、按需打开的能力

没有配置的能力会自己关掉，不会报错，api/config 会如实反映开关状态。

| 能力 | 需要的变量 | 不配的后果 |
|---|---|---|
| Google 登录 | GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET | 只保留邮箱密码登录 |
| 事务邮件、邮箱验证、Magic Link | EMAIL_FROM 加任意一家的凭据 | 注册不强制验证邮箱，Magic Link 不出现 |
| Turnstile | TURNSTILE_SITE_KEY、TURNSTILE_SECRET_KEY | 不渲染验证码，接口照常可用 |
| Customer Portal 自定义配置 | STRIPE_PORTAL_CONFIGURATION_ID | 使用 Stripe 默认门户配置 |

建议顺序是先开邮件，再开 Turnstile，最后开 Google 登录。邮件一开，邮箱验证、密码重置、Magic Link 和订阅状态通知会同时生效。

## 六、发布前自检

    npm run check
    npm test
    npm run build

仓库里的 .github/workflows/ci.yml 会在每次 push 和 PR 上跑这三条，外加校验 seeds/plans.json 和迁移编号唯一性。deploy.yml 是可选的自动发布，用之前需要在仓库里配置 CLOUDFLARE_API_TOKEN、CLOUDFLARE_ACCOUNT_ID 两个 secret 和 DATABASE_NAME 变量。API 令牌在 https://dash.cloudflare.com/profile/api-tokens 创建，选 Edit Cloudflare Workers 模板并授予目标 D1 数据库的读写权限；账号 ID 在 Cloudflare 控制台任意域名概览页的右下角。

线上第一次发布后手动确认这几条：注册与登录、邮件确实送达、订阅结账、升降级、期末取消、Customer Portal、重复 Webhook 不重复履约、部分退款、全额退款、管理后台的封禁与重放。

## 七、常见卡点

| 现象 | 原因 | 处理 |
|---|---|---|
| 定价页按钮全灰 | plan_prices 是空的 | 按第四节灌价格 |
| 注册后收不到邮件 | 没配 EMAIL_FROM、提供商凭据，或发信域名未完成 SPF 与 DKIM 验证 | 见 docs/integrations.md 的域名验证一节 |
| 认证路由返回 503 | BETTER_AUTH_SECRET 少于三十二位，或 BETTER_AUTH_URL 不是根地址 | 见 docs/auth.md |
| 订阅接口返回 503 | 当前提供商不是 Stripe 或 Waffo | Waffo 配置见 docs/waffo.md |
| 接口返回 429 | 命中速率限制 | 本地压测可临时设 RATE_LIMIT_DISABLED=true |
| 加一句文案要写九遍 | 九种语言是类型和测试强制的 | 只保留需要的语言，见 docs/i18n.md 的裁剪语言 |
| 合规页是英文占位 | 法律文本必须按公司和辖区重写 | 见 docs/marketing.md，替换 src/content/legal.ts |
| 订阅到期提醒没发出去 | 只提醒已标记期末取消的订阅 | 见 docs/scheduled.md 的提醒条件 |

# 外部服务接入

模板依赖五类外部服务，全部可选。没有配置的服务会安全关闭，不会让接口报错。这份文档回答三个问题：凭据从哪里拿、填到哪里、怎么验证接通了。

## 总览

| 服务 | 必填变量 | 未配置时 |
|---|---|---|
| Better Auth | BETTER_AUTH_SECRET、BETTER_AUTH_URL | api/auth/* 返回 503，界面不显示登录 |
| Google OAuth | GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET | 只保留邮箱密码登录 |
| 支付（择一） | 见下方各节 | 结账返回 503，定价页按钮置灰 |
| 事务邮件（择一） | EMAIL_FROM 加提供商凭据 | 注册不强制验证，Magic Link 不注册，订阅通知不发送 |
| Turnstile | TURNSTILE_SITE_KEY、TURNSTILE_SECRET_KEY | 不渲染挑战，接口照常可用 |
| KIE 试穿 | KIE_API_KEY | 试穿页显示未开放，不提交生图任务 |

## 凭据申请地址总表

带直达链接的是官方文档明确给出的稳定地址；只给导航路径的，是官方没有公开稳定深链，按路径点进去即可。全部需要先登录。

| 需要的值 | 去哪里拿 |
|---|---|
| STRIPE_SECRET_KEY | https://dashboard.stripe.com/apikeys ，测试环境 https://dashboard.stripe.com/test/apikeys |
| STRIPE_WEBHOOK_SECRET | https://dashboard.stripe.com/webhooks ，测试环境 https://dashboard.stripe.com/test/webhooks ，添加端点后取 Signing secret |
| STRIPE_PRODUCT_ID、价格 ID | https://dashboard.stripe.com/products ，测试环境 https://dashboard.stripe.com/test/products |
| STRIPE_PORTAL_CONFIGURATION_ID | https://dashboard.stripe.com/settings/billing/portal |
| POLAR_ACCESS_TOKEN | https://polar.sh 或沙箱 https://sandbox.polar.sh ，Settings → Developers → Access Tokens → New token |
| POLAR_WEBHOOK_SECRET | 同一个 Settings 页的 Webhooks → Add Endpoint，创建时设定或生成密钥 |
| POLAR_PRODUCT_ID | Polar 控制台的 Products 页，取产品 UUID |
| CREEM_API_KEY | https://creem.io/dashboard/developers |
| CREEM_WEBHOOK_SECRET | https://creem.io/dashboard 的 Developers → Webhooks → Add webhook，创建后复制 signing secret |
| WAFFO_MERCHANT_ID、WAFFO_PRIVATE_KEY | [Waffo 控制台](https://pancake.waffo.ai/merchant/dashboard/integration) 的 API 与开发，选择测试 API Key，商户 ID 与 RSA 私钥分别填写 |
| WAFFO_STORE_ID、WAFFO_PRODUCT_ID | Waffo 控制台的店铺资料和产品页；也可运行 npm run waffo:setup 创建测试商品 |
| RESEND_API_KEY | https://resend.com/api-keys |
| Resend 发信域名 | https://resend.com/domains → Add Domain |
| POSTMARK_SERVER_TOKEN | https://account.postmarkapp.com → 进入具体 Server → API Tokens 标签 |
| Postmark 发信域名 | https://account.postmarkapp.com → Sender Signatures，或 Domains |
| MAILGUN_API_KEY | https://app.mailgun.com → 左侧 API Keys |
| MAILGUN_DOMAIN | https://app.mailgun.com → Send → Sending → Domains |
| GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET | https://console.cloud.google.com/auth/clients → Create client，类型选 Web 应用 |
| TURNSTILE_SITE_KEY、TURNSTILE_SECRET_KEY | https://dash.cloudflare.com → Application Security → Turnstile → Add widget，创建后同页显示两把密钥 |
| KIE_API_KEY | https://kie.ai/api-key 创建，用 wrangler secret put KIE_API_KEY 写入 |
| CLOUDFLARE_API_TOKEN、CLOUDFLARE_ACCOUNT_ID | https://dash.cloudflare.com/profile/api-tokens ，仅在使用 deploy.yml 自动发布时需要；账号 ID 在 Cloudflare 控制台任意域名的概览页右下角 |
| BETTER_AUTH_SECRET | 不需要申请，本地生成：openssl rand -base64 32 |

Stripe 账号注册在 https://dashboard.stripe.com/register 。Stripe 自 2026 年起在正式环境引导使用受限密钥，取到的可能是 rk_live_ 开头而不是 sk_live_，模板不校验前缀，两种都能用，只要该密钥具备 Checkout、Subscriptions、Customers 和 Billing Portal 的写权限。

## 秘密放哪里

非敏感的开关和地址写进 wrangler.jsonc 的 vars，会随代码提交；密钥一律用 wrangler secret，不进仓库。

    npx wrangler secret put BETTER_AUTH_SECRET
    npx wrangler secret put STRIPE_SECRET_KEY
    npx wrangler secret put STRIPE_WEBHOOK_SECRET
    npx wrangler secret put RESEND_API_KEY
    npx wrangler secret put TURNSTILE_SECRET_KEY

本地一律写 .dev.vars，它已经在 .gitignore 里。

## Webhook 回调地址

四家支付提供商各有独立入口，全部只接受 POST，全部在处理业务前先校验原始请求体的签名。

| 提供商 | 回调地址 | 签名请求头 |
|---|---|---|
| Stripe | https://你的域名/api/webhooks/stripe | stripe-signature |
| Polar | https://你的域名/api/webhooks/polar | webhook-id、webhook-timestamp、webhook-signature |
| Creem | https://你的域名/api/webhooks/creem | creem-signature |
| Waffo | https://你的域名/api/webhooks/waffo | x-waffo-signature |

Stripe 与 Polar 的签名包含时间戳，模板强制五分钟时效。Creem 的签名只覆盖请求体，没有时间戳可校验，因此重放窗口不受时间限制，只由 payment_events 的幂等主键兜底。如果你的风险偏好不接受这一点，请在 Creem 入口前再加一层网络层防护。

## Stripe

### 拿凭据

1. https://dashboard.stripe.com/test/apikeys 取 Secret key，测试环境是 sk_test_ 开头
2. https://dashboard.stripe.com/test/webhooks 添加端点，地址填上表中的 Stripe 回调地址，创建后取 Signing secret，whsec_ 开头
3. https://dashboard.stripe.com/test/products 建产品。一次性付款只需要产品 ID；订阅还要为每个套餐建月付和年付两个价格，取 price_ 开头的价格 ID
4. https://dashboard.stripe.com/settings/billing/portal 启用 Customer portal，需要自定义配置时取配置 ID

正式上线时把上面四条链接里的 /test 去掉，进正式环境重做一遍，测试与正式的密钥不通用。

### 填变量

    PAYMENT_PROVIDER=stripe
    STRIPE_SECRET_KEY=sk_test_...
    STRIPE_WEBHOOK_SECRET=whsec_...
    STRIPE_PRODUCT_ID=prod_...
    STRIPE_PORTAL_CONFIGURATION_ID=

订阅还要把价格 ID 写进 seeds/plans.json 的 providerPriceId，然后执行 npm run seed 与 npm run seed:remote。不做这一步定价页按钮全是灰的。

### 订阅事件

在 Webhook 端点上勾选这六个：

    checkout.session.completed
    checkout.session.async_payment_succeeded
    customer.subscription.created
    customer.subscription.updated
    customer.subscription.deleted
    charge.refunded
    charge.dispute.created

模板对 customer.subscription. 前缀做整体匹配，将来 Stripe 增加同族事件不需要改代码。

### 本地验证

Stripe CLI 安装说明在 https://docs.stripe.com/stripe-cli ，装好后把事件转发到本地：

    stripe listen --forward-to http://localhost:8787/api/webhooks/stripe

CLI 会打印一个临时的 whsec_，把它填进 .dev.vars 的 STRIPE_WEBHOOK_SECRET 并重启 wrangler dev。然后：

    stripe trigger checkout.session.completed

处理失败的事件会落进 webhook_deliveries，在 /admin 的 webhooks 标签页可以看到原因并重放。

## Polar

    PAYMENT_PROVIDER=polar
    POLAR_API_BASE=https://sandbox-api.polar.sh
    POLAR_ACCESS_TOKEN=polar_oat_...
    POLAR_WEBHOOK_SECRET=polar_whs_...
    POLAR_PRODUCT_ID=<产品 UUID>

沙箱在 https://sandbox.polar.sh ，正式环境在 https://polar.sh ，两边的组织和令牌相互独立，沙箱令牌不能用于正式环境。访问令牌在 Settings → Developers → Access Tokens 创建，创建时按需勾选权限；Webhook 在同一个 Settings 页的 Webhooks → Add Endpoint 添加，地址见上表的 Polar 回调地址。

切换正式环境时把 POLAR_API_BASE 改成 https://api.polar.sh，并且重新申请正式环境的访问令牌。

处理的事件：order.paid、order.refunded，以及 subscription. 前缀的全部事件。

Polar 用的是 Standard Webhooks 规范，签名头是 webhook-id、webhook-timestamp 和 webhook-signature 三件套，其中 webhook-id 同时充当事件幂等键。

## Creem

    PAYMENT_PROVIDER=creem
    CREEM_API_KEY=creem_test_...
    CREEM_WEBHOOK_SECRET=...
    CREEM_PRODUCT_ID=prod_...

API 密钥在 https://creem.io/dashboard/developers ，同一页可以拿到测试和正式两套。Webhook 在 https://creem.io/dashboard 的 Developers → Webhooks → Add webhook 添加，地址见上表的 Creem 回调地址。测试与正式环境用左侧栏底部的 Test Mode 开关切换。

API 密钥以 creem_test_ 开头时，模板会自动改用 https://test-api.creem.io，不需要手工切 CREEM_API_BASE。

处理的事件：checkout.completed、refund.created、dispute.created，以及 subscription. 前缀的全部事件。

## 订阅能力的提供商差异

四家都能同步订阅状态到 subscriptions 表。Stripe 与 Waffo 支持 api/billing 下的 checkout、portal、cancel、resume、change。Waffo 使用托管收银台确认升降级，只支持期末取消和单席位订阅；按用量上报仍仅支持 Stripe。Polar 与 Creem 的自助管理接口返回 503，需在提供商的客户门户操作。

## Waffo Pancake

接入步骤、测试商品初始化和本地回调见 [Waffo 接入说明](waffo.md)。SDK 只在 Worker 服务端使用，私钥放在 .dev.vars 或 Wrangler Secret，浏览器只能获得短期结账或门户链接。WAFFO_ENVIRONMENT 必须显式配置为 test 或 prod，API 环境由相应环境的私钥决定。

Waffo 使用 SDK 内置平台公钥验证原始请求体，并核对店铺和环境。验签后持久化事件，再通过 executionCtx.waitUntil 处理，立即返回 200；失败事件可在管理后台重放。重复投递按事件 ID 去重，一次性付款仍执行待支付单、商品、用户、金额和币种核对。

## 事务邮件

三家择一，同时必须提供发件地址。

    EMAIL_PROVIDER=resend
    EMAIL_FROM=noreply@example.com
    EMAIL_REPLY_TO=support@example.com
    RESEND_API_KEY=re_...

    # 或者
    EMAIL_PROVIDER=postmark
    POSTMARK_SERVER_TOKEN=...
    POSTMARK_MESSAGE_STREAM=outbound

    # 或者
    EMAIL_PROVIDER=mailgun
    MAILGUN_API_KEY=...
    MAILGUN_DOMAIN=mg.example.com

EMAIL_PROVIDER 留空时，模板按 resend、postmark、mailgun 的顺序自动选择第一个配置完整的。

API 密钥的申请地址见上表。

### 域名验证是必做的一步

三家都要求先验证发信域名，否则邮件会被拒收或直接进垃圾箱。添加域名的入口分别是 https://resend.com/domains 、https://account.postmarkapp.com 的 Sender Signatures、https://app.mailgun.com 的 Send → Sending → Domains。添加后控制台会给出需要写进 DNS 的记录，通常包括：

1. SPF，一条 TXT 记录，声明允许该提供商代发
2. DKIM，一条或多条 TXT 或 CNAME 记录，用于签名
3. 可选的 DMARC，一条 TXT 记录，声明校验失败时的处理策略
4. Mailgun 还需要 MX 记录才能接收退信

DNS 在 Cloudflare 托管时，DKIM 与 SPF 这类 TXT 记录不要开橙色云代理。等提供商后台显示域名已验证再发正式邮件。

EMAIL_FROM 的域名必须是验证过的那个域名，否则发送会被提供商拒绝，模板会把这条记为不可重试的失败。

### 验证接通

配置完成后在本地注册一个新账号，验证邮件会自动发出。查库确认：

    npx wrangler d1 execute <数据库名> --local --command "SELECT template, status, attempts, last_error FROM email_messages ORDER BY created_at DESC LIMIT 5;"

status 是 sent 就算接通。是 failed 时 last_error 会带提供商返回的状态码，例如 resend_403 通常就是域名没验证。/admin 的 emails 标签页可以直接重投。

## Google OAuth

在 https://console.cloud.google.com/auth/clients 点 Create client，类型选 Web 应用。旧版入口 APIs & Services → Credentials 仍可用，会跳到同一个页面。误删的客户端可以在 https://console.cloud.google.com/apis/credentials/deleted 三十天内恢复。

回调地址填：

    http://localhost:8787/api/auth/callback/google
    https://你的域名/api/auth/callback/google

两个都要加，否则本地或线上会有一边跑不通。取到客户端 ID 与密钥后填入 GOOGLE_CLIENT_ID 和 GOOGLE_CLIENT_SECRET。

只有 Better Auth 本身也配置正确时，api/config 才会返回 googleSignInEnabled 为 true。

## Turnstile

在 https://dash.cloudflare.com 的左侧 Application Security → Turnstile 点 Add widget，域名填正式域名，本地调试再加上 localhost。创建完成后同一页直接显示两把密钥：

    TURNSTILE_SITE_KEY=0x...     # 公开，写进 wrangler.jsonc 的 vars
    TURNSTILE_SECRET_KEY=0x...   # 秘密，用 wrangler secret put

两个都配齐才会启用。启用后注册、登录、Magic Link、找回密码由 Better Auth 的 captcha 插件校验，建项目接口校验请求体里的 turnstileToken。

## 接通自检

| 检查 | 期望 |
|---|---|
| GET /api/config | 各项开关如实反映已配置的服务 |
| 注册一个新账号 | 收到验证邮件，email_messages 里状态是 sent |
| 访问 /pricing | 已配置的套餐显示真实价格，按钮可点 |
| 走一遍订阅结账 | subscriptions 表出现记录，账户中心显示套餐与续费日期 |
| 重复投递同一个 Webhook | 第二次不重复履约，payment_events 里只有一条 |
| /admin 的 webhooks 标签页 | 失败投递可见且可重放 |

# Cloudflare SaaS Template

这是从多个生产项目的重复实现中提取出的可运行模板，面向使用 React、Hono、Cloudflare Workers、Workers Static Assets 和 D1 的小型 SaaS 产品。

模板已经包含：

1. React 19 与 Vite 单页应用，含首页、定价页、登录页、账户中心和管理控制台
2. Hono Worker 与同域 API
3. D1 迁移和一个可替换的项目目录示例
4. 安全响应头、规范域名跳转、健康检查和公开配置
5. 公网网址校验与受限元数据抓取
6. requireSession、requireVerifiedEmail、requireRole、requireOwnership 授权中间件
7. 邮箱注册、邮箱验证、密码重置、Magic Link、两步验证含备用码、会话设备管理、数据导出和账号注销
8. 套餐与价格表、月付与年付订阅、免费试用、升降级、Customer Portal、权益与额度判断、按席位与按用量计费
9. Stripe、Polar、Creem、Waffo Pancake 托管结账适配与原始 Webhook 签名校验，Waffo 接入见 docs/waffo.md
10. 支付金额、币种、商品、提供商和待支付单的二次核对
11. Webhook 幂等记录、失败留存与后台重放、退款与争议反向处理
12. Resend、Postmark、Mailgun 事务邮件抽象，九种语言模板，发送幂等与失败重试
13. 管理后台：用户查询与封禁、订阅与订单、支付事件、Webhook 重放、套餐配置、系统配置、失败邮件重试和操作审计
14. 接口速率限制、Turnstile 验证码、请求幂等和敏感操作二次确认
15. 定时任务：订阅到期提醒、过期记录清理、失败邮件自动重投
16. 落地页、条款隐私退款 Cookie 四个合规页骨架、动态 robots 与 sitemap、Open Graph 元数据、品牌图标和真 404
17. 英语、西班牙语、法语、德语、葡萄牙语、意大利语、日语、韩语、中文的类型安全多语言组件
18. TypeScript、Vitest、Wrangler 和初始化脚本
19. 可插拔的图片与视频生成任务：D1 持久化、提交去重、后台提交与轮询、用户隔离、超时恢复和九语创作页面；模型接入见 docs/generation.md
20. 可切换的前端模板：原有经典红黑与 Ozil 蓝白风格，支持明暗主题、九语选择器和构建时默认模板；见 docs/marketing.md

新拿到模板先读 docs/quickstart.md，那份文档给的是从复制目录到线上可用的完整顺序。下面是速查。

## 创建新项目

先复制整个目录，再在副本中执行一次初始化：

    npm run init -- my-app "My App" example.com
    npm install
    npm run db:create

把 D1 创建命令返回的 database_id 写入 wrangler.jsonc。也可以把它作为初始化脚本的第四个参数一次写入：

    npm run init -- my-app "My App" example.com 00000000-0000-0000-0000-000000000000

初始化脚本会同步修改包名、Worker 名、D1 数据库名、应用显示名、规范域名和自定义域名路由。请只在干净副本中运行一次。

## 本地开发

复制环境变量示例并只在本地文件中填写秘密：

    cp .env.example .dev.vars
    npm run db:migrate:local
    npm run seed -- --demo
    npm run dev:worker

另开一个终端运行前端：

    npm run dev

Vite 会把 API 请求代理到 http://localhost:8787。把自己的邮箱写进 .dev.vars 的 ADMIN_EMAILS，注册后即可进入 /admin。

## 套餐与种子数据

套餐目录、价格映射和演示数据放在 seeds/plans.json，由 npm run seed 写入本地库、npm run seed:remote 写入线上库，两条命令都是幂等的。订阅要生效必须先在支付提供商建好价格，把真实的 price ID 填进 providerPriceId；仍然带 replace_me 的价格会被跳过并列出来，不会污染数据库。加 --demo 会额外写入演示项目，加 --dry-run 只打印将要执行的 SQL。

## 验证

    npm run check
    npm test
    npm run build

品牌占位图与图标由 npm run brand 生成。

.github/workflows/ci.yml 会在 push 与 PR 上执行这三条，并校验种子文件和迁移编号。deploy.yml 是可选的自动发布，需要 CLOUDFLARE_API_TOKEN、CLOUDFLARE_ACCOUNT_ID 两个 secret 和 DATABASE_NAME 变量，令牌在 https://dash.cloudflare.com/profile/api-tokens 创建。

## 分层

| 层 | 位置 | 说明 |
|---|---|---|
| 授权 | src/lib/guard.ts | 会话、角色、资源所有权、请求体检查 |
| 账户 | src/lib/auth.ts、src/lib/account | Better Auth 配置与账户生命周期接口 |
| 计费 | src/lib/billing | 套餐、价格、订阅、权益、额度、Stripe 客户端 |
| 支付 | src/lib/payments | 托管结账、签名校验、Webhook 分发与失败留存 |
| 邮件 | src/lib/email | 提供商适配、九语模板、幂等发送与重试 |
| 风控 | src/lib/security | 速率限制、Turnstile、请求幂等 |
| 后台 | src/lib/admin | 运营接口与审计查询 |
| 领域 | src/domain | 业务履约，唯一需要替换的地方 |

## 领域替换点

默认示例把成功付款累加到 projects.support_cents。新业务通常只需要替换 src/domain/fulfillment.ts：

1. 积分产品可以把购买量写入账本
2. 次数产品可以发放可消费次数
3. 订阅产品可以写入权益截止时间
4. 排名产品可以增加已验证金额或分数

支付签名、幂等、金额校验、退款目标计算和提供商 API 不应复制到领域代码。

## 上线顺序

1. 完成领域表结构和履约测试
2. 配置一种支付提供商及其 Webhook，订阅制额外把价格填进 seeds/plans.json 后执行 npm run seed:remote
3. 配置事务邮件与 Turnstile
4. 执行 npm run db:migrate:remote
5. 执行 npm run deploy
6. 验证线上页面、api/health、api/config、注册与验证邮件、订阅结账、升级与取消、Customer Portal、重复 Webhook、部分退款、全额退款、争议和管理后台

## 安全降级

没有配置的能力会安全关闭，而不是报错：Better Auth 未配置时认证路由返回 503，邮件未配置时验证与 Magic Link 关闭且注册不强制验证，Turnstile 未配置时不渲染挑战，支付未配置时结账返回 503，Stripe 与 Waffo 之外的提供商访问订阅管理接口返回 503。api/config 会如实反映每一项的开关状态。

## 文档

| 文档 | 内容 |
|---|---|
| docs/quickstart.md | 从复制目录到线上可用的完整顺序 |
| docs/integrations.md | 各家凭据的申请地址、变量填写、Webhook 回调地址与事件清单 |
| docs/api.md | 全部接口、鉴权要求、限流、幂等与错误码 |
| docs/authz.md | 授权与资源所有权中间件 |
| docs/auth.md | 账户生命周期与两步验证 |
| docs/billing.md | 套餐、订阅、权益与额度 |
| docs/waffo.md | Waffo 测试环境、商品初始化、收银台与 Webhook |
| docs/email.md | 事务邮件抽象与重试 |
| docs/admin.md | 管理后台与审计 |
| docs/security.md | 速率限制、Turnstile 与请求幂等 |
| docs/scheduled.md | 定时任务 |
| docs/marketing.md | 落地页、合规页与 SEO |
| docs/i18n.md | 多语言扩展与裁剪 |
| docs/architecture.md、docs/source-review.md | 设计背景 |

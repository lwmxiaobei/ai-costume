# 模板架构

## 目标

功能目标是让新项目直接拥有前后端、数据库、支付和发布基础能力，并把业务差异集中在少量领域文件中。

非功能目标：

| 类别 | 基线 |
|---|---|
| 安全 | 同源 API、原始请求验签、支持时间戳的提供商执行五分钟时效、支付字段二次核对、禁止私网元数据请求、写接口默认要求会话与资源所有权、可选 Turnstile |
| 可靠性 | D1 幂等事件表、退款累计值防倒退、支付履约批量写入、Webhook 失败留存与重放、邮件发送幂等与重试、写接口幂等键、定时清理与重投 |
| 性能 | 静态资源由 Cloudflare 边缘提供，列表默认最多返回一百项 |
| 可维护性 | 严格 TypeScript，支付层与领域履约层分离 |
| 可观测性 | Wrangler observability、请求标识、结构化错误标签 |
| 成本 | 单 Worker、单 D1、无常驻服务器 |

## 高层结构

    Browser
       |
       | HTML, CSS, JS
       v
    Workers Static Assets
       |
       | same origin API
       v
    Hono Worker
       |
       +--> D1
       |
       +--> Better Auth, Google OAuth, magic link, TOTP, Turnstile
       |
       +--> Stripe, Polar, Creem
       |
       +--> Resend, Postmark, Mailgun
       |
       +--> Public website metadata

请求进入业务处理函数之前经过的固定顺序：

    规范域名跳转
       |
       v
    requireSession
       |
       v
    rateLimit
       |
       v
    requireJsonBody
       |
       v
    idempotent
       |
       v
    requireVerifiedEmail, requireRole, requireOwnership, requireFeature, requireQuota
       |
       v
    handler

订阅路径：

    POST api/billing/checkout
       |
       v
    billing_customers 映射
       |
       v
    Stripe Checkout mode=subscription
       |
       v
    customer.subscription.* webhook
       |
       v
    syncSubscriptionEvent 按 provider 与订阅号 upsert
       |
       v
    subscriptions 与权益、额度、状态邮件

支付路径：

    POST api/checkout
       |
       v
    pending_checkouts
       |
       v
    Hosted checkout
       |
       v
    signed webhook
       |
       v
    signature and invariant checks
       |
       v
    domain fulfillment
       |
       v
    payments and business state

## 主要失败模式

| 失败 | 影响 | 处理 |
|---|---|---|
| 支付提供商不可达 | 无法创建结账 | 待支付单标记 failed，返回 502 |
| Webhook 重复 | 可能重复履约 | payment_events 主键幂等 |
| Webhook 被伪造 | 错误履约 | 原始请求 HMAC 校验与时间窗口 |
| 金额或商品不一致 | 错误履约 | 与 pending_checkouts 精确比对后拒绝 |
| 元数据目标指向私网 | SSRF 风险 | 规范化目标并阻止回环与私有 IPv4 |
| 元数据页面过大 | Worker 资源消耗 | 八秒超时和 512 KB 上限 |
| D1 迁移未发布 | 线上接口失败 | 发布前先执行远端迁移并检查健康接口 |
| 退款事件乱序 | 业务值倒退 | 保存累计 reversed_cents，只应用新增差额 |
| Webhook 处理失败 | 订阅或履约状态落后 | 原始请求体写入 webhook_deliveries，后台按原路径重放 |
| 订阅事件找不到用户 | 权益不生效 | 结账 metadata 携带 userId，并回落到客户号映射，仍失败则记为待重放 |
| 邮件服务商临时故障 | 验证与重置邮件丢失 | 幂等键去重，可重试错误退避重试三次，失败留档并可后台重放 |
| 重复提交写接口 | 重复下单 | Idempotency-Key 记录请求哈希与响应，重放返回原响应 |
| 接口被刷 | 资源耗尽与滥用注册 | D1 固定窗口速率限制，认证接口可叠加 Turnstile |
| 邮件服务未配置 | 用户卡在无法完成的验证 | 自动关闭验证要求与 Magic Link，requireVerifiedEmail 放行 |
| 过期会话与令牌堆积 | D1 体积和查询变慢 | 每日 Cron 按 ISO 时间清理 sessions 与 verifications |
| 定时任务重复投递 | 重复提醒或重复扣减 | 提醒按订阅号加计费周期做幂等键，清理本身幂等 |
| 未知路径 | 爬虫把错误页当正常页收录 | Worker 与前端共用一份路由表，未知路径返回真 404 |

## 扩展顺序

优先替换领域履约和数据库模型，再配置套餐价格与事务邮件，最后增加统计和营销页面。认证、授权、订阅、后台、风控和国际化已经内置，不要先复制原项目的全部业务代码。

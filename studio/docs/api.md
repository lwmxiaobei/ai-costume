# 接口参考

同域 API，全部挂在 /api 下。响应一律是 JSON，除了数据导出会带 Content-Disposition。所有 /api 响应都带 Cache-Control: no-store 和 X-Request-Id。

## 鉴权约定

会话通过 Cookie 传递，由 Better Auth 签发。前端使用同域 fetch，不需要手工附带令牌。

下表中的鉴权列含义：

| 标记 | 含义 |
|---|---|
| 公开 | 无需登录 |
| 会话 | 需要 requireSession，被封禁账号一律拒绝 |
| 已验证 | 在会话基础上要求邮箱已验证，邮件服务未配置时自动放行 |
| 管理员 | 在会话基础上要求 role 为 admin |
| 签名 | 不看会话，改为校验提供商的请求签名 |

## 公开

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | /api/health | 公开 | 存活检查，返回服务名与时间 |
| GET | /api/config | 公开 | 各能力开关、支付提供商、Turnstile 站点密钥、维护公告 |
| GET | /api/me | 公开 | 当前会话用户，未登录返回 null |
| GET | /api/projects | 公开 | 示例领域的列表接口，最多一百条 |
| GET | /api/billing/plans | 公开 | 套餐与价格表 |
| ALL | /api/auth/* | 公开 | Better Auth 全部端点，限流每五分钟 60 次 |
| GET | /robots.txt | 公开 | 动态生成，指向 sitemap |
| GET | /sitemap.xml | 公开 | 由 INDEXABLE_ROUTES 生成 |
| GET | /llms.txt | 公开 | 面向 AI 的站点索引，格式见 marketing.md |
| GET | /llms-full.txt | 公开 | 下列 Markdown 页面合并成的单个文件 |
| GET | /index.md | 公开 | 首页的 Markdown 版本，Link 头指向 / |
| GET | /product.md | 公开 | 产品说明 |
| GET | /faq.md | 公开 | 常见问题 |
| GET | /pricing.md | 公开 | 当前套餐与价格，读 D1，Link 头指向 /pricing |
| GET | /terms.md、/privacy.md、/refund.md、/cookies.md | 公开 | 合规页的 Markdown 版本 |

## 账户

| 方法 | 路径 | 鉴权 | 限流 | 说明 |
|---|---|---|---|---|
| GET | /api/account/profile | 会话 | — | 资料与当前权益 |
| PATCH | /api/account/profile | 会话 | 5 分钟 20 次 | 改名称、头像、界面语言 |
| GET | /api/account/sessions | 会话 | — | 登录设备列表，标记当前设备 |
| DELETE | /api/account/sessions/:id | 会话 | — | 注销单个设备，不能注销当前会话 |
| POST | /api/account/sessions/revoke-others | 会话 | — | 注销其他全部设备 |
| GET | /api/account/export | 会话 | 1 小时 3 次 | 导出本人全部数据 |
| POST | /api/account/delete | 会话 | 1 小时 5 次 | 需在 confirm 字段填本人邮箱 |

## 计费

| 方法 | 路径 | 鉴权 | 限流 | 说明 |
|---|---|---|---|---|
| GET | /api/billing/subscription | 会话 | — | 权益、用量与订阅摘要 |
| POST | /api/billing/checkout | 已验证 | 5 分钟 10 次 | Stripe 或 Waffo 订阅结账 |
| POST | /api/billing/portal | 会话 | 5 分钟 10 次 | Stripe 或 Waffo 客户门户，链接不得缓存 |
| POST | /api/billing/cancel | 会话 | 5 分钟 10 次 | 期末取消；立即取消仅 Stripe |
| POST | /api/billing/resume | 会话 | 5 分钟 10 次 | Stripe 或 Waffo 撤销期末取消 |
| POST | /api/billing/change | 已验证 | 5 分钟 10 次 | Stripe 直接变更，Waffo 返回变更确认 checkoutUrl；调整席位仅 Stripe |

## 支付

| 方法 | 路径 | 鉴权 | 限流 | 说明 |
|---|---|---|---|---|
| POST | /api/checkout | 已验证 | 5 分钟 10 次 | 一次性付款，支持 Idempotency-Key |
| GET | /api/checkout/status | 会话 | — | 查询待支付单，仅限本人或管理员 |
| POST | /api/webhooks/stripe | 签名 | — | 见 docs/integrations.md |
| POST | /api/webhooks/polar | 签名 | — | 同上 |
| POST | /api/webhooks/creem | 签名 | — | 同上 |
| POST | /api/webhooks/waffo | 签名 | 无 | SDK 验签并核对店铺和环境，先持久化再后台处理 |

## 生成任务

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | /api/generation/models | 公开 | 已注册且有可用适配器的模型列表 |
| POST | /api/generation/tasks | 已验证 | 创建图片或视频生成任务，必填 Idempotency-Key，每小时 20 次，按 IP 加用户 |
| GET | /api/generation/tasks | 会话 | 仅本人任务，limit 默认 20、最大 50，offset 默认 0，返回 tasks 与 hasMore |
| GET | /api/generation/tasks/:id | 会话 | 本人任务详情，其他用户的任务返回 404 |

创建参数为 modelId、prompt（非空且最多四千字符）、可选 input 对象。模型参数由服务端注册的 parseInput 校验。错误码 invalid_generation、invalid_generation_model、invalid_generation_input 返回 400；generation_unavailable 返回 503。详情见 docs/generation.md。

## 示例领域

| 方法 | 路径 | 鉴权 | 限流 | 说明 |
|---|---|---|---|---|
| POST | /api/projects | 会话 | 1 小时 20 次，按 IP 加用户 | 受套餐额度限制，可带 turnstileToken |
| DELETE | /api/projects/:id | 会话加所有权 | — | 下线本人的项目，管理员可越权 |

替换业务时这一组是样板，中间件顺序照抄即可，见 docs/authz.md。

## 管理

全部要求管理员，路径前缀统一由一条中间件保护。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/overview | 用户数、活跃订阅、净收入、失败 Webhook 与邮件数 |
| GET | /api/admin/users | 支持 query、role、banned、limit、offset |
| POST | /api/admin/users/:id/ban | 封禁或解封，封禁时清空该用户会话 |
| POST | /api/admin/users/:id/role | 调整角色 |
| GET | /api/admin/payments | 订单与退款 |
| GET | /api/admin/subscriptions | 订阅状态与周期 |
| GET | /api/admin/payment-events | 已处理事件流水 |
| GET | /api/admin/webhooks | 失败或已解决的投递 |
| POST | /api/admin/webhooks/:id/replay | 重放一条投递 |
| GET | /api/admin/plans | 含未启用的套餐 |
| PATCH | /api/admin/plans/:id | 改名称、描述、试用天数、features、quotas |
| GET | /api/admin/settings | 系统配置 |
| PUT | /api/admin/settings/:key | 写入配置 |
| GET | /api/admin/emails | 按状态筛选邮件记录 |
| POST | /api/admin/emails/retry | 重投失败邮件 |
| GET | /api/admin/audit-logs | 操作审计，可按 action 过滤 |

管理员不能封禁自己或修改自己的角色。价格无法在这里改，价格改动走 seeds/plans.json 与 npm run seed。

## 错误响应

失败响应统一是这个形状：

    { "code": "quota_exceeded", "error": "You reached the limit for your plan." }

code 是稳定值，界面据此翻译；error 是英文诊断文案，供日志和没有对应翻译的客户端使用。前端映射表在 src/i18n/utils.ts。

全部 code 与状态码如下，按状态码分组。

### 401 与 403

| code | 含义 |
|---|---|
| unauthenticated | 没有有效会话 |
| account_banned | 账号被封禁 |
| email_unverified | 邮箱未验证，邮件服务未配置时不会出现 |
| forbidden | 角色或资源所有权不满足 |
| captcha_failed | Turnstile 校验未通过 |

### 400 参数校验

| code | 出现位置 |
|---|---|
| invalid_project、invalid_project_url | 建项目 |
| invalid_checkout | 一次性结账与订阅结账 |
| invalid_profile | 改资料 |
| invalid_request | 订阅取消与变更、封禁、角色、套餐、配置 |
| invalid_query | 管理端用户查询 |
| invalid_key | 配置键名不合法 |
| no_changes | 提交了空的更新 |
| confirmation_required | 注销账号时 confirm 与本人邮箱不一致 |
| idempotency_key_required | 接口要求幂等键但未提供 |

### 402 权益不足

| code | 含义 |
|---|---|
| quota_exceeded | 超出套餐额度，响应带 used 与 limit |
| feature_not_included | 套餐不含该功能，响应带 feature 与 planId |

### 404 不存在

| code | 含义 |
|---|---|
| not_found | 通用，也用于存在但无权知道的资源 |
| project_not_found、plan_not_found、price_not_found | 对应实体不存在 |
| no_subscription | 没有活跃订阅 |
| no_billing_account | 尚未建立支付客户映射 |

### 409 状态冲突

| code | 含义 |
|---|---|
| subscription_exists | 已有活跃订阅，应改用变更接口 |
| already_on_plan | 目标价格与当前一致 |
| not_canceling | 没有待取消的订阅，无法恢复 |
| current_session | 试图注销当前会话，应改用退出登录 |
| self_action | 管理员试图封禁自己或改自己的角色 |
| idempotency_key_reused | 同一个幂等键配了不同请求体 |
| idempotent_request_in_flight | 首次请求尚未完成 |

### 413、415、422、429

| code | 状态码 | 含义 |
|---|---|---|
| request_too_large | 413 | 请求体超过限制 |
| expected_json | 415 | Content-Type 不是 JSON |
| replay_failed | 422 | Webhook 重放仍然失败 |
| rate_limited | 429 | 命中速率限制，响应带 Retry-After |

Webhook 入口不使用 code 结构，签名失败返回 401，事件无法应用返回 422，两者的响应体只有 error 字段。

### 502 与 503

| code | 状态码 | 含义 |
|---|---|---|
| provider_error | 502 | 上游支付提供商失败 |
| auth_not_configured | 503 | Better Auth 未配置 |
| payments_disabled | 503 | 未配置任何支付提供商 |
| subscriptions_unavailable | 503 | 当前提供商不是 Stripe 或 Waffo |

## 限流响应头

挂了限流的接口一律返回这三个头，被拒绝时额外返回 Retry-After：

    X-RateLimit-Limit
    X-RateLimit-Remaining
    X-RateLimit-Reset

## 幂等

对写接口发送 Idempotency-Key 请求头，取值需匹配 8 到 128 位的 [A-Za-z0-9_:.-]。重放同一个键与同一个请求体会直接返回首次的响应，并带上 Idempotent-Replay: true。一次性结账和生成任务使用该中间件；生成任务要求必填，并额外通过任务表的用户加请求键唯一约束持久去重。其他业务接口按需加 idempotent()，细节见 docs/security.md。

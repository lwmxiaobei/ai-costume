# 管理后台与审计

管理接口统一挂在 /api/admin/*，由 requireSession 与 requireRole("admin") 保护。前端控制台在 /admin，只有管理员会在导航中看到入口。

## 接口

| 接口 | 说明 |
|---|---|
| GET /api/admin/overview | 用户数、活跃订阅数、净收入、失败 Webhook 数、失败邮件数 |
| GET /api/admin/users | 按邮箱、名称或 ID 查询，可按角色与封禁状态过滤 |
| POST /api/admin/users/:id/ban | 封禁或解封，封禁时清空该用户全部会话 |
| POST /api/admin/users/:id/role | 调整角色 |
| GET /api/admin/payments | 订单与退款金额 |
| GET /api/admin/subscriptions | 订阅状态与周期 |
| GET /api/admin/payment-events | 已处理的支付事件流水 |
| GET /api/admin/webhooks | 失败或已解决的 Webhook 投递 |
| POST /api/admin/webhooks/:id/replay | 重放一条失败投递 |
| GET /api/admin/plans、PATCH /api/admin/plans/:id | 套餐配置，可改名称、描述、试用天数、features 与 quotas |
| GET /api/admin/settings、PUT /api/admin/settings/:key | 系统配置 |
| GET /api/admin/emails、POST /api/admin/emails/retry | 失败邮件与重试 |
| GET /api/admin/audit-logs | 操作审计，可按 action 过滤 |

管理员不能封禁自己，也不能修改自己的角色，避免误操作把系统锁死。

## Webhook 重放

Webhook 处理失败时，原始请求体会写入 webhook_deliveries，同一提供商加事件 ID 唯一，重复失败只累加 attempts。重放走的是与线上完全相同的 applyWebhookEvent，只是跳过签名校验，因为入库前签名已经验证过。领域层的幂等仍然生效，重放一条已经成功的事件不会重复履约。

## 审计日志

recordAudit 记录操作者、动作、目标、元数据、IP 和 User-Agent。已接入的动作包括项目创建与下线、结账发起、订阅取消与变更、资料修改、会话注销、数据导出、账号注销、封禁、角色调整、套餐与配置修改、Webhook 重放和邮件重试。

审计写入不参与业务事务，失败不会影响主流程返回。

## 语言

面向用户的页面提供九种语言，管理控制台只提供英文。运营界面的术语更新频繁，跟随九种语言同步维护的成本高于收益。需要本地化时，把 src/pages/AdminPage.tsx 中的字面量迁入 messages.ts 即可。

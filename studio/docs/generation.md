# 图片与视频生成任务

生成模块提供任务持久化、后台提交、状态查询、结果记录和九语创作页面。入口为 /generate，服务商注册点为 src/domain/generation.ts。默认模型与服务商列表为空，未接入时不会提交上游请求，也不会返回模拟生成结果。

## 接入一个模型

在 generationRuntime 中返回 models 和 providers。模型定义包含：

| 字段 | 用途 |
|---|---|
| id、name、type | 稳定模型标识、显示名称、image 或 video |
| providerId | providers 中的键，由服务端确定，客户端不能指定 |
| timeoutSeconds | 从开始提交起计算的生成总时限，每个模型自行配置 |
| parseInput | 校验并规范化模型参数，非法参数抛出异常；不能执行网络请求 |

parseInput 建议用 Zod 的 strict object schema 实现。基础创作页只发送 modelId 和 prompt，input 默认为空对象。需要参考图、分辨率或比例时，同步扩展该模型参数 schema 与前端表单。

服务商接口位于 src/lib/generation/types.ts：

1. submit(request) 提交模型请求。同步完成时返回 succeeded 和 outputs；异步任务返回 running 和 taskId；明确失败返回 failed。
2. poll(request) 使用额外提供的 taskId 查询上游状态，返回 running、succeeded 或 failed。
3. 每个 output 是带 HTTPS url 的对象，成功结果至少一条、最多二十条。模块保存结果地址，不负责上传、转存或长期保管媒体。

request 包含内部任务 id、modelId、type、prompt、经过校验的 input 和 signal。所有上游 fetch 必须传入 signal，单次请求的截止时间为二十秒。支持幂等键的服务商应以 request.id 作为其幂等键。API 密钥只在服务端适配器读取，不放进模型公开字段、input、输出或错误记录。

在模型适配器中将上游排队、处理中等非终态统一映射为 running，将失败明确映射为 failed。不得在适配器中无限轮询或等待整个视频生成完成。

## 创建和查询

公开模型列表：

    GET /api/generation/models

创建任务需要已登录用户、已验证邮箱（邮件未配置时沿用现有降级规则），以及必填的 Idempotency-Key：

    POST /api/generation/tasks
    Content-Type: application/json
    Idempotency-Key: <每次独立生成使用不同的 UUID；重试沿用原值>

    { "modelId": "你的模型ID", "prompt": "想生成的内容", "input": {} }

返回 { task, created }。首次创建为 201，命中任务层已有记录为 200。请求结果不确定时继续用原键和原请求体重试。HTTP 幂等缓存过期后，generation_tasks 的用户加请求键唯一约束仍会避免重复创建；改变内容必须使用新键。

任务列表为 GET /api/generation/tasks?limit=20&offset=0，返回 tasks 和 hasMore。limit 最大五十，排序为 created_at 和 id 倒序。详情为 GET /api/generation/tasks/:id。两者只返回本人的任务，其他用户的 ID 返回 404，管理员也没有此接口的越权访问能力。

## 后台执行

状态流转为 queued → submitting → running → succeeded / failed。同步完成的任务可以从 submitting 直接进入终态。

创建接口先写入 D1，再通过 waitUntil 尝试立即提交。另有每分钟运行的 Cron，扫描未处理任务并继续查询上游。用户离开页面后仍会处理。该 Cron 与原订阅、邮件计划分开，不会每分钟重投邮件。

一次扫描最多处理十条任务，属于低流量模板的基础调度方式。每条任务通过条件更新领取六十秒租约；写回结果时也校验租约，较慢的旧执行者不能覆盖新结果。running 查询失败会保留任务并在下一轮继续查询，查询间隔至少十五秒，实际后台刷新取决于 Cron 周期。前端每五秒读取当前页的活动任务。

提交失败或提交阶段中断时不自动重发，避免上游已经受理而本地再次产生费用。错误记录为 submission_interrupted，接入真实服务商后需按该服务商的幂等或查询能力核对上游任务。租约机制只保证本地调度与状态写入，不能替代外部服务的幂等承诺。

模型从目录下线不会改变已创建任务的类型、模型名或时限快照。适配器应继续支持尚在运行的旧模型；移除整个服务商后，任务明确失败为 provider_unavailable。

## 数据与边界

迁移文件为 migrations/0007_generation_tasks.sql，本地执行 npm run db:migrate:local；发布前按现有部署流程执行远程迁移。账号导出包含任务记录，删除账号时通过外键级联删除任务。

此模块不包含积分账本、充值发放、扣费、失败退款、素材上传、R2 转存、上游回调或任务取消。后续增加这些能力时，以已持久化任务 id 关联账本和媒体，并在接入层完成服务商签名校验。

## 验证

    npm run check
    npm test -- src/lib/generation
    npm run build

生命周期和路由测试使用真实 SQLite 执行迁移与 SQL，覆盖重复提交、并发领取、过期租约、终态保护、超时、结果地址校验、用户隔离及异常信息隔离。路由测试模拟登录会话和模型服务，不代表已完成外部服务商的付费生成验证。

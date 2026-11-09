# 定时任务

Worker 除了 fetch 还导出 scheduled，由 Cloudflare Cron Triggers 驱动。订阅与邮件任务实现在 src/lib/scheduled.ts，生成任务实现在 src/lib/generation/service.ts，wrangler.jsonc 里注册三条计划。

## 计划

| 表达式 | 频率 | 做的事 |
|---|---|---|
| 0 3 * * * | 每天 03:00 UTC | 订阅到期提醒、清理过期记录、重投失败邮件 |
| 15 * * * * | 每小时第 15 分 | 重投失败邮件 |
| * * * * * | 每分钟 | 领取生成任务、查询模型结果、处理提交中断与超时 |

每天和每小时的两条计划都会重投失败邮件。每分钟的生成任务由 Worker 单独分发，不运行邮件重试或订阅提醒；接入方式与调度边界见 docs/generation.md。

## 订阅到期提醒

只提醒真的会停用的订阅，条件是三项同时满足：

1. 状态是 trialing 或 active
2. cancel_at_period_end 为 1
3. current_period_end 落在从现在起三天内

正常续费的订阅不会收到提醒，这是刻意的。past_due 没有确定的结束时间，也不在提醒范围内，它应该由支付提供商自己的催缴邮件覆盖。

幂等键是订阅号加上本期结束时间，所以同一个计费周期最多发一封，任务重复执行不会重复打扰用户。

## 清理

| 表 | 判据 | 说明 |
|---|---|---|
| idempotency_keys | expires_at 小于当前毫秒时间戳 | 保留一天 |
| rate_limits | expires_at 小于当前毫秒时间戳 | 兜底，正常由新窗口惰性清理 |
| sessions | expires_at 小于当前 ISO 时间 | Better Auth 不会自己删过期会话 |
| verifications | expires_at 小于当前 ISO 时间 | 验证、重置和 Magic Link 的一次性令牌 |

前两张表的 expires_at 是整数毫秒，后两张是 Better Auth 写入的 ISO 字符串，比较时分别传入对应类型，不要混用 CURRENT_TIMESTAMP，它的格式与 ISO 字符串不同，按字典序比较会差出一天。

## 本地验证

wrangler dev 加 --test-scheduled 会暴露一个触发端点：

    npx wrangler dev --test-scheduled
    curl "http://localhost:8787/__scheduled?cron=0+3+*+*+*"

任务结束后会打印一行 scheduled_done，内含各项计数，方便确认是否真的执行。

## 注意

scheduled 处理器把工作放进 waitUntil，异常只记录不抛出，避免一个任务失败拖垮整次触发。任务本身要保持幂等，Cron Triggers 在极少数情况下会重复投递。

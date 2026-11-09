# 风控与滥用控制

## 速率限制

src/lib/security/rate-limit.ts 使用 D1 上的固定窗口计数器。桶键由作用域、身份和窗口起点拼成，窗口起点对齐到固定边界，因此同一窗口内的请求落在同一行上，通过 ON CONFLICT 原子自增。新窗口第一次写入时顺带清理过期行。

    app.post("/api/reports", requireSession(), rateLimit({
      scope: "reports",
      limit: 20,
      windowSeconds: 300,
      by: "ip+user",
    }), handler);

by 支持 ip、user 和 ip+user。响应始终带 X-RateLimit-Limit、X-RateLimit-Remaining 和 X-RateLimit-Reset，被拒绝时返回 429 与 Retry-After。

模板已配置的限制：认证接口每五分钟 60 次，建项目每小时 20 次，结账与订阅操作每五分钟 10 次，资料修改每五分钟 20 次，数据导出每小时 3 次，账号注销每小时 5 次。

RATE_LIMIT_DISABLED 设为 true 可整体关闭，只用于本地压测。

## Turnstile

同时配置 TURNSTILE_SITE_KEY 与 TURNSTILE_SECRET_KEY 后才会启用。启用后：

1. Better Auth 的 captcha 插件会校验注册、登录、Magic Link 和找回密码接口
2. 建项目接口会校验请求体中的 turnstileToken
3. api/config 返回站点密钥，前端组件按需加载挑战脚本

未配置时 verifyTurnstileToken 直接返回 true，前端不渲染挑战，接口保持可用。

## 请求幂等

对写接口挂载 idempotent() 后，客户端可以带 Idempotency-Key 头。中间件记录端点加请求体的哈希：

1. 首次请求正常执行，成功响应体落库
2. 相同键与相同请求体重放，直接返回落库响应并带 Idempotent-Replay 头
3. 相同键但请求体不同，返回 409 idempotency_key_reused
4. 首次请求尚未完成时并发重放，返回 409 idempotent_request_in_flight
5. 服务端错误不落库，允许客户端重试

记录保留一天，purgeExpiredIdempotencyKeys 可在定时任务中清理。

## 账号安全

1. 密码最少十二位
2. 封禁会立即删除该用户全部会话，并在读取会话时二次拦截
3. 会话设备列表可单独注销，也可一次注销其他全部设备
4. 两步验证已提供完整界面，用户可自行绑定 TOTP，备用码在登录时同样可用，详见 docs/auth.md
5. 账号注销要求输入本人邮箱确认，并会先尝试取消 Stripe 订阅

## 尚未内置

当前 better-auth 版本没有提供 Passkey 插件入口，模板因此没有接入。异常注册检测、IP 信誉库和设备指纹属于业务侧策略，建议结合 Cloudflare WAF 与 Bot Management 在边缘处理。

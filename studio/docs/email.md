# 事务邮件

模板把 Resend、Postmark 和 Mailgun 抽象成同一个发送接口，位于 src/lib/email。

凭据获取、发信域名的 SPF 与 DKIM 配置见 docs/integrations.md。这份文档讲的是模板这一侧的抽象与重试。

## 配置

必须同时提供发件地址与某一家的凭据，否则邮件能力整体关闭：

    EMAIL_PROVIDER=resend        # 留空则按 resend、postmark、mailgun 顺序自动选择
    EMAIL_FROM=noreply@example.com
    EMAIL_REPLY_TO=support@example.com
    RESEND_API_KEY=...

未配置时的降级行为：

1. api/config 返回 emailEnabled 与 magicLinkEnabled 均为 false
2. 注册不再要求邮箱验证，requireVerifiedEmail 自动放行
3. Magic Link 插件不会注册
4. sendEmail 直接返回 disabled，不写库也不报错

## 模板

EmailTemplate 覆盖登录验证、密码重置、Magic Link、欢迎、支付成功、退款、订阅生效、订阅取消、订阅到期、账号注销和团队邀请。每个模板在九种语言下都有主题、标题、正文、按钮和落款，i18n 测试会校验九种语言的模板集合完全一致。

渲染时会转义全部插值，并且只有 HTTPS 或本地回环地址才会渲染成按钮，避免把 javascript: 之类的链接放进邮件。

## 幂等与重试

    await sendEmail(env, {
      to: user.email,
      template: "password_reset",
      idempotencyKey: "password_reset:" + token,
      locale: user.locale,
      variables: { url },
    });

idempotency_key 在 email_messages 上是唯一索引。重复调用只会命中已有记录：已发送则跳过，未达上限则继续重试。单次调用内对可重试错误最多尝试三次，退避 200 毫秒与 800 毫秒；不可重试的错误立即落库为 failed。

管理后台的 POST /api/admin/emails/retry 会调用 retryFailedEmails，按创建时间重放尚未达到上限的失败邮件，重新渲染使用落库的 variables 与 locale。

## 接入新的提供商

在 provider.ts 的 deliverEmail 中增加一个分支，返回提供商的消息 ID，并在 isEmailProviderConfigured 中声明所需变量即可。非 2xx 响应统一转成 EmailDeliveryError，408、429 和 5xx 视为可重试。

# Better Auth 与 Google 登录

模板包含 Better Auth 1.7、邮箱密码登录、邮箱验证、密码重置、Magic Link、Google OAuth、二次验证、管理插件、Hono 认证路由、D1 核心表、前端会话 Hook 和多语言登录页。

## 已提供的能力

| 能力 | 位置 |
|---|---|
| 服务端 Better Auth 配置 | src/lib/auth.ts |
| Hono 认证路由 | api/auth/* |
| 当前用户接口 | api/me |
| 账户生命周期接口 | api/account/* |
| React 认证客户端 | src/lib/auth-client.ts |
| 会话 Hook | src/hooks/useSession.ts |
| 登录、注册与找回密码页 | src/pages/AuthPage.tsx |
| 账户中心页 | src/pages/AccountPage.tsx |
| D1 表结构 | migrations/0002_better_auth.sql、migrations/0003_accounts.sql |

## 已启用的插件

| 插件 | 状态 | 说明 |
|---|---|---|
| admin | 始终启用 | 角色、封禁、模拟登录，字段映射到 role、banned、ban_reason、ban_expires |
| twoFactor | 始终启用 | TOTP 与备用码，表为 two_factors，界面见下节 |
| magicLink | 配置邮件后启用 | 十五分钟有效，一次性 |
| captcha | 配置 Turnstile 后启用 | 保护注册、登录、Magic Link 和找回密码 |

当前 better-auth 版本没有导出 Passkey 插件，模板暂未接入。

## 账户生命周期

| 接口 | 说明 |
|---|---|
| POST api/auth/sign-up/email | 邮箱注册，配置邮件后自动发送验证信 |
| POST api/auth/sign-in/email | 邮箱密码登录，密码最少十二位 |
| POST api/auth/sign-in/magic-link | 发送一次性登录链接 |
| POST api/auth/forget-password | 发送重置链接 |
| GET api/account/profile | 资料与当前权益 |
| PATCH api/account/profile | 修改名称、头像和界面语言 |
| GET api/account/sessions | 登录设备列表，标记当前设备 |
| DELETE api/account/sessions/:id | 注销单个设备 |
| POST api/account/sessions/revoke-others | 注销其他全部设备 |
| GET api/account/export | 导出本人全部数据为 JSON |
| POST api/account/delete | 输入本人邮箱确认后注销，先尝试取消订阅 |

邮件服务未配置时，注册不再强制验证邮箱，Magic Link 不会注册，requireVerifiedEmail 自动放行，避免用户卡在无法完成的验证流程里。详见 docs/email.md。

## 两步验证

界面在账户中心，组件是 src/components/TwoFactorPanel.tsx。

开启流程：输入当前密码，服务端生成密钥并立即把 two_factor_enabled 置为 1，界面随后展示设置密钥、一条 otpauth 链接和十个备用码，用户在验证器里添加后输入六位数字确认。因为服务端在生成密钥时就已经置位，界面提供了取消设置，它会调用关闭接口回滚，避免用户拿不到密钥却被锁在门外。

otpauth 链接在手机上点击可以直接唤起验证器。模板没有引入二维码库，桌面端请手工录入设置密钥，需要二维码的项目自行接入一个渲染库即可。

登录流程：开启后 sign-in/email 不再直接建立会话，而是返回 twoFactorRedirect，界面切换到验证码步骤。输入六位数字走 TOTP 校验，输入其他格式走备用码校验，判别函数是 isTotpCode。

two_factors 表除了密钥、备用码、验证状态和失败计数，还必须有 locked_until 列，插件在连续失败时用它锁定。缺这一列会让验证接口返回 500，迁移 0006 补的就是它。

## 本地配置

先执行迁移：

    npm run db:migrate:local

在 .dev.vars 中配置：

    APP_ENV=development
    BETTER_AUTH_URL=http://localhost:8787
    BETTER_AUTH_SECRET=<至少三十二字符的随机值>
    GOOGLE_CLIENT_ID=<Google Web Client ID>
    GOOGLE_CLIENT_SECRET=<Google Client Secret>

随机秘密可以使用：

    openssl rand -base64 32

Google Web 应用的本地回调地址是：

    http://localhost:8787/api/auth/callback/google

## 生产配置

初始化脚本会根据正式域名写入 BETTER_AUTH_URL。然后分别安装秘密：

    npx wrangler secret put BETTER_AUTH_SECRET
    npx wrangler secret put GOOGLE_CLIENT_ID
    npx wrangler secret put GOOGLE_CLIENT_SECRET

Google Web 应用的正式回调地址是：

    https://example.com/api/auth/callback/google

执行远端迁移后再部署：

    npm run db:migrate:remote
    npm run deploy

## 安全降级

只有以下条件全部满足时，api/config 才返回 googleSignInEnabled 为 true：

1. BETTER_AUTH_URL 是 HTTPS 根地址，或本地回环 HTTP 地址
2. BETTER_AUTH_SECRET 至少三十二个字符
3. GOOGLE_CLIENT_ID 和 GOOGLE_CLIENT_SECRET 都存在

未满足时认证路由返回 503，界面不会发送用户进入无效的 OAuth 流程。

## 领域授权边界

登录只证明当前会话对应哪个用户。授权由 src/lib/guard.ts 的中间件统一承担：requireSession、requireVerifiedEmail、requireRole 和 requireOwnership。业务表需要保存 user_id，写接口挂载 requireOwnership，不要根据前端传来的用户标识授权。详见 docs/authz.md。

## 首个管理员

ADMIN_EMAILS 是逗号分隔的引导名单，其中的邮箱在读取会话时被直接视为 admin，不写回数据库。系统里已经有管理员之后，后续角色调整走管理后台，可以把这个变量清空。

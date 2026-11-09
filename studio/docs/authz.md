# 授权与资源所有权

模板提供一组 Hono 中间件，把「谁在请求」和「能不能做」分开处理。全部位于 src/lib/guard.ts。

## 中间件

| 中间件 | 作用 | 失败响应 |
|---|---|---|
| requireSession() | 读取服务端会话，写入 context.user，并拒绝被封禁账号 | 503 auth_not_configured、401 unauthenticated、403 account_banned |
| requireVerifiedEmail() | 要求邮箱已验证。未配置邮件服务时自动放行，避免用户无法完成验证 | 403 email_unverified |
| requireRole(...roles) | 校验会话角色 | 403 forbidden |
| requireOwnership(options) | 按主键读取资源行，比对所有者列，命中后写入 context.resource | 404 not_found、403 forbidden |
| requireJsonBody(maxBytes) | 统一的 Content-Type 与请求体大小检查 | 415 expected_json、413 request_too_large |

requireOwnership 的选项：

    requireOwnership({
      table: "projects",     // 只允许标识符字符集，防止拼接注入
      param: "id",           // 路由参数名，默认 id
      idColumn: "id",        // 主键列，默认 id
      ownerColumn: "user_id",// 所有者列，默认 user_id
      adminBypass: true,     // 管理员是否可越权访问，默认 true
    })

## 使用顺序

requireSession 必须排在依赖会话的中间件之前，requireOwnership 与 requireRole 之后才是业务处理函数：

    app.delete(
      "/api/projects/:id",
      requireSession(),
      requireOwnership({ table: "projects" }),
      async (context) => { /* context.get("resource") 已是校验过的行 */ },
    );

## 纯函数

hasRole 与 ownsResource 是不依赖请求上下文的纯函数，业务代码可以直接复用，也便于单元测试。两者都会先判断账号是否被封禁。

## 角色来源

角色存放在 users.role，由 Better Auth 的 admin 插件维护。除此之外，ADMIN_EMAILS 中列出的邮箱在读取会话时会被直接提升为 admin，用于首个管理员的引导。这份名单只在服务端生效，不写回数据库。

## 边界

会话只回答「当前用户是谁」。任何业务表都应保存 user_id，并在写接口上显式挂载 requireOwnership，不要根据前端传入的用户标识授权。

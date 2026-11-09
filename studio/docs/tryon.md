# 虚拟试穿

用户上传本人照片，选衣装集里的一套衣服，用 KIE 生成穿上这套衣服的图。首页 `/` 和 `/tryon` 都是试穿页，衣装集图集站的大图弹窗通过 `?costume=ID` 跳过来。

## 上线前提

服装图片作者 ギア（@giaaibusi）只同意了"中文镜像、图片不修改、不收费"。试穿功能涉及真实人物照片，而且要收费，两点都需要作者另行同意。拿到同意之前不要部署。

## 规则

- 只开放春、夏、秋、冬、派对五个分类（`scripts/make-costumes.mjs` 生成 `src/content/costumes.json`）；内衣、性感、泳装不开放。
- 提示词在服务端写死（`src/lib/tryon/routes.ts`），用户不能自定义。
- 用户需勾选"照片是本人、已满 18 岁"。照片在浏览器端缩到长边 1536 以内，上传到 KIE 临时存储，24 小时后自动删除。
- 通用生图接口 `/api/generation/tasks` 的创建不开放任何模型，试穿只能走扣费的 `/api/tryon`。
- 每人每天 `TRYON_USER_DAILY_CAP` 次，全站每天 `TRYON_DAILY_CAP` 次（只计未失败的任务）。

## 积分

- `credit_ledger` 记录赠送、扣费和退还；同一用户同一 ref 只记一次。
- 已购积分不入账本，按 `payments` 实时折算：每笔订单 `quantity × CREDITS_PER_PACK × 未退款比例`，争议订单不计。退款和争议不需要额外处理。
- 积分包走模板的一次性付款 `POST /api/checkout`，`projectId` 固定为迁移 0009 写入的积分项目；`CHECKOUT_PROJECT_ID` 限制只能买这个项目。单价是 `UNIT_PRICE_CENTS`。
- 新用户验证邮箱后赠送 `TRYON_FREE_CREDITS`，按规范化邮箱的哈希只发一次，注销重注册也不再发。
- 失败任务和扣费后 15 分钟仍没建成任务的请求，由每分钟的生成 Cron 退还积分；已退还的请求号不能再用。

## 上线步骤

1. 作者同意后再继续。
2. KIE：`npx wrangler secret put KIE_API_KEY`。用 KIE 的目录接口确认 `KIE_TRYON_MODEL` 的实际模型名和图片字段名（默认 `google/nano-banana-edit`、`image_urls`），不一致就改 `wrangler.jsonc` 的 `KIE_TRYON_MODEL` 和 `KIE_TRYON_IMAGES_FIELD`。按单张成本调整 `UNIT_PRICE_CENTS` 和 `CREDITS_PER_PACK`。
3. Waffo：按 `docs/waffo.md` 配置并创建一次性商品，商品金额等于 `UNIT_PRICE_CENTS`。
4. 邮件：必须配置。否则注册不要求验证邮箱，赠送积分也不会发放。
5. Turnstile：建议配置。
6. D1：`npm run db:create`，把 database_id 填进 `wrangler.jsonc`，再 `npm run db:migrate:remote`。
7. `npx wrangler secret put BETTER_AUTH_SECRET`，`BETTER_AUTH_URL` 和 `CANONICAL_HOST` 填正式地址，然后 `npm run deploy`。
8. 把试穿站地址填进图集站 `site.config.json` 的 `tryonUrl`，重新部署图集站，弹窗里才会出现"试穿这套"。

## 已知限制

- 生成结果的地址是 KIE 的，14 天后失效，没有转存到 R2。
- 没有开放 Google 登录。如果要开，先处理账号关联的抢注问题：模板对 Google 开了 trustedProviders 自动关联，未验证邮箱的密码账号可能被关联。

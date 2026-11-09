# 落地页、合规页与 SEO

## 落地页

首页由首屏介绍与项目表单、双预览窗口、能力列表、项目目录和行动号召组成。公共页面采用参考 https://bulin47ai.com/bulin-47-ai-trend 的红黑配色、大号窄体标题、细边框和错位双窗口。视觉样式集中在 src/marketing.css，通过 marketing-shell 限定作用范围，管理后台保留原有布局和样式。

默认使用深色主题，已有主题选择继续保留，也支持浅色切换。Big Shoulders 标题字体保存在 public/fonts，本地加载并附带 OFL 许可。正文继续使用 Manrope，中文、日文和韩文使用适合对应文字的标题尺寸。

文案在 messages.hero 和 messages.landing 下，九种语言齐全。hero.accent 是 hero.title 的末尾片段，用于标题的红色强调，修改标题时需一起调整。项目表单继续使用 /api/projects，双窗口分别进入账户与定价页；移动端通过顶部菜单访问完整导航。

替换业务时，把能力列表与双窗口的文案换成自己的卖点，把项目表单和目录换成产品的核心交互即可。

## 前端模板切换

现在提供两套前端模板，顶部的模板选择器可以随时切换，浏览器会记住选择：

| 标识 | 风格 | 默认主题 |
|---|---|---|
| classic | 原有红黑配色、窄体标题、双预览窗口 | 深色 |
| ozil | 参考 https://tryozilgoalai.com/ 的暖白与钴蓝配色、倾斜窄体标题、三张叠放竖版预览、橙色标签和蓝色通栏 | 浅色 |

访问 `/?template=ozil` 或 `/?template=classic` 可直接预览指定模板。选择优先级为网址参数、浏览器已保存的选择、构建时的 `VITE_FRONTEND_TEMPLATE`，最后回退到 classic。例如，以 Ozil 作为新项目的默认模板：

    VITE_FRONTEND_TEMPLATE=ozil npm run dev
    VITE_FRONTEND_TEMPLATE=ozil npm run build

这个 Vite 构建变量也可以放入 `.env.local`，放在 Worker 的 `.dev.vars` 中不会生效。两套模板分别保存明暗偏好，classic 沿用原来的 `app_theme`，ozil 使用 `app_theme_ozil`。

模板状态在 src/hooks/useFrontendTemplate.ts，选择器文案在 src/i18n/templates.ts，覆盖现有九种语言。Ozil 样式集中在 src/templates/ozil.css，通过 template-ozil 限定作用范围；首页复用原来的业务组件，只切换预览组件和视觉样式，定价、登录、账户、生成页与合规页同步使用新配色，管理后台不使用模板样式。

三张预览使用 public/images/templates/ozil 中的本地 WebP 图片，均为展示用照片，不是模型生成结果。点击预览进入现有 `/generate` 创作页。素材来源见同目录的 SOURCES.md，替换为实际产品素材时保留文件名即可。

## 合规页

四个页面：/terms、/privacy、/refund、/cookies。路由表在 src/routes.ts，正文在 src/content/legal.ts，渲染组件是 src/pages/LegalPage.tsx。

正文只有英文，并且每页顶部有一条醒目的替换提示，提示本身是九种语言的。这是刻意的取舍：法律文本必须按公司实际情况和所在司法辖区重写，提供多语言的占位条款只会诱导人直接拿去用。

正文写的是每一节该说什么，而不是可以直接生效的条款。隐私政策那一节例外，它如实列出了模板默认收集的数据：账户资料、会话与设备信息、支付提供商的客户与订阅标识、审计日志、邮件投递记录、限流计数和待重放的 Webhook 负载。改动数据处理方式时要同步更新这一节。

Cookie 说明也如实写明：模板不含分析和广告 Cookie，因此不显示同意横幅，因为严格必要的 Cookie 在多数司法辖区不需要同意。一旦接入分析或任何非必要存储，必须先加同意机制再启用。

## SEO

| 项 | 位置 | 说明 |
|---|---|---|
| robots.txt | Worker 动态生成 | 放行公开页，屏蔽 /account、/admin、/signin 和 /api/，并指向 sitemap |
| sitemap.xml | Worker 动态生成 | 取自 src/routes.ts 的 INDEXABLE_ROUTES，域名取自 PUBLIC_APP_URL 或当前请求 |
| canonical、og:url | 运行时按当前地址写入 | 初始值是 https://example.com，初始化脚本会替换成真实域名 |
| og:image、twitter:image | public/og.png | 1200×630 占位图 |
| 图标 | public/favicon.svg、public/icon.png | SVG 主图标加 512 像素的 apple-touch-icon |
| html lang | 随界面语言切换 | 由 useDocumentMetadata 按 HTML_LANGS 写入 |

两张位图和 SVG 都由 npm run brand 生成，脚本是 scripts/make-brand.mjs，只用 Node 内置的 zlib，不引入图形依赖。它画的是纯几何占位图，没有文字，正式上线前应该换成带产品名的设计稿。

新增需要被收录的页面时，只要加进 src/routes.ts 的 INDEXABLE_ROUTES，sitemap 会自动包含。

## 面向 AI 的内容

页脚的 Agents 区块做两件事：列出给 AI 读的纯文本文件，以及一排按钮，点开就在 ChatGPT、Claude、Perplexity、Gemini 或 Grok 里带着预填问题询问本产品。

| 文件 | 内容来源 |
|---|---|
| /llms.txt | 按 llmstxt.org 的格式列出下面各页，链接为绝对地址 |
| /llms-full.txt | product、pricing、faq 和四个合规页拼成一个文件 |
| /index.md | 首页文案，直接取 messages.en 的 hero 和 landing |
| /product.md | 首页卖点加上 src/content/agents.ts 的 PRODUCT |
| /faq.md | src/content/agents.ts 的 FAQ |
| /pricing.md | D1 里的在售套餐，只列当前支付提供商的价格，与定价页一致 |
| /terms.md 等 | src/content/legal.ts |

这些文件都由 Worker 动态生成，生成函数在 src/lib/agents/markdown.ts，路由在 src/lib/agents/routes.ts。名称取 APP_NAME，域名取 PUBLIC_APP_URL 或当前请求。响应带五分钟缓存；index.md、pricing.md 和合规页的 Markdown 版本带 rel="canonical" 的 Link 头，指回对应的 HTML 页面，避免和正式页面争排名。

内容只有英文，理由同合规页：PRODUCT 和 FAQ 写的是模板本身，上线前要换成自己的产品说明。首页文案改了之后 index.md 和 product.md 会自动跟着变。

询问按钮的提问文案在 messages.agents.prompt，九种语言齐全，会带上站点地址和 llms.txt 地址。各家的预填参数都不是公开承诺的接口：ChatGPT、Claude、Perplexity 和 Grok 用 ?q=，Gemini 没有对应参数，按钮改为打开 Google AI Mode（由 Gemini 回答）。哪家改了参数，只需改 src/content/agents.ts 里的 ASSISTANTS。图标取自 LobeHub Icons（MIT 许可）。

本地用 npm run dev 时，Vite 会把这些路径代理到 8787 端口的 Worker，需要同时运行 npm run dev:worker。

## 404

未知路径返回真正的 404 状态码，而不是静默显示首页。判定共用 src/routes.ts 的 isAppRoute：Worker 在 notFound 里拿到 SPA 外壳后，如果路径不属于已知路由就把状态改成 404；前端 resolveRoute 对同样的路径返回 /404，渲染 NotFoundPage。

两边共用一份路由表，所以新增页面时不会出现「前端能渲染但爬虫看到 404」的偏差。

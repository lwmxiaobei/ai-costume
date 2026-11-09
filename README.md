# 男装服饰集

1200 套独立生成的男装搭配参考图，包含春、夏、秋、冬、内衣、派对、泳装、性感 8 个分类。支持分类筛选、关键词搜索、分页加载、大图弹窗及高清原图下载。

线上地址：https://ai-costume-zh.lwmlxy520.workers.dev

图库图片存储在 Cloudflare R2 的 `ai-costume-images` 存储桶。列表使用压缩缩略图，弹窗使用 768 像素 WebP 预览，点击下载时获取 1024×1536 高清原图。Worker 通过 `/media/men/` 提供预览，通过 `/download/men/` 提供高清下载。

## 获取项目与图片

仓库直接保存男装原图、缩略图、预览图及 `upstream/files/` 中的历史图片，克隆时会获取全部图片：

```bash
git clone git@github.com:lwmxiaobei/ai-costume.git
cd ai-costume
npm ci
npm run build
```

`studio/` 为独立应用，依赖需在该目录内单独安装。本地密钥、依赖、构建产物和浏览器调试缓存不提交到仓库。线上部署与图片发布仍使用现有 Cloudflare Worker 和 R2。

## 数据与构建

- `output/menswear-1200/`：1200 套男装计划、最终原图、缩略图及提示词，包含返工后的最终版本。
- `output/r2-assets/`：压缩预览、R2 上传清单、上传进度与云端校验结果。
- `src/index.html`：男装网站页面。
- `src/i18n.js`：界面翻译、分类名称、语言识别与多语言搜索词。
- `scripts/keyword-translations.json`：服装、面料、颜色和搭配描述的翻译词典，由构建脚本生成各语言的图片描述。
- `src/worker.js`：压缩预览与高清下载接口。
- `site.config.json`：网站标题、副标题、分类、注意事项与页脚，`locales` 中维护繁体中文、英语和日语内容。

构建只收录男装合集。原有 `upstream/` 为历史来源归档，不参与网站构建，网站不提供历史图片的预览和下载入口。

## 追加男装图片

```text
images/
  春/  MY-0001.png  MY-0001.txt
  keywords.csv
```

子目录名就是分类名。同名 `.txt` 填写关键词，也可使用 `keywords.csv` 的 `id,关键词`。图片编号须与男装合集中的编号不同，栅格图会生成压缩缩略图和预览图。

## 命令

```bash
npm run build      # 生成男装页面、索引、预览图与 R2 上传清单
npm test           # 验证预览、高清下载及历史图片访问限制
npm run upload:r2  # 上传缺失或变化的图片，校验云端大小与 MD5
npm run deploy     # 构建并发布网站 Worker
```

批量上传使用临时密钥保护的 Worker，上传时校验 SHA-256，结束后删除临时 Worker。中断后重新运行会跳过已完整上传的图片。`remote-validation.json` 记录清单中图片的最终核对结果。

本地预览通过远程 R2 绑定读取同一套男装图片。

## 多语言

支持简体中文、繁体中文、英语和日语，可在页头切换。首次访问按浏览器语言自动选择，手动选择保存在浏览器中。切换时保留当前分类、搜索条件和已加载数量。

界面、分类、服装描述、使用提示、注意事项、下载弹窗和错误提示均随语言切换。支持使用简繁中文、英语和日语检索同一套服装。各语言的注意事项均包含免费商用、禁止下载后重新上传到自己的网站，以及作者链接。

# 男装服饰集 1200 张

已完成 1200 张男装搭配，按女版现有分类与数量占比分配。之前的五张预览单独保留，不计入本合集。

生成方式：内置 imagegen，各搭配独立生成。全部原图为 1024×1536，浅灰白背景、隐形模特穿着形态。返工项目使用已登记的最终版本。

分类数量：春 183、夏 217、秋 208、冬 216、内衣 170、派对 41、泳装 46、性感 119。

打开 index.html 可按分类浏览，点击缩略图可查看原图。每张图片附有对应提示词和关键词文件。

最终校验：1200 张原图、缩略图及配套文本齐全，原图校验值一致且无相同文件，浏览页包含 1200 个条目，无待返工项目或未解决失败。详细结果见 asset-validation.json。

plan.json 为完整计划，prompts 为逐图提示词，images 为分类原图，thumbs 为浏览缩略图，results 为逐图结果，failures 为生成失败的记录。index.html 为本地浏览页。

命令：

```sh
node scripts/menswear-collection.mjs status
node scripts/menswear-collection.mjs next 8
node scripts/menswear-collection.mjs refresh
```

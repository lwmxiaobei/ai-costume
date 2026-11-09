// 从镜像站的原站数据生成可试穿的服装清单（排除内衣、性感、泳装）
import { readFileSync, writeFileSync } from "node:fs";

const SRC = new URL("../../upstream/items.json", import.meta.url);
const OUT = new URL("../src/content/costumes.json", import.meta.url);
const CAT = { "春": "春", "夏": "夏", "秋": "秋", "冬": "冬", "パーティ": "派对" };

const items = JSON.parse(readFileSync(SRC, "utf8"))
  .filter((d) => CAT[d["カテゴリ"]])
  .map((d) => ({ id: d.id, cat: CAT[d["カテゴリ"]], kw: d["キーワード"] }));
writeFileSync(OUT, JSON.stringify(items));
console.log("可试穿服装 " + items.length + " 套");

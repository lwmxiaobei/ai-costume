// 构建图库与 R2 上传清单，网站静态资源中只保留页面和索引。
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync, copyFileSync, rmSync } from 'node:fs';
import { join, extname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { localizeKeywords } from './localize-keywords.mjs';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const IMG = join(ROOT, 'images'), DIST = join(ROOT, 'dist');
const ASSETS = join(ROOT, 'output/r2-assets'), MEN = join(ROOT, 'output/menswear-1200');
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'site.config.json'), 'utf8'));
const RASTER = new Set(['.png', '.jpg', '.jpeg', '.webp']), ALL = new Set([...RASTER, '.svg']);
const items = [], manifest = [], assetKeys = new Set(), cats = [...CONFIG.cats];
mkdirSync(ASSETS, { recursive: true });
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
function resize(src, out, width) {
  if (existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) return;
  mkdirSync(join(out, '..'), { recursive: true });
  execFileSync('cwebp', ['-quiet', '-q', '80', '-resize', String(width), '0', '-metadata', 'none', src, '-o', out]);
}
function asset(key, file, download = false) {
  if (!existsSync(file)) throw new Error(`缺少图片：${relative(ROOT, file)}`);
  if (!assetKeys.has(key)) {
    const data = readFileSync(file);
    manifest.push({ key, file: relative(ROOT, file), size: data.length, md5: createHash('md5').update(data).digest('hex'), sha256: createHash('sha256').update(data).digest('hex') });
    assetKeys.add(key);
  }
  return `/${download ? 'download' : 'media'}/${key.split('/').map(encodeURIComponent).join('/')}`;
}
function addItem(item) {
  if (items.some(d => d.id === item.id)) throw new Error(`图片编号重复：${item.id}`);
  if (!cats.includes(item.cat)) cats.push(item.cat);
  items.push(item);
}
// 男版只读取已登记的最终图片，包含返工后的最终版本。
if (existsSync(join(MEN, 'plan.json'))) {
  for (const item of JSON.parse(readFileSync(join(MEN, 'plan.json'), 'utf8')).items) {
    const resultFile = join(MEN, 'results', `${item.id}.json`);
    if (!existsSync(resultFile)) continue;
    const result = JSON.parse(readFileSync(resultFile, 'utf8'));
    const original = join(MEN, result.image), preview = join(ASSETS, 'previews', `${item.id}.webp`);
    resize(original, preview, 768);
    addItem({ id: item.id, gender: '男装', cat: item.category, kw: Array.isArray(item.keywords) ? item.keywords.join(' ') : item.keywords,
      thumb: asset(`men/thumb/${item.id}.webp`, join(MEN, result.thumbnail)),
      img: asset(`men/img/${item.id}.webp`, preview),
      orig: asset(`men/orig/${item.id}.png`, original, true) });
  }
}
// 保留 images/<分类>/ 的自有图片导入方式。
const kwCsv = {};
if (existsSync(join(IMG, 'keywords.csv'))) {
  for (const line of readFileSync(join(IMG, 'keywords.csv'), 'utf8').split(/\r?\n/).slice(1)) {
    const i = line.indexOf(',');
    if (i >= 0) kwCsv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, '');
  }
}
const dirs = existsSync(IMG) ? readdirSync(IMG, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name) : [];
for (const cat of dirs) {
  for (const f of readdirSync(join(IMG, cat)).filter(f => ALL.has(extname(f).toLowerCase())).sort()) {
    const ext = extname(f).toLowerCase(), id = basename(f, extname(f)), src = join(IMG, cat, f), txt = join(IMG, cat, `${id}.txt`);
    const kw = existsSync(txt) ? readFileSync(txt, 'utf8').trim().replace(/\s+/g, ' ') : (kwCsv[id] || '');
    let thumb, img;
    if (RASTER.has(ext)) {
      const small = join(ASSETS, 'custom/thumb', `${id}.webp`), medium = join(ASSETS, 'custom/img', `${id}.webp`);
      resize(src, small, 480); resize(src, medium, 768);
      thumb = asset(`custom/thumb/${id}.webp`, small); img = asset(`custom/img/${id}.webp`, medium);
    } else thumb = img = asset(`custom/img/${id}.svg`, src);
    addItem({ id, gender: '男装', cat, kw, thumb, img, orig: asset(`custom/orig/${id}${ext}`, src, true) });
  }
}
const usedCats = cats.filter(c => items.some(d => d.cat === c));
const counts = Object.fromEntries(usedCats.map(c => [c, items.filter(d => d.cat === c).length]));
const { cats: _omit, ...config } = CONFIG;
for (const item of items) item.kwLocales = localizeKeywords(item.kw);
writeFileSync(join(DIST, 'data.json'), JSON.stringify({ total: items.length, cats: usedCats, counts, config, items }));
const html = readFileSync(join(ROOT, 'src/index.html'), 'utf8').replace(
  '<script type="application/json" id="site-config">{}</script>',
  `<script type="application/json" id="site-config">${JSON.stringify(CONFIG).replaceAll('<', '\\u003c')}</script>`
);
writeFileSync(join(DIST, 'index.html'), html);
copyFileSync(join(ROOT, 'src/i18n.js'), join(DIST, 'i18n.js'));
writeFileSync(join(DIST, '_headers'), ['/data.json', '  Cache-Control: public, max-age=300', '/*', '  X-Content-Type-Options: nosniff', '  Referrer-Policy: same-origin', ''].join('\n'));
writeFileSync(join(ASSETS, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`完成：${items.length} 套，${manifest.length} 个 R2 图片文件，总计 ${(manifest.reduce((sum, asset) => sum + asset.size, 0) / 1024 ** 3).toFixed(2)} GiB`);

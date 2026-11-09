// 从原站同步数据和图片到 upstream/（经作者授权的中文镜像，图片原样保存）
// Node 的 fetch 默认不走 HTTP_PROXY，本机代理下载原站很慢，直连更快
import { writeFileSync, mkdirSync, existsSync, statSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';

const SRC = 'https://ai-costume-gallery.pages.dev/';
const UP = join(new URL('..', import.meta.url).pathname, 'upstream');
const CONCURRENCY = 8;

const html = await (await fetch(SRC)).text();
const m = html.match(/const D=(\[.*?\]);\s*\n/s);
if (!m) throw new Error('原站页面里没找到数据（const D=...），页面结构可能变了');
const items = JSON.parse(m[1]);
mkdirSync(UP, { recursive: true });
writeFileSync(join(UP, 'items.json'), JSON.stringify(items));

const paths = [...new Set(items.flatMap(d => [d['サムネ'], d['画像'], d['原寸']]))];
const todo = paths.filter(p => { const f = join(UP, 'files', p); return !existsSync(f) || statSync(f).size === 0; });
console.log(`共 ${items.length} 条，${paths.length} 个文件，需要下载 ${todo.length} 个`);

async function get(p) {
  const out = join(UP, 'files', p);
  mkdirSync(dirname(out), { recursive: true });
  for (let i = 1; i <= 5; i++) {
    try {
      const r = await fetch(SRC + p);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      writeFileSync(out + '.part', Buffer.from(await r.arrayBuffer()));
      renameSync(out + '.part', out);
      return true;
    } catch (e) {
      if (i === 5) { console.error(`失败 ${p}：${e.message}`); return false; }
      await new Promise(r => setTimeout(r, 1000 * i));
    }
  }
}

let done = 0, failed = 0, next = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < todo.length) {
    const p = todo[next++];
    if (!(await get(p))) failed++;
    if (++done % 200 === 0) console.log(`${done}/${todo.length}`);
  }
}));
console.log(`完成：下载 ${done - failed}，失败 ${failed}`);
if (failed) process.exitCode = 1;

// 通过临时、密钥保护的 Worker 批量上传，完成后删除临时 Worker。
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, createReadStream } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'output/r2-assets/manifest.json'), 'utf8'));
const config = JSON.parse(readFileSync(join(root, 'wrangler.jsonc'), 'utf8'));
const bucket = config.r2_buckets.find(binding => binding.binding === 'IMAGES').bucket_name;
const name = `ai-costume-upload-${randomBytes(5).toString('hex')}`;
const temporary = mkdtempSync(join(tmpdir(), 'ai-costume-r2-'));
const token = randomBytes(32).toString('hex');
const env = { ...process.env };
for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) delete env[key];
const cli = (...args) => execFileSync(join(root, 'node_modules/.bin/wrangler'), args, { cwd: root, env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 4 * 1024 ** 2 });
const conf = join(temporary, 'wrangler.json');
writeFileSync(conf, JSON.stringify({ name, main: 'worker.mjs', compatibility_date: '2026-10-23', workers_dev: true, r2_buckets: [{ binding: 'BUCKET', bucket_name: bucket }] }));
writeFileSync(join(temporary, 'worker.mjs'), `
export default { async fetch(request, env) {
  if (!env.UPLOAD_TOKEN || request.headers.get('Authorization') !== 'Bearer ' + env.UPLOAD_TOKEN) return new Response('Unauthorized', {status:401});
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const list = await env.BUCKET.list({limit:1000, cursor:url.searchParams.get('cursor') || undefined});
    return Response.json({objects:list.objects.map(o=>({key:o.key,size:o.size,etag:o.etag})),truncated:list.truncated,cursor:list.cursor});
  }
  if (request.method !== 'PUT') return new Response(null,{status:405});
  const key = decodeURIComponent(url.pathname.slice(1));
  if (!/^(g|men|custom)\\//.test(key)) return new Response(null,{status:400});
  const object = await env.BUCKET.put(key, request.body, {
    sha256: request.headers.get('X-Content-SHA256'),
    httpMetadata: {contentType:request.headers.get('Content-Type'),cacheControl:'public, max-age=31536000, immutable'}
  });
  return Response.json({key:object.key,size:object.size,etag:object.etag});
}};
`);

let deployed = false, completed = 0, uploaded = 0, skipped = 0;
const out = join(root, 'output/r2-assets');
mkdirSync(out, { recursive: true });
const saveProgress = () => writeFileSync(join(out, 'upload-progress.json'), JSON.stringify({ bucket, target: manifest.length, completed, uploaded, skipped, updatedAt: new Date().toISOString() }, null, 2) + '\n');
try {
  const deployment = cli('deploy', '--config', conf);
  deployed = true;
  const endpoint = deployment.match(new RegExp('https://' + name + '\\.[a-zA-Z0-9-]+\\.workers\\.dev'))?.[0];
  if (!endpoint) throw new Error('无法取得临时上传地址');
  execFileSync(join(root, 'node_modules/.bin/wrangler'), ['secret', 'put', 'UPLOAD_TOKEN', '--config', conf], { cwd: root, env, input: token, stdio: ['pipe', 'pipe', 'pipe'] });
  console.log(`准备上传至 ${bucket}，共 ${manifest.length} 个文件。临时上传地址：${endpoint}`);
  const request = async (path, options = {}) => {
    const attempts = options.method === 'PUT' ? 1 : 5;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const response = await fetch(endpoint + path, { ...options, headers: { Authorization: 'Bearer ' + token, ...options.headers }, signal: AbortSignal.timeout(120000) });
        if (!response.ok) throw new Error(`R2 请求失败：HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
        return await response.json();
      } catch (error) {
        if (attempt === attempts) throw error;
        console.log(`等待上传地址就绪，正在重试：${error.cause?.code || error.message}`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  };
  const listAll = async () => {
    const objects = new Map();
    let cursor;
    do {
      const list = await request(cursor ? '?cursor=' + encodeURIComponent(cursor) : '/');
      for (const object of list.objects) objects.set(object.key, object);
      cursor = list.truncated ? list.cursor : null;
    } while (cursor);
    return objects;
  };
  const matches = (remote, asset) => remote?.size === asset.size && remote.etag.replaceAll('"', '') === asset.md5;
  const remote = await listAll();
  const pending = manifest.filter(asset => {
    if (!matches(remote.get(asset.key), asset)) return true;
    completed++; skipped++; return false;
  });
  saveProgress();
  let next = 0, failed = false;
  const failures = [];
  await Promise.all(Array.from({ length: 10 }, async () => {
    while (!failed && next < pending.length) {
      const asset = pending[next++];
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const result = await request('/' + asset.key.split('/').map(encodeURIComponent).join('/'), {
            method: 'PUT', duplex: 'half', body: createReadStream(resolve(root, asset.file)),
            headers: { 'Content-Length': String(asset.size), 'Content-Type': asset.key.endsWith('.webp') ? 'image/webp' : asset.key.endsWith('.svg') ? 'image/svg+xml' : asset.key.match(/\.jpe?g$/i) ? 'image/jpeg' : 'image/png', 'X-Content-SHA256': asset.sha256 }
          });
          if (!matches(result, asset)) throw new Error('云端文件校验失败');
          completed++; uploaded++;
          if (completed % 100 === 0 || completed === manifest.length) { saveProgress(); console.log(`已核对 ${completed}/${manifest.length} 个文件`); }
          break;
        } catch (error) {
          if (attempt === 3) { failed = true; failures.push({ key: asset.key, error: error.message }); }
          else await new Promise(resolve => setTimeout(resolve, attempt * 3000));
        }
      }
    }
  }));
  saveProgress();
  if (failures.length) throw new Error(JSON.stringify(failures));
  const final = await listAll();
  const issues = manifest.filter(asset => !matches(final.get(asset.key), asset)).map(asset => asset.key);
  const report = { bucket, checkedAt: new Date().toISOString(), expected: manifest.length, verified: manifest.length - issues.length, bytes: manifest.reduce((sum, asset) => sum + asset.size, 0), issues };
  writeFileSync(join(out, 'remote-validation.json'), JSON.stringify(report, null, 2) + '\n');
  if (issues.length) throw new Error(`仍有 ${issues.length} 个文件需要补传`);
  console.log(JSON.stringify(report));
} catch (error) {
  console.error(error.stdout?.toString() || error.message);
  console.error(error.stderr?.toString() || '');
  process.exitCode = 1;
} finally {
  if (deployed) {
    try { cli('delete', name, '--config', conf, '--force'); console.log('临时上传 Worker 已删除。'); }
    catch { console.error(`临时上传 Worker ${name} 清理失败，需要重试清理。`); process.exitCode = 1; }
  }
  rmSync(temporary, { recursive: true, force: true });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

function fromGallery(path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('Referer', 'https://gallery.test/');
  return new Request('https://gallery.test' + path, { ...init, headers });
}

function setup() {
  const calls = [];
  const bytes = new Uint8Array([137, 80, 78, 71, 0, 255, 128, 1]);
  const object = { body: bytes, size: bytes.length, httpEtag: '"original-etag"', writeHttpMetadata() {} };
  const env = {
    IMAGES: {
      async get(key) { calls.push(['get', key]); return key.includes('missing') ? null : object; },
      async head(key) { calls.push(['head', key]); return object; }
    },
    ASSETS: { async fetch() { return new Response('gallery'); } }
  };
  return { calls, bytes, env, ctx: { waitUntil() {} } };
}

test('浏览预览只读取 WebP，不能经预览入口加载原图', async () => {
  const { calls, env, ctx } = setup();
  const response = await worker.fetch(fromGallery('/media/men/thumb/MEN-SPR-0001.webp'), env, ctx);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.equal(response.headers.get('vary'), 'Origin, Referer, Sec-Fetch-Site');
  assert.equal(response.headers.get('content-disposition'), null);
  assert.deepEqual(calls, [['get', 'men/thumb/MEN-SPR-0001.webp']]);
  const denied = await worker.fetch(fromGallery('/media/men/orig/MEN-SPR-0001.png'), env, ctx);
  assert.equal(denied.status, 404);
  assert.equal(calls.length, 1);
});

test('下载返回 R2 中的原始字节并附带高清文件名', async () => {
  const { calls, bytes, env, ctx } = setup();
  const response = await worker.fetch(fromGallery('/download/men/orig/MEN-SPR-0001.png'), env, ctx);
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="MEN-SPR-0001.png"');
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  assert.deepEqual(calls, [['get', 'men/orig/MEN-SPR-0001.png']]);
});

test('HEAD 只读取原图元数据，缺失预览返回 404', async () => {
  const { calls, env, ctx } = setup();
  const response = await worker.fetch(fromGallery('/download/men/orig/MEN-SPR-0001.png', { method: 'HEAD' }), env, ctx);
  assert.equal(response.status, 200);
  assert.equal(response.body, null);
  assert.equal(response.headers.get('content-length'), '8');
  assert.deepEqual(calls, [['head', 'men/orig/MEN-SPR-0001.png']]);
  const missing = await worker.fetch(fromGallery('/media/men/img/missing.webp'), env, ctx);
  assert.equal(missing.status, 404);
});

test('图片接口不能写入，页面由静态资源服务', async () => {
  const { calls, env, ctx } = setup();
  const denied = await worker.fetch(fromGallery('/media/men/img/MEN-SPR-0001.webp', { method: 'PUT', body: 'x' }), env, ctx);
  assert.equal(denied.status, 405);
  assert.equal(calls.length, 0);
  assert.equal(await (await worker.fetch(fromGallery('/'), env, ctx)).text(), 'gallery');
});

test('旧女装预览与下载地址均不可访问，也不读取 R2', async () => {
  const { calls, env, ctx } = setup();
  for (const path of ['/media/g/thumbs/SPR-0001.webp', '/media/g/img/SPR-0001.webp', '/download/g/png/SPR-0001.png']) {
    const response = await worker.fetch(fromGallery(path), env, ctx);
    assert.equal(response.status, 404);
  }
  assert.deepEqual(calls, []);
});

test('预览和下载拦截外站、无来源及不一致的来源，且不读取 R2', async () => {
  const { calls, env, ctx } = setup();
  const sources = [
    {},
    { Origin: 'https://external.test' },
    { Referer: 'https://external.test/page' },
    { Referer: 'https://gallery.test.external.test/' },
    { Referer: 'https://gallery.test@external.test/' },
    { Referer: 'https://sub.gallery.test/' },
    { Referer: 'http://gallery.test/' },
    { Referer: 'https://gallery.test:8443/' },
    { Origin: 'null', Referer: 'https://gallery.test/' },
    { Origin: 'https://gallery.test', Referer: 'not-a-url' },
    { Origin: 'https://external.test', Referer: 'https://gallery.test/' },
    { Origin: 'https://gallery.test', Referer: 'https://external.test/' },
    { Referer: 'https://gallery.test/', 'Sec-Fetch-Site': 'cross-site' },
    { Referer: 'https://gallery.test/', 'Sec-Fetch-Site': 'same-site' },
    { 'Sec-Fetch-Site': 'none' },
    { 'Sec-Fetch-Site': 'same-origin' }
  ];
  for (const path of ['/media/men/thumb/MEN-SPR-0001.webp', '/download/men/orig/MEN-SPR-0001.png']) {
    for (const method of ['GET', 'HEAD']) {
      for (const headers of sources) {
        const response = await worker.fetch(new Request('https://gallery.test' + path, { method, headers }), env, ctx);
        assert.equal(response.status, 403, JSON.stringify({ path, method, headers }));
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.equal(response.headers.get('access-control-allow-origin'), null);
      }
    }
  }
  assert.deepEqual(calls, []);
});

test('同源 Origin、Referer 及两者同时提供时均可访问，支持本地预览', async () => {
  for (const headers of [
    { Origin: 'https://gallery.test' },
    { Referer: 'https://gallery.test/?lang=en' },
    { Origin: 'https://gallery.test', Referer: 'https://gallery.test/', 'Sec-Fetch-Site': 'same-origin' }
  ]) {
    const { env, ctx } = setup();
    const response = await worker.fetch(new Request('https://gallery.test/media/men/img/MEN-SPR-0001.webp', { headers }), env, ctx);
    assert.equal(response.status, 200);
  }
  const { env, ctx } = setup();
  const local = await worker.fetch(new Request('http://localhost:8787/media/men/img/MEN-SPR-0001.webp', { headers: { Referer: 'http://localhost:8787/' } }), env, ctx);
  assert.equal(local.status, 200);
});

test('缓存命中前仍校验来源，旧缓存响应也补齐同源和缓存隔离响应头', async t => {
  const { bytes, calls, env, ctx } = setup();
  let matches = 0;
  const cached = new Response(bytes, { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' } });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: { default: { async match() { matches++; return cached; } } }
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'caches', original);
    else delete globalThis.caches;
  });
  for (const headers of [{}, { Referer: 'https://external.test/' }]) {
    const denied = await worker.fetch(new Request('https://gallery.test/media/men/img/MEN-SPR-0001.webp', { headers }), env, ctx);
    assert.equal(denied.status, 403);
  }
  assert.equal(matches, 0);
  const response = await worker.fetch(fromGallery('/media/men/img/MEN-SPR-0001.webp'), env, ctx);
  assert.equal(matches, 1);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.equal(response.headers.get('vary'), 'Origin, Referer, Sec-Fetch-Site');
  assert.equal(cached.headers.get('cross-origin-resource-policy'), null);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  assert.deepEqual(calls, []);
});

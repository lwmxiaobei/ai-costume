import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

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
  const response = await worker.fetch(new Request('https://gallery.test/media/men/thumb/MEN-SPR-0001.webp'), env, ctx);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.equal(response.headers.get('content-disposition'), null);
  assert.deepEqual(calls, [['get', 'men/thumb/MEN-SPR-0001.webp']]);
  const denied = await worker.fetch(new Request('https://gallery.test/media/men/orig/MEN-SPR-0001.png'), env, ctx);
  assert.equal(denied.status, 404);
  assert.equal(calls.length, 1);
});

test('下载返回 R2 中的原始字节并附带高清文件名', async () => {
  const { calls, bytes, env, ctx } = setup();
  const response = await worker.fetch(new Request('https://gallery.test/download/men/orig/MEN-SPR-0001.png'), env, ctx);
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="MEN-SPR-0001.png"');
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  assert.deepEqual(calls, [['get', 'men/orig/MEN-SPR-0001.png']]);
});

test('HEAD 只读取原图元数据，缺失预览返回 404', async () => {
  const { calls, env, ctx } = setup();
  const response = await worker.fetch(new Request('https://gallery.test/download/men/orig/MEN-SPR-0001.png', { method: 'HEAD' }), env, ctx);
  assert.equal(response.status, 200);
  assert.equal(response.body, null);
  assert.equal(response.headers.get('content-length'), '8');
  assert.deepEqual(calls, [['head', 'men/orig/MEN-SPR-0001.png']]);
  const missing = await worker.fetch(new Request('https://gallery.test/media/men/img/missing.webp'), env, ctx);
  assert.equal(missing.status, 404);
});

test('图片接口不能写入，页面由静态资源服务', async () => {
  const { calls, env, ctx } = setup();
  const denied = await worker.fetch(new Request('https://gallery.test/media/men/img/MEN-SPR-0001.webp', { method: 'PUT', body: 'x' }), env, ctx);
  assert.equal(denied.status, 405);
  assert.equal(calls.length, 0);
  assert.equal(await (await worker.fetch(new Request('https://gallery.test/'), env, ctx)).text(), 'gallery');
});

test('旧女装预览与下载地址均不可访问，也不读取 R2', async () => {
  const { calls, env, ctx } = setup();
  for (const path of ['/media/g/thumbs/SPR-0001.webp', '/media/g/img/SPR-0001.webp', '/download/g/png/SPR-0001.png']) {
    const response = await worker.fetch(new Request('https://gallery.test' + path), env, ctx);
    assert.equal(response.status, 404);
  }
  assert.deepEqual(calls, []);
});

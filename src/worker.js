const PREVIEW = /^(?:men\/(?:thumb|img)|custom\/(?:thumb|img))\/[^/]+\.(?:webp|svg)$/i;
const ORIGINAL = /^(?:men\/orig|custom\/orig)\/[^/]+\.(?:png|jpe?g|webp|svg)$/i;
const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };

// 图片请求必须提供本站来源，且所有已提供的来源信息必须一致。
function isSameOrigin(request, origin) {
  const site = request.headers.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin') return false;
  const sources = ['Origin', 'Referer'].map(name => request.headers.get(name)).filter(Boolean);
  if (!sources.length) return false;
  try { return sources.every(source => new URL(source).origin === origin); }
  catch { return false; }
}

function imageResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  headers.set('Vary', 'Origin, Referer, Sec-Fetch-Site');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const download = url.pathname.startsWith('/download/');
    if (!download && !url.pathname.startsWith('/media/')) return env.ASSETS.fetch(request);
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    let key;
    try { key = decodeURIComponent(url.pathname.slice(download ? 10 : 7)); }
    catch { return new Response('Not found', { status: 404 }); }
    if (!(download ? ORIGINAL : PREVIEW).test(key)) return new Response('Not found', { status: 404 });
    if (!isSameOrigin(request, url.origin)) return imageResponse(new Response('Forbidden', { status: 403, headers: { 'Cache-Control': 'no-store' } }));
    const cache = !download && request.method === 'GET' ? globalThis.caches?.default : null;
    const cached = cache && await cache.match(request);
    if (cached) return imageResponse(cached);
    const object = await env.IMAGES[request.method === 'HEAD' ? 'head' : 'get'](key);
    if (!object) return new Response('Not found', { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Content-Type', TYPES[key.split('.').pop().toLowerCase()]);
    headers.set('Content-Length', String(object.size));
    headers.set('ETag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('X-Content-Type-Options', 'nosniff');
    if (download) headers.set('Content-Disposition', `attachment; filename="${key.split('/').pop().replace(/["\r\n]/g, '')}"`);
    const response = imageResponse(new Response(request.method === 'HEAD' ? null : object.body, { headers }));
    if (cache) ctx.waitUntil(cache.put(request, response.clone()));
    return response;
  }
};

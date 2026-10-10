'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { createMalafakServer } = require('./proxy.cjs');

async function run() {
  const seen = [];
  const fixture = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const bytes = Buffer.concat(chunks);
    seen.push({ method: req.method, path: req.url, headers: req.headers, bytes });
    if (req.url === '/asset.pdf') {
      res.writeHead(206, { 'Content-Type': 'application/pdf', 'Content-Range': 'bytes 0-7/12' });
      res.end(Buffer.from([37,80,68,70,45,0,128,255])); return;
    }
    if (req.url.startsWith('/api/shares')) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': [
        'pdf-share-device=testcap; Domain=upstream.test; Path=/; HttpOnly; SameSite=None; Secure; Partitioned',
        'oai-session=DO-NOT-FORWARD; Path=/; Secure',
      ] });
      res.end('{"ok":true}'); return;
    }
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: 'https://malafak.is-a.dev/share' }); res.end(); return;
    }
    if (req.url === '/?_rsc=1') {
      res.writeHead(200, { 'Content-Type': 'text/x-component' });
      const metadata = 'بيانات الصفحة: noindex, nofollow; https://malafak.is-a.dev/';
      res.end('0:"$1"\n1:T' + Buffer.byteLength(metadata).toString(16) + ',' + metadata); return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'ETag': 'old', 'X-Robots-Tag': 'noindex' });
    res.end('<html><head><meta name="robots" content="noindex, nofollow"></head><body><script>"noindex, nofollow"</script>PDF workspace</body></html>');
  });
  fixture.listen(0, '127.0.0.1'); await once(fixture, 'listening');
  const origin = 'https://raqzilo-test.vercel.app';
  const proxy = createMalafakServer({ upstream: `http://127.0.0.1:${fixture.address().port}`, publicOrigin: origin });
  proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
  const port = proxy.address().port;
  function send(path, { method = 'GET', headers = {}, body = '' } = {}) {
    return new Promise((resolve, reject) => {
      const r = http.request({ hostname: '127.0.0.1', port, path, method,
        headers: { host: new URL(origin).host, ...headers } }, response => {
        const chunks = [];
        response.on('data', c => chunks.push(c));
        response.on('end', () => resolve({ status: response.statusCode, headers: response.headers,
          bytes: Buffer.concat(chunks), text: Buffer.concat(chunks).toString('utf8') }));
        response.on('error', reject);
      });
      r.on('error', reject); r.end(body);
    });
  }
  try {
    const home = await send('/', { headers: {
      'oai-authenticated-user-id': 'FORGED', 'oai-authenticated-user-email': 'FORGED',
      authorization: 'FORGED', 'x-forwarded-host': 'evil.test',
      cookie: 'oai-session=FORGED; pdf-share-device=realcap; waraqira-language=en',
    } });
    assert.equal(home.status, 200);
    assert(home.text.includes(`href="${origin}/"`));
    assert(!home.text.includes('noindex'));
    assert(!home.headers.etag && !home.headers['x-robots-tag']);
    const first = seen.at(-1);
    assert(!first.headers['oai-authenticated-user-id']); assert(!first.headers.authorization);
    assert(!first.headers['x-forwarded-host']);
    assert.equal(first.headers.cookie, 'pdf-share-device=realcap; waraqira-language=en');
    const rsc = await send('/?_rsc=1');
    assert.equal(rsc.status, 200); assert(!rsc.text.includes('noindex'));
    assert(!rsc.text.includes('malafak.is-a.dev'));
    const pdf = await send('/asset.pdf', { headers: { range: 'bytes=0-7' } });
    assert.equal(pdf.status, 206);
    assert.equal(pdf.headers['content-range'], 'bytes 0-7/12');
    assert.deepEqual(pdf.bytes, Buffer.from([37,80,68,70,45,0,128,255]));
    const before = seen.length;
    const cross = await send('/api/shares', { method: 'POST', headers: { origin: 'https://evil.test' }, body: '{}' });
    assert.equal(cross.status, 403); assert.equal(seen.length, before);
    const own = await send('/api/shares', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{"size":100}' });
    assert.equal(own.status, 200);
    assert.equal(seen.at(-1).headers.origin, `http://127.0.0.1:${fixture.address().port}`);
    assert.equal(seen.at(-1).bytes.toString(), '{"size":100}');
    assert.equal(own.headers['set-cookie'].length, 1);
    assert(!own.headers['set-cookie'][0].includes('Domain='));
    assert(own.headers['set-cookie'][0].includes('Partitioned'));
    const upload = await send('/api/shares/' + 'a'.repeat(32), { method: 'PUT',
      headers: { origin, 'content-type': 'application/pdf', 'x-upload-token': 'uploadcap' },
      body: Buffer.from('%PDF-1.7\n%%EOF') });
    assert.equal(upload.status, 200);
    assert.equal(seen.at(-1).headers['x-upload-token'], 'uploadcap');
    assert.equal(seen.at(-1).bytes.toString(), '%PDF-1.7\n%%EOF');
    const admin = await send('/admin'); assert.equal(admin.status, 302);
    assert.equal(admin.headers.location, `http://127.0.0.1:${fixture.address().port}/admin`);
    assert.equal((await send('/api/settings', { method: 'PUT', headers: { origin }, body: '{}' })).status, 405);
    assert.equal((await send('//evil.test/')).status, 400);
    assert.equal((await send('/%2Fadmin')).status, 400);
    assert.equal((await send('/', { headers: { host: 'evil.test' } })).status, 421);
    assert.equal((await send('/health', { headers: { host: 'health-check' } })).status, 200);
    assert.equal((await send('/redirect')).headers.location, origin + '/share');
    const robots = await send('/robots.txt'); assert(robots.text.includes(origin + '/sitemap.xml'));
    const sitemap = await send('/sitemap.xml'); assert(sitemap.text.includes('<loc>' + origin + '/</loc>'));
    assert.equal((await send('/', { method: 'HEAD' })).bytes.length, 0);
    console.log('PASS: HTML/RSC metadata, exact PDF bytes/range, public cookies, upload streaming, same-origin writes, auth-header isolation, owner redirect, host checks, robots/sitemap, HEAD.');
  } finally {
    await new Promise(resolve => proxy.close(resolve));
    await new Promise(resolve => fixture.close(resolve));
  }
}
run().catch(e => { console.error(e); process.exitCode = 1; });

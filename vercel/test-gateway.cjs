'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');

(async () => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html', 'x-robots-tag': 'noindex' });
    res.end('<html><head><meta name="robots" content="noindex, nofollow"></head><body>PDF tools</body></html>');
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  process.env.UPSTREAM_ORIGIN = `http://127.0.0.1:${upstream.address().port}`;
  process.env.PUBLIC_ORIGIN = 'https://raqzilo.vercel.app';
  process.env.VERCEL_URL = 'raqzilo-owned-preview.vercel.app';
  const gateway = require('./api/gateway.js');
  const server = http.createServer(gateway);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const fetchHost = (host, path = '/') => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: server.address().port, path,
      headers: { host, 'x-forwarded-host': 'raqzilo-owned-preview.vercel.app' } }, res => {
      let body = ''; res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      res.on('error', reject);
    }).on('error', reject);
  });
  try {
    const preview = await fetchHost(process.env.VERCEL_URL);
    assert.equal(preview.status, 200);
    assert.equal(preview.headers['x-robots-tag'], 'noindex, nofollow');
    assert(preview.body.includes('href="https://raqzilo.vercel.app/"'));
    assert(preview.body.includes('noindex, nofollow'));
    assert((await fetchHost(process.env.VERCEL_URL, '/robots.txt')).body.includes('Disallow: /'));
    const production = await fetchHost('raqzilo.vercel.app');
    assert.equal(production.status, 200);
    assert(!production.headers['x-robots-tag']);
    assert(!production.body.includes('noindex'));
    assert.equal((await fetchHost('unrelated.vercel.app')).status, 421);
    assert.equal((await fetchHost('evil.test')).status, 421);
    console.log('PASS: owned preview works with noindex and production canonical; forged hosts stay rejected.');
  } finally {
    server.closeAllConnections(); upstream.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => upstream.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

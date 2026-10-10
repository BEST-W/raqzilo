'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { createHash } = require('node:crypto');

(async () => {
  const payload = Buffer.alloc(5 * 1024 * 1024, 71);
  const hash = data => createHash('sha256').update(data).digest('hex');
  const expectedHash = hash(payload);
  let sourceCancelled = false;
  const upstream = http.createServer((req, res) => {
    if (req.url === '/slow.pdf') {
      res.writeHead(200, { 'content-type': 'application/pdf' });
      const timer = setInterval(() => res.write(payload.subarray(0, 65536)), 10);
      res.once('close', () => { clearInterval(timer); sourceCancelled = true; });
      return;
    }
    if (req.url === '/broken.pdf') {
      res.writeHead(200, { 'content-type': 'application/pdf', 'content-length': payload.length });
      res.write(payload.subarray(0, 1024));
      setTimeout(() => res.destroy(), 10);
      return;
    }
    const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || '');
    const body = range ? payload.subarray(Number(range[1]), Number(range[2]) + 1) : payload;
    res.writeHead(range ? 206 : 200, {
      'content-type': 'application/pdf', 'content-length': body.length,
      ...(range && { 'content-range': `bytes ${range[1]}-${range[2]}/${payload.length}` }),
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  process.env.UPSTREAM_ORIGIN = `http://127.0.0.1:${upstream.address().port}`;
  process.env.PUBLIC_ORIGIN = 'https://raqzilo.vercel.app';
  const gateway = require('./api/gateway.js');
  const completed = [];
  const warnings = [];
  const warningListener = warning => {
    if (warning.name === 'MaxListenersExceededWarning') warnings.push(warning.message);
  };
  process.on('warning', warningListener);
  const server = http.createServer((req, res) => {
    // A host/runtime can already monitor the response. The old streaming path
    // exceeded the default close-listener limit with these two existing hooks.
    const platformClose = () => {};
    res.on('close', platformClose); res.on('close', platformClose);
    const baseline = Object.fromEntries(['close', 'error', 'finish'].map(k => [k, res.listeners(k)]));
    let peakClose = res.listenerCount('close');
    const observed = event => {
      if (event === 'close') peakClose = Math.max(peakClose, res.listenerCount(event) + 1);
    };
    res.on('newListener', observed);
    const settled = error => {
      res.removeListener('newListener', observed);
      completed.push({ path: req.url, peakClose, error,
        baseline,
        remaining: Object.fromEntries(['close', 'error', 'finish'].map(k => [k, res.listeners(k)])) });
    };
    gateway(req, res).then(() => settled(null), settled);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = { host: '127.0.0.1', port: server.address().port };
  function download(path, options = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request({ ...address, path, method: options.method || 'GET',
        headers: { host: 'raqzilo.vercel.app', ...options.headers } }, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.once('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        res.once('aborted', () => options.expectAbort ? resolve({ aborted: true }) : reject(new Error('unexpected abort')));
        res.once('error', reject);
      });
      req.setTimeout(5000, () => req.destroy(new Error('request timeout')));
      req.once('error', reject); req.end();
    });
  }
  try {
    const repeated = await Promise.all(Array.from({ length: 12 }, () => download('/binary.pdf')));
    for (const response of repeated) {
      assert.equal(response.status, 200); assert.equal(hash(response.body), expectedHash);
    }
    const range = await download('/binary.pdf', { headers: { range: 'bytes=20-300' } });
    assert.equal(range.status, 206); assert.deepEqual(range.body, payload.subarray(20, 301));
    const head = await download('/binary.pdf', { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(Number(head.headers['content-length']), payload.length);
    assert.equal(head.body.length, 0);
    assert.equal((await download('/broken.pdf', { expectAbort: true })).aborted, true);
    await new Promise((resolve, reject) => {
      const req = http.get({ ...address, path: '/slow.pdf', headers: { host: 'raqzilo.vercel.app' } }, res => {
        res.once('data', () => req.destroy());
        res.on('error', () => {}); res.once('close', resolve);
      });
      req.setTimeout(5000, () => req.destroy(new Error('request timeout')));
      req.on('error', error => { if (error.message === 'request timeout') reject(error); });
    });
    const deadline = Date.now() + 2000;
    while ((!sourceCancelled || completed.length < 16) && Date.now() < deadline)
      await new Promise(resolve => setTimeout(resolve, 10));
    assert(sourceCancelled, 'client cancellation must close the upstream transfer');
    assert.equal(completed.length, 16, 'all gateway invocations must settle');
    assert.deepEqual(warnings, [], 'streaming must not exceed the default listener limit');
    for (const result of completed) {
      assert(result.peakClose <= 10);
      assert.deepEqual(result.remaining, result.baseline, 'remove owned listeners and preserve every host listener');
      assert.equal(result.error, null);
    }
    console.log('PASS: concurrent 5 MiB downloads, ranges, HEAD, upstream interruption and client cancellation; no excess listeners or unfinished invocations.');
  } finally {
    process.removeListener('warning', warningListener);
    server.closeAllConnections(); upstream.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => upstream.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

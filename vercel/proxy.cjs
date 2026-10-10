// SPDX-License-Identifier: AGPL-3.0-only
'use strict';

const http = require('node:http');
const https = require('node:https');

const DEFAULT_UPSTREAM = 'https://mustanad-pdf.abdulhadisa966.chatgpt.site';
const BRAND_ORIGIN = 'https://malafak.is-a.dev';
const GOOGLE_VERIFICATION_TAG = '<meta name="google-site-verification" content="igXaVHtprFJQ2Ec484l3KIr0dWpe8RxLuQokknki5cE" />';
const PUBLIC_COOKIES = new Set(['pdf-share-device', 'waraqira-language']);
const HOP_HEADERS = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'proxy-connection',
]);

function originURL(value) {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Use an HTTPS origin without a path or credentials.');
  }
  return url;
}

function filteredHeaders(source, request = false) {
  const nominated = String(source.connection || '').toLowerCase().split(',').map(s => s.trim());
  const excluded = new Set([...HOP_HEADERS, ...nominated]);
  const headers = {};
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined || excluded.has(name)) continue;
    if (request && (name === 'host' || name === 'authorization' ||
        name === 'cookie' || name === 'origin' || name === 'referer' ||
        name === 'forwarded' || name.startsWith('x-forwarded-') ||
        name.startsWith('oai-') || name.startsWith('cf-') ||
        name.startsWith('x-openai-') || name.startsWith('x-vercel-') || name.startsWith('x-real-'))) continue;
    headers[name] = value;
  }
  return headers;
}

function publicCookieHeader(value) {
  return String(value || '').split(';').map(s => s.trim())
    .filter(s => PUBLIC_COOKIES.has(s.slice(0, s.indexOf('=')))).join('; ');
}

function publicSetCookies(value) {
  return (Array.isArray(value) ? value : value ? [value] : [])
    .filter(s => PUBLIC_COOKIES.has(s.slice(0, s.indexOf('='))))
    .map(s => s.replace(/;\s*Domain=[^;]*/ig, ''));
}

function fail(response, status, message) {
  if (response.destroyed || response.writableEnded) return;
  if (response.headersSent) { response.destroy(); return; }
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store', 'x-robots-tag': 'noindex',
  });
  response.end(JSON.stringify({ error: message }));
}

// Flight text frames declare their UTF-8 byte length. Rewriting metadata without
// updating that length makes the browser consume part of the following record.
function rewriteFlight(buffer, rewriteText) {
  const lengthTags = new Set('TAOoUSsLlGgMmV');
  const output = [];
  let offset = 0;
  while (offset < buffer.length) {
    const colon = buffer.indexOf(58, offset);
    if (colon < 0 || !/^[a-f0-9]*$/i.test(buffer.subarray(offset, colon).toString('ascii'))) {
      throw new Error('Invalid Flight record.');
    }
    const tag = String.fromCharCode(buffer[colon + 1]);
    if (lengthTags.has(tag)) {
      const comma = buffer.indexOf(44, colon + 2);
      const encodedLength = buffer.subarray(colon + 2, comma).toString('ascii');
      if (comma < 0 || !/^[a-f0-9]+$/i.test(encodedLength)) throw new Error('Invalid Flight length.');
      const length = Number.parseInt(encodedLength, 16);
      const end = comma + 1 + length;
      if (!Number.isSafeInteger(length) || end > buffer.length) throw new Error('Incomplete Flight frame.');
      if (tag === 'T') {
        const text = Buffer.from(rewriteText(buffer.subarray(comma + 1, end).toString('utf8')));
        output.push(buffer.subarray(offset, colon + 2), Buffer.from(text.length.toString(16) + ','), text);
      } else {
        // Typed arrays and other binary frames must remain byte-for-byte intact.
        output.push(buffer.subarray(offset, end));
      }
      offset = end;
    } else {
      const newline = buffer.indexOf(10, colon + 1);
      if (newline < 0) throw new Error('Incomplete Flight record.');
      output.push(Buffer.from(rewriteText(buffer.subarray(offset, newline + 1).toString('utf8'))));
      offset = newline + 1;
    }
  }
  return Buffer.concat(output);
}

function rewriteInlineFlight(html, rewriteText) {
  const pushes = [];
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const scriptStart = script.index + script[0].indexOf('>') + 1;
    for (const push of script[1].matchAll(/\.rsc\.push\(("(?:\\.|[^"\\])*")\)/g)) {
      pushes.push({ start: scriptStart + push.index, end: scriptStart + push.index + push[0].length,
        value: JSON.parse(push[1]) });
    }
  }
  if (!pushes.length) return rewriteText(html);
  const flight = rewriteFlight(Buffer.from(pushes.map(push => push.value).join('')), rewriteText);
  const encoded = JSON.stringify(flight.toString('utf8')).replace(/[<>&\u2028\u2029]/g,
    value => '\\u' + value.charCodeAt(0).toString(16).padStart(4, '0'));
  let output = '';
  let offset = 0;
  for (let i = 0; i < pushes.length; i++) {
    const push = pushes[i];
    output += rewriteText(html.slice(offset, push.start));
    // Keep the existing bootstrap and completion scripts in their original order.
    output += `.rsc.push(${i === 0 ? encoded : '""'})`;
    offset = push.end;
  }
  return output + rewriteText(html.slice(offset));
}

function createMalafakServer(options = {}) {
  const port = Number(options.port ?? process.env.PORT ?? 10000);
  const upstream = originURL(options.upstream || process.env.UPSTREAM_ORIGIN || DEFAULT_UPSTREAM);
  const publicURL = originURL(options.publicOrigin || process.env.PUBLIC_ORIGIN ||
    process.env.RENDER_EXTERNAL_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
    (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) || `http://127.0.0.1:${port}`);
  const canonicalURL = originURL(options.canonicalOrigin || publicURL.origin);
  const indexable = options.indexable !== false;
  // Respect the deployment's existing network proxy settings, when present.
  const agentOptions = { keepAlive: true, maxSockets: 64, maxFreeSockets: 8, proxyEnv: process.env };
  const agent = upstream.protocol === 'https:' ? new https.Agent(agentOptions) : new http.Agent(agentOptions);

  function rewriteOrigins(text) {
    return text.replaceAll(upstream.origin, publicURL.origin)
      .replaceAll(BRAND_ORIGIN, publicURL.origin);
  }

  const server = http.createServer({ requestTimeout: 75000, headersTimeout: 15000 }, (request, response) => {
    let incoming;
    try {
      if (!request.url.startsWith('/') || request.url.startsWith('//')) throw new Error();
      incoming = new URL(request.url, publicURL);
      if (incoming.origin !== publicURL.origin || /%2f|%5c|%00/i.test(incoming.pathname)) throw new Error();
    } catch { fail(response, 400, 'عنوان الطلب غير صحيح.'); return; }

    const method = request.method || 'GET';
    const read = method === 'GET' || method === 'HEAD';
    if (incoming.pathname === '/health' && read) {
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(method === 'HEAD' ? undefined : '{"ok":true}');
      return;
    }
    if (request.headers.host !== publicURL.host) {
      fail(response, 421, 'عنوان الموقع غير صحيح.'); return;
    }

    // Owner authentication stays at the existing, authenticated Site.
    // Never accept an owner identity from a visitor-supplied header.
    if (/^\/(?:admin|signin-with-chatgpt|signout-with-chatgpt|callback|chatgpt-auth)(?:\/|$)/.test(incoming.pathname)) {
      if (!read) { fail(response, 403, 'افتح لوحة التحكم من الموقع الأصلي.'); return; }
      response.writeHead(302, {
        location: upstream.origin + incoming.pathname + incoming.search,
        'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex',
      });
      response.end(); return;
    }

    const allowedWrite = (method === 'POST' && incoming.pathname === '/api/shares') ||
      (['PUT', 'DELETE'].includes(method) && /^\/api\/shares\/[a-f0-9]{32}$/.test(incoming.pathname));
    if (!read && !allowedWrite) { fail(response, 405, 'الطلب غير مسموح من هذا المسار.'); return; }
    if (allowedWrite && request.headers.origin !== publicURL.origin) {
      fail(response, 403, 'طلب غير مسموح.'); return;
    }
    const byteLimit = method === 'POST' ? 16384 : 10 * 1024 * 1024;
    if (allowedWrite && Number(request.headers['content-length'] || 0) > byteLimit) {
      request.resume(); fail(response, 413, 'الملف أكبر من الحد المسموح.'); return;
    }

    if (incoming.pathname === '/robots.txt' && read) {
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      response.end(method === 'HEAD' ? undefined : !indexable ? 'User-agent: *\nDisallow: /\n' :
        `User-agent: *\nAllow: /$\nDisallow: /admin\nDisallow: /api/\nDisallow: /share\nDisallow: /s/\nDisallow: /signin-with-chatgpt\nDisallow: /signout-with-chatgpt\nDisallow: /callback\nSitemap: ${publicURL.origin}/sitemap.xml\n`);
      return;
    }
    if (incoming.pathname === '/sitemap.xml' && read) {
      response.writeHead(200, { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'no-store' });
      response.end(method === 'HEAD' ? undefined :
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${canonicalURL.origin}/</loc></url></urlset>`);
      return;
    }

    const target = new URL(upstream.origin + incoming.pathname + incoming.search);
    const headers = filteredHeaders(request.headers, true);
    headers.host = upstream.host;
    headers['accept-encoding'] = 'identity';
    const cookie = publicCookieHeader(request.headers.cookie);
    if (cookie) headers.cookie = cookie;
    if (request.headers.origin === publicURL.origin) headers.origin = upstream.origin;
    else if (request.headers.origin) headers.origin = request.headers.origin;
    if (request.headers.referer) {
      try {
        const referrer = new URL(request.headers.referer);
        if (referrer.origin === publicURL.origin) headers.referer = upstream.origin + referrer.pathname;
      } catch { /* No referrer is needed for public reads. */ }
    }

    const transport = upstream.protocol === 'https:' ? https : http;
    const proxy = transport.request(target, { method, headers, agent }, original => {
      const outgoing = filteredHeaders(original.headers);
      if (!indexable) outgoing['x-robots-tag'] = 'noindex, nofollow';
      delete outgoing['set-cookie'];
      const cookies = publicSetCookies(original.headers['set-cookie']);
      if (cookies.length) outgoing['set-cookie'] = cookies;
      if (outgoing.location) {
        try {
          const destination = new URL(outgoing.location, upstream);
          if ([upstream.origin, BRAND_ORIGIN].includes(destination.origin)) {
            const owner = /^\/(?:admin|signin-with-chatgpt|signout-with-chatgpt|callback)(?:\/|$)/.test(destination.pathname);
            outgoing.location = (owner ? upstream.origin : publicURL.origin) + destination.pathname + destination.search + destination.hash;
          }
        } catch { delete outgoing.location; }
      }
      for (const name of ['content-security-policy', 'content-security-policy-report-only', 'link']) {
        if (typeof outgoing[name] === 'string') outgoing[name] = rewriteOrigins(outgoing[name]);
      }
      const contentType = String(outgoing['content-type'] || '').toLowerCase();
      const transform = method !== 'HEAD' && original.statusCode === 200 &&
        !outgoing['content-encoding'] &&
        (contentType.includes('text/html') || contentType.includes('text/x-component'));
      if (!transform) {
        response.writeHead(original.statusCode || 502, outgoing);
        // pipe preserves backpressure without pipeline's extra close listeners
        // on a response already monitored by the serverless runtime. Explicitly
        // handle an interrupted upstream so a partial download cannot hang.
        const interrupted = () => response.destroy();
        original.once('error', interrupted);
        original.once('aborted', interrupted);
        original.once('close', () => {
          original.removeListener('error', interrupted);
          original.removeListener('aborted', interrupted);
        });
        original.pipe(response);
        return;
      }
      const chunks = [];
      let bytes = 0;
      original.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 2 * 1024 * 1024) {
          original.destroy(); fail(response, 502, 'تعذر تحميل الصفحة.');
        } else chunks.push(chunk);
      });
      original.on('error', () => fail(response, 502, 'تعذر الاتصال بالموقع.'));
      original.on('end', () => {
        if (response.destroyed || response.writableEnded) return;
        const rewriteText = text => {
          const rewritten = rewriteOrigins(text);
          return indexable && incoming.pathname === '/' ? rewritten.replace(/noindex,\s*nofollow/g, 'index, follow') : rewritten;
        };
        let body;
        try {
          const buffer = Buffer.concat(chunks);
          body = contentType.includes('text/x-component') ? rewriteFlight(buffer, rewriteText) :
            rewriteInlineFlight(buffer.toString('utf8'), rewriteText);
        } catch {
          fail(response, 502, 'تعذر تحميل بيانات الصفحة.'); return;
        }
        if (incoming.pathname === '/') {
          if (contentType.includes('text/html')) {
            body = body.replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/ig, '');
            body = body.replace('</head>', `${GOOGLE_VERIFICATION_TAG}<link rel="canonical" href="${canonicalURL.origin}/"></head>`);
          }
          if (indexable) delete outgoing['x-robots-tag'];
        }
        delete outgoing['content-length']; delete outgoing.etag; delete outgoing['content-md5'];
        outgoing['cache-control'] = 'no-store, must-revalidate';
        response.writeHead(original.statusCode, outgoing);
        response.end(body);
      });
    });
    proxy.setTimeout(65000, () => proxy.destroy(new Error('timeout')));
    proxy.on('error', () => fail(response, 502, 'تعذر الاتصال بالموقع. حاول مرة أخرى.'));
    const cancel = () => proxy.destroy();
    function cleanup() {
      request.removeListener('aborted', cancel);
      response.removeListener('error', cancel);
      response.removeListener('finish', cleanup);
      response.removeListener('close', closed);
    }
    function closed() {
      if (!response.writableFinished) cancel();
      cleanup();
    }
    request.once('aborted', cancel);
    response.once('error', cancel);
    response.once('finish', cleanup);
    response.once('close', closed);
    if (allowedWrite) {
      let bytes = 0;
      request.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > byteLimit) { request.unpipe(proxy); proxy.destroy(); request.resume(); fail(response, 413, 'الملف أكبر من الحد المسموح.'); }
      });
      request.pipe(proxy);
    } else proxy.end();
  });
  server.on('close', () => agent.destroy());
  return server;
}

module.exports = { createMalafakServer, rewriteFlight, rewriteInlineFlight };

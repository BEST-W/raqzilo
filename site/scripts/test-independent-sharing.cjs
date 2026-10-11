const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
const { createClient } = require('@libsql/client');
let client;
function compile(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, URL, Headers, Request, Response, TextEncoder, TextDecoder, Uint8Array, Buffer, Error, crypto: webcrypto, setTimeout, clearTimeout, console, process: { env: { TURSO_DATABASE_URL: 'file::memory:' } }, require: name => Object.hasOwn(mocks, name) ? mocks[name] : require(name) }, { filename: file });
  return module.exports;
}
const db = compile('lib/database.ts', { 'server-only': {}, '@libsql/client': { createClient(options) { client = createClient(options); return client; } } }).database;
const origin = 'https://raqzilo.vercel.app';
let owner = false, enabled = true, failure = false, signed;
const stored = new Map();
const files = {
  async delete(path) { if (failure) throw Error('storage fixture failure'); stored.delete(path); },
  async head(path) { const bytes = stored.get(path); return bytes ? { size: bytes.length, httpEtag: 'fixture-etag' } : null; },
  async get(path, options) { if (failure) throw Error('storage fixture failure'); const bytes = stored.get(path); return bytes ? { size: bytes.length, httpEtag: 'fixture-etag', body: options ? bytes.slice(options.range.offset, options.range.offset + options.range.length) : new Blob([bytes]).stream() } : null; },
};
const server = compile('lib/sharing-server.ts', {
  './database': { database: db }, './file-storage': { files }, './sharing-model': compile('lib/sharing-model.ts'), './request-origin': compile('lib/request-origin.ts'),
  './settings-server': { readSettings: async () => ({ settings: { maintenance: false, tools: { share: enabled } } }), ownerStatus: async () => ({ allowed: owner }) },
  '@vercel/blob': { issueSignedToken: async options => { signed = options; return { delegationToken: 'fixture', clientSigningToken: 'fixture', validUntil: options.validUntil }; } },
  '@vercel/blob/client': { handleUploadPresigned: async ({ body, getSignedToken }) => ({ result: await getSignedToken(body.payload.pathname, body.payload.clientPayload, body.payload.multipart) }) },
});
const bytes = new TextEncoder().encode('%PDF-1.7\nfixture PDF\n%%EOF\n');
const request = (path, method = 'GET', body, cookie, headers = {}) => new Request(origin + path, { method, headers: { origin, ...(cookie ? { cookie } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const errorStatus = async (work, status) => { try { await work; assert.fail('expected rejection'); } catch (error) { assert.equal(error.status, status); } };
async function grant(cookie, size = bytes.length) {
  const result = await server.createShare(request('/api/shares', 'POST', { filename: 'ملف الاختبار.pdf', size, consent: true }, cookie));
  return { ...await result.json(), cookie: result.headers.get('set-cookie').split(';')[0] };
}
const authorize = (item, pathname = 'pdf-shares/' + item.id + '.pdf', cookie = item.cookie) => server.authorizeBlobUpload(request('/api/shares/upload', 'POST', { type: 'blob.generate-presigned-url', payload: { pathname, clientPayload: item.id, multipart: false } }, cookie, { 'x-upload-token': item.uploadToken }));
const complete = item => server.uploadShare(request('/api/shares/' + item.id, 'PUT', undefined, item.cookie, { 'x-upload-token': item.uploadToken }), item.id);
async function clear() { await db.batch([db.prepare('DELETE FROM pdf_shares'), db.prepare('DELETE FROM share_events')]); stored.clear(); }
(async () => {
  await db.prepare('SELECT count(*) FROM pdf_shares').first();
  const simultaneous = await Promise.allSettled(Array.from({ length: 8 }, () => grant()));
  assert.equal(simultaneous.filter(item => item.status === 'fulfilled').length, 3);
  assert.equal((await db.prepare('SELECT count(*) AS count FROM pdf_shares').first()).count, 3);
  await clear();
  await errorStatus(server.createShare(request('/api/shares', 'POST', { filename: 'a.pdf', size: 10 * 1024 * 1024 + 1, consent: true })), 413);
  enabled = false; await errorStatus(grant(), 403); enabled = true;
  const item = await grant();
  await errorStatus(authorize(item, 'other.pdf'), 403);
  await errorStatus(authorize(item, undefined, 'pdf-share-device=' + 'a'.repeat(64)), 403);
  await errorStatus(server.authorizeBlobUpload(request('/api/shares/upload', 'POST', { type: 'blob.generate-presigned-url' }, item.cookie, { origin: 'https://other.test' })), 403);
  await authorize(item);
  assert.equal(signed.pathname, 'pdf-shares/' + item.id + '.pdf');
  assert.deepEqual(Array.from(signed.operations), ['put']);
  assert.deepEqual(Array.from(signed.allowedContentTypes), ['application/pdf']);
  assert.equal(signed.maximumSizeInBytes, bytes.length); assert(signed.validUntil > Date.now());
  await errorStatus(authorize(item), 403);
  stored.set('pdf-shares/' + item.id + '.pdf', bytes);
  assert.equal((await complete(item)).status, 200);
  await errorStatus(complete(item), 403);
  const response = await server.serveSharedFile(request('/api/shares/' + item.id + '/file'), item.id);
  assert.equal(response.status, 200); assert.equal(await response.text(), new TextDecoder().decode(bytes));
  assert(response.headers.get('content-disposition').includes(encodeURIComponent('ملف الاختبار.pdf')));
  assert(response.headers.get('x-robots-tag').includes('noindex'));
  const head = await server.serveSharedFile(request('/file', 'HEAD'), item.id); assert.equal(head.headers.get('content-length'), String(bytes.length));
  const range = await server.serveSharedFile(request('/file', 'GET', undefined, undefined, { range: 'bytes=0-3' }), item.id);
  assert.equal(range.status, 206); assert.equal(await range.text(), '%PDF');
  assert.equal((await server.serveSharedFile(request('/file', 'GET', undefined, undefined, { range: 'bytes=9999-' }), item.id)).status, 416);
  assert.equal((await (await server.listShares(request('/api/shares'))).json()).items.length, 0);
  assert.equal((await (await server.listShares(request('/api/shares', 'GET', undefined, item.cookie))).json()).items.length, 1);
  await errorStatus(server.listShares(request('/api/shares?scope=all')), 403);
  await errorStatus(server.deleteShare(request('/file', 'DELETE'), item.id), 403);
  owner = true; assert.equal((await (await server.listShares(request('/api/shares?scope=all'))).json()).items.length, 1);
  assert.equal((await server.deleteShare(request('/file', 'DELETE'), item.id)).status, 200); owner = false;
  assert.equal(stored.size, 0);
  const invalid = await grant(); await authorize(invalid); stored.set('pdf-shares/' + invalid.id + '.pdf', new Uint8Array(bytes.length));
  await errorStatus(complete(invalid), 400); assert.equal(stored.size, 0);
  assert.equal(await db.prepare('SELECT id FROM pdf_shares WHERE id = ?').bind(invalid.id).first(), null);
  const expired = await grant(); await db.prepare('UPDATE pdf_shares SET upload_expires = 0 WHERE id = ?').bind(expired.id).run();
  await errorStatus(authorize(expired), 403); await grant();
  assert.equal(await db.prepare('SELECT id FROM pdf_shares WHERE id = ?').bind(expired.id).first(), null);
  console.log('PASS: real SQLite transactions, concurrent quotas, scoped direct uploads, creator/owner permissions, PDF validation, cleanup, private files, range and HEAD');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => client?.close());

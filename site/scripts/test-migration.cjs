const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { createClient } = require('@libsql/client');
let client, reads = [], puts = [], deleted = [];
const token = 'b'.repeat(64);
const environment = { TURSO_DATABASE_URL: 'file::memory:', MIGRATION_TOKEN: token, MIGRATION_EXPIRES: String(Date.now() + 60000) };
function compile(file, mocks = {}, extra = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, process: { env: environment }, Buffer, URL, Headers, Request, Response, TextDecoder, TextEncoder, Uint8Array, Date, AbortSignal, Error, ...extra, require: name => Object.hasOwn(mocks, name) ? mocks[name] : require(name) }, { filename: file });
  return module.exports;
}
const db = compile('lib/database.ts', { 'server-only': {}, '@libsql/client': { createClient(options) { client = createClient(options); return client; } } }).database;
const model = compile('lib/settings-model.ts', { './brand': compile('lib/brand.ts') });
const bytes = new TextEncoder().encode('%PDF-1.7\nmigration fixture\n%%EOF');
const stored = new Map();
let fail = false;
const { migrateData } = compile('lib/migrate-data.ts', {
  'server-only': {}, './database': { database: db }, './settings-model': model, './sharing-model': compile('lib/sharing-model.ts'), './owner-auth-core': compile('lib/owner-auth-core.ts'),
  './sharing-server': { boundedBody: async (request, max) => { const data = new Uint8Array(await request.arrayBuffer()); if (data.length > max) throw Error('too large'); return data; } },
  './file-storage': { files: {
    async head(path) { return stored.has(path) ? { size: stored.get(path).length } : null; },
    async put(path, data) { puts.push(path); stored.set(path, data); },
    async delete(path) { deleted.push(path); stored.delete(path); },
  } },
}, { fetch: async (url, options) => { reads.push({ url, options }); return new Response(fail ? new Uint8Array(bytes.length) : bytes); } });
const row = { id: 'a'.repeat(32), filename: 'عقد.pdf', size: bytes.length, creator_hash: 'c'.repeat(64), created_at: 1000 };
const manifest = { settings: { config: model.defaultSettings, revision: 4, updated_at: '2026-10-11T00:00:00.000Z' }, shares: [row] };
const request = (body = manifest, bearer = token) => new Request('https://candidate.test/api/migration', { method: 'POST', headers: { authorization: 'Bearer ' + bearer }, body: JSON.stringify(body) });
(async () => {
  assert.equal((await migrateData(request(undefined, 'a'.repeat(64)))).status, 404);
  environment.MIGRATION_EXPIRES = '1'; assert.equal((await migrateData(request())).status, 404); environment.MIGRATION_EXPIRES = String(Date.now() + 60000);
  fail = true; await assert.rejects(migrateData(request()), /Source PDF validation failed/); assert.equal(stored.size, 0);
  fail = false; const result = await migrateData(request()); assert.equal(result.status, 200); assert.equal((await result.json()).files, 1);
  assert.equal(reads[reads.length - 1].url, 'https://raqzilo.vercel.app/api/shares/' + row.id + '/file'); assert.equal(reads[0].options.redirect, 'error');
  assert.deepEqual(Array.from(stored.get('pdf-shares/' + row.id + '.pdf')), Array.from(bytes));
  const saved = await db.prepare('SELECT * FROM pdf_shares WHERE id = ?').bind(row.id).first(); assert.equal(saved.creator_hash, row.creator_hash); assert.equal(saved.filename, row.filename); assert.equal(saved.status, 'ready'); assert.equal(saved.upload_hash, '');
  const settings = await db.prepare('SELECT * FROM site_settings').first(); assert.equal(settings.revision, 4);
  const count = reads.length; assert.equal((await migrateData(request())).status, 200); assert.equal(reads.length, count); assert.equal(puts.length, 1);
  await db.prepare('DELETE FROM migration_state').run();
  await assert.rejects(migrateData(request({ ...manifest, shares: [{ ...row, filename: 'changed.pdf' }] })), /Share changed/);
  await assert.rejects(migrateData(request({ ...manifest, shares: [{ ...row, id: '../outside' }] })));
  await assert.rejects(migrateData(request({ ...manifest, settings: { ...manifest.settings, revision: 2 } })), /Settings changed/);
  assert.equal(deleted.length, 0);
  console.log('PASS: private expiring import, fixed source host, validated bytes, preserved share IDs/creator capabilities/settings, resumable and completed imports, conflict refusal');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => client?.close());

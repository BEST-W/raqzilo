const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { randomBytes } = require('node:crypto');

(async () => {
  const folder = await mkdtemp(join(tmpdir(), 'raqzilo-http-'));
  const token = randomBytes(32).toString('hex');
  const password = 'independent owner fixture password';
  const origin = 'http://127.0.0.1:3118';
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3118'], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', TURSO_DATABASE_URL: 'file:' + join(folder, 'test.db'), TURSO_AUTH_TOKEN: '', OWNER_SETUP_TOKEN: token, OWNER_SETUP_EXPIRES: String(Date.now() + 3600000) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  const call = (path, body, cookie, extra = {}) => fetch(origin + path, { method: body === undefined ? 'GET' : 'POST', redirect: 'manual', headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  try {
    let ready = false;
    for (let i = 0; i < 160; i++) { try { const result = await call('/api/settings'); if (result.ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 250)); }
    assert(ready, 'Next server failed to start: ' + output.slice(-1500));
    const home = await (await call('/', undefined, undefined, { 'accept-language': 'en-US' })).text();
    assert(home.includes('lang="en"')); assert(home.includes('Choose PDF file')); assert(!home.includes('class="admin-link"'));
    assert(home.includes('igXaVHtprFJQ2Ec484l3KIr0dWpe8RxLuQokknki5cE'));
    const arabic = await (await call('/', undefined, undefined, { 'accept-language': 'ar-SA' })).text(); assert(arabic.includes('lang="ar"')); assert(arabic.includes('dir="rtl"'));
    const admin = await (await call('/admin')).text(); assert(admin.includes('Owner sign in')); assert(!admin.includes('signin-with-chatgpt')); assert(!admin.includes('Save changes'));
    const current = await (await call('/api/settings')).json();
    const save = (settings, revision, cookie, extra = {}) => fetch(origin + '/api/settings', { method: 'PUT', headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...extra }, body: JSON.stringify({ settings, revision }) });
    assert.equal((await save(current.settings, current.revision, undefined, { 'oai-authenticated-user-id': 'forged', 'oai-authenticated-user-email': 'forged@example.test' })).status, 403);
    assert.equal((await call('/api/owner/setup', { token, password }, undefined, { origin: 'https://other.test' })).status, 403);
    assert.equal((await call('/api/owner/setup', { token: '0'.repeat(64), password })).status, 403);
    const setup = await call('/api/owner/setup', { token, password }); assert.equal(setup.status, 200, await setup.text());
    const cookieHeader = setup.headers.get('set-cookie'); assert(cookieHeader.includes('HttpOnly')); assert(cookieHeader.includes('SameSite=Strict'));
    const cookie = cookieHeader.split(';')[0];
    const owner = await (await call('/admin', undefined, cookie)).text(); assert(owner.includes('BEST-W')); assert(owner.includes('Save changes')); assert(!owner.includes('signin-with-chatgpt'));
    const changed = { ...current.settings, nameEn: 'Independent fixture', announcementEn: 'Persistence verified' };
    const saved = await save(changed, current.revision, cookie); assert.equal(saved.status, 200);
    const after = await saved.json(); assert.equal(after.revision, current.revision + 1);
    assert.equal((await save(changed, current.revision, cookie)).status, 409);
    assert.equal((await (await call('/api/settings')).json()).settings.announcementEn, 'Persistence verified');
    assert.equal((await call('/api/owner/setup', { token, password })).status, 403);
    assert.equal((await call('/api/owner/logout', {}, cookie)).status, 303);
    assert.equal((await save(changed, after.revision, cookie)).status, 403);
    assert.equal((await call('/api/owner/login', { password: 'wrong fixture password' })).status, 401);
    const login = await call('/api/owner/login', { password }); assert.equal(login.status, 200);
    assert.notEqual(login.headers.get('set-cookie').split(';')[0], cookie);
    for (const path of ['/vendor/mupdf/mupdf.js', '/vendor/mupdf/mupdf-wasm.wasm', '/vendor/ocr/tesseract.esm.min.js', '/vendor/ocr/worker.min.js', '/vendor/ocr/lang/ara.traineddata.gz', '/vendor/ocr/lang/eng.traineddata.gz', '/fonts/DejaVuSans.ttf', '/source.zip']) {
      const result = await call(path); assert.equal(result.status, 200, path); assert((await result.arrayBuffer()).byteLength > 100, path);
    }
    console.log('PASS: built Next HTTP app, automatic languages, own-password activation/login/logout, forged-header rejection, CSRF, saved settings/conflicts, single-use setup, PDF/OCR/source assets');
  } finally {
    child.kill('SIGTERM'); await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve); }); await rm(folder, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

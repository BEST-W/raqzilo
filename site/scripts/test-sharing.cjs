const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const {createRequire}=require('node:module');
const {PDFDocument}=require('pdf-lib');
const {Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
function compile(file,mocks={}) {
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,require:name=>Object.hasOwn(mocks,name)?mocks[name]:require(name),Error,TypeError,SyntaxError,URL,Request,Response,Headers,Uint8Array,TextEncoder,TextDecoder,crypto:globalThis.crypto,setTimeout,clearTimeout,console},{filename:file});
  return module.exports;
}
(async()=>{
  const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-15',d1Databases:['DB'],r2Buckets:['FILES']});
  try {
    const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('FILES');
    for(const file of fs.readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort())for(const sql of fs.readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
    const model=compile('lib/sharing-model.ts');let owner=false,enabled=true,failPut=false;
    const files={put:(...args)=>failPut?Promise.reject(new Error('test storage failure')):bucket.put(...args),get:(...args)=>bucket.get(...args),head:(...args)=>bucket.head(...args),delete:(...args)=>bucket.delete(...args)};
    const server=compile('lib/sharing-server.ts',{'cloudflare:workers':{env:{DB:db,FILES:files}},'./sharing-model':model,'./settings-server':{readSettings:async()=>({settings:{maintenance:false,tools:{share:enabled}}}),ownerStatus:async()=>({allowed:owner})}});
    const origin='https://pdf.example.test';
    const request=(path,method='GET',body,headers={})=>new Request(origin+path,{method,headers:{origin,...headers},...(body===undefined?{}:{body})});
    const call=async(fn,...args)=>{try{return await fn(...args);}catch(e){return server.shareFailure(e);}};
    const pdf=await PDFDocument.create();pdf.addPage().drawText('Sharing integration fixture');const data=await pdf.save();
    const grant=async(cookie,extra={})=>call(server.createShare,request('/api/shares','POST',JSON.stringify({filename:'عقد تجربة.pdf',size:data.length,consent:true,...extra}),{'Content-Type':'application/json',...(cookie?{cookie}:{})}));
    let response=await grant();assert.equal(response.status,200);const cookie=response.headers.get('set-cookie').split(';')[0];assert(response.headers.get('set-cookie').includes('HttpOnly'));assert(response.headers.get('set-cookie').includes('Secure'));
    const policy=response.headers.get('set-cookie');
    assert(policy.includes('SameSite=None'),'HTTPS sharing must allow the embedded preview context');
    assert(policy.includes('Partitioned'),'The embedded creator capability must be partitioned by the top-level site');
    assert(!policy.includes('SameSite=Lax'),'Lax cookies cannot be set by a cross-site iframe');
    let auth=await response.json();assert.match(auth.id,/^[a-f0-9]{32}$/);assert.match(auth.uploadToken,/^[a-f0-9]{64}$/);
    const upload=(info,secret=cookie,bytes=data)=>call(server.uploadShare,request('/api/shares/'+info.id,'PUT',bytes,{cookie:secret,'X-Upload-Token':info.uploadToken}),info.id);
    assert.equal((await upload(auth,model.SHARE_COOKIE+'='+'a'.repeat(64))).status,403);
    response=await upload(auth);assert.equal(response.status,200);const shared=(await response.json()).file;assert.equal(shared.filename,'عقد تجربة.pdf');assert.equal(shared.path,'/api/shares/'+auth.id+'/file');assert(!JSON.stringify(shared).includes('hash'));
    assert.equal((await upload(auth)).status,403);
    response=await call(server.serveSharedFile,request(shared.path),auth.id);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/pdf');assert.equal(response.headers.get('cache-control'),'no-store');assert(response.headers.get('content-disposition').includes(encodeURIComponent('عقد تجربة.pdf')));assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from(data));
    response=await call(server.serveSharedFile,request('/api/shares/'+auth.id+'/file','HEAD'),auth.id);assert.equal(response.status,200);assert.equal(response.headers.get('content-length'),String(data.length));assert.equal((await response.arrayBuffer()).byteLength,0);
    response=await call(server.serveSharedFile,request('/api/shares/'+auth.id+'/file','GET',undefined,{range:'bytes=0-19'}),auth.id);assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes 0-19/${data.length}`);assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from(data.subarray(0,20)));
    response=await call(server.serveSharedFile,request('/api/shares/'+auth.id+'/file','GET',undefined,{range:'bytes=-12'}),auth.id);assert.equal(response.status,206);assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from(data.subarray(data.length-12)));
    assert.equal((await call(server.serveSharedFile,request('/file','GET',undefined,{range:'bytes=999999-'}),auth.id)).status,416);
    response=await call(server.serveSharedFile,request('/file?download=1'),auth.id);assert(response.headers.get('content-disposition').startsWith('attachment'));
    assert.equal((await (await call(server.listShares,request('/api/shares'))).json()).items.length,0);
    const own=await (await call(server.listShares,request('/api/shares','GET',undefined,{cookie}))).json();assert.equal(own.items.length,1);assert.equal(own.items[0].id,auth.id);assert(!own.storage);assert(!JSON.stringify(own).includes('creator_hash'));
    assert.equal((await call(server.listShares,request('/api/shares?scope=all'))).status,403);
    assert.equal((await call(server.deleteShare,request('/api/shares/'+auth.id,'DELETE'),auth.id)).status,403);
    assert.equal((await call(server.deleteShare,request('/api/shares/'+auth.id,'DELETE',undefined,{cookie,origin:'https://evil.test'}),auth.id)).status,403);
    assert.equal((await call(server.createShare,request('/api/shares','POST','{}',{origin:'https://evil.test'}))).status,403);
    assert.equal((await grant(cookie,{consent:false})).status,400);assert.equal((await grant(cookie,{size:model.SHARE_MAX_BYTES+1})).status,413);
    enabled=false;assert.equal((await grant(cookie)).status,403);enabled=true;
    response=await grant(cookie);let invalid=await response.json();assert.equal((await upload(invalid,cookie,new Uint8Array(data.length))).status,400);assert.equal(await bucket.head('pdf-shares/'+invalid.id+'.pdf'),null);assert.equal(await db.prepare('SELECT id FROM pdf_shares WHERE id=?').bind(invalid.id).first(),null);
    response=await grant(cookie);let failed=await response.json();failPut=true;assert.equal((await upload(failed)).status,503);failPut=false;assert.equal(await db.prepare('SELECT id FROM pdf_shares WHERE id=?').bind(failed.id).first(),null);
    owner=true;const all=await (await call(server.listShares,request('/api/shares?scope=all'))).json();assert.equal(all.items.length,1);assert.equal(all.storage.bytes,data.length);assert.equal(all.storage.maxBytes,model.SHARE_STORAGE_BYTES);
    assert.equal((await call(server.deleteShare,request('/api/shares/'+auth.id,'DELETE'),auth.id)).status,200);owner=false;assert.equal(await bucket.head('pdf-shares/'+auth.id+'.pdf'),null);assert.equal((await call(server.serveSharedFile,request('/file'),auth.id)).status,404);
    response=await grant(cookie);const creator=await response.json();assert.equal((await upload(creator)).status,200);assert.equal((await call(server.deleteShare,request('/delete','DELETE',undefined,{cookie}),creator.id)).status,200);
    response=await grant(cookie);const last=await response.json();assert.equal((await upload(last)).status,200);assert.equal((await grant(cookie)).status,429); // Delete does not reset the daily quota.
    await db.prepare('DELETE FROM pdf_shares').run();await db.prepare('DELETE FROM share_events').run();
    const simultaneous=await Promise.all(Array.from({length:8},()=>grant()));assert.equal(simultaneous.filter(r=>r.status===200).length,3);assert.equal(simultaneous.filter(r=>r.status===429).length,5);
    await db.prepare('UPDATE pdf_shares SET upload_expires=?').bind(Date.now()-1).run();
    await call(server.listShares,request('/api/shares','GET',undefined,{cookie}));assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM pdf_shares').first()).count,0);
    console.log('PASS: real D1/R2 PDF upload, durable read, Arabic names, download, HEAD/ranges, explicit consent, creator/owner authorization, deletion, cross-origin denial, invalid file and storage failure cleanup, daily and concurrent quotas, expired grant cleanup.');
  } finally {await mf.dispose();}
})().catch(error=>{console.error(error);process.exitCode=1;});

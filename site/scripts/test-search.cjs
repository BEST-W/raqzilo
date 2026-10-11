const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
function compile(file,mocks={}){
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,URL,Response,require:name=>mocks[name]??require(name)});
 return module.exports;
}
const config=compile('lib/search-config.ts');
const robots=compile('app/robots.txt/route.ts',{'@/lib/search-config':config});
const sitemap=compile('app/sitemap.xml/route.ts',{'@/lib/search-config':config});
(async()=>{
 for(const host of ['mustanad-pdf.abdulhadisa966.chatgpt.site','localhost:3000',null,'raqzilo.vercel.app.other.test']){
  const req=new Request('https://example.test/',{headers:host?{host}:{}});
  const rules=await robots.GET(req).text();
  assert(rules.includes('Allow: /$'));assert(!rules.includes('Sitemap:'));
  assert.equal(config.isPublicHost(host),false);
  assert.equal(sitemap.GET(req).status,404);
 }
 const req=new Request(config.publicOrigin,{headers:{host:'raqzilo.vercel.app'}});
 const text=await robots.GET(req).text();
 assert(text.includes('Sitemap: https://raqzilo.vercel.app/sitemap.xml'));
 for(const path of ['/admin','/api/','/s/','/share'])assert(text.includes('Disallow: '+path));
 const xml=await sitemap.GET(req).text();
 assert.equal((xml.match(/<loc>/g)||[]).length,1);
 assert(xml.includes('<loc>https://raqzilo.vercel.app/</loc>'));
 assert(!xml.includes('abdul'));
 const model=compile('lib/settings-model.ts', {'./brand':compile('lib/brand.ts')});
 assert.equal(model.defaultSettings.name,'راقزيلو');assert.equal(model.defaultSettings.nameEn,'Raqzilo');
 console.log('PASS: branded domain sitemap, account URL crawl protection, private routes excluded, Arabic/English branding');
})().catch(e=>{console.error(e);process.exitCode=1});

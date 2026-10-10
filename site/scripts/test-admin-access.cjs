const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
let identity=null;
let allowed=false;
let settingsReads=0;
const settings={name:'Private settings'};
function compile(file,mocks){
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const module={exports:{}};
 const context={module,exports:module.exports,URL,Headers,require:name=>Object.hasOwn(mocks,name)?mocks[name]:require(name)};
 vm.runInNewContext(code,context,{filename:file});
 return module.exports;
}
const auth=compile('app/chatgpt-auth.ts',{
 'next/headers':{headers:async()=>new Headers(identity?{'oai-authenticated-user-id':identity.userId,'oai-authenticated-user-email':identity.email}:{})},
 'next/navigation':{redirect(){throw new Error('An anonymous admin visit must render sign-in, not redirect silently.');}}
});
const Access=compile('components/admin-access.tsx',{
 '@/components/language-switcher':{__esModule:true,default:()=>null},
 '@/components/language-provider':{useLanguage:()=>({t:text=>text,dir:'rtl',language:'ar',message:text=>text})}
}).default;
const page=compile('app/admin/page.tsx',{
 '@/app/chatgpt-auth':auth,
 '@/components/admin-access':{__esModule:true,default:Access},
 '@/components/admin-panel':{__esModule:true,default:props=>React.createElement('div',{'data-admin-panel':true},props.initial.name)},
 '@/lib/settings-server':{ownerStatus:async()=>({allowed,user:identity}),readSettings:async()=>{settingsReads++;return{settings,revision:2};}}
}).default;
(async()=>{
 let html=renderToStaticMarkup(await page());
 assert(html.includes('الدخول إلى إدارة الموقع'));
 assert(html.includes('href="/signin-with-chatgpt?return_to=%2Fadmin"'));
 assert(html.includes('target="_top"'));
 assert.equal(settingsReads,0);
 assert(!html.includes('data-admin-panel'));
 identity={userId:'visitor',email:'visitor@example.test'};
 html=renderToStaticMarkup(await page());
 assert(html.includes('لوحة الإدارة خاصة بالمالك'));
 assert(html.includes('href="/signout-with-chatgpt?return_to=%2Fadmin"'));
 assert.equal(settingsReads,0);
 allowed=true;
 html=renderToStaticMarkup(await page());
 assert(html.includes('data-admin-panel'));
 assert.equal(settingsReads,1);
 assert.equal(auth.chatGPTSignInPath('https://example.test/'),'/signin-with-chatgpt?return_to=%2F');
 console.log('PASS: anonymous sign-in page, non-owner denied with account switch, owner panel, protected settings, safe auth return path');
})().catch(error=>{console.error(error);process.exitCode=1;});

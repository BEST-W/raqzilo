const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const dictionary=JSON.parse(fs.readFileSync('lib/english.json','utf8'));
const store=new Map();
let values=[],cursor=0,effects=[];
const fakeReact={
  createContext:()=>({Provider:'language-context'}),
  useState(initial){const at=cursor++;if(!(at in values))values[at]=initial;return[values[at],next=>{values[at]=next;}];},
  useEffect(effect){effects.push(effect);},
  useCallback:callback=>callback,
  useRef(initial){const at=cursor++;if(!(at in values))values[at]={current:initial};return values[at];},
};
const document={cookie:'',documentElement:{lang:'ar',dir:'rtl'}};
const storage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)};
const translations={languageCookie:'waraqira-language',translate:(language,key)=>language==='en'?dictionary[key]||key:key,translateMessage:(language,text)=>language==='en'?dictionary[text]||text:text};
const langModule={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/language-preference.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:langModule,exports:langModule.exports});
const navigator={languages:['ar-SA'],language:'ar-SA'};
const handlers=new Map();
const window={addEventListener:(type,fn)=>handlers.set(type,fn),removeEventListener:type=>handlers.delete(type)};
const mocks={'@/lib/language-preference':langModule.exports,'react':fakeReact,'@/lib/translations':translations,'@/components/ui/direction':{DirectionProvider:'direction-provider'}};
const source=ts.transpileModule(fs.readFileSync('components/language-provider.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleValue={exports:{}};
vm.runInNewContext(source,{module:moduleValue,exports:moduleValue.exports,document,navigator,window,localStorage:storage,location:{protocol:'https:'},require:name=>Object.hasOwn(mocks,name)?mocks[name]:require(name)});
const Provider=moduleValue.exports.LanguageProvider;
const child={id:'open-editor'};
function render(initialLanguage='ar',explicitLanguage){cursor=0;effects=[];const tree=Provider({initialLanguage,explicitLanguage,children:child});return{context:tree.props.value,children:tree.props.children.props.children};}
function commit(){effects.forEach(effect=>effect());}
let rendered=render();commit();
assert.equal(rendered.context.dir,'rtl');
rendered.context.setLanguage('en');
assert.equal(store.get('waraqira-language'),'en');
assert(document.cookie.includes('waraqira-language=en;'));
assert(document.cookie.includes('SameSite=Lax'));
assert(document.cookie.includes('Secure'));
rendered=render();commit();
assert.equal(rendered.context.language,'en');assert.equal(rendered.context.dir,'ltr');
assert.equal(document.documentElement.lang,'en');assert.equal(document.documentElement.dir,'ltr');
assert.equal(rendered.context.t('تنزيل PDF'),'Download PDF');
assert.equal(rendered.children,child,'Changing language must preserve the editor subtree');
// Simulate a fresh visit with no language cookie and the saved local preference.
values=[];rendered=render('ar');commit();rendered=render('ar');commit();
assert.equal(rendered.context.language,'en');
rendered.context.setLanguage('ar');rendered=render('en');commit();
assert.equal(rendered.context.language,'ar');assert.equal(document.documentElement.dir,'rtl');
// A cookie-provided preference still works with unavailable browser storage.
values=[];storage.getItem=()=>{throw new Error('Storage disabled');};storage.setItem=()=>{throw new Error('Storage disabled');};
rendered=render('en','en');commit();assert.equal(rendered.context.language,'en');
rendered.context.setLanguage('ar');assert(document.cookie.startsWith('waraqira-language=ar;'));
// A fresh browser follows device language and responds to language changes.
store.clear();storage.getItem=key=>store.get(key)||null;storage.setItem=(key,value)=>store.set(key,value);values=[];navigator.languages=['en-US','ar-SA'];
rendered=render('en');commit();rendered=render('en');commit();assert.equal(rendered.context.language,'en');
navigator.languages=['ar-SA'];handlers.get('languagechange')();rendered=render('en');commit();assert.equal(rendered.context.language,'ar');
rendered.context.setLanguage('en');navigator.languages=['ar-SA'];handlers.get('languagechange')();rendered=render('en');commit();assert.equal(rendered.context.language,'en','Explicit choice must survive device-language changes');
assert.equal(langModule.exports.requestLanguage(undefined,'en-US,en;q=0.9,ar;q=0.8'),'en');
assert.equal(langModule.exports.requestLanguage(undefined,'en;q=0.3,ar-SA;q=0.9'),'ar');
assert.equal(langModule.exports.requestLanguage('ar','en-US'),'ar');
assert.equal(langModule.exports.requestLanguage(undefined,'ar;q=0,en;q=0.5'),'en');
assert.equal(langModule.exports.requestLanguage(undefined,'fr-FR'),'en');
console.log('PASS: actual language provider switches text/direction, saves a secure preference, restores it, retains the editor subtree, and handles disabled storage.');

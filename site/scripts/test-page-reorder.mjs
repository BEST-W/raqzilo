import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as mupdf from 'mupdf';
import {PDFDocument,StandardFonts,degrees} from 'pdf-lib';
import * as engine from '../lib/pdf-engine.ts';
import {movedPageOrder,destinationFromSlot,remapPageMarks} from '../lib/page-order.ts';
engine.installEngineForTests(mupdf);
engine.installFontForTests(new Uint8Array(await fs.readFile('public/fonts/DejaVuSans.ttf')));
const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
for(let i=0;i<5;i++){const page=pdf.addPage([500+i*10,700]);page.drawText('ORIGINAL_PAGE_'+(i+1),{x:60,y:600,font,size:18});if(i===1)page.setRotation(degrees(90));}
const plain=await pdf.save();
const original=await engine.applyMarks(plain,[{id:'field',page:3,kind:'field',x:.1,y:.4,w:.5,h:.05,size:12,name:'contract_name',text:'Kept form value',color:'#20282b'}]);
const pending=[{id:'added-text',page:1,kind:'text',x:.1,y:.25,w:.6,h:.07,size:16,text:'PENDING_EDIT',color:'#20282b'},{id:'highlight',page:4,kind:'highlight',x:.1,y:.2,w:.6,h:.07,size:16,color:'#f8cf54'}];
const originalInfo=await engine.inspect(original);
const order=movedPageOrder(5,1,4);assert.deepEqual(order,[0,2,3,4,1]);
const afterMarks=remapPageMarks(pending,order);
assert.equal(afterMarks[0].page,4);assert.equal(afterMarks[1].page,3);assert.equal(pending[0].page,1);
const reordered=await engine.reorder(original,order),info=await engine.inspect(reordered);
assert.equal(info.length,5);assert.equal(info[4].width,originalInfo[1].width);assert.equal(info[4].height,originalInfo[1].height);
for(let i=0;i<order.length;i++){const rendered=await engine.renderPage(reordered,i,350);assert(rendered.lines.some(line=>line.text.includes('ORIGINAL_PAGE_'+(order[i]+1))),'native PDF page order must match the drop');}
const fields=await engine.readFields(reordered);assert.equal(fields[0].page,2);assert.equal(fields[0].value,'Kept form value');
const exported=await engine.applyMarks(reordered,afterMarks);
assert((await engine.renderPage(exported,4,350)).lines.some(line=>line.text.includes('PENDING_EDIT')));
assert(!(await engine.renderPage(exported,1,350)).lines.some(line=>line.text.includes('PENDING_EDIT')));
// Undo restores the unmodified bytes and original pending marks, keeping them editable.
const undoExport=await engine.applyMarks(original,pending);
assert((await engine.renderPage(undoExport,1,350)).lines.some(line=>line.text.includes('PENDING_EDIT')));
assert(!(await engine.renderPage(undoExport,4,350)).lines.some(line=>line.text.includes('PENDING_EDIT')));
assert.deepEqual(movedPageOrder(5,4,0),[4,0,1,2,3]);
assert.deepEqual(movedPageOrder(5,2,2),[0,1,2,3,4]);
assert.equal(destinationFromSlot(5,0,0),0);assert.equal(destinationFromSlot(5,0,1),0);assert.equal(destinationFromSlot(5,0,5),4);
assert.equal(destinationFromSlot(5,4,0),0);assert.equal(destinationFromSlot(5,3,2),2);
assert.throws(()=>movedPageOrder(5,-1,0));assert.throws(()=>movedPageOrder(5,0,5));assert.throws(()=>destinationFromSlot(5,0,6));
const longOrder=movedPageOrder(250,0,249);assert.equal(longOrder.length,250);assert.equal(new Set(longOrder).size,250);assert.equal(longOrder[249],0);
console.log('PASS: drop slots in both directions and no-op, real PDF page order, rotation/size, pending edits on correct pages, undo export, AcroForm retained, 250-page order');

// Exercise the actual editor callbacks, including editable marks and the Undo button.
const {default:ts}=await import('typescript');
const {default:vm}=await import('node:vm');
const {createRequire}=await import('node:module');
const require=createRequire(import.meta.url);
const model=await import('../lib/settings-model.ts');
const hookValues=[];let cursor=0,capturedDownload=null,effects=[],uiLanguage="ar";
const dictionary=JSON.parse(await fs.readFile("lib/english.json","utf8"));
const t=(source,values)=>{const text=uiLanguage==="en"?dictionary[source]||source:source;return values?text.replace(/\{(\w+)\}/g,(match,key)=>String(values[key]??match)):text;};
const fakeReact={useState(initial){const slot=cursor++;if(!(slot in hookValues))hookValues[slot]=initial;return[hookValues[slot],next=>{hookValues[slot]=typeof next==='function'?next(hookValues[slot]):next;}];},useRef(initial){const slot=cursor++;return hookValues[slot]??(hookValues[slot]={current:initial});},useEffect(effect,deps){effects.push({effect,deps});}};
const Rail=()=>null,Button=()=>null;
const stubs=new Proxy({},{get:()=>()=>null});
const source=ts.transpileModule(await fs.readFile('components/pdf-editor.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const moduleValue={exports:{}};
const mocks={'@/components/language-provider':{useLanguage:()=>({language:uiLanguage,dir:uiLanguage==='ar'?'rtl':'ltr',t,message:value=>value})},'@/lib/localized-settings':{getLocalizedToolEntries:(settings)=>model.getToolEntries(settings).map(entry=>({...entry,name:t(entry.name),description:t(entry.description)}))},'react':fakeReact,'@/lib/settings-model':model,'@/lib/page-order':{movedPageOrder,remapPageMarks},'@/lib/pdf-engine':{...engine,download:output=>{capturedDownload=output;}},'@/components/page-rail':{__esModule:true,default:Rail},'@/components/ui/button':{Button},'@/lib/browser-tools':{registerBrowserTools(){return()=>{};}}};
vm.runInNewContext(source,{module:moduleValue,exports:moduleValue.exports,Error,Uint8Array,ArrayBuffer,Blob,URL,window:{devicePixelRatio:1},crypto:globalThis.crypto,requestAnimationFrame:callback=>{callback();return 0;},require:name=>Object.hasOwn(mocks,name)?mocks[name]:name.startsWith('@/components/')?stubs:require(name)});
const Editor=moduleValue.exports.default;
function nodes(tree){if(Array.isArray(tree))return tree.flatMap(nodes);if(!tree||typeof tree!=='object')return[];return[tree,...nodes(tree.props?.children)];}
function renderEditor(){cursor=0;effects=[];return nodes(Editor({settings:model.defaultSettings}));}
function textOf(children){if(Array.isArray(children))return children.map(textOf).join('');if(typeof children==='string'||typeof children==='number')return String(children);return children?.props?textOf(children.props.children):'';}
function rail(){return renderEditor().find(node=>node.type===Rail).props;}
async function flush(){for(let i=0;i<200;i++){await new Promise(resolve=>setTimeout(resolve,0));if(!renderEditor().some(node=>node.props?.className==='busy-indicator')){const error=hookValues.find(value=>value?.error&&value?.text);if(error)throw new Error(error.text);return;}}throw new Error('editor callback did not finish');}
let tree=renderEditor();
const input=tree.find(node=>node.type==='input'&&node.props.accept==='application/pdf,.pdf'&&!node.props.multiple);
input.props.onChange({target:{files:[{name:'reorder.pdf',size:original.length,arrayBuffer:async()=>original.buffer.slice(original.byteOffset,original.byteOffset+original.byteLength)}],value:''}});
await flush();assert.equal(rail().pages.length,5);
uiLanguage="en";tree=renderEditor();assert.equal(rail().pages.length,5);assert(tree.some(node=>node.type===Button&&textOf(node.props.children).trim()==="Download PDF"));assert(tree.some(node=>node.type==="button"&&textOf(node.props.children)==="Text"));
uiLanguage="ar";assert.equal(rail().pages.length,5);
// Run the real page-render effect before enabling a paper gesture.
renderEditor();const drawEffect=effects.find(({deps})=>deps?.length===2&&deps[0] instanceof Uint8Array&&deps[1]===0);assert(drawEffect);
const stopRendering=drawEffect.effect();
for(let i=0;i<100;i++){await new Promise(resolve=>setTimeout(resolve,0));if(renderEditor().some(node=>node.props?.className==='page-image')&&!renderEditor().some(node=>node.props?.className==='page-loading'))break;}
assert(renderEditor().some(node=>node.props?.className==='page-image'));
// Add a text mark using the normal toolbar and paper gesture.
tree=renderEditor();tree.find(node=>node.type==='button'&&textOf(node.props.children)==='نص').props.onClick();
const paperNode={getBoundingClientRect:()=>({left:0,top:0,width:500,height:700}),setPointerCapture(){},hasPointerCapture:()=>false};
let paper=renderEditor().find(node=>node.props?.className==='paper');paper.props.ref.current=paperNode;
const pointer=(x,y)=>({button:0,pointerId:1,clientX:x,clientY:y,preventDefault(){}});
paper.props.onPointerDown(pointer(50,200));paper=renderEditor().find(node=>node.props?.className==='paper');paper.props.onPointerMove(pointer(330,260));paper=renderEditor().find(node=>node.props?.className==='paper');paper.props.onPointerUp(pointer(330,260));
assert(renderEditor().some(node=>textOf(node.props?.children)==='اكتب نصك هنا'));
rail().onMove(0,4);await flush();assert.equal(rail().page,4);
assert(renderEditor().some(node=>textOf(node.props?.children)==='اكتب نصك هنا'),'pending text must stay editable after moving its page');
renderEditor().find(node=>node.type===Button&&node.props['aria-label']==='تراجع').props.onClick();await flush();assert.equal(rail().page,0);
assert(renderEditor().some(node=>textOf(node.props?.children)==='اكتب نصك هنا'),'Undo must restore the text mark, not delete it');
rail().onMove(0,4);await flush();
renderEditor().find(node=>node.type===Button&&node.props.className==='brand-button download-button').props.onClick();await flush();assert(capturedDownload);
const saved=(await engine.renderPage(capturedDownload,4,350)).lines;
assert(saved.some(line=>line.text.includes('ORIGINAL_PAGE_1')));assert(saved.some(line=>/[\u0600-\u06ff]/.test(line.text)));
assert((await engine.renderPage(capturedDownload,0,350)).lines.some(line=>line.text.includes('ORIGINAL_PAGE_2')));
stopRendering();
console.log('PASS: actual editor file opening, text gesture, page move, selected-page tracking, Undo retaining editable text, and downloaded PDF order/content');

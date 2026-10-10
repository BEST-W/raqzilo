const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const modelCode=ts.transpileModule(fs.readFileSync('lib/page-order.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const modelModule={exports:{}};vm.runInNewContext(modelCode,{module:modelModule,exports:modelModule.exports,Error,require});
const code=ts.transpileModule(fs.readFileSync('components/page-rail.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const hooks=[];let cursor=0,nextFrame=0;const frames=new Map();
const hookReact={useRef(value){const index=cursor++;return hooks[index]??(hooks[index]={current:value});},useState(value){const index=cursor++;if(!(index in hooks))hooks[index]=value;return[hooks[index],next=>{hooks[index]=typeof next==='function'?next(hooks[index]):next;}];},useEffect(){},useId(){return'page-help';}};
const Button=()=>null;
const mocks={'react':hookReact,'@/components/ui/button':{Button},'@/lib/page-order':modelModule.exports};
const moduleValue={exports:{}};
vm.runInNewContext(code,{module:moduleValue,exports:moduleValue.exports,window:{innerWidth:1200,innerHeight:900},requestAnimationFrame:fn=>{const id=++nextFrame;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),setTimeout,clearTimeout,require:name=>Object.hasOwn(mocks,name)?mocks[name]:require(name)});
const PageRail=moduleValue.exports.default,moves=[],selections=[];
const props={pages:Array.from({length:3},()=>({width:595,height:842})),page:0,thumbnails:{},canArrange:true,busy:false,onMove:(from,to)=>moves.push([from,to]),onSelect:page=>selections.push(page),onRotate(){},onDelete(){}};
function flatten(tree){if(Array.isArray(tree))return tree.flatMap(flatten);if(!tree||typeof tree!=='object')return[];return[tree,...flatten(tree.props?.children)];}
function render(next=props){cursor=0;return flatten(PageRail(next));}
function thumbnails(tree){return tree.filter(node=>node.type==='button'&&node.props.className==='thumbnail');}
function event(node,x,y,type='mouse'){return{pointerId:1,isPrimary:true,button:0,pointerType:type,clientX:x,clientY:y,currentTarget:node,preventDefault(){}};}
function node(){const captured=new Set();return{focus(){},setPointerCapture:id=>captured.add(id),releasePointerCapture:id=>captured.delete(id),hasPointerCapture:id=>captured.has(id)};}
const list={scrollTop:0,getBoundingClientRect:()=>({left:100,right:200,top:0,bottom:360,height:360}),querySelectorAll:()=>props.pages.map((_,index)=>({dataset:{pageIndex:String(index)},getBoundingClientRect:()=>({top:index*120-list.scrollTop,height:100})})),querySelector:()=>node()};
let tree=render();tree.find(node=>node.props?.className==='page-thumbnails').props.ref.current=list;
let thumb=thumbnails(tree)[0],source=node();
thumb.props.onPointerDown(event(source,150,20));thumb.props.onPointerMove(event(source,150,325));
tree=render();assert(tree.some(node=>node.props?.className?.includes('drop-after')),'show an insertion indicator while dragging');
thumb.props.onPointerUp(event(source,150,325));thumb.props.onClick();assert.equal(selections.length,0,'dragging must not also navigate on click');assert.equal(moves.length,1);assert.equal(moves[0][0],0);assert.equal(moves[0][1],2);
// A normal click still opens a page.
tree=render();thumb=thumbnails(tree)[1];source=node();thumb.props.onPointerDown(event(source,150,140));thumb.props.onPointerUp(event(source,150,140));thumb.props.onClick();assert.equal(selections.at(-1),1);
// Move in the other direction.
thumb=thumbnails(render())[2];source=node();thumb.props.onPointerDown(event(source,150,275));thumb.props.onPointerMove(event(source,150,10));thumb.props.onPointerUp(event(source,150,10));assert.equal(moves.at(-1)[0],2);assert.equal(moves.at(-1)[1],0);
// Releasing outside the rail and cancelling leave the document unchanged.
let before=moves.length;thumb=thumbnails(render())[0];source=node();thumb.props.onPointerDown(event(source,150,20));thumb.props.onPointerMove(event(source,350,200));thumb.props.onPointerUp(event(source,350,200));assert.equal(moves.length,before);
thumb.props.onPointerDown(event(source,150,20));thumb.props.onPointerMove(event(source,150,325));thumb.props.onPointerCancel();assert.equal(moves.length,before);assert.equal(frames.size,0);
// Touch drags use the handle so the thumbnail remains scrollable.
thumb.props.onPointerDown(event(source,150,20,'touch'));thumb.props.onPointerMove(event(source,150,325,'touch'));thumb.props.onPointerUp(event(source,150,325,'touch'));assert.equal(moves.length,before);
const handle=render().find(item=>item.type===Button&&item.props.className==='page-drag-handle');source=node();handle.props.onPointerDown(event(source,150,20,'touch'));handle.props.onPointerMove(event(source,150,350,'touch'));assert(frames.size>0);
const scroll=frames.values().next().value;scroll();assert(list.scrollTop>0,'scroll automatically at the list edge');handle.props.onPointerUp(event(source,150,350,'touch'));assert.equal(moves.length,before+1);frames.clear();
// Keyboard and visibility rules use the same move callback.
thumb=thumbnails(render())[0];thumb.props.onKeyDown({altKey:true,key:'ArrowDown',preventDefault(){}});assert.equal(moves.at(-1)[0],0);assert.equal(moves.at(-1)[1],1);
tree=render({...props,canArrange:false});assert(!tree.some(item=>item.props?.className==='page-drag-handle'));before=moves.length;thumb=thumbnails(tree)[0];thumb.props.onPointerDown(event(node(),150,20));thumb.props.onPointerMove(event(node(),150,325));thumb.props.onPointerUp(event(node(),150,325));assert.equal(moves.length,before);
assert(thumbnails(render({...props,busy:true})).every(item=>item.props.disabled));
console.log('PASS: actual component pointer handlers, insertion indicator, click vs drag, reverse move, cancellation, outside release, touch handle, edge scrolling, keyboard, disabled tools/busy');

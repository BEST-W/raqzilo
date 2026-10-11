import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as mupdf from 'mupdf';
import {PDFDocument, StandardFonts, degrees} from 'pdf-lib';
import {unzipSync,strFromU8} from 'fflate';
import * as engine from '../lib/pdf-engine.ts';

engine.installEngineForTests(mupdf);
engine.installFontForTests(new Uint8Array(await fs.readFile('public/fonts/DejaVuSans.ttf')));
const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
for(let i=0;i<5;i++){
  const page=pdf.addPage([595,842]);page.drawText('ORIGINAL_PAGE_'+(i+1),{x:50,y:700,size:20,font});
  if(i===1)page.setRotation(degrees(90));
}
const source=await pdf.save();
for(const range of ['١–٣، ٥','۱—۳، ۵','\u200f١-٣، ٥\u200e','1−3, 5']){
  const extracted=await engine.reorder(source,engine.parseRange(range,5));
  assert.equal((await engine.inspect(extracted)).length,4);
  for(const [i,expected] of [1,2,3,5].entries())assert((await engine.renderPage(extracted,i)).lines.some(line=>line.text.includes('ORIGINAL_PAGE_'+expected)));
}
for(const range of ['٠','٦','٣-١','١.٥','١,,٢','١-٢x'])assert.throws(()=>engine.parseRange(range,5));
const lines=['نجح تعديل المستند بالعربية — Audit added text 123','Invoice 456 فاتورة عربية','المبلغ 100 SAR رقم ٢٠٢٦','Arabic العربية English'];
const marked=await engine.applyMarks(source,lines.map((text,index)=>({id:'mixed-'+index,page:index%2,kind:'text',text,x:.08,y:.2+Math.floor(index/2)*.18,w:.84,h:.12,size:18,color:'#000000'})));
const text=(await Promise.all([engine.renderPage(marked,0),engine.renderPage(marked,1)])).flatMap(page=>page.lines).map(line=>line.text).join('\n');
for(const fragment of ['Audit added text 123','Invoice 456','100','SAR','٢٠٢٦','Arabic','English','العربية'])assert(text.includes(fragment),'preserve mixed-script text: '+fragment);
for(const reversed of ['txet dedda tiduA','eciovnI','RAS 001','hsilgnE'])assert(!text.includes(reversed));
assert((await engine.toWord(marked,'Audit')).length>1000);
const form=await engine.applyMarks(source,[{id:'field',page:0,kind:'field',fieldKind:'text',name:'bilingual',text:'English 123 اسم العميل',x:.1,y:.3,w:.8,h:.08,color:'#000000',size:18}]);
const filled=await engine.fillFields(form,{bilingual:'المستند Audit client 456'});
assert.equal((await engine.readFields(filled))[0].value,'المستند Audit client 456');
const native=new mupdf.PDFDocument(filled);
try{
 native.bake(false,true);const buffer=native.saveToBuffer();let flattened;try{flattened=buffer.asUint8Array().slice();}finally{buffer.destroy();}
 assert((await engine.renderPage(flattened,0)).lines.some(line=>line.text.includes('Audit client 456')),'the form appearance must keep English and numbers readable');
}finally{native.destroy();}
console.log('PASS: Arabic/Persian page ranges select the correct real PDF pages, malformed ranges rejected, mixed Arabic/English/numbers survive export on upright and rotated pages, Word export');

// Redaction must remove newly added content and the underlying AcroForm value,
// including on rotated pages. Preserve unrelated text and fields.
const redactionPdf=await PDFDocument.create();
for(const angle of [0,90,180,270])redactionPdf.addPage([595,842]).setRotation(degrees(angle));
const redactionSource=await redactionPdf.save();
const privateMarks=Array.from({length:4},(_,page)=>({id:'secret-'+page,page,kind:'text',text:'PRIVATE_ADDITION_'+page,x:.12,y:.35,w:.65,h:.09,size:18,color:'#000000'}));
const publicMarks=Array.from({length:4},(_,page)=>({...privateMarks[page],id:'keep-'+page,y:.7,text:'KEEP_ADDITION_'+page}));
const formMarks=privateMarks.map(mark=>({...mark,id:'private-field-'+mark.page,kind:'field',fieldKind:'text',name:'private_field_'+mark.page,text:'PRIVATE_FORM_VALUE_'+mark.page}));
const publicForm={...formMarks[0],id:'public-field',name:'public_field',text:'KEEP_FORM_VALUE',y:.85};
const redactions=privateMarks.map(mark=>({...mark,id:'redact-'+mark.page,kind:'redact',text:undefined,x:.1,y:.32,w:.72,h:.15}));
const existingForms=await engine.applyMarks(redactionSource,[...formMarks,publicForm]);
for(const pending of [[...privateMarks,...publicMarks,...redactions],[...redactions,...privateMarks,...publicMarks]]){
  const output=await engine.applyMarks(existingForms,pending);
  for(let page=0;page<4;page++){
    const text=(await engine.renderPage(output,page)).lines.map(line=>line.text).join('\n');
    assert(!text.includes('PRIVATE_'),'redaction must remove the pending text on rotation '+page);
    assert(text.includes('KEEP_ADDITION_'+page),'unredacted additions must survive');
  }
  const remaining=await engine.readFields(output);
  assert.deepEqual(remaining.map(field=>[field.name,field.value]),[['public_field','KEEP_FORM_VALUE']]);
  const fields=(await PDFDocument.load(output)).getForm().getFields();
  assert(!fields.some(field=>field.getName().startsWith('private_')),'redacted values must be removed from the actual AcroForm');
  const wordXml=strFromU8(unzipSync(await engine.toWord(output,'Redaction audit'))['word/document.xml']);
  assert(!wordXml.includes('PRIVATE_'),'Word export must not restore redacted private text');
  assert(wordXml.includes('KEEP_ADDITION_0'));
}
const newlyAddedFields=await engine.applyMarks(redactionSource,[...formMarks,publicForm,...redactions]);
assert.deepEqual((await engine.readFields(newlyAddedFields)).map(field=>field.name),['public_field']);
console.log('PASS: redaction removes pending text in either mark order, existing and newly added AcroForm values on all four rotations; unrelated content and fields survive');

// Merging must preserve both the form data and its visible, editable widgets.
const controls=await engine.applyMarks(filled,[
  {id:'merge-check',page:0,kind:'field',fieldKind:'checkbox',name:'agree',checked:true,x:.1,y:.5,w:.06,h:.05,color:'#000000',size:14},
  {id:'merge-choice',page:0,kind:'field',fieldKind:'dropdown',name:'choice',text:'First',options:['First','Second','العربية'],x:.1,y:.6,w:.6,h:.08,color:'#000000',size:14},
]);
const firstForm=await engine.fillFields(controls,{bilingual:'Merge test A',agree:'Yes',choice:'First'});
const secondForm=await engine.fillFields(controls,{bilingual:'Merge test B',agree:'Off',choice:'Second'});
const mergedForms=await engine.appendPdfs(firstForm,[secondForm,firstForm]);
assert.equal((await engine.inspect(mergedForms)).length,15);
const mergedFields=await engine.readFields(mergedForms);
assert.deepEqual(mergedFields.map(field=>[field.page,field.name,field.value]),[
  [0,'bilingual','Merge test A'],[0,'agree','Yes'],[0,'choice','First'],
  [5,'bilingual_2','Merge test B'],[5,'agree_2','Off'],[5,'choice_2','Second'],
  [10,'bilingual_3','Merge test A'],[10,'agree_3','Yes'],[10,'choice_3','First'],
]);
assert.deepEqual(mergedFields.find(field=>field.name==='choice_2').options,['First','Second','العربية']);
for(const [index,original] of [[0,firstForm],[5,secondForm],[10,firstForm]]){
  assert.deepEqual((await engine.renderPage(mergedForms,index,595,false)).png,(await engine.renderPage(original,0,595,false)).png,'merged form appearances must remain visually identical');
}
const editedMerge=await engine.fillFields(mergedForms,{bilingual_2:'Edited only B',choice_3:'العربية'});
const editedFields=await engine.readFields(editedMerge);
assert.equal(editedFields.find(field=>field.name==='bilingual_2').value,'Edited only B');
assert.equal(editedFields.find(field=>field.name==='bilingual').value,'Merge test A');
assert.equal(editedFields.find(field=>field.name==='choice_3').value,'العربية');
const reorderedMerge=await engine.reorder(editedMerge,[5,0,10]);
assert.deepEqual((await engine.readFields(reorderedMerge)).filter(field=>field.kind==='text').map(field=>[field.page,field.name]),[[0,'bilingual_2'],[1,'bilingual'],[2,'bilingual_3']]);
const redactedMerge=await engine.applyMarks(mergedForms,[{id:'merge-redact',page:5,kind:'redact',x:.08,y:.28,w:.86,h:.12,color:'#000000',size:14}]);
assert(!(await engine.readFields(redactedMerge)).some(field=>field.name==='bilingual_2'));
assert.equal((await engine.readFields(redactedMerge)).find(field=>field.name==='bilingual').value,'Merge test A');

// Preserve non-widget annotations and remap internal links to the appended pages.
const linked=new mupdf.PDFDocument(source);
let linkedBytes;
try{
  const page=linked.loadPage(1);
  try{
    page.createLink([30,30,130,60],'https://example.com/merge-audit').destroy();
    page.createLink([30,80,130,110],'#page=3').destroy();
    const note=page.createAnnotation('Text');
    try{note.setRect([150,30,180,60]);note.setContents('KEEP_MERGED_NOTE');note.update();}finally{note.destroy();}
  }finally{page.destroy();}
  const buffer=linked.saveToBuffer();
  try{linkedBytes=buffer.asUint8Array().slice();}finally{buffer.destroy();}
}finally{linked.destroy();}
const linkedMerge=await engine.appendPdfs(firstForm,[linkedBytes]);
const combined=new mupdf.PDFDocument(linkedMerge);
try{
  const page=combined.loadPage(6);
  try{
    const links=page.getLinks();
    try{
      assert(links.some(link=>link.getURI()==='https://example.com/merge-audit'));
      const internal=links.find(link=>!link.isExternal());
      assert(internal);assert.equal(combined.resolveLink(internal),7);
    }finally{links.forEach(link=>link.destroy());}
    const notes=page.getAnnotations();
    try{assert(notes.some(note=>note.getContents()==='KEEP_MERGED_NOTE'));}finally{notes.forEach(note=>note.destroy());}
  }finally{page.destroy();}
}finally{combined.destroy();}
console.log('PASS: merged text/checkbox/dropdown fields keep values, options and identical appearances; duplicate names stay independent after filling, reordering and redaction; annotations and internal/external links survive');

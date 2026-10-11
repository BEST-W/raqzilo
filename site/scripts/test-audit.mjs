import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as mupdf from 'mupdf';
import {PDFDocument, StandardFonts, degrees} from 'pdf-lib';
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

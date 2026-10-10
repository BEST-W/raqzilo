import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as mupdf from 'mupdf';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import * as engine from '../lib/pdf-engine.ts';
engine.installEngineForTests(mupdf);
engine.installFontForTests(new Uint8Array(await fs.readFile('public/fonts/DejaVuSans.ttf')));
const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
pdf.addPage([595,842]).drawText('ORIGINAL_CONTENT_A',{x:70,y:720,font,size:18});
pdf.addPage([420,595]).drawText('ORIGINAL_CONTENT_B',{x:70,y:480,font,size:18});
const original=await pdf.save();
const rotated=await engine.rotatePage(original,0);
const numbered=await engine.numberPages(rotated,{start:7,position:'bottomRight',size:12,color:'#2457d6'});
for(let i=0;i<2;i++){
 const render=await engine.renderPage(numbered,i,1000);
 const line=render.lines.find(line=>line.text.includes(`${7+i} / 8`));
 assert(line,'native numbering text must exist');assert(line.y>.90&&line.y<1,'numbers must appear at the visible bottom even after rotation');assert(line.x>.75,'right position must be relative to visible page');
 assert(render.lines.some(line=>line.text.includes('ORIGINAL_CONTENT_')));
}
for(const position of ['bottomCenter','bottomLeft','topCenter']){
 const output=await engine.numberPages(rotated,{position});const render=await engine.renderPage(output,0,500);const line=render.lines.find(line=>line.text.includes('1 / 2'));assert(line);
 if(position==='topCenter')assert(line.y<.08);else assert(line.y>.90);
 if(position==='bottomLeft')assert(line.x<.10);else assert(line.x>.35&&line.x<.6);
}
const marked=await engine.watermark(numbered,{text:'نسخة للمراجعة',size:40,color:'#d32f5d',opacity:.22});
const render=await engine.renderPage(marked,0,1000);assert(render.lines.length>(await engine.renderPage(numbered,0,500)).lines.length);
assert(render.lines.some(line=>line.text.includes('ORIGINAL_CONTENT_A')));
await fs.mkdir('/tmp/mustanad-pdf-qa',{recursive:true});
await fs.writeFile('/tmp/mustanad-pdf-qa/extra-tools-rotated.png',render.png);
const blank=await engine.insertBlankPage(marked,1),info=await engine.inspect(blank);assert.equal(info.length,3);assert.equal(info[1].width,420);assert.equal(info[1].height,595);
assert.equal((await engine.renderPage(blank,1,300)).lines.length,0);
assert((await engine.renderPage(blank,2,500)).lines.some(line=>line.text.includes('ORIGINAL_CONTENT_B')));
const field=await engine.applyMarks(original,[{id:'field',page:0,kind:'field',x:.1,y:.6,w:.5,h:.05,size:12,name:'contract_name',text:'Kept value',color:'#20282b'}]);
const withExtras=await engine.insertBlankPage(await engine.watermark(await engine.numberPages(field),{text:'REVIEW'}),0);
assert.equal((await engine.readFields(withExtras))[0].name,'contract_name');assert.equal((await engine.readFields(withExtras))[0].value,'Kept value');
await assert.rejects(()=>engine.numberPages(original,{start:0}));
await assert.rejects(()=>engine.watermark(original,{text:''}));
await assert.rejects(()=>engine.watermark(original,{text:'hello',opacity:1}));
await assert.rejects(()=>engine.insertBlankPage(original,-1));
await assert.rejects(()=>engine.numberPages(original,{size:NaN}));
await assert.rejects(()=>engine.watermark(original,{text:'hello',opacity:Infinity}));
const short=await PDFDocument.create();short.addPage([842,120]);
const fitted=await engine.watermark(await short.save(),{text:'A WATERMARK THAT MUST STAY INSIDE A SHORT LANDSCAPE PAGE',size:70});
const fittedLine=(await engine.renderPage(fitted,0,842)).lines[0];assert(fittedLine);assert(fittedLine.x>=0&&fittedLine.y>=0&&fittedLine.x+fittedLine.w<=1&&fittedLine.y+fittedLine.h<=1,'watermark must fit both page dimensions');
console.log('PASS: native page numbering positions after rotation, Arabic watermark, content retained, blank-page dimensions/order, AcroForm field preserved, validation');

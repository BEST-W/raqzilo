import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as mupdf from 'mupdf';
import {PDFDocument, StandardFonts, PDFName, PDFDict, PDFRawStream, decodePDFRawStream} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as engine from '../lib/pdf-engine.ts';
import {readMarkdownPages, buildMarkdown, markdownPageNeedsOcr} from '../lib/pdf-markdown.ts';
engine.installEngineForTests(mupdf);
const pdf=await PDFDocument.create();
pdf.registerFontkit(fontkit);
const font=await pdf.embedFont(StandardFonts.Helvetica);
const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
const arabic=await pdf.embedFont(await fs.readFile('public/fonts/DejaVuSans.ttf'),{subset:true});
for(let index=0;index<3;index++) {
 const page=pdf.addPage([595,842]);
 page.drawText('CONFIDENTIAL HANDBOOK',{x:50,y:821,size:9,font});
 page.drawText(`Page ${index+1} of 3`,{x:50,y:15,size:9,font});
 page.drawText(`Chapter ${index+1}`,{x:50,y:750,size:24,font:bold});
 page.drawText('This paragraph contains the full original document text.\nA wrapped line stays available for the reader and AI.',{x:50,y:695,size:12,lineHeight:17,font});
 page.drawText('Invoice ID 2026-101: $125.00',{x:50,y:630,size:12,font});
 if(index===0) {
  for(const [row,cells] of [['Item','Amount'],['Design','125.00'],['Support','30.00']].entries()) {
   cells.forEach((text,column)=>page.drawText(text,{x:50+column*235,y:560-row*26,size:12,font:row===0?bold:font}));
  }
 }
 if(index===1)page.drawText('هذا المستند عربي لاختبار استخراج النص',{x:50,y:540,size:13,font:arabic});
}
const bytes=await pdf.save();
const progress=[];
const pages=await readMarkdownPages(bytes,[0,1,2],value=>progress.push(value));
const output=buildMarkdown(pages);
assert(output.text.includes('# Chapter 1'));
assert(output.text.includes('wrapped line stays available'));
assert(output.text.includes('2026-101: $125.00'),'Document numbers and totals must remain unchanged');
assert(output.text.includes('المستند'),'Arabic text must be preserved');
assert(output.text.includes('| Item | Amount |'),'Aligned table headers must be readable Markdown');
assert(output.text.includes('| Design | 125.00 |'));
assert(!output.text.includes('CONFIDENTIAL HANDBOOK'));
assert(!output.text.includes('Page 1 of 3'));
assert.equal(output.removedLines,6);
assert.equal(output.emptyPages.length,0);
assert.deepEqual(output.unreadablePages,[]);
assert(pages.every(page=>!markdownPageNeedsOcr(page)),'Valid Arabic and English must stay on the native extraction path');
assert.equal(progress.at(-1),1);
const full=buildMarkdown(pages,{removeRepeated:false,pageMarkers:true});
assert(full.text.includes('CONFIDENTIAL HANDBOOK'));
assert(full.text.includes('Page 1 of 3'));
assert(full.text.includes('<!-- Page 3 -->'));
const selected=buildMarkdown(await readMarkdownPages(bytes,[1]),{removeRepeated:true,pageMarkers:false});
assert(!selected.text.includes('Chapter 1'));
assert(selected.text.includes('Chapter 2'));
const scanned=await PDFDocument.create();
const image=await scanned.embedPng((await engine.renderPage(bytes,0,600,false)).png);
scanned.addPage([595,842]).drawImage(image,{x:0,y:0,width:595,height:842});
const noText=buildMarkdown(await readMarkdownPages(await scanned.save(),[0]));
assert.equal(noText.text,'');assert.deepEqual(noText.emptyPages,[0]);
// Reproduce a genuine broken Arabic font map. Keep the original glyphs and
// page drawing intact, but map the Arabic glyphs to I during text extraction.
const broken=await PDFDocument.load(bytes);
let replacedMaps=0;
for(const [,object] of broken.context.enumerateIndirectObjects()) {
 if(!(object instanceof PDFDict)||!object.has(PDFName.of('ToUnicode')))continue;
 const stream=object.lookup(PDFName.of('ToUnicode'),PDFRawStream);
 const originalMap=new TextDecoder().decode(decodePDFRawStream(stream).decode());
 let replaced=false;
 const damagedMap=originalMap.replace(/(<[0-9a-f]+>\s*)<([0-9a-f]+)>/gi,(entry,source,target)=>{
  const codes=target.match(/.{4}/g)||[];
  if(!codes.some(code=>parseInt(code,16)>=0x600&&parseInt(code,16)<=0x6ff))return entry;
  replaced=true;return source+'<0049>';
 });
 if(replaced){object.set(PDFName.of('ToUnicode'),broken.context.register(broken.context.flateStream(damagedMap)));replacedMaps++;}
}
assert(replacedMaps>0,'Fixture must corrupt a real Arabic ToUnicode map');
const brokenPages=await readMarkdownPages(await broken.save(),[0,1,2]);
assert(brokenPages[1].lines.some(line=>/I{4,}/.test(line.text)),'Broken font must actually extract as I placeholders');
assert.deepEqual(brokenPages.filter(markdownPageNeedsOcr).map(page=>page.index),[1],'Only the damaged Arabic page should need OCR');
assert.deepEqual(buildMarkdown(brokenPages).unreadablePages,[1],'Unreadable text must produce a visible page warning');
assert(buildMarkdown(brokenPages).text.includes('2026-101: $125.00'),'Valid English and totals must remain available when a font is damaged');
const repaired={...brokenPages[1],fromOcr:true,lines:[{text:'خطة تعلم اللغة الإنجليزية',size:12,bold:false,box:[0,100,500,120],block:1}]};
const repairedResult=buildMarkdown([brokenPages[0],repaired,brokenPages[2]]);
assert.deepEqual(repairedResult.unreadablePages,[]);
assert(repairedResult.text.includes('خطة تعلم اللغة الإنجليزية'));
assert(!repairedResult.text.includes('IIII'));
assert(!markdownPageNeedsOcr({...repaired,lines:[{...repaired.lines[0],text:'Chapter III: valid Arabic العربية and English'}]}),'Roman III must not be mistaken for corrupt font text');
const safeText=buildMarkdown([{index:0,height:842,fromOcr:true,lines:[{text:'<script>alert(1)</script>',size:12,bold:false,box:[0,100,200,120],block:1}]}]);
assert(safeText.text.includes('\\<script\\>'));
await assert.rejects(()=>readMarkdownPages(bytes,[99]));
await fs.mkdir('.sites-runtime',{recursive:true});
await fs.writeFile('.sites-runtime/markdown-test.pdf',bytes);
await fs.writeFile('.sites-runtime/markdown-test.md',output.text);
console.log(`PASS: PDF to MD preserves Arabic/English, headings, tables and totals; detects a real broken Arabic font map, limits OCR to its page, warns on unreadable text and preserves recognized Arabic (${output.words} words).`);

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as mupdf from 'mupdf';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {createWorker} from 'tesseract.js';
import * as engine from '../lib/pdf-engine.ts';
import * as tools from '../lib/local-pdf-tools.ts';
import {ocrWords} from '../lib/local-ocr.ts';
import {settingsSchema,defaultSettings} from '../lib/settings-model.ts';
engine.installEngineForTests(mupdf);
const fontBytes=new Uint8Array(await fs.readFile('public/fonts/DejaVuSans.ttf'));
engine.installFontForTests(fontBytes);
const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
for(let i=0;i<2;i++){const p=pdf.addPage([600,800]);p.drawText('LOCAL OCR TEST 2026',{font,size:30,x:50,y:650});p.drawText('Page '+(i+1),{font,size:16,x:50,y:550});}
const original=await pdf.save();
const cropped=await tools.cropPages(original,[0],{top:10,bottom:15,left:5,right:20});
assert.deepEqual(await engine.inspect(cropped),[{width:450,height:600},{width:600,height:800}]);
for(let n=0,data=original;n<4;n++,data=await engine.rotatePage(data,0)){
 const before=(await engine.inspect(data))[0],out=await tools.cropPages(data,[0],{top:10,bottom:10,left:20,right:5}),after=(await engine.inspect(out))[0];
 assert(Math.abs(after.width-before.width*.75)<.01);assert(Math.abs(after.height-before.height*.8)<.01);
 assert((await engine.renderPage(out,0,300)).png.length>100);
}
await assert.rejects(()=>tools.cropPages(original,[2],{top:0,bottom:0,left:0,right:0}));
assert.throws(()=>tools.cropBox({top:50,bottom:45,left:0,right:0}));
assert.throws(()=>tools.cropBox({top:NaN,bottom:0,left:0,right:0}));
const artifactDir='/tmp/mustanad-local-qa';await fs.mkdir(artifactDir,{recursive:true});
for(const password of ['my-pass-2026','quote"comma,equals=ok','encrypt=none,evil','كلمة سر آمنة١٢٣','emoji🔐pass']){
 const out=await tools.protectPdf(original,password),native=new mupdf.PDFDocument(out);
 try{assert(native.needsPassword());assert.equal(native.authenticatePassword('wrong-password'),0);assert(native.authenticatePassword(password));assert.equal(native.countPages(),2);}finally{native.destroy();}
 await assert.rejects(()=>engine.unlock(out),/PASSWORD/);assert.equal((await engine.inspect(await engine.unlock(out,password))).length,2);
}
await assert.rejects(()=>tools.protectPdf(original,'a'));
await assert.rejects(()=>tools.protectPdf(original,'abc\nxyz'));
await fs.writeFile(path.join(artifactDir,'protected.pdf'),await tools.protectPdf(original,'quote"comma,equals=ok'));
const fieldMarks=[
 {id:'text',page:0,kind:'field',fieldKind:'text',name:'client',text:'',required:true,x:.1,y:.4,w:.5,h:.07,color:'#000000',size:14},
 {id:'check',page:0,kind:'field',fieldKind:'checkbox',name:'agree',checked:false,required:true,x:.1,y:.55,w:.05,h:.05,color:'#000000',size:14},
 {id:'dropdown',page:0,kind:'field',fieldKind:'dropdown',name:'choice',options:['First','Second','العربية'],text:'First',x:.1,y:.65,w:.5,h:.07,color:'#000000',size:14}
];
const form=await engine.applyMarks(original,fieldMarks),fields=await engine.readFields(form);
assert.equal(fields.length,3);assert(fields.find(f=>f.name==='client').required);assert(fields.find(f=>f.name==='agree').required);
assert.deepEqual(fields.find(f=>f.name==='choice').options,['First','Second','العربية']);
await assert.rejects(()=>engine.fillFields(form,{client:'',agree:'Off'}),/مطلوبة/);
const filled=await engine.fillFields(form,{client:'Visitor',agree:'Yes',choice:'Second'}),values=await engine.readFields(filled);
assert.equal(values.find(f=>f.name==='client').value,'Visitor');assert.notEqual(values.find(f=>f.name==='agree').value,'Off');assert.equal(values.find(f=>f.name==='choice').value,'Second');
assert((await tools.comparePdfs(form,filled,[0]))[0].visualChanged,'Filled field appearances must be visible, not only stored values');
const arabicFilled=await engine.fillFields(form,{client:'محمد عبدالله',agree:'Yes',choice:'العربية'});assert.equal((await engine.readFields(arabicFilled)).find(f=>f.name==='client').value,'محمد عبدالله');await fs.writeFile(path.join(artifactDir,'arabic-form.png'),(await engine.renderPage(arabicFilled,0,1000)).png);
assert.equal((await engine.readFields(await tools.cropPages(filled,[0],{top:0,bottom:0,left:0,right:0}))).length,3);
const equal=await tools.comparePdfs(original,original,[0,1]);assert(equal.every(r=>r.status==='same'&&r.boxes.length===0));
const changed=await engine.applyMarks(original,[{id:'change',page:0,kind:'text',text:'NEW AMOUNT 900',x:.2,y:.6,w:.6,h:.1,size:24,color:'#000000'}]);
const diffs=await tools.comparePdfs(original,changed,[0,1]);assert.equal(diffs[0].status,'changed');assert(diffs[0].visualChanged&&diffs[0].boxes.length);assert.equal(diffs[1].status,'same');
assert(tools.textDifferences(diffs[0].before,diffs[0].after).some(l=>l.kind==='added'&&l.text.includes('900')));
const one=await engine.reorder(original,[0]);assert.equal((await tools.comparePdfs(original,one,[1]))[0].status,'removed');assert.equal((await tools.comparePdfs(one,original,[1]))[0].status,'added');
const graphicsPdf=await PDFDocument.load(original);graphicsPdf.getPage(0).drawRectangle({x:400,y:150,width:90,height:90,color:rgb(0,0,1)});
const graphicDiff=(await tools.comparePdfs(original,await graphicsPdf.save(),[0]))[0];assert.equal(graphicDiff.before,graphicDiff.after);assert(graphicDiff.visualChanged);
for(const kind of ['invoice','letter','form']){
 const template=await tools.createTemplate(kind,'مستند','#de684b');assert(template.marks.some(m=>m.text.includes('مستند')));
 const out=await engine.applyMarks(template.bytes,template.marks);assert.equal((await engine.inspect(out)).length,1);const r=await engine.renderPage(out,0,1000);await fs.writeFile(path.join(artifactDir,kind+'.png'),r.png);await fs.writeFile(path.join(artifactDir,kind+'.pdf'),out);
 if(kind==='form')assert.equal((await engine.readFields(out)).length,5);
}
const legacy=JSON.parse(JSON.stringify(defaultSettings));legacy.tools.merge=false;for(const key of ['crop','protect','compare','ocr','templates'])delete legacy.tools[key];legacy.name='المالك';
const migrated=settingsSchema.parse(legacy);assert.equal(migrated.name,'المالك');assert.equal(migrated.tools.merge,false);for(const key of ['crop','protect','compare','ocr','templates'])assert(migrated.tools[key]);
console.log('PASS: crop and four rotations, quoted/Unicode AES-256 passwords, required text/checkbox/dropdown fields, page/text/visual comparisons, Arabic templates and settings migration');
// Exercise the real OCR engine with the same self-hosted language models.
const worker=await createWorker('eng',1,{langPath:path.resolve('public/vendor/ocr/lang'),cacheMethod:'none'});
try{
 await worker.setParameters({tessedit_pageseg_mode:'3',preserve_interword_spaces:'1',user_defined_dpi:'200'});
 const english=(await engine.renderPage(original,0,1500,false)).png;const recognized=await worker.recognize(Buffer.from(english),{}, {text:true,blocks:true});
 assert(recognized.data.text.includes('LOCAL'));assert(recognized.data.text.includes('OCR'));assert(recognized.data.text.includes('2026'));
 const width=new DataView(english.buffer,english.byteOffset,english.byteLength).getUint32(16),height=new DataView(english.buffer,english.byteOffset,english.byteLength).getUint32(20);
 const words=ocrWords(recognized.data,width,height);assert(words.length>0);
 const searchable=await tools.searchablePdf(original,[{index:0,text:recognized.data.text,confidence:recognized.data.confidence,words}],fontBytes);
 assert((await engine.renderPage(searchable,0,500)).lines.some(line=>line.text.includes('LOCAL')));
 assert.deepEqual(Buffer.from((await engine.renderPage(searchable,0,500,false)).png),Buffer.from((await engine.renderPage(original,0,500,false)).png));
 const scanned=await PDFDocument.create(),image=await scanned.embedPng(english),scanPage=scanned.addPage([600,800]);scanPage.drawImage(image,{x:0,y:0,width:600,height:800});const scanBytes=await scanned.save();
 assert.equal((await engine.renderPage(scanBytes,0,500)).lines.length,0);
 const withLayer=await tools.searchablePdf(scanBytes,[{index:0,text:recognized.data.text,confidence:recognized.data.confidence,words}],fontBytes);
 assert((await engine.renderPage(withLayer,0,500)).lines.some(line=>line.text.includes('LOCAL')));await fs.writeFile(path.join(artifactDir,'searchable.pdf'),withLayer);
 const blank=await PDFDocument.create();blank.addPage([595,842]);const arabic=await engine.applyMarks(await blank.save(),[{id:'ar',page:0,kind:'text',text:'اختبار قراءة اللغة العربية',x:.1,y:.2,w:.8,h:.13,size:32,color:'#000000'}]);
 const arImage=(await engine.renderPage(arabic,0,1600,false)).png;await fs.writeFile(path.join(artifactDir,'arabic-ocr.png'),arImage);await worker.reinitialize('ara',1);await worker.setParameters({tessedit_pageseg_mode:'7',preserve_interword_spaces:'1',user_defined_dpi:'200'});const arResult=await worker.recognize(Buffer.from(arImage),{}, {text:true,blocks:true});
 console.log('Arabic OCR sample:',arResult.data.text.trim());assert(arResult.data.text.includes('اختبار'));assert(arResult.data.text.includes('العربية'));
 const docx=await tools.textToWord([recognized.data.text,arResult.data.text],'OCR');assert(docx.length>1000);
 console.log('PASS: actual English/Arabic local OCR, coordinate extraction, invisible searchable layer preserves appearance, scanned-page search, DOCX export');
}finally{await worker.terminate();}

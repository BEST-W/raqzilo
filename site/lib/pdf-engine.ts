import type * as MuPDF from "mupdf";
import { bidirectionalFontkit, pdfTextIsRtl } from "./pdf-text-layout.ts";
export type Bytes = Uint8Array;
export type Box = {x:number;y:number;w:number;h:number};
export type FieldKind="text"|"checkbox"|"dropdown";
export type Mark = Box & {id:string;page:number;kind:"text"|"replace"|"image"|"signature"|"highlight"|"redact"|"field";text?:string;image?:string;color:string;size:number;name?:string;source?:Box;fieldKind?:FieldKind;options?:string[];required?:boolean;checked?:boolean};
export type TextLine = Box & {text:string;size:number};
export type PageInfo = {width:number;height:number};
export type FieldInfo = {page:number;name:string;value:string;kind:string;options:string[];required:boolean};
let enginePromise:Promise<typeof MuPDF>|null=null;
export function getEngine() {
  if(!enginePromise){const url="/vendor/mupdf/mupdf.js";enginePromise=import(/* webpackIgnore: true */ url).catch(e=>{enginePromise=null;throw e;});}
  return enginePromise;
}
export function installEngineForTests(engine:typeof MuPDF){enginePromise=Promise.resolve(engine);}
function save(doc:MuPDF.PDFDocument,options="garbage=4,compress,compress-images,compress-fonts,encrypt=none") {
  const buffer=doc.saveToBuffer(options);try{return buffer.asUint8Array().slice();}finally{buffer.destroy();}
}
function document(m:typeof MuPDF,bytes:Bytes){return new m.PDFDocument(bytes);}
export async function unlock(bytes:Bytes,password="") {
  const m=await getEngine();const doc=document(m,bytes);
  try{const protectedFile=doc.needsPassword();if(protectedFile&&!doc.authenticatePassword(password))throw new Error("PASSWORD");
    if(doc.countPages()===0)throw new Error("المستند لا يحتوي على صفحات.");
    if(doc.countPages()>250)throw new Error("الحد الحالي 250 صفحة لكل مستند.");
    return protectedFile?save(doc):bytes;
  }finally{doc.destroy();}
}
export async function inspect(bytes:Bytes):Promise<PageInfo[]> {
  const m=await getEngine();const doc=document(m,bytes);
  try{return Array.from({length:doc.countPages()},(_,i)=>{const p=doc.loadPage(i);try{const b=p.getBounds();return{width:b[2]-b[0],height:b[3]-b[1]};}finally{p.destroy();}});}finally{doc.destroy();}
}
export async function renderPage(bytes:Bytes,index:number,maxWidth=1200,withText=true) {
  const m=await getEngine();const doc=document(m,bytes);const page=doc.loadPage(index);
  try {
    const b=page.getBounds(),w=b[2]-b[0],h=b[3]-b[1];const scale=Math.min(maxWidth/w,Math.sqrt(5_000_000/(w*h)));
    const pixmap=page.toPixmap(m.Matrix.scale(scale,scale),m.ColorSpace.DeviceRGB,false,true);
    let png:Bytes;try{png=pixmap.asPNG().slice();}finally{pixmap.destroy();}
    const lines:TextLine[]=[];
    if(withText){const st=page.toStructuredText("preserve-whitespace");let current:TextLine|null=null;
      try{st.walk({beginLine:(r)=>{current={x:(r[0]-b[0])/w,y:(r[1]-b[1])/h,w:(r[2]-r[0])/w,h:(r[3]-r[1])/h,text:"",size:12};},onChar:(c,_o,_f,size)=>{if(current){current.text+=c;current.size=size;}},endLine:()=>{if(current?.text.trim())lines.push(current);current=null;}});}finally{st.destroy();}
    }
    return{png,lines,width:w,height:h};
  }finally{page.destroy();doc.destroy();}
}
function rect(mark:Box,b:MuPDF.Rect):MuPDF.Rect {const w=b[2]-b[0],h=b[3]-b[1];return[b[0]+mark.x*w,b[1]+mark.y*h,b[0]+(mark.x+mark.w)*w,b[1]+(mark.y+mark.h)*h];}
function rgb(hex:string):[number,number,number]{return [parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255];}
function imageBytes(url:string){const encoded=url.split(",")[1];return Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));}
let fontPromise:Promise<Bytes>|null=null;
async function fontBytes(){if(!fontPromise)fontPromise=fetch("/fonts/DejaVuSans.ttf").then(r=>{if(!r.ok)throw new Error("تعذر تحميل الخط.");return r.arrayBuffer();}).then(b=>new Uint8Array(b));return fontPromise;}
let testFont:Bytes|undefined;
export function installFontForTests(bytes:Bytes){testFont=bytes;}
async function redactOutput(bytes:Bytes,redactions:Mark[]) {
  if(!redactions.length)return bytes;
  const m=await getEngine();const hiddenFields=new Set<string>();const source=document(m,bytes);
  try{
    for(const index of new Set(redactions.map(mark=>mark.page))){const page=source.loadPage(index);try{
      const bounds=page.getBounds(),boxes=redactions.filter(mark=>mark.page===index).map(mark=>rect(mark,bounds));
      for(const widget of page.getWidgets()){try{
        const area=widget.getRect();if(boxes.some(box=>Math.max(area[0],box[0])<Math.min(area[2],box[2])&&Math.max(area[1],box[1])<Math.min(area[3],box[3])))hiddenFields.add(widget.getName());
      }finally{widget.destroy();}}
    }finally{page.destroy();}}
  }finally{source.destroy();}
  // A black rectangle can hide a widget while leaving its private value in the
  // AcroForm. Remove intersecting fields, including any copies of that field.
  let input=bytes;
  if(hiddenFields.size){const {PDFDocument}=await import("pdf-lib");const pdf=await PDFDocument.load(input),form=pdf.getForm();for(const name of hiddenFields){const field=form.getFieldMaybe(name);if(!field)continue;const widgetRefs=field.acroField.getWidgets().map(widget=>pdf.context.getObjectRef(widget.dict));form.removeField(field);for(const page of pdf.getPages())for(const ref of widgetRefs)if(ref)page.node.removeAnnot(ref);}input=await pdf.save({updateFieldAppearances:false});}
  const doc=document(m,input);
  try{
    for(const index of new Set(redactions.map(mark=>mark.page))){const page=doc.loadPage(index);try{
      const bounds=page.getBounds();for(const mark of redactions.filter(mark=>mark.page===index)){const annotation=page.createAnnotation("Redact");try{annotation.setRect(rect(mark,bounds));annotation.update();page.applyRedactions(true,m.PDFPage.REDACT_IMAGE_PIXELS,m.PDFPage.REDACT_LINE_ART_REMOVE_IF_TOUCHED,m.PDFPage.REDACT_TEXT_REMOVE);}finally{annotation.destroy();}}
    }finally{page.destroy();}}
    return save(doc);
  }finally{doc.destroy();}
}
export async function applyMarks(bytes:Bytes,marks:Mark[]) {
  if(!marks.length)return bytes;
  const redactions=marks.filter(mark=>mark.kind==="redact");
  const m=await getEngine();const doc=document(m,bytes);const transforms=new Map<number,{inverse:MuPDF.Matrix;bounds:MuPDF.Rect;rotation:number}>();
  let normalized:Bytes;
  try{
    for(const index of new Set(marks.map(x=>x.page))){const page=doc.loadPage(index);try{
      const b=page.getBounds();const rotateObj=page.getObject().getInheritable("Rotate");const rotation=rotateObj.asNumber()||0;rotateObj.destroy();
      transforms.set(index,{inverse:m.Matrix.invert(page.getTransform()),bounds:b,rotation});
      const selected=marks.filter(x=>x.page===index);
      for(const mark of selected.filter(x=>x.kind==="replace")){
        const a=page.createAnnotation("Redact");a.setRect(rect(mark.source||mark,b));a.update();
        page.applyRedactions(false,m.PDFPage.REDACT_IMAGE_PIXELS,m.PDFPage.REDACT_LINE_ART_REMOVE_IF_TOUCHED,m.PDFPage.REDACT_TEXT_REMOVE);a.destroy();
      }
      for(const mark of selected){
        if(mark.kind==="replace"){
          const a=page.createAnnotation("Square");a.setRect(rect(mark.source||mark,b));a.setInteriorColor([1,1,1]);a.setColor([1,1,1]);a.setBorderWidth(0);a.update();a.destroy();
        }
        if(mark.kind==="highlight"){
          const r=rect(mark,b),a=page.createAnnotation("Highlight");a.setQuadPoints([[r[0],r[1],r[2],r[1],r[0],r[3],r[2],r[3]]]);a.setColor(rgb(mark.color));a.setOpacity(.35);a.update();a.destroy();
        }
        if(mark.kind==="image"||mark.kind==="signature"){
          const image=new m.Image(imageBytes(mark.image!));const a=page.createAnnotation("Stamp");try{a.setStampImage(image);a.setRect(rect(mark,b));a.setFlags(m.PDFAnnotation.IS_PRINT);a.update();}finally{a.destroy();image.destroy();}
        }
      }
    }finally{page.destroy();}}
    doc.bake(true,false);
    normalized=save(doc);
  }finally{doc.destroy();}
  const textMarks=marks.filter(x=>x.kind==="text"||x.kind==="replace"||x.kind==="field");
  if(!textMarks.length)return redactOutput(normalized,redactions);
  const [{PDFDocument,rgb:pdfRgb,degrees},fontkit]=await Promise.all([import("pdf-lib"),import("@pdf-lib/fontkit")]);
  const pdf=await PDFDocument.load(normalized);pdf.registerFontkit(bidirectionalFontkit(fontkit.default));
  const font=await pdf.embedFont(testFont||await fontBytes(),{subset:true});
  for(const mark of textMarks){
    const info=transforms.get(mark.page)!;const r=rect(mark,info.bounds);const inv=info.inverse;
    const point=(x:number,y:number)=>({x:inv[0]*x+inv[2]*y+inv[4],y:inv[1]*x+inv[3]*y+inv[5]});
    const page=pdf.getPage(mark.page);
    if(mark.kind==="field"){
      const form=pdf.getForm();let name=mark.name||"field";let suffix=1;while(form.getFieldMaybe(name)){name=(mark.name||"field")+"_"+suffix++;}
      const pr=m.Rect.transform(r,inv);
      const options={x:pr[0],y:pr[1],width:pr[2]-pr[0],height:pr[3]-pr[1],font,borderWidth:1,borderColor:pdfRgb(.68,.75,.83),backgroundColor:pdfRgb(.98,.99,1)};
      if(mark.fieldKind==="checkbox"){
        const field=form.createCheckBox(name);if(mark.required)field.enableRequired();field.addToPage(page,options);if(mark.checked)field.check();field.updateAppearances();
      }else if(mark.fieldKind==="dropdown"){
        const items=[...new Set((mark.options||[]).map(s=>s.trim()).filter(Boolean))];if(!items.length||items.length>50||items.some(s=>s.length>120))throw new Error("أضف من خيار واحد إلى 50 خياراً للقائمة.");
        const field=form.createDropdown(name);field.setOptions(items);if(mark.required)field.enableRequired();if(mark.text&&items.includes(mark.text))field.select(mark.text);field.addToPage(page,options);field.setFontSize(Math.max(6,Math.min(mark.size,options.height*.65)));field.updateAppearances(font);
      }else{
        const field=form.createTextField(name);field.setText(mark.text||"");if(mark.required)field.enableRequired();field.addToPage(page,options);field.setFontSize(Math.max(6,Math.min(mark.size,options.height*.65)));field.updateAppearances(font);
      }
    }else{
      const [cr,cg,cb]=rgb(mark.color);const size=Math.max(5,Math.min(mark.size,(r[3]-r[1])/.9));
      const paragraphs=(mark.text||"").split("\n");let lineIndex=0;
      for(const paragraph of paragraphs){const words=paragraph.split(/\s+/);let line="";const lines:string[]=[];
        for(const word of words){const next=line?line+" "+word:word;if(line&&font.widthOfTextAtSize(next,size)>r[2]-r[0]){lines.push(line);line=word;}else line=next;}lines.push(line);
        for(const text of lines){if((lineIndex+.8)*size*1.25>r[3]-r[1])break;const rtl=pdfTextIsRtl(text);const width=font.widthOfTextAtSize(text,size);const position=point(rtl?Math.max(r[0],r[2]-width):r[0],r[1]+size*.85+lineIndex*size*1.25);page.drawText(text,{...position,size,font,color:pdfRgb(cr,cg,cb),rotate:degrees(info.rotation)});lineIndex++;}
      }
    }
  }
  return redactOutput(await pdf.save({updateFieldAppearances:false}),redactions);
}
export async function reorder(bytes:Bytes,indices:number[]){
  const m=await getEngine();const doc=document(m,bytes);
  try{if(!indices.length)throw new Error("يجب إبقاء صفحة واحدة على الأقل.");doc.rearrangePages(indices);return save(doc);}finally{doc.destroy();}
}
export async function rotatePage(bytes:Bytes,index:number){
  const m=await getEngine();const doc=document(m,bytes);const page=doc.findPage(index);
  try{const inherited=page.getInheritable("Rotate");const rotation=inherited.asNumber()||0;inherited.destroy();page.put("Rotate",(rotation+90)%360);return save(doc);}finally{page.destroy();doc.destroy();}
}
export async function appendPdfs(bytes:Bytes,others:Bytes[]) {
  const m=await getEngine();const doc=document(m,bytes);
  try{for(const extra of others){const source=document(m,extra);try{if(source.needsPassword())throw new Error("افتح الملف المحمي أولاً، ثم نزّل نسخة منه قبل الدمج.");if(doc.countPages()+source.countPages()>250)throw new Error("الحد الحالي 250 صفحة.");for(let i=0;i<source.countPages();i++)doc.graftPage(-1,source,i);}finally{source.destroy();}}return save(doc);}finally{doc.destroy();}
}
export function parseRange(value:string,count:number){
  const normalized=value.replace(/[٠-٩]/g,char=>String(char.charCodeAt(0)-0x660)).replace(/[۰-۹]/g,char=>String(char.charCodeAt(0)-0x6f0)).replace(/[\u200e\u200f\u061c]/g,"").replace(/[–—−]/g,"-").replace(/،/g,",");
  const out:number[]=[];
  for(const part of normalized.split(",")){const match=part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);if(!match)throw new Error("اكتب الصفحات مثل 1-3, 5.");const start=Number(match[1]),end=Number(match[2]||start);if(start<1||end<start||end>count)throw new Error("نطاق الصفحات خارج المستند.");for(let i=start;i<=end;i++)if(!out.includes(i-1))out.push(i-1);}
  if(!out.length)throw new Error("اختر صفحة واحدة على الأقل.");return out;
}
export async function compressLossless(bytes:Bytes){const m=await getEngine();const doc=document(m,bytes);try{return save(doc);}finally{doc.destroy();}}
export async function compressVisual(bytes:Bytes,quality:number,progress:(n:number)=>void){
  const {PDFDocument}=await import("pdf-lib");const pdf=await PDFDocument.create();const info=await inspect(bytes);
  for(let i=0;i<info.length;i++){const rendered=await renderPage(bytes,i,quality===.5?850:1200,false);const blob=new Blob([new Uint8Array(rendered.png).buffer]);const bitmap=await createImageBitmap(blob);const canvas=documentCanvas(bitmap.width,bitmap.height);const ctx=canvas.getContext("2d")!;ctx.drawImage(bitmap,0,0);bitmap.close();const image=await pdf.embedJpg(canvas.toDataURL("image/jpeg",quality));const page=pdf.addPage([info[i].width,info[i].height]);page.drawImage(image,{x:0,y:0,width:info[i].width,height:info[i].height});progress((i+1)/info.length);await new Promise(r=>setTimeout(r,0));}
  return pdf.save();
}
function documentCanvas(width:number,height:number){const canvas=globalThis.document.createElement("canvas");canvas.width=width;canvas.height=height;return canvas;}
export async function readFields(bytes:Bytes){const m=await getEngine();const doc=document(m,bytes);const result:FieldInfo[]=[];
  try{for(let i=0;i<doc.countPages();i++){const p=doc.loadPage(i);try{for(const widget of p.getWidgets()){try{if(!widget.isReadOnly()&&(widget.isText()||widget.isChoice()||widget.isCheckbox()))result.push({page:i,name:widget.getName(),value:widget.getValue(),kind:widget.isCheckbox()?"checkbox":widget.isChoice()?"choice":"text",options:widget.isChoice()?widget.getOptions():[],required:(widget.getFieldFlags()&m.PDFWidget.FIELD_IS_REQUIRED)!==0});}finally{widget.destroy();}}}finally{p.destroy();}}return result;}finally{doc.destroy();}
}
export async function fillFields(bytes:Bytes,values:Record<string,string>){
  for(const field of await readFields(bytes)){const value=values[field.name]??field.value;if(field.required&&(!value.trim()||field.kind==="checkbox"&&value==="Off"))throw new Error("الخانة مطلوبة: "+field.name);}
  const [{PDFDocument,PDFTextField,PDFDropdown,PDFOptionList,PDFCheckBox,TextAlignment},fontkit]=await Promise.all([import("pdf-lib"),import("@pdf-lib/fontkit")]);
  const pdf=await PDFDocument.load(bytes);pdf.registerFontkit(bidirectionalFontkit(fontkit.default));const font=await pdf.embedFont(testFont||await fontBytes(),{subset:true});
  for(const field of pdf.getForm().getFields()){
    const value=values[field.getName()];if(value===undefined||field.isReadOnly())continue;
    if(field instanceof PDFTextField){field.setText(value);if(/[\u0600-\u06ff]/.test(value))field.setAlignment(TextAlignment.Right);field.updateAppearances(font);}
    else if(field instanceof PDFDropdown||field instanceof PDFOptionList){field.select(value);field.updateAppearances(font);}
    else if(field instanceof PDFCheckBox){if(value&&value!=="Off")field.check();else field.uncheck();field.updateAppearances();}
  }
  return pdf.save({updateFieldAppearances:false});
}
export async function toWord(bytes:Bytes,filename:string){const m=await getEngine();const doc=document(m,bytes);const texts:string[]=[];
  try{for(let i=0;i<doc.countPages();i++){const p=doc.loadPage(i),text=p.toStructuredText("preserve-whitespace");try{texts.push(text.asText());}finally{text.destroy();p.destroy();}}}finally{doc.destroy();}
  if(!texts.some(t=>t.trim()))throw new Error("هذا الملف مصوّر ولا يحتوي على نص قابل للاستخراج. التحويل الحالي يحتاج PDF نصياً.");
  const {Document,Paragraph,TextRun,Packer}=await import("docx");const word=new Document({title:filename,creator:"Raqzilo",sections:texts.map(text=>({properties:{},children:text.split("\n").map(line=>new Paragraph({bidirectional:/[\u0600-\u06ff]/.test(line),children:[new TextRun({text:line,font:"Arial",size:24,rightToLeft:/[\u0600-\u06ff]/.test(line)})]}))}))});
  return new Uint8Array(await Packer.toArrayBuffer(word));
}
export async function toImages(bytes:Bytes,progress:(n:number)=>void){const {zipSync}=await import("fflate");const count=(await inspect(bytes)).length;const files:Record<string,Bytes>={};for(let i=0;i<count;i++){files["page-"+(i+1)+".png"]=(await renderPage(bytes,i,1600,false)).png;progress((i+1)/count);await new Promise(r=>setTimeout(r,0));}return zipSync(files,{level:0});}
export async function imagesToPdf(files:File[]){const {PDFDocument}=await import("pdf-lib");const pdf=await PDFDocument.create();for(const file of files){const bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>30_000_000){bitmap.close();throw new Error("الصورة كبيرة جداً. قلّل أبعادها أولاً.");}const canvas=documentCanvas(bitmap.width,bitmap.height);canvas.getContext("2d")!.drawImage(bitmap,0,0);bitmap.close();const png=imageBytes(canvas.toDataURL("image/png"));const image=await pdf.embedPng(png);const scale=Math.min(1,1200/image.width,1600/image.height);const width=image.width*scale,height=image.height*scale;const page=pdf.addPage([width,height]);page.drawImage(image,{x:0,y:0,width,height});}return pdf.save();}
export async function makeDemo(){const {PDFDocument,StandardFonts,rgb}=await import("pdf-lib");const pdf=await PDFDocument.create();const regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);const page=pdf.addPage([595,842]);
  const text=(s:string,x:number,y:number,size=11,b=false,color=[.2,.24,.26])=>page.drawText(s,{x,y,size,font:b?bold:regular,color:rgb(color[0],color[1],color[2])});
  page.drawRectangle({x:0,y:776,width:595,height:66,color:rgb(.96,.95,.93)});text("RAQZILO",44,800,16,true);text("SAMPLE DOCUMENT",408,802,8,false,[.5,.5,.5]);
  text("INVOICE",44,708,34,true);text("INV-2026-001",44,682,11,false,[.5,.5,.5]);text("Studio North",384,715,15,true);text("Creative services",384,695);text("Riyadh, Saudi Arabia",384,677);
  text("BILLED TO",44,610,9,true,[.5,.5,.5]);text("Example Client",44,587,15,true);text("Project: Brand identity",44,567);text("ISSUED",384,610,9,true,[.5,.5,.5]);text("04 October 2026",384,587);text("DUE: 18 October 2026",384,567);
  page.drawRectangle({x:44,y:492,width:507,height:33,color:rgb(.95,.95,.94)});text("DESCRIPTION",57,505,9,true);text("QTY",354,505,9,true);text("AMOUNT (SAR)",440,505,9,true);
  [["Brand strategy workshop","1","2,500.00"],["Visual identity design","1","4,000.00"],["Brand guidelines","1","1,500.00"]].forEach((r,i)=>{const y=465-i*44;text(r[0],57,y);text(r[1],362,y);text(r[2],466,y);page.drawLine({start:{x:44,y:y-15},end:{x:551,y:y-15},color:rgb(.9,.9,.88),thickness:.6});});
  text("Subtotal",354,294);text("8,000.00",466,294);text("VAT 15%",354,267);text("1,200.00",466,267);page.drawRectangle({x:341,y:211,width:210,height:36,color:rgb(.87,.41,.29)});text("TOTAL",354,224,11,true,[1,1,1]);text("SAR 9,200.00",452,224,11,true,[1,1,1]);
  text("Payment details",44,171,11,true);text("Account number: 1234 5678 9012",44,150,10);text("This is a sample invoice for trying the editor.",44,113,10,false,[.5,.5,.5]);page.drawLine({start:{x:44,y:75},end:{x:551,y:75},color:rgb(.88,.88,.87),thickness:.5});text("Thank you for your business.",44,55,9);text("1 / 1",525,55,9);
  return pdf.save();}
export function download(bytes:Bytes,name:string,mime="application/pdf"){const blob=new Blob([new Uint8Array(bytes).buffer],{type:mime}),url=URL.createObjectURL(blob),a=globalThis.document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),15000);}

export type NumberPosition="bottomCenter"|"bottomRight"|"bottomLeft"|"topCenter";
type PageGeometry={bounds:MuPDF.Rect;inverse:MuPDF.Matrix;rotation:number};
async function nativeTextOverlay(bytes:Bytes,draw:(info:PageGeometry,index:number,total:number,width:(text:string,size:number)=>number)=>{text:string;size:number;x:number;y:number;color:string;opacity:number;angle:number}){
  const m=await getEngine();const source=document(m,bytes);const geometry:PageGeometry[]=[];
  try{for(let index=0;index<source.countPages();index++){const page=source.loadPage(index);try{const rotate=page.getObject().getInheritable("Rotate");geometry.push({bounds:page.getBounds(),inverse:m.Matrix.invert(page.getTransform()),rotation:rotate.asNumber()||0});rotate.destroy();}finally{page.destroy();}}}finally{source.destroy();}
  const [{PDFDocument,rgb:pdfRgb,degrees},fontkit]=await Promise.all([import("pdf-lib"),import("@pdf-lib/fontkit")]);
  const pdf=await PDFDocument.load(bytes);pdf.registerFontkit(bidirectionalFontkit(fontkit.default));const font=await pdf.embedFont(testFont||await fontBytes(),{subset:true});
  for(let index=0;index<geometry.length;index++){const info=geometry[index],data=draw(info,index,geometry.length,(text,size)=>font.widthOfTextAtSize(text,size));const inv=info.inverse;const x=inv[0]*data.x+inv[2]*data.y+inv[4],y=inv[1]*data.x+inv[3]*data.y+inv[5];const [r,g,b]=rgb(data.color);pdf.getPage(index).drawText(data.text,{x,y,size:data.size,font,color:pdfRgb(r,g,b),opacity:data.opacity,rotate:degrees(info.rotation+data.angle)});}
  return pdf.save({updateFieldAppearances:false});
}
export async function numberPages(bytes:Bytes,{start=1,position="bottomCenter",size=11,color="#5e6570"}:{start?:number;position?:NumberPosition;size?:number;color?:string}={}){
  if(!Number.isInteger(start)||start<1||start>99999||!Number.isFinite(size)||size<6||size>30||!["bottomCenter","bottomRight","bottomLeft","topCenter"].includes(position)||!/^#[0-9a-fA-F]{6}$/.test(color))throw new Error("قيم ترقيم الصفحات غير صالحة.");
  return nativeTextOverlay(bytes,(info,index,total,width)=>{const b=info.bounds,w=b[2]-b[0],h=b[3]-b[1],text=`${start+index} / ${start+total-1}`,fontSize=Math.min(size,h*.04),textWidth=width(text,fontSize);const x=position==="bottomRight"?b[2]-w*.04-textWidth:position==="bottomLeft"?b[0]+w*.04:b[0]+(w-textWidth)/2;const y=position==="topCenter"?b[1]+h*.04+fontSize*.7:b[3]-h*.03;return{text,x,y,size:fontSize,color,opacity:1,angle:0};});
}
export async function watermark(bytes:Bytes,{text,size=38,color="#64748b",opacity=.18}:{text:string;size?:number;color?:string;opacity?:number}){
  const value=text.trim();if(!value||value.length>120||!Number.isFinite(size)||size<10||size>100||!Number.isFinite(opacity)||opacity<.05||opacity>.6||!/^#[0-9a-fA-F]{6}$/.test(color))throw new Error("راجع نص العلامة المائية وإعداداتها.");
  return nativeTextOverlay(bytes,(info,_index,_total,width)=>{const b=info.bounds,w=b[2]-b[0],h=b[3]-b[1],unitWidth=width(value,1),theta=Math.PI/6,fontSize=Math.min(size,w*.82/(unitWidth*Math.cos(theta)+1.2*Math.sin(theta)),h*.7/(unitWidth*Math.sin(theta)+1.2*Math.cos(theta))),textWidth=width(value,fontSize),angle=30;return{text:value,x:b[0]+w/2-textWidth*Math.cos(theta)/2,y:b[1]+h/2+textWidth*Math.sin(theta)/2+fontSize*.3,size:fontSize,color,opacity,angle};});
}
export async function insertBlankPage(bytes:Bytes,index:number){const {PDFDocument}=await import("pdf-lib");const pdf=await PDFDocument.load(bytes);if(pdf.getPageCount()>=250)throw new Error("الحد الحالي 250 صفحة.");if(!Number.isInteger(index)||index<0||index>pdf.getPageCount())throw new Error("موضع الصفحة غير صالح.");const info=await inspect(bytes),reference=info[Math.min(index,info.length-1)];pdf.insertPage(index,[reference.width,reference.height]);return pdf.save({updateFieldAppearances:false});}

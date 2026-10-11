import { bidirectionalFontkit } from "./pdf-text-layout.ts";
import {translate,type Language} from "./translations";
import {getEngine,type Bytes,type Box,type Mark} from "./pdf-engine";

export type Margins={top:number;bottom:number;left:number;right:number};
export function cropBox(margins:Margins):Box{
  const values=Object.values(margins);
  if(values.length!==4||values.some(v=>!Number.isFinite(v)||v<0||v>90)||margins.left+margins.right>=95||margins.top+margins.bottom>=95)throw new Error("راجع الهوامش؛ يجب إبقاء 5% على الأقل من عرض الصفحة وارتفاعها.");
  return{x:margins.left/100,y:margins.top/100,w:1-(margins.left+margins.right)/100,h:1-(margins.top+margins.bottom)/100};
}
export async function cropPages(bytes:Bytes,indices:number[],margins:Margins){
  const box=cropBox(margins),m=await getEngine(),doc=new m.PDFDocument(bytes);
  try{
    if(!indices.length||indices.some(i=>!Number.isInteger(i)||i<0||i>=doc.countPages()))throw new Error("نطاق الصفحات غير صالح.");
    for(const index of new Set(indices)){
      const page=doc.loadPage(index);
      try{
        const b=page.getBounds(),w=b[2]-b[0],h=b[3]-b[1];
        const visible:[number,number,number,number]=[b[0]+box.x*w,b[1]+box.y*h,b[0]+(box.x+box.w)*w,b[1]+(box.y+box.h)*h];
        const original=m.Rect.transform(visible,m.Matrix.invert(page.getTransform()));
        const object=page.getObject();try{object.put("CropBox",original);}finally{object.destroy();}
      }finally{page.destroy();}
    }
    const buffer=doc.saveToBuffer("garbage=4,compress,encrypt=none");try{return buffer.asUint8Array().slice();}finally{buffer.destroy();}
  }finally{doc.destroy();}
}
export async function protectPdf(bytes:Bytes,password:string){
  if(password.length<4||new TextEncoder().encode(password).length>100||/[\x00-\x1f\x7f]/.test(password))throw new Error("استخدم كلمة مرور من 4 أحرف إلى 100 بايت، دون أسطر جديدة.");
  const m=await getEngine(),doc=new m.PDFDocument(bytes);
  try{
    // JSON options preserve commas, quotes, equals signs and Unicode in passwords.
    const options=JSON.stringify({garbage:4,compress:true,encrypt:"aes-256","user-password":password,"owner-password":password});
    const buffer=doc.saveToBuffer(options);try{return buffer.asUint8Array().slice();}finally{buffer.destroy();}
  }finally{doc.destroy();}
}
export type PageComparison={index:number;status:"same"|"changed"|"added"|"removed";before:string;after:string;visualChanged:boolean;boxes:Box[];rasterWidth:number;rasterHeight:number;beforeRasterWidth:number;afterRasterWidth:number};
export type TextDifference={text:string;kind:"same"|"added"|"removed"};
export function textDifferences(before:string,after:string):TextDifference[]{
  if(before===after)return before?[{text:before,kind:"same"}]:[];
  const a=before.split("\n"),b=after.split("\n");
  // Bound memory for exceptionally long extracted pages.
  if(a.length*b.length>1_000_000)return[{text:before,kind:"removed"},{text:after,kind:"added"}];
  const table=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
  for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)table[i][j]=a[i]===b[j]?table[i+1][j+1]+1:Math.max(table[i+1][j],table[i][j+1]);
  const result:TextDifference[]=[];let i=0,j=0;
  while(i<a.length||j<b.length){
    if(i<a.length&&j<b.length&&a[i]===b[j]){result.push({text:a[i++],kind:"same"});j++;}
    else if(j<b.length&&(i===a.length||table[i][j+1]>=table[i+1][j]))result.push({text:b[j++],kind:"added"});
    else result.push({text:a[i++],kind:"removed"});
  }
  return result;
}
type Raster={width:number;height:number;stride:number;pixels:Uint8ClampedArray;pageWidth:number;pageHeight:number;text:string};
async function raster(doc:InstanceType<Awaited<ReturnType<typeof getEngine>>["PDFDocument"]>,index:number):Promise<Raster|null>{
  if(index>=doc.countPages())return null;
  const m=await getEngine(),page=doc.loadPage(index);
  try{
    const bounds=page.getBounds(),pageWidth=bounds[2]-bounds[0],pageHeight=bounds[3]-bounds[1];
    const scale=Math.min(480/pageWidth,1000/pageHeight),pixmap=page.toPixmap(m.Matrix.scale(scale,scale),m.ColorSpace.DeviceRGB,false,true);
    const structured=page.toStructuredText("preserve-whitespace");
    try{return{width:pixmap.getWidth(),height:pixmap.getHeight(),stride:pixmap.getStride(),pixels:pixmap.getPixels().slice(),pageWidth,pageHeight,text:structured.asText().trim()};}
    finally{structured.destroy();pixmap.destroy();}
  }finally{page.destroy();}
}
function rasterDifferences(a:Raster,b:Raster):Box[]{
  const width=Math.max(a.width,b.width),height=Math.max(a.height,b.height),tile=20,boxes:Box[]=[];
  const value=(r:Raster,x:number,y:number,c:number)=>x<r.width&&y<r.height?r.pixels[y*r.stride+x*3+c]:255;
  for(let y=0;y<height;y+=tile)for(let x=0;x<width;x+=tile){
    const w=Math.min(tile,width-x),h=Math.min(tile,height-y);let different=0;
    for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)if(Math.abs(value(a,xx,yy,0)-value(b,xx,yy,0))>28||Math.abs(value(a,xx,yy,1)-value(b,xx,yy,1))>28||Math.abs(value(a,xx,yy,2)-value(b,xx,yy,2))>28)different++;
    if(different>=Math.max(2,w*h*.01))boxes.push({x:x/width,y:y/height,w:w/width,h:h/height});
  }
  return boxes;
}
export async function comparePdfs(before:Bytes,after:Bytes,indices:number[],progress:(n:number)=>void=()=>{}){
  const m=await getEngine(),a=new m.PDFDocument(before),b=new m.PDFDocument(after),out:PageComparison[]=[];
  try{
    const total=Math.max(a.countPages(),b.countPages());
    if(!indices.length||indices.some(i=>!Number.isInteger(i)||i<0||i>=total))throw new Error("نطاق المقارنة غير صالح.");
    for(let n=0;n<indices.length;n++){
      const index=indices[n],first=await raster(a,index),second=await raster(b,index);
      const boxes=first&&second?rasterDifferences(first,second):[],visualChanged=!!(first&&second&&(boxes.length||Math.abs(first.pageWidth-second.pageWidth)>.5||Math.abs(first.pageHeight-second.pageHeight)>.5));
      out.push({index,status:!first?"added":!second?"removed":first.text!==second.text||visualChanged?"changed":"same",before:first?.text||"",after:second?.text||"",visualChanged,boxes,rasterWidth:Math.max(first?.width||0,second?.width||0),rasterHeight:Math.max(first?.height||0,second?.height||0),beforeRasterWidth:first?.width||0,afterRasterWidth:second?.width||0});
      progress((n+1)/indices.length);await new Promise(r=>setTimeout(r,0));
    }
    return out;
  }finally{a.destroy();b.destroy();}
}
export async function textToWord(texts:string[],title:string){
  const {Document,Paragraph,TextRun,Packer}=await import("docx");
  const doc=new Document({title,creator:"Mustanad",sections:texts.map(text=>({children:text.split("\n").map(line=>new Paragraph({bidirectional:/[\u0600-\u06ff]/.test(line),children:[new TextRun({text:line,font:"Arial",size:24,rightToLeft:/[\u0600-\u06ff]/.test(line)})]}))}))});
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}
export type OcrWord=Box&{text:string};
export type OcrPage={index:number;text:string;confidence:number;words:OcrWord[]};
export async function searchablePdf(bytes:Bytes,pages:OcrPage[],fontData:Bytes){
  const [{PDFDocument,rgb},fontkit,m]=await Promise.all([import("pdf-lib"),import("@pdf-lib/fontkit"),getEngine()]);
  const pdf=await PDFDocument.load(bytes);pdf.registerFontkit(bidirectionalFontkit(fontkit.default));const font=await pdf.embedFont(fontData,{subset:true}),source=new m.PDFDocument(bytes);
  try{
    for(const recognized of pages){
      const page=source.loadPage(recognized.index);
      try{
        const b=page.getBounds(),inv=m.Matrix.invert(page.getTransform()),w=b[2]-b[0],h=b[3]-b[1];
        const rotationObj=page.getObject().getInheritable("Rotate"),rotation=rotationObj.asNumber()||0;rotationObj.destroy();
        const {degrees}=await import("pdf-lib");
        for(const word of recognized.words){
          const text=word.text.trim();if(!text)continue;
          const size=Math.max(1,Math.min(word.h*h*.85,word.w*w/Math.max(.001,font.widthOfTextAtSize(text,1))));
          const px=b[0]+word.x*w,py=b[1]+word.y*h+word.h*h*.8;
          pdf.getPage(recognized.index).drawText(text,{x:inv[0]*px+inv[2]*py+inv[4],y:inv[1]*px+inv[3]*py+inv[5],font,size,color:rgb(0,0,0),opacity:0,rotate:degrees(rotation)});
        }
      }finally{page.destroy();}
    }
    return pdf.save({updateFieldAppearances:false});
  }finally{source.destroy();}
}
export type TemplateKind="invoice"|"letter"|"form";
export async function createTemplate(kind:TemplateKind,brand:string,accent:string,language:Language="ar"){
  const t=(source:string)=>translate(language,source);
  const {PDFDocument,rgb}=await import("pdf-lib");const pdf=await PDFDocument.create();const page=pdf.addPage([595,842]);
  const cr=parseInt(accent.slice(1,3),16)/255,cg=parseInt(accent.slice(3,5),16)/255,cb=parseInt(accent.slice(5,7),16)/255;
  page.drawRectangle({x:35,y:760,width:525,height:4,color:rgb(cr,cg,cb)});
  for(const y of kind==="invoice"?[480,440,400,360,320]:kind==="letter"?[650,600,550,500,450,400]:[610,530,450,370])page.drawLine({start:{x:40,y},end:{x:555,y},thickness:.6,color:rgb(.84,.86,.88)});
  const title=t({invoice:"فاتورة",letter:"خطاب",form:"نموذج بيانات"}[kind]);
  const marks:Mark[]=[];
  const add=(text:string,x:number,y:number,w:number,h:number,size=16,field=false,name?:string)=>marks.push({id:crypto.randomUUID(),page:0,kind:field?"field":"text",text:field?text:t(text),x:language==="en"?1-x-w:x,y,w,h,size,color:"#20282b",name});
  add(brand,.09,.04,.83,.04,16);add(title,language==="en"?.09:.5,.105,language==="en"?.83:.42,.06,30);
  if(kind==="invoice"){
    add("رقم الفاتورة: __________",.5,.22,.42,.05);add("التاريخ: __________",.08,.22,.35,.05);
    add("العميل: __________________________",.3,.29,.62,.05);
    add("الوصف",.53,.385,.39,.04,14);add("الكمية",.35,.385,.13,.04,14);add("المبلغ",.09,.385,.2,.04,14);
    ["الخدمة الأولى","الخدمة الثانية","الخدمة الثالثة"].forEach((s,i)=>{const y=.435+i*.05;add(s,.53,y,.39,.04,14);add("١",.35,y,.13,.04,14);add("٠٫٠٠",.09,y,.2,.04,14);});
    add("الإجمالي: __________ ريال",.4,.665,.52,.05,20);add("ملاحظات: ______________________________",.08,.77,.84,.06,14);
  }else if(kind==="letter"){
    add("التاريخ: __________",.55,.2,.37,.04);add("إلى: __________________________",.3,.26,.62,.05);
    add("الموضوع: __________________________",.16,.33,.76,.05,18);
    add("السلام عليكم ورحمة الله وبركاته،\n\nاكتب نص خطابك هنا.\n\nوتفضلوا بقبول التحية والتقدير.",.09,.42,.83,.31,17);
    add("الاسم: __________\nالتوقيع: __________",.45,.79,.47,.1);
  }else{
    ["الاسم","البريد الإلكتروني","رقم التواصل","ملاحظات"].forEach((s,i)=>{add(s,.62,.24+i*.1,.3,.04);add("",.09,.245+i*.1,.5,.045,14,true,"form_"+(i+1));});
    add("الموافقة على البيانات",.43,.73,.42,.05,16);marks.push({id:crypto.randomUUID(),page:0,kind:"field",fieldKind:"checkbox",name:"agreement",x:language==="en"?.095:.87,y:.735,w:.035,h:.025,size:12,color:accent});
  }
  return{bytes:await pdf.save(),marks,title};
}

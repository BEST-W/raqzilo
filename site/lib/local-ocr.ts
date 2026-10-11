import type {Worker,Page} from "tesseract.js";
import {renderPage,type Bytes} from "./pdf-engine";
import type {OcrPage,OcrWord} from "./local-pdf-tools";
export type OcrLanguage="ara"|"eng"|"ara+eng";
export type OcrLayout="auto"|"block"|"line";
type Progress=(message:string,value:number)=>void;
function abortable<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{
  if(signal.aborted)return Promise.reject(new Error("تم إلغاء القراءة."));
  return new Promise((resolve,reject)=>{
    const abort=()=>{reject(new Error("تم إلغاء القراءة."));};signal.addEventListener("abort",abort,{once:true});
    promise.then(resolve,reject).finally(()=>signal.removeEventListener("abort",abort));
  });
}
export function ocrWords(data:Pick<Page,"blocks">,width:number,height:number):OcrWord[]{
  const words:OcrWord[]=[];
  for(const block of data.blocks||[])for(const paragraph of block.paragraphs||[])for(const line of paragraph.lines||[])for(const word of line.words||[]){
    const b=word.bbox;if(word.text?.trim())words.push({text:word.text,x:b.x0/width,y:b.y0/height,w:(b.x1-b.x0)/width,h:(b.y1-b.y0)/height});
  }
  return words;
}
export async function recognizePdf(bytes:Bytes,indices:number[],language:OcrLanguage,progress:Progress,signal:AbortSignal,layout:OcrLayout="auto"){
  if(!indices.length||indices.length>20)throw new Error("اختر من صفحة واحدة إلى 20 صفحة في كل عملية OCR.");
  let worker:Worker|undefined,done=0;const abort=()=>{void worker?.terminate().catch(()=>{});};signal.addEventListener("abort",abort,{once:true});
  try{
    progress("تجهيز قارئ النصوص على جهازك…",0);
    const url="/vendor/ocr/tesseract.esm.min.js";
    // The browser distribution exposes Tesseract through its default ESM export.
    const loaded=await import(/* webpackIgnore: true */ url) as {default?:typeof import("tesseract.js")}&Partial<typeof import("tesseract.js")>;
    const tesseract=(loaded.default||loaded) as typeof import("tesseract.js");
    const creating=tesseract.createWorker(language,1,{
      workerPath:location.origin+"/vendor/ocr/worker.min.js",corePath:location.origin+"/vendor/ocr/core",langPath:location.origin+"/vendor/ocr/lang",
      workerBlobURL:false,cachePath:"mustanad-ocr-v6",logger:event=>{
        if(signal.aborted)return;
        const reading=event.status==="recognizing text";
        progress(reading?`قراءة الصفحة ${indices[done]+1} (${done+1}/${indices.length})…`:"تحميل وتجهيز ملفات اللغة…",reading?(done+event.progress)/indices.length:0);
      },
    });
    creating.then(created=>{if(signal.aborted)void created.terminate();},()=>{});
    worker=await abortable(creating,signal);
    const modes={auto:tesseract.PSM.AUTO,block:tesseract.PSM.SINGLE_BLOCK,line:tesseract.PSM.SINGLE_LINE};
    await abortable(worker.setParameters({tessedit_pageseg_mode:modes[layout],preserve_interword_spaces:"1",user_defined_dpi:"200"}),signal);
    const results:OcrPage[]=[];
    for(done=0;done<indices.length;done++){
      if(signal.aborted)throw new Error("تم إلغاء القراءة.");
      const index=indices[done];progress(`تجهيز الصفحة ${index+1}…`,done/indices.length);
      const image=await renderPage(bytes,index,1800,false),blob=new Blob([new Uint8Array(image.png).buffer],{type:"image/png"});
      const bitmap=await createImageBitmap(blob);const width=bitmap.width,height=bitmap.height;bitmap.close();
      const result=await abortable(worker.recognize(blob,{}, {text:true,blocks:true}),signal);
      results.push({index,text:result.data.text.trim(),confidence:result.data.confidence,words:ocrWords(result.data,width,height)});
      progress(`اكتملت قراءة الصفحة ${index+1}.`,(done+1)/indices.length);
    }
    return results;
  }finally{signal.removeEventListener("abort",abort);if(worker)await worker.terminate().catch(()=>{});}
}

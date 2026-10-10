"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Copy, ExternalLink, FileText, Link as LinkIcon, LoaderCircle, RefreshCw, Trash2, Upload } from "lucide-react";
import { useLanguage } from "./language-provider";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { SHARE_MAX_BYTES, type SharedFile } from "@/lib/sharing-model";

type List = {items: SharedFile[]; storage?: {bytes:number;count:number;maxBytes:number}};
const sizeLabel = (size:number) => size < 1048576 ? `${Math.round(size / 1024)} KB` : `${(size / 1048576).toFixed(1)} MB`;
async function result<T>(response:Response):Promise<T> {
  const data=await response.json() as T & {error?:string};
  if (!response.ok) throw new Error(data.error || "تعذر إكمال العملية. حاول مرة أخرى.");
  return data;
}
export default function SharePanel({ownerMode=false,currentName,getCurrentFile,enabled=true}:{ownerMode?:boolean;currentName?:string;getCurrentFile?:()=>Promise<File>;enabled?:boolean}) {
  const {t,message:translateError,language}=useLanguage();
  const [file,setFile]=useState<File|null>(null),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false);
  const [list,setList]=useState<List>({items:[]}),[loading,setLoading]=useState(true),[notice,setNotice]=useState(""),[error,setError]=useState("");
  const [created,setCreated]=useState<SharedFile|null>(null),[removeId,setRemoveId]=useState<string|null>(null),[origin,setOrigin]=useState("");
  const picker=useRef<HTMLInputElement>(null),consentId=useId();
  async function refresh() {
    setLoading(true);
    try {setList(await result<List>(await fetch("/api/shares"+(ownerMode?"?scope=all":""),{cache:"no-store"})));}
    catch(e){setError(e instanceof Error?e.message:"تعذر إكمال العملية. حاول مرة أخرى.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{setOrigin(location.origin);void refresh();},[ownerMode]); // eslint-disable-line react-hooks/exhaustive-deps
  function choose(next:File|null) {
    setError("");setNotice("");setCreated(null);setConsent(false);
    if(!next){setFile(null);return;}
    if(!/\.pdf$/i.test(next.name)||next.size===0){setError("اختر ملف PDF صالحاً.");setFile(null);return;}
    if(next.size>SHARE_MAX_BYTES){setError("الملف أكبر من الحد المتاح للمشاركة.");setFile(null);return;}
    setFile(next);
  }
  async function useCurrent() {
    if(!getCurrentFile)return;
    setBusy(true);setError("");
    try{choose(await getCurrentFile());}catch(e){setError(e instanceof Error?e.message:"تعذر تجهيز المستند.");}finally{setBusy(false);}
  }
  async function upload() {
    if(!file||!consent||busy)return;
    setBusy(true);setError("");setNotice("");
    try {
      const grant=await result<{id:string;uploadToken:string}>(await fetch("/api/shares",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({filename:file.name.slice(0,146).replace(/\.pdf$/i,"")+".pdf",size:file.size,consent:true})}));
      const data=await result<{file:SharedFile}>(await fetch("/api/shares/"+grant.id,{method:"PUT",headers:{"Content-Type":"application/pdf","X-Upload-Token":grant.uploadToken},body:file}));
      setCreated(data.file);setFile(null);setConsent(false);setNotice("تم إنشاء الرابط. يمكنك نسخه ومشاركته الآن.");await refresh();
    } catch(e){setError(e instanceof Error?e.message:"تعذر إكمال العملية. حاول مرة أخرى.");}
    finally{setBusy(false);}
  }
  async function copy(item:SharedFile) {
    try{await navigator.clipboard.writeText(location.origin+item.path);setNotice("تم نسخ رابط المشاركة.");setError("");}
    catch{setError("تعذر النسخ التلقائي. حدّد الرابط وانسخه يدوياً.");}
  }
  async function remove(item:SharedFile) {
    setBusy(true);setError("");setNotice("");
    try{await result(await fetch("/api/shares/"+item.id,{method:"DELETE"}));setList(prev=>({...prev,items:prev.items.filter(f=>f.id!==item.id)}));if(created?.id===item.id)setCreated(null);setRemoveId(null);setNotice("تم حذف الملف وتعطيل رابطه.");await refresh();}
    catch(e){setError(e instanceof Error?e.message:"تعذر إكمال العملية. حاول مرة أخرى.");}
    finally{setBusy(false);}
  }
  return <section className="share-panel" aria-busy={busy}>
    <div className="card-heading"><LinkIcon size={23}/><div><h2>{t(ownerMode?"إدارة الملفات المشتركة":"PDF إلى رابط")}</h2><p>{t(ownerMode?"احذف أي ملف أو انسخ رابطه. صلاحية الحذف متاحة للمالك فقط.":"ارفع نسخة، ثم شارك رابطها مع من تريد.")}</p></div></div>
    {!ownerMode && <>
      <p className="share-privacy">{t("هذه الأداة تحفظ نسخة من الملف على سيرفر الموقع. أي شخص لديه الرابط يستطيع عرضها وتنزيلها. لا تشارك مستنداً حساساً إلا إذا كنت تريد إتاحته لحاملي الرابط.")}</p>
      <div className="share-picker"><input ref={picker} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label={t("اختيار PDF للمشاركة")} disabled={busy||!enabled} onChange={e=>{choose(e.target.files?.[0]??null);e.target.value="";}}/>
        <Button variant="outline" disabled={busy||!enabled} onClick={()=>picker.current?.click()}><Upload size={17}/>{t("اختر PDF من جهازك")}</Button>
        {getCurrentFile&&<Button variant="outline" disabled={busy||!enabled} onClick={()=>void useCurrent()}><FileText size={17}/>{t("استخدم المستند الحالي مع تعديلاته")}</Button>}
        <small>{t("حتى 10 ميجابايت للملف · 5 روابط يومياً لكل متصفح")}</small>
      </div>
      {currentName&&getCurrentFile&&<p className="share-small">{t("المستند المفتوح:")} <b dir="auto">{currentName}</b></p>}
      {file&&<div className="share-selected"><FileText size={20}/><span dir="auto">{file.name}</span><small dir="ltr">{sizeLabel(file.size)}</small></div>}
      <label htmlFor={consentId} className="share-consent"><input id={consentId} type="checkbox" checked={consent} disabled={busy||!file||!enabled} onChange={e=>setConsent(e.target.checked)}/><span>{t("أوافق على رفع نسخة من هذا الملف وإتاحتها لكل من لديه الرابط.")}</span></label>
      <Button className="brand-button" disabled={!file||!consent||busy||!enabled} onClick={()=>void upload()}>{busy?<LoaderCircle className="spin" size={17}/>:<LinkIcon size={17}/>} {t(busy?"جارٍ تجهيز رابط المشاركة…":"إنشاء رابط المشاركة")}</Button>
      {!enabled&&<p className="notice error">{t("إنشاء روابط المشاركة غير متاح حالياً.")}</p>}
    </>}
    {error&&<div className="notice error" role="alert"><p>{translateError(error)}</p>{error==="طلب الرفع غير مسموح. أعد اختيار الملف."&&<a className="text-link" href="/share" target="_blank" rel="noopener noreferrer">{t("إذا استمر الخطأ، افتح أداة المشاركة في تبويب جديد وأعد اختيار الملف.")}<ExternalLink size={15}/></a>}</div>}
    {notice&&<p className="notice success" role="status">{t(notice)}</p>}
    {created&&<div className="share-result"><label className="form-label">{t("رابط مباشر للملف")}<Input dir="ltr" readOnly value={origin+created.path} onFocus={e=>e.target.select()}/></label><p className="share-small">{t("يفتح PDF مباشرة دون صفحة الموقع أو تسجيل دخول. يحتاج اتصالاً بالإنترنت لفتحه، ويمكن حفظه للاستخدام دون اتصال.")}</p><div className="share-actions"><Button variant="outline" onClick={()=>void copy(created)}><Copy size={16}/>{t("نسخ الرابط")}</Button><a className="text-link" href={created.path} target="_blank" rel="noopener noreferrer">{t("فتح الملف مباشرة")}<ExternalLink size={15}/></a></div></div>}
    <div className="share-list-heading"><h3>{t(ownerMode?"ملفات الموقع المشتركة":"ملفاتك المشتركة")}</h3><Button variant="ghost" disabled={loading||busy} onClick={()=>{setError("");void refresh();}} aria-label={t("تحديث الملفات المشتركة")}><RefreshCw size={16} className={loading?"spin":""}/></Button></div>
    {ownerMode&&list.storage&&<p className="share-small">{t("التخزين المستخدم:")} <b dir="ltr">{sizeLabel(list.storage.bytes)} / {sizeLabel(list.storage.maxBytes)}</b> · {t("{0} ملفات",{"0":list.storage.count})}</p>}
    {loading?<p className="share-small" role="status">{t("جارٍ تحميل الملفات…")}</p>:list.items.length===0?<div className="share-empty"><FileText size={23}/><p>{t("لا توجد ملفات مشتركة بعد.")}</p></div>:<ul className="share-file-list">{list.items.map(item=><li key={item.id}>
      <div className="share-file-info"><FileText size={21}/><div><a href={item.path} target="_blank" rel="noopener noreferrer" dir="auto">{item.filename}</a><small>{sizeLabel(item.size)} · {new Date(item.createdAt).toLocaleDateString(language==="ar"?"ar-SA":"en-GB")}</small></div></div>
      <div className="share-actions"><Button variant="outline" size="sm" disabled={busy} onClick={()=>void copy(item)}><Copy size={14}/>{t("نسخ الرابط")}</Button><Button variant="ghost" size="sm" disabled={busy} onClick={()=>setRemoveId(item.id)} aria-label={t("حذف الملف المشترك")+": "+item.filename}><Trash2 size={16}/></Button></div>
      {removeId===item.id&&<div className="share-delete-confirm"><p>{t("حذف هذا الملف؟ سيتوقف الرابط عن العمل لجميع من شاركته معهم.")}</p><div className="share-actions"><Button variant="destructive" size="sm" disabled={busy} onClick={()=>void remove(item)}>{t("حذف الملف")}</Button><Button variant="outline" size="sm" disabled={busy} onClick={()=>setRemoveId(null)}>{t("إلغاء")}</Button></div></div>}
    </li>)}</ul>}
    {!ownerMode&&<p className="share-small">{t("الرابط يعمل حتى تحذف الملف. إدارة ملفاتك مرتبطة بهذا المتصفح؛ إذا مسحت بياناته، تواصل مع مالك الموقع لحذفها.")}</p>}
  </section>;
}

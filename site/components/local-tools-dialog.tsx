"use client";
import { useLanguage } from "@/components/language-provider";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Download, LoaderCircle, Check, Crop, FileText, Upload, Square, LockKeyhole } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { appearanceVariables, toolLabels, type Settings } from "@/lib/settings-model";
import * as engine from "@/lib/pdf-engine";
import * as local from "@/lib/local-pdf-tools";
import { recognizePdf, type OcrLanguage, type OcrLayout } from "@/lib/local-ocr";
export type LocalTool = "crop" | "protect" | "compare" | "ocr" | "templates";
export function isLocalTool(value: string): value is LocalTool { return ["crop", "protect", "compare", "ocr", "templates"].includes(value); }
type Props = {
    tool: LocalTool;
    label?: string;
    settings: Settings;
    name: string;
    page: number;
    pages: engine.PageInfo[];
    preview: string;
    getBytes: () => Promise<engine.Bytes>;
    onApply: (bytes: engine.Bytes) => Promise<void>;
    onCreate: (template: Awaited<ReturnType<typeof local.createTemplate>>) => Promise<void>;
    onClose: () => void;
    onBusy: (label: string) => void;
};
const statusNames = { same: "متطابقة", changed: "تغيّرت", added: "مضافة في الثانية", removed: "محذوفة من الثانية" };
export default function LocalToolsDialog({ tool, label, settings, name, page, pages, preview, getBytes, onApply, onCreate, onClose, onBusy }: Props) {
    const { t, dir, language: uiLanguage, message: localizeMessage } = useLanguage();
    const [working, setWorking] = useState(""), [error, setError] = useState(""), [note, setNote] = useState(""), [progress, setProgress] = useState(0);
    const workingRef = useRef(false), abortRef = useRef<AbortController | null>(null), urlRef = useRef<string[]>([]);
    const [range, setRange] = useState(String(page + 1)), [margins, setMargins] = useState<local.Margins>({ top: 5, bottom: 5, left: 5, right: 5 });
    const [password, setPassword] = useState(""), [repeat, setRepeat] = useState(""), [showPassword, setShowPassword] = useState(false);
    const [other, setOther] = useState<{
        name: string;
        bytes: engine.Bytes;
        count: number;
    } | null>(null), [pendingOther, setPendingOther] = useState<File | null>(null), [otherPassword, setOtherPassword] = useState("");
    const [comparison, setComparison] = useState<local.PageComparison[]>([]), [selected, setSelected] = useState(0), [showIdentical, setShowIdentical] = useState(false);
    const [pair, setPair] = useState<{
        before: string;
        after: string;
    }>({ before: "", after: "" }), sourceRef = useRef<engine.Bytes | null>(null);
    const [ocrLanguage, setOcrLanguage] = useState<OcrLanguage>("ara+eng"), [recognized, setRecognized] = useState<local.OcrPage[]>([]), ocrSource = useRef<engine.Bytes | null>(null);
    const [layout, setLayout] = useState<OcrLayout>("auto");
    const [template, setTemplate] = useState<local.TemplateKind>("invoice");
    const base = name.replace(/\.pdf$/i, "") || t("مستند"), totalComparison = Math.max(pages.length, other?.count || 0);
    const row = comparison.find(r => r.index === selected), visible = comparison.filter(r => showIdentical || r.status !== "same");
    const allText = recognized.map(r => t("الصفحة {0}\n{1}", { "0": r.index + 1, "1": r.text })).join("\n\n");
    const frame = (() => { try {
        return local.cropBox(margins);
    }
    catch {
        return null;
    } })();
    useEffect(() => () => { abortRef.current?.abort(); urlRef.current.forEach(url => URL.revokeObjectURL(url)); }, []);
    async function job(message: string, fn: () => Promise<void>) {
        if (workingRef.current)
            return;
        workingRef.current = true;
        setWorking(message);
        onBusy(message);
        setError("");
        setNote("");
        setProgress(0);
        try {
            await fn();
        }
        catch (e) {
            setError(e instanceof Error ? localizeMessage(e.message) : t("تعذر إكمال العملية."));
        }
        finally {
            workingRef.current = false;
            setWorking("");
            onBusy("");
        }
    }
    async function readOther(file: File, pass = "") {
        if (file.size > settings.maxFileMB * 1024 * 1024)
            throw new Error(t("أقصى حجم {0} ميجابايت.", { "0": settings.maxFileMB }));
        if (!/\.pdf$/i.test(file.name))
            throw new Error(t("اختر ملف PDF."));
        try {
            const data = await engine.unlock(new Uint8Array(await file.arrayBuffer()), pass), info = await engine.inspect(data);
            setOther({ name: file.name, bytes: data, count: info.length });
            setPendingOther(null);
            setOtherPassword("");
            setComparison([]);
            setPair({ before: "", after: "" });
            setRange(`1-${Math.max(pages.length, info.length)}`);
        }
        catch (e) {
            if (e instanceof Error && localizeMessage(e.message) === "PASSWORD") {
                setPendingOther(file);
                throw new Error(pass ? t("كلمة مرور الملف الثاني غير صحيحة.") : t("الملف الثاني محمي؛ أدخل كلمة مروره أدناه."));
            }
            throw e;
        }
    }
    async function showPair(result: local.PageComparison, before: engine.Bytes, after: engine.Bytes) {
        const next = { before: "", after: "" };
        const fresh: string[] = [];
        try {
            if (result.status !== "added") {
                const r = await engine.renderPage(before, result.index, 900, false);
                next.before = URL.createObjectURL(new Blob([new Uint8Array(r.png).buffer], { type: "image/png" }));
                fresh.push(next.before);
            }
            if (result.status !== "removed") {
                const r = await engine.renderPage(after, result.index, 900, false);
                next.after = URL.createObjectURL(new Blob([new Uint8Array(r.png).buffer], { type: "image/png" }));
                fresh.push(next.after);
            }
            urlRef.current.forEach(url => URL.revokeObjectURL(url));
            urlRef.current = fresh;
            setPair(next);
            setSelected(result.index);
        }
        catch (e) {
            fresh.forEach(url => URL.revokeObjectURL(url));
            throw e;
        }
    }
    function report() {
        const text = t("مقارنة مستندين\nالأول: {0}\nالثاني: {1}\nالمقارنة حسب ترتيب الصفحات\n\n", { "0": name, "1": other?.name }) + comparison.map(r => t("الصفحة {0}: {1}{2}\n", { "0": r.index + 1, "1": t(statusNames[r.status]), "2": r.visualChanged ? " " + t("— تغيّر المظهر") : "" }) + local.textDifferences(r.before, r.after).map(l => `${l.kind === "added" ? "+" : l.kind === "removed" ? "-" : " "} ${l.text}`).join("\n")).join("\n\n");
        engine.download(new TextEncoder().encode(text), base + t("-مقارنة.txt"), "text/plain;charset=utf-8");
    }
    return <Dialog open onOpenChange={open => { if (!open && !workingRef.current)
        onClose(); }}><DialogContent dir={dir} className={`editor-dialog local-tools-dialog ${tool === "compare" ? "compare-dialog" : ""}`} style={appearanceVariables(settings) as CSSProperties}>
  <DialogTitle>{label || t(toolLabels[tool].name)}</DialogTitle>
  <DialogDescription>{tool === "crop" ? t("حدّد هوامش القص، ثم اختر الصفحات التي تطبّق عليها.") : tool === "protect" ? t("أضف كلمة مرور مطلوبة لفتح النسخة المنزّلة.") : tool === "compare" ? t("قارن المستند المفتوح بملف آخر، دون رفعهما.") : tool === "ocr" ? t("اقرأ النص من الصفحات المصوّرة على جهازك.") : t("اختر نقطة بداية، ثم عدّل النصوص والخانات في المحرر.")}</DialogDescription>
  {tool === "crop" && <>
   <div className="crop-preview" style={{ aspectRatio: `${pages[page]?.width || 595}/${pages[page]?.height || 842}`, width: Math.min(300, 220 * (pages[page]?.width || 595) / (pages[page]?.height || 842)) }}>{preview && <img src={preview} alt={t("معاينة الصفحة الحالية")}/>}{frame && <span className="crop-frame" style={{ left: frame.x * 100 + "%", top: frame.y * 100 + "%", width: frame.w * 100 + "%", height: frame.h * 100 + "%" }}/>}</div>
   <div className="local-margin-grid">{(["top", "bottom", "right", "left"] as const).map(side => <label className="form-label" key={side}>{{ top: t("أعلى"), bottom: t("أسفل"), right: t("يمين"), left: t("يسار") }[side]} %<Input disabled={!!working} type="number" min={0} max={90} step={1} value={margins[side]} onChange={e => setMargins(m => ({ ...m, [side]: Number(e.target.value) }))}/></label>)}</div>
   <label className="form-label">{t("الصفحات")}<Input disabled={!!working} dir="ltr" value={range} onChange={e => setRange(e.target.value)} placeholder="1-3, 5"/></label>
   <Button variant="outline" disabled={!!working} onClick={() => setRange(`1-${pages.length}`)}>{t("اختيار جميع الصفحات (")}{pages.length})</Button>
   <p className="dialog-note">{t("القص يغيّر الإطار الظاهر؛ المحتوى خارجه يبقى في الملف. لإزالة بيانات حساسة استخدم «حجب البيانات».")}</p>
   <Button className="brand-button" disabled={!!working || !frame} onClick={() => void job(t("قص الصفحات…"), async () => { await onApply(await local.cropPages(await getBytes(), engine.parseRange(range, pages.length), margins)); onClose(); })}><Crop />{" " + t("تطبيق القص")}</Button>
  </>}
  {tool === "protect" && <form className="local-tool-form" onSubmit={e => { e.preventDefault(); void job(t("تشفير النسخة…"), async () => { if (password !== repeat)
            throw new Error(t("كلمتا المرور غير متطابقتين.")); const output = await local.protectPdf(await getBytes(), password); engine.download(output, base + t("-محمي.pdf")); setPassword(""); setRepeat(""); setNote(t("تم تنزيل نسخة محمية بكلمة مرور. مستند العمل الحالي يبقى مفتوحاً.")); }); }}>
   <label className="form-label">{t("كلمة المرور")}<Input disabled={!!working} autoComplete="new-password" type={showPassword ? "text" : "password"} dir="auto" minLength={4} maxLength={100} value={password} onChange={e => setPassword(e.target.value)} required/></label>
   <label className="form-label">{t("تأكيد كلمة المرور")}<Input disabled={!!working} autoComplete="new-password" type={showPassword ? "text" : "password"} dir="auto" value={repeat} onChange={e => setRepeat(e.target.value)} required/></label>
   <Button type="button" variant="ghost" onClick={() => setShowPassword(v => !v)}>{showPassword ? t("إخفاء كلمة المرور") : t("إظهار كلمة المرور")}</Button>
   <p className="dialog-note">{t("احتفظ بكلمة المرور؛ لا يحفظها الموقع. الحماية تستخدم تشفير AES-256 وتُطبّق على هذه النسخة فقط.")}</p>
   <Button type="submit" className="brand-button" disabled={!!working || password.length < 4 || !repeat}><LockKeyhole />{" " + t("تنزيل PDF محمي")}</Button>
  </form>}
  {tool === "compare" && <>
   <div className="compare-file-row"><span><strong>{t("النسخة الأولى")}</strong><small>{name}</small></span><label className={`local-file-button ${working ? "disabled" : ""}`}><Upload size={17}/>{other ? t("تغيير النسخة الثانية") : t("اختيار النسخة الثانية")}<input disabled={!!working} type="file" accept="application/pdf,.pdf" onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file)
            void job(t("فتح النسخة الثانية…"), () => readOther(file)); }}/></label></div>
   {other && <p className="dialog-note">{t("النسخة الثانية:") + " "}{other.name} · {other.count}{" " + t("صفحة")}</p>}
   {pendingOther && <form className="local-tool-form" onSubmit={e => { e.preventDefault(); void job(t("فتح النسخة المحمية…"), () => readOther(pendingOther, otherPassword)); }}><label className="form-label">{t("كلمة مرور") + " "}{pendingOther.name}<Input disabled={!!working} type="password" value={otherPassword} onChange={e => setOtherPassword(e.target.value)}/></label><Button disabled={!!working || !otherPassword} type="submit" variant="outline">{t("فتح النسخة الثانية")}</Button></form>}
   <label className="form-label">{t("الصفحات المطلوب مقارنتها")}<Input dir="ltr" disabled={!!working} value={range} onChange={e => setRange(e.target.value)} placeholder="1-3, 5"/><small>{t("تُقارن الصفحات في مواضعها الحالية. الصفحات المصوّرة تُقارن بصرياً.")}</small></label>
   <Button className="brand-button" disabled={!!working || !other} onClick={() => void job(t("مقارنة الصفحات…"), async () => { if (!other)
            return; const before = await getBytes(); sourceRef.current = before; const results = await local.comparePdfs(before, other.bytes, engine.parseRange(range, totalComparison), setProgress); setComparison(results); const first = results.find(r => r.status !== "same") || results[0]; setShowIdentical(!results.some(r => r.status !== "same")); await showPair(first, before, other.bytes); })}><Check />{" " + t("مقارنة المستندين")}</Button>
   {comparison.length > 0 && <div className="comparison-results"><div className="compare-summary"><strong>{comparison.filter(r => r.status !== "same").length}{" " + t("صفحة مختلفة من") + " "}{comparison.length}</strong><Button variant="outline" size="sm" disabled={!!working} onClick={report}><Download />{" " + t("تقرير نصي")}</Button></div>
    <Button variant="ghost" size="sm" disabled={!!working} onClick={() => setShowIdentical(v => !v)}>{showIdentical ? t("إخفاء الصفحات المتطابقة") : t("إظهار الصفحات المتطابقة")}</Button>
    <div className="compare-page-list">{visible.map(r => <button disabled={!!working} key={r.index} className={selected === r.index ? "selected" : ""} onClick={() => { if (sourceRef.current && other)
                void job(t("عرض المقارنة…"), () => showPair(r, sourceRef.current!, other.bytes)); }}>{t("صفحة") + " "}{r.index + 1}<span className={`comparison-status ${r.status}`}>{t(statusNames[r.status])}</span></button>)}</div>
    {row && <><div className="compare-images">{(["before", "after"] as const).map(side => <div key={side}><strong>{side === "before" ? t("النسخة الأولى") : t("النسخة الثانية")}</strong>{pair[side] ? <div className="compare-image-frame" style={{ aspectRatio: `${row.rasterWidth}/${row.rasterHeight}` }}><img style={{ width: (side === "before" ? row.beforeRasterWidth : row.afterRasterWidth) / row.rasterWidth * 100 + "%" }} src={pair[side]} alt={t("{0} — الصفحة {1}", { "0": side === "before" ? t("قبل") : t("بعد"), "1": row.index + 1 })}/>{row.boxes.map((box, i) => <span key={i} className="visual-difference" style={{ left: box.x * 100 + "%", top: box.y * 100 + "%", width: box.w * 100 + "%", height: box.h * 100 + "%" }}/>)}</div> : <p className="dialog-note">{t("لا توجد صفحة في هذه النسخة.")}</p>}</div>)}</div>
     {row.before || row.after ? <div className="text-difference" dir="auto">{local.textDifferences(row.before, row.after).map((line, i) => <div key={i} className={line.kind}><span aria-hidden>{line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}</span>{line.text || " "}</div>)}</div> : <p className="dialog-note">{t("لا يوجد نص مضمّن في هذه الصفحة؛ المناطق الملوّنة توضح اختلاف المظهر.")}</p>}
     <p className="dialog-note">{t("الأخضر نص مضاف، والأحمر نص محذوف. التحديد البرتقالي يوضح اختلاف المظهر وقد يشمل تغيّر موضع النص أو مقاس الصفحة.")}</p>
    </>}
   </div>}
  </>}
  {tool === "ocr" && <>
   <label className="form-label">{t("لغة المستند")}<Select dir={dir} disabled={!!working} value={ocrLanguage} onValueChange={value => setOcrLanguage(value as OcrLanguage)}><SelectTrigger className="full-width"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ara+eng">{t("عربي وإنجليزي")}</SelectItem><SelectItem value="ara">{t("العربية")}</SelectItem><SelectItem value="eng">{t("الإنجليزية")}</SelectItem></SelectContent></Select></label>
   <label className="form-label">{t("نوع المحتوى")}<Select dir={dir} disabled={!!working} value={layout} onValueChange={value => setLayout(value as OcrLayout)}><SelectTrigger className="full-width"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">{t("صفحة كاملة — تلقائي")}</SelectItem><SelectItem value="block">{t("فقرة واحدة")}</SelectItem><SelectItem value="line">{t("سطر واحد")}</SelectItem></SelectContent></Select><small>{t("اختر «سطر واحد» إذا كانت الصورة تحتوي على سطر فقط.")}</small></label>
   <label className="form-label">{t("الصفحات")}<Input disabled={!!working} dir="ltr" value={range} onChange={e => setRange(e.target.value)} placeholder="1-3, 5"/><small>{t("حتى 20 صفحة في العملية الواحدة. عدد صفحات المستند:") + " "}{pages.length}.</small></label>
   <p className="dialog-note">{t("تُحمّل ملفات اللغة عند أول استخدام وتُعالج الصفحات على جهازك. جودة القراءة تعتمد على وضوح الصورة؛ راجع النص قبل استخدامه.")}</p>
   <Button className="brand-button" disabled={!!working} onClick={() => void job(t("قراءة نص الصور…"), async () => { const controller = new AbortController(); abortRef.current = controller; const source = await getBytes(); ocrSource.current = source; setRecognized([]); const result = await recognizePdf(source, engine.parseRange(range, pages.length), ocrLanguage, (message, value) => { setWorking(message); onBusy(message); setProgress(value); }, controller.signal, layout); setRecognized(result); if (!result.some(r => r.text))
            setNote(t("لم يُكتشف نص واضح. جرّب صورة أوضح أو لغة أخرى.")); })}><FileText />{" " + t("استخراج النص")}</Button>
   {working && abortRef.current && !abortRef.current.signal.aborted && <Button variant="outline" onClick={() => abortRef.current?.abort()}>{t("إلغاء القراءة")}</Button>}
   {recognized.length > 0 && <div className="ocr-results"><label className="form-label">{t("النص المستخرج")}<Textarea rows={10} dir="auto" value={allText} readOnly/></label><div className="local-downloads"><Button variant="outline" disabled={!!working || !allText.trim()} onClick={() => engine.download(new TextEncoder().encode(allText), base + t("-نص.txt"), "text/plain;charset=utf-8")}><Download />{" " + t("نص TXT")}</Button><Button variant="outline" disabled={!!working || !recognized.some(r => r.text)} onClick={() => void job(t("تجهيز Word…"), async () => engine.download(await local.textToWord(recognized.map(r => r.text), base), base + "-OCR.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))}><Download /> Word</Button><Button className="brand-button" disabled={!!working || !recognized.some(r => r.words.length)} onClick={() => void job(t("إضافة طبقة البحث…"), async () => { if (!ocrSource.current)
            return; const response = await fetch("/fonts/DejaVuSans.ttf"); if (!response.ok)
            throw new Error(t("تعذر تحميل الخط.")); const output = await local.searchablePdf(ocrSource.current, recognized, new Uint8Array(await response.arrayBuffer())); engine.download(output, base + t("-قابل-للبحث.pdf")); setNote(t("تم تنزيل نسخة بطبقة نص غير مرئية للصفحات التي قرأتها.")); })}><Download />{" " + t("PDF قابل للبحث")}</Button></div></div>}
  </>}
  {tool === "templates" && <>
   <div className="template-options">{([{ id: "invoice", name: t("فاتورة"), detail: t("بيانات العميل والبنود والإجمالي") }, { id: "letter", name: t("خطاب"), detail: t("عنوان ومحتوى ومساحة توقيع") }, { id: "form", name: t("نموذج بيانات"), detail: t("خانات قابلة للتعبئة ومربع موافقة") }] as const).map(item => <button disabled={!!working} key={item.id} className={template === item.id ? "selected" : ""} onClick={() => setTemplate(item.id)}><span>{item.id === "form" ? <Square size={22}/> : <FileText size={22}/>}</span><strong>{item.name}</strong><small>{item.detail}</small></button>)}</div>
   <p className="dialog-note">{t("قوالب بسيطة قابلة للتعديل، تستخدم اسم موقعك ولونه. تقدر تحرّك النصوص وتعدّلها وتضيف شعارك.")}</p>
   <Button className="brand-button" disabled={!!working} onClick={() => void job(t("إنشاء المستند…"), async () => { await onCreate(await local.createTemplate(template, uiLanguage === "en" ? settings.nameEn || t(settings.name) : settings.name, settings.accent, uiLanguage)); onClose(); })}><Check />{" " + t("فتح القالب في المحرر")}</Button>
  </>}
  {working && <div className="local-tool-progress" role="status"><LoaderCircle size={17} className="spin"/><span>{localizeMessage(working)}</span>{progress > 0 && <Progress value={progress * 100}/>}</div>}
  {error && <p className="tool-form-error" role="alert">{localizeMessage(error)}</p>}{note && <p className="local-success" role="status">{localizeMessage(note)}</p>}
 </DialogContent></Dialog>;
}

"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Copy, Download, FileText, LoaderCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useLanguage } from "@/components/language-provider";
import { appearanceVariables, type Settings } from "@/lib/settings-model";
import { download, parseRange, type Bytes } from "@/lib/pdf-engine";
import type { MarkdownResult } from "@/lib/pdf-markdown";

type Props = { settings: Settings; name: string; pageCount: number; getBytes: () => Promise<Bytes>; onClose: () => void; onBusy: (label: string) => void };

export default function MarkdownDialog({ settings, name, pageCount, getBytes, onClose, onBusy }: Props) {
  const { t, dir, message } = useLanguage();
  const [range, setRange] = useState(`1-${pageCount}`);
  const [removeRepeated, setRemoveRepeated] = useState(true), [pageMarkers, setPageMarkers] = useState(false), [useOcr, setUseOcr] = useState(true), [forceOcr, setForceOcr] = useState(false);
  const [working, setWorking] = useState(""), [progress, setProgress] = useState(0), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [result, setResult] = useState<(MarkdownResult & { scannedPages: number; repairedPages: number; selectedPages: number }) | null>(null);
  const busy = useRef(false), abort = useRef<AbortController | null>(null);
  useEffect(() => () => { abort.current?.abort(); }, []);
  const base = name.replace(/\.pdf$/i, "") || "document";
  const invalidate = () => { setResult(null); setNotice(""); setError(""); };
  async function convert() {
    if (busy.current) return;
    busy.current = true;
    setResult(null); setError(""); setNotice(""); setProgress(0);
    const label = t("تجهيز Markdown…");
    setWorking(label); onBusy(label);
    const controller = new AbortController(); abort.current = controller;
    try {
      const indices = parseRange(range, pageCount);
      const bytes = await getBytes();
      const { readMarkdownPages, buildMarkdown, markdownPageNeedsOcr } = await import("@/lib/pdf-markdown");
      const pages = await readMarkdownPages(bytes, indices, value => setProgress(useOcr ? value * .25 : value));
      if (controller.signal.aborted) throw new Error(t("تم إلغاء القراءة."));
      const damaged = new Set(pages.filter(page => page.lines.length && markdownPageNeedsOcr(page)).map(page => page.index));
      const needsOcr = pages.filter(page => forceOcr || markdownPageNeedsOcr(page)).map(page => page.index);
      let scannedPages = 0, repairedPages = 0;
      if (useOcr && needsOcr.length) {
        if (needsOcr.length > 20) throw new Error(t("اختر حتى 20 صفحة تحتاج قراءة من الصورة في كل عملية OCR."));
        const { recognizePdf } = await import("@/lib/local-ocr");
        const recognized = await recognizePdf(bytes, needsOcr, "ara+eng", (text, value) => {
          const next = message(text); setWorking(next); onBusy(next); setProgress(.25 + value * .75);
        }, controller.signal);
        for (const item of recognized) {
          const page = pages.find(page => page.index === item.index)!;
          // If recognition failed, retain any existing text and flag it below
          // instead of silently dropping the page's original contents.
          if (!item.text.trim()) continue;
          page.fromOcr = true;
          page.lines = item.text.split(/\n/).filter(line => line.trim()).map((text, line) => ({ text, size: 12, bold: false, block: 0, box: [0, line * 18 + 70, 500, line * 18 + 82] }));
          // OCR geometry varies; do not remove inferred headers from recognized pages.
          page.height = Math.max(page.height, page.lines.length * 18 + 150);
          if (page.lines.length) { scannedPages++; if (damaged.has(page.index) && !markdownPageNeedsOcr(page)) repairedPages++; }
        }
      }
      if (controller.signal.aborted) throw new Error(t("تم إلغاء القراءة."));
      const converted = buildMarkdown(pages, { removeRepeated, pageMarkers });
      setResult({ ...converted, scannedPages, repairedPages, selectedPages: indices.length }); setProgress(1);
      if (!converted.text) setNotice(t("لم يُعثر على نص. فعّل قراءة الصفحات المصوّرة أو اختر صفحات أخرى."));
    } catch (cause) {
      setError(cause instanceof Error ? message(cause.message) : t("تعذر إكمال العملية."));
    } finally {
      busy.current = false; abort.current = null; setWorking(""); onBusy("");
    }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy.current) onClose(); }}>
    <DialogContent dir={dir} className="editor-dialog markdown-dialog" style={appearanceVariables(settings) as CSSProperties}>
      <DialogTitle>{t("PDF إلى Markdown")}</DialogTitle>
      <DialogDescription>{t("نص منظم في ملف MD، مناسب لإرساله إلى أدوات الذكاء الاصطناعي. التحويل على جهازك دون رفع الملف.")}</DialogDescription>
      <label className="form-label">{t("الصفحات")}<Input dir="ltr" disabled={!!working} value={range} onChange={event => { setRange(event.target.value); invalidate(); }} placeholder="1-3, 5"/><small>{t("يمكنك اختيار الصفحات المطلوبة لتقليل المحتوى المرسل.")}</small></label>
      <div className="markdown-options">
        <label><Checkbox checked={removeRepeated} disabled={!!working} onCheckedChange={value => { setRemoveRepeated(value === true); invalidate(); }}/><span>{t("إزالة رؤوس الصفحات وتذييلاتها المتكررة")}</span></label>
        <label><Checkbox checked={pageMarkers} disabled={!!working} onCheckedChange={value => { setPageMarkers(value === true); invalidate(); }}/><span>{t("إضافة فواصل بأرقام الصفحات")}</span></label>
        <label><Checkbox checked={useOcr} disabled={!!working} onCheckedChange={value => { setUseOcr(value === true); invalidate(); }}/><span>{t("إصلاح النص غير المقروء وقراءة الصفحات المصوّرة باستخدام OCR")}</span></label>
        {useOcr && <label><Checkbox checked={forceOcr} disabled={!!working} onCheckedChange={value => { setForceOcr(value === true); invalidate(); }}/><span>{t("قراءة كل الصفحات المحددة من الصورة")}</span></label>}
      </div>
      {useOcr && <p className="dialog-note">{t("تُقرأ العربية والإنجليزية من الصورة عند غياب النص أو تلف ترميز الخط، حتى 20 صفحة في المرة. إذا بقيت حروف مثل IIII، فعّل قراءة كل الصفحات. قد تستغرق وقتاً؛ راجع دقة النص.")}</p>}
      <Button className="brand-button" disabled={!!working} onClick={() => void convert()}><FileText/>{t("تحويل إلى MD")}</Button>
      {working && <div className="local-tool-progress" role="status"><LoaderCircle size={17} className="spin"/><span>{working}</span><Progress value={progress * 100}/>{abort.current && <Button size="sm" variant="outline" onClick={() => abort.current?.abort()}>{t("إلغاء القراءة")}</Button>}</div>}
      {result && <section className="markdown-result">
        <div className="markdown-statistics"><span>{t("{0} كلمات", { 0: result.words })}</span><span>{new TextEncoder().encode(result.text).length.toLocaleString()} B</span><span>{t("{0} صفحات محددة", { 0: result.selectedPages })}</span>{result.scannedPages > 0 && <span>{t("قراءة {0} صفحات باستخدام OCR", { 0: result.scannedPages })}</span>}</div>
        {result.removedLines > 0 && <p className="dialog-note">{t("أُزيلت {0} أسطر متكررة من هوامش الصفحات.", { 0: result.removedLines })}</p>}
        {result.repairedPages > 0 && <p className="dialog-note">{t("أُعيدت قراءة {0} صفحات ذات نص غير مقروء من الصورة.", { 0: result.repairedPages })}</p>}
        {result.emptyPages.length > 0 && <p className="markdown-warning" role="status">{t("الصفحات {0} بلا نص مستخرج؛ لن يحتوي MD على محتواها. فعّل OCR وأعد التحويل إذا كانت مصوّرة.", { 0: result.emptyPages.map(index => index + 1).join(", ") })}</p>}
        {result.unreadablePages.length > 0 && <p className="markdown-warning" role="status">{t("بعض النصوص في الصفحات {0} غير مقروءة. فعّل OCR وقراءة كل الصفحات من الصورة، ثم أعد التحويل وراجع النتيجة.", { 0: result.unreadablePages.map(index => index + 1).join(", ") })}</p>}
        <label className="form-label">{t("معاينة Markdown")}<Textarea dir="auto" rows={9} value={result.text} readOnly spellCheck={false}/></label>
        <div className="local-downloads"><Button className="brand-button" disabled={!result.text || !!working} onClick={() => download(new TextEncoder().encode(result.text), base + ".md", "text/markdown;charset=utf-8")}><Download/>{t("تنزيل MD")}</Button><Button variant="outline" disabled={!result.text || !!working} onClick={() => { void Promise.resolve().then(() => navigator.clipboard.writeText(result.text)).then(() => { setNotice(t("تم نسخ Markdown.")); setError(""); }).catch(() => setError(t("تعذر النسخ. نزّل ملف MD بدلاً من ذلك."))); }}><Copy/>{t("نسخ النص")}</Button></div>
      </section>}
      <p className="dialog-note">{t("يُستخرج النص دون تلخيص، ولا تُضمّن الصور. تنسيق الجداول والعناوين تقريبي؛ راجع النتيجة. التوكن يعتمد على النص ونموذج الذكاء الاصطناعي.")}</p>
      {error && <p className="tool-form-error" role="alert">{error}</p>}{notice && <p className="local-success" role="status">{notice}</p>}
    </DialogContent>
  </Dialog>;
}

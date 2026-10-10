"use client";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { FileText, FolderOpen, LockKeyhole, ShieldCheck, CheckCircle2, Download, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { useLanguage } from "@/components/language-provider";
import type { ToolEntry } from "@/lib/settings-model";

type Props = {
  mode: "home" | "tools";
  siteName: string;
  maxFileMB: number;
  entries: ToolEntry[];
  busy: boolean;
  icon: (entry: ToolEntry, size: number) => ReactNode;
  toolStyle: (entry: ToolEntry) => CSSProperties | undefined;
  onChoose: (entry: ToolEntry) => void;
  onOpen: () => void;
  onFile: (file: File) => void;
  onDemo: () => void;
  onHelp: () => void;
};

export default function HomeWorkspace({ mode, siteName, maxFileMB, entries, busy, icon, toolStyle, onChoose, onOpen, onFile, onDemo, onHelp }: Props) {
  const { t } = useLanguage();
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  return <div className="home-workspace">
    {mode === "home" ? <section className="home-hero">
      <div className="welcome-heading">
        <span className="hero-badge"><Sparkles size={15} />{t("كل أدوات PDF، في متصفحك")}</span>
        <h1>{t("مستنداتك،")}<br /><em>{t("تحت سيطرتك.")}</em></h1>
        <p>{t("عدّل النصوص والصور، رتّب الصفحات، ووقّع ملفاتك محلياً. شارك نسخة عبر رابط عندما تختار ذلك.")}</p>
        <div className="hero-assurances"><span><CheckCircle2 size={17} />{t("مجاني للاستخدام")}</span><span><LockKeyhole size={17} />{t("دون تسجيل للزوار")}</span></div>
      </div>
      <Empty className={`upload-card ${dragging ? "drag-over" : ""}`} onDragEnter={event => { if (!busy && event.dataTransfer.types.includes("Files")) { event.preventDefault(); depth.current++; setDragging(true); } }} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = busy ? "none" : "copy"; }} onDragLeave={event => { event.preventDefault(); depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false); }} onDrop={event => { event.preventDefault(); depth.current = 0; setDragging(false); const file = event.dataTransfer.files[0]; if (file && !busy) onFile(file); }}>
        <div className="upload-card-inner">
          <span className="upload-icon"><FileText size={37} strokeWidth={1.5} /></span>
          <h2>{t("ابدأ بمستندك")}</h2>
          <p>{t("اسحب ملف PDF إلى هنا، أو اختره من جهازك")}</p>
          <Button className="brand-button upload-action" size="lg" onClick={onOpen} disabled={busy}><FolderOpen size={19} />{t("اختر ملف PDF")}</Button>
          <span className="upload-limit">{t("حتى {0} ميجابايت · 250 صفحة", { 0: maxFileMB })}</span>
        </div>
        <button className="sample-link" onClick={onDemo} disabled={busy}>{t("افتح مستند التجربة")}</button>
      </Empty>
    </section> : <section className="tool-page-heading"><span className="hero-badge"><Sparkles size={15} />{t("أدوات لكل مهمة")}</span><h1>{t("أدوات تجعل المستند أسهل.")}</h1><p>{t("اختر مهمتك، وافتح ملفك. الباقي هنا.")}</p></section>}

    <section className="home-tools" aria-labelledby="home-tools-heading">
      <div className="section-heading"><div><span className="section-kicker">{t("أدوات لكل مهمة")}</span><h2 id="home-tools-heading">{t("اختر ما تريد إنجازه")}</h2></div><span className="section-meta"><ShieldCheck size={17} />{t("تعديل محلي ومشاركة اختيارية")}</span></div>
      <div className="tool-grid">{entries.map(entry => {
        const external = entry.kind === "custom" && entry.tool.action === "openLink";
        const contents = <><span className="tool-card-icon">{icon(entry, 25)}</span><h3>{entry.name}</h3><p>{entry.description}</p>{external && <span className="external-tool-label">{t("يفتح رابطاً خارجياً")}</span>}</>;
        return external && entry.kind === "custom" ? <a key={entry.id} className="tool-card" style={toolStyle(entry)} href={entry.tool.url} target="_blank" rel="noopener noreferrer">{contents}</a> : <button key={entry.id} className="tool-card" style={toolStyle(entry)} onClick={() => onChoose(entry)} disabled={busy}>{contents}</button>;
      })}</div>
    </section>

    <section className="home-benefits" aria-label={t("خصوصية المستندات")}>
      {[{ Icon: ShieldCheck, title: "تعديل محلي ومشاركة اختيارية", text: "التعديل على جهازك. أداة المشاركة ترفع نسخة تختارها بموافقتك لإنشاء رابط." }, { Icon: CheckCircle2, title: "لا حساب. لا اشتراك.", text: "ابدأ مباشرة، واستخدم أدوات المستندات مجاناً." }, { Icon: Download, title: "من فتح الملف إلى تنزيله", text: "افتح ملفك، طبّق تعديلاتك، ثم نزّل النسخة الجاهزة." }].map(({ Icon, title, text }) => <div className="benefit" key={title}><Icon size={25} strokeWidth={1.6} /><h3>{t(title)}</h3><p>{t(text)}</p></div>)}
    </section>
    <footer className="site-footer"><div className="footer-brand"><span className="brand-icon"><FileText size={19} /></span><div><strong>{siteName}</strong><span>{t("أدوات PDF مجانية في متصفحك")}</span></div></div><div className="footer-links"><button onClick={onHelp}>{t("طريقة الاستخدام")}</button><span>© {new Date().getFullYear()} {siteName}</span></div></footer>
  </div>;
}

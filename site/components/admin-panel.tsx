"use client";
import SharePanel from "@/components/share-panel";
import { useLanguage } from "@/components/language-provider";
import { useState, useEffect, type CSSProperties } from "react";
import { ArrowRight, SlidersHorizontal, ShieldCheck, Check, Save, ExternalLink, LockKeyhole, Palette, Wrench, Info, LoaderCircle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import ColorControl from "@/components/customization/color-control";
import ToolManager from "@/components/customization/tool-manager";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import LanguageSwitcher from "@/components/language-switcher";
import { settingsSchema, defaultTheme, readableForeground, appearanceVariables, type Settings } from "@/lib/settings-model";
export default function AdminPanel({ initial, initialRevision, ownerName }: {
    initial: Settings;
    initialRevision: number;
    ownerName: string;
}) {
    const { t, dir, language: uiLanguage, message: localizeMessage } = useLanguage();
    const [settings, setSettings] = useState(initial);
    const [saved, setSaved] = useState(initial);
    const [revision, setRevision] = useState(initialRevision);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState(false);
    const siteName = uiLanguage === "en" ? settings.nameEn || t(settings.name) : settings.name;
    useEffect(()=>{document.title=siteName+" · "+t("لوحة الإدارة");},[siteName,t]);
    const dirty = JSON.stringify(settings) !== JSON.stringify(saved);
    function change<K extends keyof Settings>(key: K, value: Settings[K]) { setSettings(s => ({ ...s, [key]: value })); setMessage(""); }
    async function save() {
        const parsed = settingsSchema.safeParse(settings);
        if (!parsed.success) {
            setError(true);
            setMessage(t("راجع قيم الإعدادات والأدوات قبل الحفظ."));
            return;
        }
        setBusy(true);
        setMessage("");
        try {
            const response = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings, revision }) });
            const data = await response.json() as {
                error?: string;
                settings: Settings;
                revision: number;
            };
            if (!response.ok)
                throw new Error(data.error);
            setSettings(data.settings);
            setSaved(data.settings);
            setRevision(data.revision);
            setError(false);
            setMessage(t("تم الحفظ. إعداداتك الجديدة تظهر لجميع الزوار."));
        }
        catch (e) {
            setError(true);
            setMessage(e instanceof Error ? localizeMessage(e.message) : t("تعذر الحفظ."));
        }
        finally {
            setBusy(false);
        }
    }
    return <div className="admin-app" dir={dir} style={appearanceVariables(settings) as CSSProperties}>
    <header className="app-header"><a href="/" className="brand"><span className="brand-icon"><FileText size={22}/></span><strong>{siteName}</strong><span className="header-divider"/><span className="header-label">{t("لوحة الإدارة")}</span></a><div className="header-end"><LanguageSwitcher/><a href="/" className="header-link">{t("فتح المحرر") + " "}<ExternalLink size={15}/></a></div></header>
    <main className="admin-main">
      <div className="admin-heading"><div><div className="eyebrow"><SlidersHorizontal size={15}/>{" " + t("مساحة المالك")}</div><h1>{t("موقعك، على طريقتك.")}</h1><p>{t("غيّر المظهر، وأضف أدواتك، ورتّبها بالطريقة التي تريدها.")}</p></div><Button className="brand-button" onClick={save} disabled={!dirty || busy}>{busy ? <LoaderCircle className="spin"/> : <Save />}{busy ? t("جارٍ الحفظ") : t("حفظ التغييرات")}</Button></div>
      {message && <div className={error ? "notice error" : "notice success"} role="status">{error ? <Info size={18}/> : <Check size={18}/>} {localizeMessage(message)}</div>}
      <div className="admin-grid">
        <section className="admin-card"><div className="card-heading"><Palette size={20}/><div><h2>{t("هوية الموقع")}</h2><p>{t("الاسم والألوان ورسالتك للزوار")}</p></div></div>
          <div className="bilingual-fields">
            <label className="form-label">{t("اسم الموقع بالعربية")}<Input dir="rtl" value={settings.name} maxLength={40} onChange={e=>change("name",e.target.value)}/></label>
            <label className="form-label">{t("اسم الموقع بالإنجليزية")}<Input dir="ltr" value={settings.nameEn} maxLength={40} onChange={e=>change("nameEn",e.target.value)}/></label>
            <label className="form-label">{t("الوصف بالعربية")}<Input dir="rtl" value={settings.tagline} maxLength={100} onChange={e=>change("tagline",e.target.value)}/></label>
            <label className="form-label">{t("الوصف بالإنجليزية")}<Input dir="ltr" value={settings.taglineEn} maxLength={100} onChange={e=>change("taglineEn",e.target.value)}/></label>
          </div>
          <p className="appearance-note">{t("تظهر النصوص حسب اللغة التي يختارها الزائر.")}</p>
          <ColorControl label={t("اللون الأساسي والأزرار")} value={settings.accent} onChange={value => change("accent", value)} swatches/>
          <p className="appearance-note">{t("الألوان الجاهزة مجرد أمثلة. اضغط «اختيار أي لون» أو اكتب رمز اللون.")}</p>
          <Collapsible className="theme-options"><CollapsibleTrigger asChild><Button variant="outline" className="full-width">{t("ألوان الخلفيات والنص")}</Button></CollapsibleTrigger><CollapsibleContent><div className="theme-colors">{([{ key: "background", label: t("خلفية الموقع") }, { key: "surface", label: t("خلفية الشريط والبطاقات") }, { key: "sidebar", label: t("خلفية قائمة الأدوات") }, { key: "canvas", label: t("خلفية مساحة PDF") }, { key: "text", label: t("لون النص") }] as const).map(item => <ColorControl key={item.key} label={item.label} value={settings.theme[item.key]} onChange={value => change("theme", { ...settings.theme, [item.key]: value })}/>)}</div></CollapsibleContent></Collapsible>
          <div className="theme-preview-label">{t("معاينة المظهر")}</div><div className="theme-preview" style={{ background: settings.theme.background, color: settings.theme.text }}><div className="theme-preview-sidebar" style={{ background: settings.theme.sidebar, color: readableForeground(settings.theme.sidebar) }}><strong>{siteName}</strong><span>{t("المحرر")}</span><span>{t("الأدوات")}</span></div><div className="theme-preview-main"><div style={{ background: settings.theme.surface }}><strong>{siteName}</strong><span style={{ background: settings.accent, color: readableForeground(settings.accent) }}>{t("تنزيل PDF")}</span></div><section style={{ background: settings.theme.canvas }}><span style={{ background: settings.theme.surface }}>{t("ملفك جاهز للعمل")}</span></section></div></div>
          <Button type="button" variant="ghost" className="reset-colors" onClick={() => { change("theme", { ...defaultTheme }); change("accent", "#4f46e5"); }}>{t("استعادة الألوان الافتراضية")}</Button>
          <div className="bilingual-fields">
            <label className="form-label">{t("الإعلان بالعربية")}<span className="optional">{t("اختياري")}</span><Textarea dir="rtl" rows={3} value={settings.announcement} maxLength={240} onChange={e=>change("announcement",e.target.value)}/></label>
            <label className="form-label">{t("الإعلان بالإنجليزية")}<span className="optional">{t("اختياري")}</span><Textarea dir="ltr" rows={3} value={settings.announcementEn} maxLength={240} onChange={e=>change("announcementEn",e.target.value)}/></label>
          </div>
        </section>
        <section className="admin-card tools-admin-card"><div className="card-heading"><Wrench size={20}/><div><h2>{t("الأدوات وترتيبها")}</h2><p>{t("أضف أدوات إضافية وخصّص ترتيب القائمة")}</p></div></div><ToolManager settings={settings} onChange={next => { setSettings(next); setMessage(""); }}/></section>
        <section className="admin-card"><div className="card-heading"><SlidersHorizontal size={20}/><div><h2>{t("إعدادات التشغيل")}</h2><p>{t("حد الملفات وحالة الموقع")}</p></div></div><label className="form-label">{t("أقصى حجم للملف، بالميجابايت")}<Input type="number" min={5} max={100} value={settings.maxFileMB} onChange={e => change("maxFileMB", Number(e.target.value))}/><small>{t("من 5 إلى 100 ميجابايت. المعالجة تتم على جهاز الزائر.")}</small></label><div className="setting-row"><div><h3>{t("وضع الصيانة")}</h3><p>{t("إيقاف المحرر مؤقتاً للزوار")}</p></div><Switch dir="ltr" aria-label={t("وضع الصيانة")} checked={settings.maintenance} onCheckedChange={v => change("maintenance", v)}/></div></section>
        <section className="admin-card ownership-card"><div className="card-heading"><ShieldCheck size={20}/><div><h2>{t("الملكية والخصوصية")}</h2><p>{t("صلاحيات الإدارة محمية بحسابك")}</p></div></div><div className="owner-badge"><span><LockKeyhole size={18}/></span><div><strong>{ownerName}</strong><small>{t("مالك الموقع")}</small></div><span className="status-pill">{t("صلاحية كاملة")}</span></div><p>{t("الزوار يستخدمون الأدوات دون تسجيل. الدخول إلى هذه اللوحة متاح لحساب المالك فقط.")}</p><p>{t("التعديل محلي. نحفظ إعدادات الموقع والملفات التي يختار الزوار مشاركتها بروابط.")}</p><a href="/source.zip" className="text-link">{t("تنزيل كود الموقع المفتوح المصدر") + " "}<ArrowRight size={14}/></a></section>
      </div>
      <section className="admin-card share-admin-card"><SharePanel ownerMode/></section>
      <div className="admin-bottom"><span>{dirty ? t("لديك تغييرات لم تُحفظ") : t("الإعدادات محفوظة")}{" " + t("· إصدار الإعدادات") + " "}{revision}</span><div className="admin-bottom-actions"><Button variant="outline" disabled={!dirty || busy} onClick={() => { setSettings(saved); setMessage(""); }}>{t("إلغاء التغييرات")}</Button><Button className="brand-button" onClick={save} disabled={!dirty || busy}>{busy ? <LoaderCircle className="spin"/> : <Save />}{t("حفظ التغييرات")}</Button></div></div>
    </main>
  </div>;
}

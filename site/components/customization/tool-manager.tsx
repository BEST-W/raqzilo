"use client";
import { translate } from "@/lib/translations";
import {getLocalizedToolEntries} from "@/lib/localized-settings";
import { useLanguage } from "@/components/language-provider";
import { useState, type CSSProperties } from "react";
import { Plus, Pencil, Trash2, GripVertical, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { customToolSchema, extraActions, extraActionLabels, moveTool, readableForeground, type CustomTool, type Settings } from "@/lib/settings-model";
import ColorControl from "./color-control";
import CustomToolIcon, { iconLabels } from "./tool-icon";
export default function ToolManager({ settings, onChange }: {
    settings: Settings;
    onChange: (settings: Settings) => void;
}) {
    const { t, dir, language: uiLanguage, message: localizeMessage } = useLanguage();
    const [draft, setDraft] = useState<CustomTool | null>(null), [error, setError] = useState("");
    const [deleting, setDeleting] = useState<string | null>(null), [dragging, setDragging] = useState<string | null>(null);
    const entries = getLocalizedToolEntries(settings, uiLanguage), order = entries.map(entry => entry.id), editing = draft ? settings.customTools.some(t => t.id === draft.id) : false;
    function openNew() { setError(""); setDraft({ id: "custom_" + crypto.randomUUID(), name: "ترقيم الصفحات", nameEn: "Page numbers", description: extraActionLabels.numberPages.description, descriptionEn: translate("en",extraActionLabels.numberPages.description), action: "numberPages", icon: "hash", enabled: true, color: settings.accent, url: "", defaultText: "" }); }
    function edit<K extends keyof CustomTool>(key: K, value: CustomTool[K]) { setDraft(tool => tool ? { ...tool, [key]: value } : null); setError(""); }
    function chooseAction(action: CustomTool["action"]) { if (!draft)
        return; const icons = { numberPages: "hash", watermark: "stamp", blankPage: "plus", openLink: "link", crop: "image", protect: "shield", compare: "file", ocr: "sparkles", templates: "file" } as const; setDraft({ ...draft, action, name: extraActionLabels[action].name, nameEn: translate("en",extraActionLabels[action].name), description: extraActionLabels[action].description, descriptionEn: translate("en",extraActionLabels[action].description), icon: icons[action] }); setError(""); }
    function saveTool() { if (!draft)
        return; const parsed = customToolSchema.safeParse(draft); if (!parsed.success) {
        setError(parsed.error.issues.some(i => i.path.includes("url")) ? t("أدخل رابطاً كاملاً يبدأ بـ https://") : t("اكتب اسماً من حرفين إلى 40 حرفاً واختر قيماً صالحة للأداة."));
        return;
    } const next = editing ? settings.customTools.map(tool => tool.id === draft.id ? parsed.data : tool) : [...settings.customTools, parsed.data]; onChange({ ...settings, customTools: next, toolOrder: editing ? order : [...order, draft.id] }); setDraft(null); }
    function move(id: string, target: string) { onChange({ ...settings, toolOrder: moveTool(order, id, target) }); setDragging(null); }
    return <div className="tool-manager"><div className="tool-manager-intro"><p>{t("أضف أدواتك، وغيّر ترتيب القائمة والبطاقات.")}</p><Button type="button" className="brand-button" onClick={openNew} disabled={settings.customTools.length >= 24}><Plus />{" " + t("إضافة أداة")}</Button></div>
  <div className="managed-tools">{entries.map((entry, index) => <div key={entry.id} className={dragging === entry.id ? "managed-tool dragging" : "managed-tool"} onDragOver={e => { if (dragging) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
        } }} onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData("application/x-mustanad-tool"); if (order.includes(id))
            move(id, entry.id); }}>
   <button type="button" className="tool-drag-handle" aria-label={t("اسحب لترتيب") + " " + entry.name} draggable onDragStart={e => { e.dataTransfer.setData("application/x-mustanad-tool", entry.id); e.dataTransfer.effectAllowed = "move"; setDragging(entry.id); }} onDragEnd={() => setDragging(null)}><GripVertical size={17}/></button>
   <div className="managed-tool-info"><strong>{entry.name} {entry.kind === "custom" && <small>{t("إضافية")}</small>}</strong><p>{entry.description}</p>{entry.kind === "custom" && <span className="tool-function">{t(extraActionLabels[entry.tool.action].name)}</span>}</div>
   <Switch dir="ltr" checked={entry.enabled} aria-label={t("إظهار") + " " + entry.name} onCheckedChange={enabled => onChange(entry.kind === "builtin" ? { ...settings, tools: { ...settings.tools, [entry.key]: enabled } } : { ...settings, customTools: settings.customTools.map(t => t.id === entry.id ? { ...t, enabled } : t) })}/>
   <div className="managed-tool-controls"><button type="button" disabled={index === 0} onClick={() => move(entry.id, order[index - 1])} aria-label={t("رفع") + " " + entry.name}>{t("للأعلى")}</button><button type="button" disabled={index === entries.length - 1} onClick={() => move(entry.id, order[index + 1])} aria-label={t("خفض") + " " + entry.name}>{t("للأسفل")}</button>{entry.kind === "custom" && <><button type="button" onClick={() => { setError(""); setDraft({ ...entry.tool }); }} aria-label={t("تعديل") + " " + entry.name}><Pencil size={14}/></button><button type="button" onClick={() => setDeleting(entry.id)} aria-label={t("حذف") + " " + entry.name}><Trash2 size={14}/></button></>}</div>
  </div>)}</div><p className="tool-manager-note">{t("الإضافات تستخدم الوظائف المتاحة أو تفتح رابطاً. إنشاء وظيفة معالجة جديدة بالكامل يحتاج برمجة. اضغط «حفظ التغييرات» لنشر تعديلاتك على الزوار.")}</p>
  <Dialog open={!!draft} onOpenChange={open => { if (!open)
        setDraft(null); }}><DialogContent className="editor-dialog tool-create-dialog" dir={dir} style={{ "--brand": settings.accent, "--brand-foreground": readableForeground(settings.accent) } as CSSProperties}><DialogTitle>{editing ? t("تعديل الأداة") : t("إضافة أداة جديدة")}</DialogTitle><DialogDescription>{t("اختر وظيفة تعمل، ثم خصّص الاسم والأيقونة واللون.")}</DialogDescription>{draft && <><label className="form-label">{t("وظيفة الأداة")}<Select dir={dir} value={draft.action} onValueChange={value => chooseAction(value as CustomTool["action"])}><SelectTrigger className="full-width"><SelectValue /></SelectTrigger><SelectContent>{extraActions.map(action => <SelectItem key={action} value={action}>{t(extraActionLabels[action].name)}</SelectItem>)}</SelectContent></Select></label><div className="bilingual-fields">
     <label className="form-label">{t("اسم الأداة بالعربية")}<Input dir="rtl" value={draft.name} maxLength={40} onChange={e=>edit("name",e.target.value)}/></label>
     <label className="form-label">{t("اسم الأداة بالإنجليزية")}<Input dir="ltr" value={draft.nameEn} maxLength={40} onChange={e=>edit("nameEn",e.target.value)}/></label>
     <label className="form-label">{t("وصف الأداة بالعربية")}<Textarea dir="rtl" rows={2} value={draft.description} maxLength={140} onChange={e=>edit("description",e.target.value)}/></label>
     <label className="form-label">{t("وصف الأداة بالإنجليزية")}<Textarea dir="ltr" rows={2} value={draft.descriptionEn} maxLength={140} onChange={e=>edit("descriptionEn",e.target.value)}/></label>
   </div>{draft.action === "openLink" && <label className="form-label">{t("رابط الموقع")}<Input dir="ltr" type="url" placeholder="https://example.com" value={draft.url} maxLength={2000} onChange={e => edit("url", e.target.value)}/><small>{t("يفتح الرابط في تبويب جديد. لا تُرسل ملفات PDF تلقائياً إلى الرابط.")}</small></label>}{draft.action === "watermark" && <label className="form-label">{t("نص العلامة الافتراضي، اختياري")}<Input value={draft.defaultText} placeholder={t("مثلاً: نسخة للمراجعة")} maxLength={120} onChange={e => edit("defaultText", e.target.value)}/></label>}
   <label className="form-label">{t("الأيقونة")}<Select dir={dir} value={draft.icon} onValueChange={value => edit("icon", value as CustomTool["icon"])}><SelectTrigger className="full-width"><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(iconLabels) as CustomTool["icon"][]).map(icon => <SelectItem key={icon} value={icon}><span className="icon-option"><CustomToolIcon icon={icon} size={16}/>{t(iconLabels[icon])}</span></SelectItem>)}</SelectContent></Select></label><ColorControl label={t("لون الأداة")} value={draft.color} onChange={value => edit("color", value)}/><div className="custom-tool-preview"><span style={{ color: draft.color, background: draft.color + "15" }}><CustomToolIcon icon={draft.icon}/></span><div><strong>{(uiLanguage === "en" ? draft.nameEn || t(draft.name) : draft.name) || t("اسم الأداة")}</strong><p>{uiLanguage === "en" ? draft.descriptionEn || t(draft.description) : draft.description}</p></div></div>{error && <p className="tool-form-error" role="alert">{localizeMessage(error)}</p>}<Button type="button" className="brand-button" onClick={saveTool}><Check />{editing ? t("اعتماد التعديل") : t("إضافة للقائمة")}</Button></>}</DialogContent></Dialog>
  <AlertDialog open={!!deleting} onOpenChange={open => { if (!open)
        setDeleting(null); }}><AlertDialogContent className="editor-dialog" dir={dir}><AlertDialogTitle>{t("حذف الأداة الإضافية؟")}</AlertDialogTitle><AlertDialogDescription>{t("تُحذف من القائمة بعد حفظ التغييرات. ملفات PDF لا تتأثر.")}</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>{t("إلغاء")}</AlertDialogCancel><AlertDialogAction className="brand-button" onClick={() => { onChange({ ...settings, customTools: settings.customTools.filter(t => t.id !== deleting), toolOrder: order.filter(id => id !== deleting) }); setDeleting(null); }}>{t("حذف الأداة")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </div>;
}

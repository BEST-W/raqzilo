"use client";
import { useLanguage } from "@/components/language-provider";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import type { Mark, FieldKind } from "@/lib/pdf-engine";
export const fieldKindLabels = { text: "خانة نصية", checkbox: "مربع اختيار", dropdown: "قائمة منسدلة" };
export function FieldKindSelect({ value, onChange }: {
    value: FieldKind;
    onChange: (value: FieldKind) => void;
}) {
    const { t, dir, language: uiLanguage, message: localizeMessage } = useLanguage();
    return <label className="form-label">{t("نوع الخانة")}<Select dir={dir} value={value} onValueChange={v => onChange(v as FieldKind)}><SelectTrigger className="full-width"><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(fieldKindLabels) as FieldKind[]).map(k => <SelectItem key={k} value={k}>{t(fieldKindLabels[k])}</SelectItem>)}</SelectContent></Select></label>;
}
export default function FieldProperties({ mark, onChange }: {
    mark: Mark;
    onChange: (value: Partial<Mark>) => void;
}) {
    const { t, dir, language: uiLanguage, message: localizeMessage } = useLanguage();
    const kind = mark.fieldKind || "text";
    return <>
  <FieldKindSelect value={kind} onChange={fieldKind => onChange({ fieldKind, text: "", checked: false, options: fieldKind === "dropdown" ? [t("الخيار الأول"), t("الخيار الثاني")] : undefined })}/>
  <label className="form-label">{t("اسم الخانة")}<Input dir="auto" maxLength={100} value={mark.name || ""} onChange={e => onChange({ name: e.target.value.replace(/[.\x00-\x1f]/g, "_") })}/></label>
  {kind !== "checkbox" && <label className="form-label">{t("حجم خط الخانة")}<Input type="number" min={6} max={36} value={mark.size} onChange={e => onChange({ size: Math.max(6, Math.min(36, Number(e.target.value) || 14)) })}/></label>}
  {kind === "text" && <label className="form-label">{t("القيمة الافتراضية")}<Textarea dir="auto" rows={3} value={mark.text || ""} onChange={e => onChange({ text: e.target.value })}/></label>}
  {kind === "checkbox" && <label className="field-check"><Checkbox checked={mark.checked === true} onCheckedChange={v => onChange({ checked: v === true })}/><span>{t("محدّد افتراضياً")}</span></label>}
  {kind === "dropdown" && <><label className="form-label">{t("خيارات القائمة")}<Textarea dir="auto" rows={4} value={(mark.options || []).join("\n")} onChange={e => onChange({ options: e.target.value.split("\n") })}/><small>{t("كل خيار في سطر، حتى 50 خياراً.")}</small></label><label className="form-label">{t("القيمة الافتراضية")}<Select dir={dir} value={mark.text || "__empty__"} onValueChange={v => onChange({ text: v === "__empty__" ? "" : v })}><SelectTrigger className="full-width"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__empty__">{t("دون اختيار")}</SelectItem>{[...new Set((mark.options || []).filter(v => v.trim() && v !== "__empty__"))].map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></label></>}
  <label className="field-check"><Checkbox checked={mark.required === true} onCheckedChange={v => onChange({ required: v === true })}/><span>{t("خانة مطلوبة عند التعبئة")}</span></label>
 </>;
}

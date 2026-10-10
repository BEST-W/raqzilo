"use client";
import { useLanguage } from "@/components/language-provider";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
const colors = ["#de684b", "#2457d6", "#148760", "#8239c9", "#efae25", "#d32f5d", "#111827", "#ffffff"];
export default function ColorControl({ label, value, onChange, swatches = false }: {
    label: string;
    value: string;
    onChange: (color: string) => void;
    swatches?: boolean;
}) {
    const { t, dir, language: uiLanguage, message: localizeMessage } = useLanguage();
    const picker = useRef<HTMLInputElement>(null), id = useId();
    const [draft, setDraft] = useState(value);
    useEffect(() => setDraft(value), [value]);
    function choose() { const input = picker.current; if (!input)
        return; try {
        if (input.showPicker)
            input.showPicker();
        else
            input.click();
    }
    catch {
        input.click();
    } }
    return <div className="color-control"><label className="color-label" htmlFor={id}>{label}</label><div className="color-control-row"><Button type="button" variant="outline" onClick={choose} className="choose-color"><span className="color-chip" style={{ background: value }}/>{t("اختيار أي لون")}</Button><input ref={picker} type="color" value={value} className="native-color-picker" aria-label={label} onChange={e => onChange(e.target.value)}/><Input id={id} dir="ltr" aria-label={label + (" " + t("— رمز اللون"))} maxLength={7} value={draft} onChange={e => { const next = e.target.value; setDraft(next); if (/^#[0-9a-fA-F]{6}$/.test(next))
        onChange(next); }} onBlur={() => setDraft(value)} className="hex-color"/></div>{swatches && <div className="all-color-swatches">{colors.map(color => <button type="button" key={color} aria-label={t("اختيار") + " " + color} aria-pressed={value.toLowerCase() === color} onClick={() => onChange(color)} style={{ background: color }} className={value.toLowerCase() === color ? "picked" : ""}/>)}</div>}</div>;
}

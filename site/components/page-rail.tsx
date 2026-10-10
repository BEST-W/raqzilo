"use client";
import { useLanguage } from "@/components/language-provider";
import { useEffect, useId, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import { FileText, GripVertical, Plus, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { destinationFromSlot } from "@/lib/page-order";
import type { PageInfo } from "@/lib/pdf-engine";
type Props = {
    pages: PageInfo[];
    page: number;
    thumbnails: Record<number, string>;
    canArrange: boolean;
    busy: boolean;
    onSelect: (page: number) => void;
    onMove: (from: number, to: number) => void;
    onRotate: (page: number) => void;
    onDelete: (page: number) => void;
    onAdd?: () => void;
};
type Gesture = {
    from: number;
    pointerId: number;
    node: HTMLElement;
    startX: number;
    startY: number;
    x: number;
    y: number;
    active: boolean;
    slot: number | null;
};
type Drag = {
    from: number;
    slot: number | null;
    x: number;
    y: number;
};
export default function PageRail({ pages, page, thumbnails, canArrange, busy, onSelect, onMove, onRotate, onDelete, onAdd }: Props) {
    const { t, dir, language: uiLanguage, message: localizeMessage } = useLanguage();
    const list = useRef<HTMLDivElement>(null), gesture = useRef<Gesture | null>(null), frame = useRef<number | null>(null), keyboardTarget = useRef<number | null>(null), ignoreClick = useRef(false), clickReset = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [drag, setDrag] = useState<Drag | null>(null), hintId = useId();
    const canDrag = canArrange && pages.length > 1 && !busy;
    function stop(update = true) {
        if (frame.current !== null) {
            cancelAnimationFrame(frame.current);
            frame.current = null;
        }
        const current = gesture.current;
        gesture.current = null;
        if (current?.node.hasPointerCapture(current.pointerId))
            current.node.releasePointerCapture(current.pointerId);
        if (update)
            setDrag(null);
    }
    useEffect(() => { stop(); }, [canDrag, pages.length]);
    useEffect(() => { if (!busy && keyboardTarget.current !== null) {
        list.current?.querySelector<HTMLButtonElement>(`[data-page-index="${keyboardTarget.current}"] .thumbnail`)?.focus();
        keyboardTarget.current = null;
    } }, [busy]);
    useEffect(() => {
        const cancel = () => stop();
        const escape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape" && gesture.current) {
            event.preventDefault();
            stop();
        } };
        window.addEventListener("blur", cancel);
        window.addEventListener("keydown", escape);
        return () => { stop(false); if (clickReset.current)
            clearTimeout(clickReset.current); window.removeEventListener("blur", cancel); window.removeEventListener("keydown", escape); };
    }, []);
    function locate(current: Gesture) {
        const container = list.current;
        if (!container)
            return;
        const bounds = container.getBoundingClientRect();
        let slot: number | null = null;
        if (current.x >= bounds.left - 12 && current.x <= bounds.right + 12 && current.y >= bounds.top && current.y <= bounds.bottom) {
            slot = pages.length;
            const items = container.querySelectorAll<HTMLElement>("[data-page-index]");
            for (const item of items) {
                const bounds = item.getBoundingClientRect();
                if (current.y < bounds.top + bounds.height / 2) {
                    slot = Number(item.dataset.pageIndex);
                    break;
                }
            }
        }
        current.slot = slot;
        setDrag({ from: current.from, slot, x: current.x, y: current.y });
    }
    function autoScroll() {
        const current = gesture.current, container = list.current;
        if (!current?.active || !container)
            return;
        const bounds = container.getBoundingClientRect();
        if (current.x >= bounds.left - 24 && current.x <= bounds.right + 24 && current.y >= bounds.top - 70 && current.y <= bounds.bottom + 70) {
            const edge = Math.min(45, bounds.height / 4);
            let speed = 0;
            if (current.y < bounds.top + edge)
                speed = -Math.min(15, Math.max(2, (bounds.top + edge - current.y) / 3));
            else if (current.y > bounds.bottom - edge)
                speed = Math.min(15, Math.max(2, (current.y - bounds.bottom + edge) / 3));
            const before = container.scrollTop;
            container.scrollTop += speed;
            if (before !== container.scrollTop)
                locate(current);
        }
        frame.current = requestAnimationFrame(autoScroll);
    }
    function start(event: PointerEvent<HTMLButtonElement>, index: number) {
        if (!canDrag || !event.isPrimary || event.button !== 0)
            return;
        event.preventDefault();
        event.currentTarget.focus();
        keyboardTarget.current = null;
        ignoreClick.current = false;
        if (clickReset.current) {
            clearTimeout(clickReset.current);
            clickReset.current = null;
        }
        stop();
        gesture.current = { from: index, pointerId: event.pointerId, node: event.currentTarget, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false, slot: null };
        event.currentTarget.setPointerCapture(event.pointerId);
    }
    function move(event: PointerEvent<HTMLButtonElement>) {
        const current = gesture.current;
        if (!current || current.pointerId !== event.pointerId)
            return;
        current.x = event.clientX;
        current.y = event.clientY;
        if (!current.active && Math.hypot(current.x - current.startX, current.y - current.startY) < 6)
            return;
        event.preventDefault();
        current.active = true;
        ignoreClick.current = true;
        locate(current);
        if (frame.current === null)
            frame.current = requestAnimationFrame(autoScroll);
    }
    function finish(event: PointerEvent<HTMLButtonElement>) {
        const current = gesture.current;
        if (!current || current.pointerId !== event.pointerId)
            return;
        current.x = event.clientX;
        current.y = event.clientY;
        if (current.active)
            locate(current);
        const { from, slot, active } = current;
        stop();
        if (active) {
            event.preventDefault();
            clickReset.current = setTimeout(() => { ignoreClick.current = false; clickReset.current = null; }, 250);
        }
        if (active && slot !== null) {
            const to = destinationFromSlot(pages.length, from, slot);
            if (to !== from)
                onMove(from, to);
        }
    }
    function keyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
        if (!canDrag || !event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key))
            return;
        event.preventDefault();
        const to = index + (event.key === "ArrowUp" ? -1 : 1);
        if (to >= 0 && to < pages.length) {
            keyboardTarget.current = to;
            onMove(index, to);
        }
    }
    const dropSlot = drag?.slot !== null && drag?.slot !== undefined && destinationFromSlot(pages.length, drag.from, drag.slot) !== drag.from ? drag.slot : null;
    return <aside className="page-rail">
    <div className="rail-heading"><span>{t("الصفحات")}</span><b>{pages.length}</b></div>
    {canArrange && pages.length > 1 && <p className="page-order-hint" id={hintId}>{t("اسحب لترتيبها")}<span className="sr-only">{t(". على اللمس استخدم مقبض الصفحة. من لوحة المفاتيح استخدم Alt مع السهم للأعلى أو للأسفل.")}</span></p>}
    <div className="page-thumbnails" ref={list} role="list" aria-label={t("صفحات المستند")} aria-describedby={canArrange && pages.length > 1 ? hintId : undefined}>
      {pages.map((info, index) => <div key={index} data-page-index={index} role="listitem" className={["thumbnail-item", index === page ? "active" : "", canDrag ? "sortable" : "", drag?.from === index ? "dragging" : "", dropSlot === index ? "drop-before" : "", dropSlot === pages.length && index === pages.length - 1 ? "drop-after" : ""].filter(Boolean).join(" ")}>
        <button className="thumbnail" style={{ aspectRatio: `${info.width}/${info.height}` }} disabled={busy} draggable={false} onPointerDown={event => { if (event.pointerType !== "touch")
            start(event, index); }} onPointerMove={move} onPointerUp={finish} onPointerCancel={() => stop()} onLostPointerCapture={event => { if (gesture.current?.node === event.currentTarget && gesture.current.pointerId === event.pointerId && !event.currentTarget.hasPointerCapture(event.pointerId))
            stop(); }} onKeyDown={event => keyboard(event, index)} onClick={() => { if (ignoreClick.current) {
            ignoreClick.current = false;
            return;
        } onSelect(index); }} aria-label={t("افتح الصفحة {0}", { "0": index + 1 })} aria-current={index === page ? "page" : undefined} title={canArrange ? t("الصفحة {0} — اسحب لتغيير ترتيبها", { "0": index + 1 }) : t("الصفحة {0}", { "0": index + 1 })}>
          {thumbnails[index] ? <img src={thumbnails[index]} alt={t("معاينة الصفحة {0}", { "0": index + 1 })} draggable={false}/> : <FileText size={25}/>}
        </button>
        {canArrange && pages.length > 1 && <Button type="button" variant="ghost" size="icon" className="page-drag-handle" disabled={busy} aria-label={t("اسحب لترتيب الصفحة {0}. أو استخدم Alt مع السهم للأعلى أو للأسفل.", { "0": index + 1 })} title={t("اسحب الصفحة إلى مكانها الجديد")} onPointerDown={event => start(event, index)} onPointerMove={move} onPointerUp={finish} onPointerCancel={() => stop()} onLostPointerCapture={event => { if (gesture.current?.node === event.currentTarget && gesture.current.pointerId === event.pointerId && !event.currentTarget.hasPointerCapture(event.pointerId))
            stop(); }} onKeyDown={event => keyboard(event, index)}><GripVertical size={15}/></Button>}
        <div className="thumbnail-caption"><span>{index + 1}</span>{canArrange && <div><button title={t("تدوير")} aria-label={t("تدوير الصفحة {0}", { "0": index + 1 })} disabled={busy} onClick={() => onRotate(index)}><RotateCw size={12}/></button><button title={t("حذف")} aria-label={t("حذف الصفحة {0}", { "0": index + 1 })} disabled={pages.length === 1 || busy} onClick={() => onDelete(index)}><Trash2 size={12}/></button></div>}</div>
      </div>)}
    </div>
    {onAdd && <button className="rail-add" onClick={onAdd} disabled={busy}><Plus size={15}/>{" " + t("إضافة ملف")}</button>}
    <span className="sr-only" role="status" aria-live="polite">{drag ? t("نقل الصفحة {0}. {1}", { "0": drag.from + 1, "1": dropSlot !== null ? t("الموضع الجديد {0}.", { "0": destinationFromSlot(pages.length, drag.from, dropSlot) + 1 }) : t("اختر الموضع الجديد أو اضغط Escape للإلغاء.") }) : ""}</span>
    {drag && <div className="page-drag-preview" style={{ left: Math.min(Math.max(8, drag.x + 14), window.innerWidth - 120), top: Math.min(drag.y + 14, window.innerHeight - 50) }} aria-hidden="true"><FileText size={15}/>{" " + t("الصفحة") + " "}{drag.from + 1}</div>}
  </aside>;
}

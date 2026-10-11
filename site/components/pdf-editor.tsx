"use client";
import {getLocalizedToolEntries} from "@/lib/localized-settings";
import { useLanguage } from "@/components/language-provider";
import LanguageSwitcher from "@/components/language-switcher";
import HomeWorkspace from "@/components/home-workspace";
import { useState, useRef, useEffect, type CSSProperties, type PointerEvent } from "react";
import { FileText, Upload, Download, Plus, Type, Image as ImageIcon, PenLine, Highlighter, Shield, Files, Combine, ArrowLeftRight, Minimize2, FormInput, Settings2, ChevronLeft, ChevronRight, RotateCw, Trash2, Undo2, MousePointer2, Search, X, Check, LockKeyhole, ArrowUpRight, ArrowUp, ArrowDown, ZoomIn, ZoomOut, LoaderCircle, CheckCircle2, CircleHelp, MoreHorizontal, GripVertical, FolderOpen, Sparkles, PanelLeftClose } from "lucide-react";
import { Sidebar, SidebarProvider } from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Empty } from "@/components/ui/empty";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { registerBrowserTools, type WorkspaceSnapshot } from "@/lib/browser-tools";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { type Settings, type ToolKey, type CustomTool, type ToolEntry, toolLabels, appearanceVariables } from "@/lib/settings-model";
import CustomToolIcon from "@/components/customization/tool-icon";
import PageRail from "@/components/page-rail";
import { movedPageOrder, remapPageMarks } from "@/lib/page-order";
import ColorControl from "@/components/customization/color-control";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import * as engine from "@/lib/pdf-engine";
import type { Bytes, Mark, Box, TextLine, PageInfo, FieldInfo } from "@/lib/pdf-engine";
import LocalToolsDialog, { isLocalTool, type LocalTool } from "@/components/local-tools-dialog";
import { Crop, ScanText, LayoutTemplate } from "lucide-react";
import SharePanel from "@/components/share-panel";
import { Link as LinkIcon } from "lucide-react";
import FieldProperties, { FieldKindSelect } from "@/components/field-properties";
import MarkdownDialog from "@/components/markdown-dialog";
type Tool = "select" | "text" | "replace" | "image" | "signature" | "highlight" | "redact" | "field" | "pages";
type HistoryEntry = {
    bytes: Bytes;
    marks: Mark[];
    page: number;
    dirty: boolean;
    afterMarks: Mark[];
};
type Modal = "sign" | "convert" | "compress" | "extract" | "password" | "help" | "numberPages" | "watermark" | "blankPage" | null;
const icons = { edit: Type, sign: PenLine, redact: Shield, pages: Files, merge: Combine, markdown: FileText, convert: ArrowLeftRight, compress: Minimize2, forms: FormInput, crop: Crop, protect: LockKeyhole, compare: ArrowLeftRight, ocr: ScanText, templates: LayoutTemplate, share: LinkIcon };
const toolNames: Record<Tool, string> = { select: "تحديد وتحريك", text: "إضافة نص", replace: "تعديل نص موجود", image: "إضافة صورة", signature: "إضافة توقيع", highlight: "تظليل", redact: "حجب بيانات", field: "إضافة خانة", pages: "تنظيم الصفحات" };
const formatSize = (n: number) => n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
const uid = () => crypto.randomUUID();
const nextFrame = () => new Promise<void>(r => requestAnimationFrame(() => r()));
export default function Editor({ settings, isOwner = false }: {
    settings: Settings;
    isOwner?: boolean;
}) {
    const { t, dir, language: uiLanguage, message: localizeMessage } = useLanguage();
    const [bytes, setBytes] = useState<Bytes | null>(null), [name, setName] = useState(""), [pages, setPages] = useState<PageInfo[]>([]), [page, setPage] = useState(0);
    const [image, setImage] = useState(""), [lines, setLines] = useState<TextLine[]>([]), [thumbnails, setThumbnails] = useState<Record<number, string>>({});
    const [marks, setMarks] = useState<Mark[]>([]), [selected, setSelected] = useState<string | null>(null), [tool, setTool] = useState<Tool>("select"), [category, setCategory] = useState<ToolKey>("edit");
    const [view, setView] = useState<"editor" | "tools">("editor"), [zoom, setZoom] = useState(1), [availableWidth, setAvailableWidth] = useState(800);
    const [busy, setBusy] = useState(""), [rendering, setRendering] = useState(false), [status, setStatus] = useState<{
        text: string;
        error?: boolean;
    } | null>(null);
    const [modal, setModal] = useState<Modal>(null), [draft, setDraft] = useState<Box | null>(null), [color, setColor] = useState("#20282b"), [size, setSize] = useState(14);
    const [shareOpen, setShareOpen] = useState(false);
    const [markdownOpen, setMarkdownOpen] = useState(false);
    const [localTool, setLocalTool] = useState<LocalTool | null>(null), [fieldKind, setFieldKind] = useState<engine.FieldKind>("text");
    const pendingCategory = useRef<ToolKey | null>(null);
    const [history, setHistory] = useState<HistoryEntry[]>([]), [dirty, setDirty] = useState(false), [query, setQuery] = useState(""), [showSearch, setShowSearch] = useState(false);
    const [fields, setFields] = useState<FieldInfo[]>([]), [values, setValues] = useState<Record<string, string>>({});
    const [range, setRange] = useState("1"), [compression, setCompression] = useState("lossless"), [flattenAccepted, setFlattenAccepted] = useState(false), [progress, setProgress] = useState(0);
    const [extraTool, setExtraTool] = useState<CustomTool | null>(null), [activeExtraId, setActiveExtraId] = useState<string | null>(null);
    const [numberStart, setNumberStart] = useState(1), [numberPosition, setNumberPosition] = useState<engine.NumberPosition>("bottomCenter"), [extraSize, setExtraSize] = useState(11), [extraColor, setExtraColor] = useState(settings.accent);
    const [watermarkText, setWatermarkText] = useState(""), [watermarkOpacity, setWatermarkOpacity] = useState(18), [blankPosition, setBlankPosition] = useState("after");
    const pendingExtra = useRef<CustomTool | null>(null);
    const entries = getLocalizedToolEntries(settings, uiLanguage).filter(entry => entry.enabled);
    const siteName = uiLanguage === "en" ? settings.nameEn || t(settings.name) : settings.name;
    const siteTagline = uiLanguage === "en" ? settings.taglineEn || t(settings.tagline) : settings.tagline;
    const announcement = uiLanguage === "en" ? settings.announcementEn || settings.announcement : settings.announcement;
    const extraTitle = extraTool ? (uiLanguage === "en" ? extraTool.nameEn || t(extraTool.name) : extraTool.name) : "";
    const appearance = appearanceVariables(settings) as CSSProperties;
    useEffect(()=>{document.title=siteName+" · "+t("أدوات PDF مجانية في متصفحك");},[siteName,t]);
    const [confirmationText, setConfirmationText] = useState("");
    const confirmResolve = useRef<((answer: boolean) => void) | null>(null);
    const browserSnapshot = useRef<WorkspaceSnapshot>({ filename: null, pages: 0, currentPage: null, pendingEdits: 0, availableTools: [] });
    const browserNavigate = useRef<(page: number) => Promise<WorkspaceSnapshot>>(async () => browserSnapshot.current);
    const [password, setPassword] = useState(""), [pendingFile, setPendingFile] = useState<{
        bytes: Bytes;
        name: string;
    } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null), mergeRef = useRef<HTMLInputElement>(null), imageRef = useRef<HTMLInputElement>(null), imagesPdfRef = useRef<HTMLInputElement>(null);
    const workspaceRef = useRef<HTMLDivElement>(null), paperRef = useRef<HTMLDivElement>(null), signatureRef = useRef<HTMLCanvasElement>(null);
    const gesture = useRef<{
        mode: "draw" | "move";
        startX: number;
        startY: number;
        id?: string;
        x?: number;
        y?: number;
    } | null>(null), signatureDrawing = useRef(false), hasSignature = useRef(false);
    const active = marks.find(m => m.id === selected), pageMarks = marks.filter(m => m.page === page), base = name.replace(/\.pdf$/i, "") || t("مستند");
    const pageInfo = pages[page] || { width: 595, height: 842 };
    const paperWidth = Math.max(220, Math.min(680, availableWidth - 72)) * zoom;
    browserSnapshot.current = { filename: name || null, pages: pages.length, currentPage: bytes ? page + 1 : null, pendingEdits: marks.length, availableTools: entries.map(entry => entry.id) };
    browserNavigate.current = async (next) => { if (busy)
        throw new Error("The document is busy."); jump(next - 1); await nextFrame(); return browserSnapshot.current; };
    useEffect(() => registerBrowserTools(() => browserSnapshot.current, p => browserNavigate.current(p)), []);
    useEffect(() => { const input = fileRef.current; const cancel = () => { pendingExtra.current = null; pendingCategory.current = null; }; input?.addEventListener("cancel", cancel); return () => input?.removeEventListener("cancel", cancel); }, []);
    function confirmChoice(text: string) { return new Promise<boolean>(resolve => { confirmResolve.current = resolve; setConfirmationText(text); }); }
    function finishConfirmation(answer: boolean) { confirmResolve.current?.(answer); confirmResolve.current = null; setConfirmationText(""); }
    useEffect(() => { if (!workspaceRef.current)
        return; const observer = new ResizeObserver(entries => setAvailableWidth(entries[0].contentRect.width)); observer.observe(workspaceRef.current); return () => observer.disconnect(); }, [bytes, view]);
    useEffect(() => { const handler = (e: BeforeUnloadEvent) => { if (dirty) {
        e.preventDefault();
        e.returnValue = "";
    } }; window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler); }, [dirty]);
    useEffect(() => { if (!status)
        return; toast[status.error ? "error" : "success"](status.text, { duration: status.error ? 10000 : 5500 }); const timer = setTimeout(() => setStatus(null), status.error ? 10000 : 5500); return () => clearTimeout(timer); }, [status]);
    useEffect(() => {
        if (!bytes)
            return;
        let cancelled = false;
        let url = "";
        setRendering(true);
        setImage("");
        setLines([]);
        engine.renderPage(bytes, page, Math.min(2000, Math.max(1200, paperWidth * window.devicePixelRatio))).then(rendered => { if (cancelled)
            return; url = URL.createObjectURL(new Blob([new Uint8Array(rendered.png).buffer], { type: "image/png" })); setImage(url); setLines(rendered.lines); }).catch(e => { if (!cancelled)
            setStatus({ text: e instanceof Error ? localizeMessage(e.message) : t("تعذر عرض الصفحة."), error: true }); }).finally(() => { if (!cancelled)
            setRendering(false); });
        return () => { cancelled = true; if (url)
            URL.revokeObjectURL(url); };
    }, [bytes, page]);
    useEffect(() => {
        setThumbnails({});
        if (!bytes)
            return;
        let cancelled = false;
        const urls: string[] = [];
        (async () => { for (let i = 0; i < Math.min(pages.length, 24); i++) {
            await new Promise(r => setTimeout(r, 25));
            if (cancelled)
                break;
            try {
                const r = await engine.renderPage(bytes, i, 120, false);
                if (cancelled)
                    break;
                const url = URL.createObjectURL(new Blob([new Uint8Array(r.png).buffer], { type: "image/png" }));
                urls.push(url);
                setThumbnails(t => ({ ...t, [i]: url }));
            }
            catch {
                break;
            }
        } })();
        return () => { cancelled = true; urls.forEach(u => URL.revokeObjectURL(u)); };
    }, [bytes, pages.length]);
    useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") {
        setSelected(null);
        setDraft(null);
        setTool("select");
    } if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (bytes && !busy)
            void exportPdf();
    } if (e.key === "Delete" && selected && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setMarks(m => m.filter(x => x.id !== selected));
        setSelected(null);
        setDirty(true);
    } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); });
    async function run(label: string, fn: () => Promise<void>) { if (busy)
        return; setBusy(label); setProgress(0); await nextFrame(); try {
        await fn();
    }
    catch (e) {
        setStatus({ text: e instanceof Error && localizeMessage(e.message) !== "PASSWORD" ? localizeMessage(e.message) : t("تعذر إكمال العملية. جرّب ملف PDF آخر."), error: true });
    }
    finally {
        setBusy("");
    } }
    function validate(file: File) { if (file.size > settings.maxFileMB * 1024 * 1024)
        throw new Error(t("أقصى حجم للملف {0} ميجابايت.", { "0": settings.maxFileMB })); }
    async function loadDocument(data: Bytes, filename: string, reset = true) { const info = await engine.inspect(data); if (reset) {
        setHistory([]);
        setMarks([]);
        setDirty(false);
    } const loadedFields = category === "forms" ? await engine.readFields(data) : []; setBytes(data); setName(filename); setPages(info); setPage(0); setSelected(null); setFields(loadedFields); setValues(Object.fromEntries(loadedFields.map(field => [field.name, field.value]))); setView("editor"); setZoom(1); if (pendingExtra.current) {
        const next = pendingExtra.current;
        pendingExtra.current = null;
        openExtraDialog(next);
    }
    else if (pendingCategory.current) {
        const next = pendingCategory.current;
        pendingCategory.current = null;
        await chooseCategory(next, data);
    } }
    async function openFile(file: File) { if (dirty && !await confirmChoice(t("لديك تعديلات لم تُنزّل. فتح مستند جديد؟"))) {
        pendingExtra.current = null;
        pendingCategory.current = null;
        return;
    } await run(t("فتح المستند…"), async () => { validate(file); if (!/\.pdf$/i.test(file.name))
        throw new Error(t("اختر ملف PDF. لتحويل الصور استخدم أداة التحويل.")); const data = new Uint8Array(await file.arrayBuffer()); try {
        const unlocked = await engine.unlock(data);
        await loadDocument(unlocked, file.name);
    }
    catch (e) {
        if (e instanceof Error && localizeMessage(e.message) === "PASSWORD") {
            setPendingFile({ bytes: data, name: file.name });
            setPassword("");
            setModal("password");
        }
        else
            throw e;
    } }); }
    async function changeBytes(data: Bytes, prior?: Bytes) { const info = await engine.inspect(data); const currentFields = category === "forms" ? await engine.readFields(data) : []; const previous = prior || bytes; if (previous)
        setHistory(h => [...h, { bytes: previous, marks: prior ? [] : marks, page, dirty, afterMarks: [] }].slice(-4)); setBytes(data); setPages(info); setPage(p => Math.min(p, info.length - 1)); setMarks([]); setSelected(null); setFields(currentFields); setValues(Object.fromEntries(currentFields.map(field => [field.name, field.value]))); setDirty(true); }
    async function applied() { if (!bytes)
        throw new Error(t("افتح مستنداً أولاً.")); return engine.applyMarks(bytes, marks); }
    async function exportPdf() { await run(t("تجهيز النسخة المعدّلة…"), async () => { const output = await applied(); engine.download(output, base + t("-معدّل.pdf")); if (marks.length)
        await changeBytes(output); setDirty(false); setStatus({ text: t("تم تنزيل النسخة المعدّلة على جهازك.") }); }); }
    function updateMark(update: Partial<Mark>) { if (!selected)
        return; setMarks(ms => ms.map(m => m.id === selected ? { ...m, ...update } : m)); setDirty(true); }
    function addMark(mark: Omit<Mark, "id" | "page" | "color" | "size"> & Partial<Pick<Mark, "color" | "size">>) { const id = uid(); setMarks(m => [...m, { ...mark, id, page, color: mark.color || color, size: mark.size || size }]); setSelected(id); setDirty(true); }
    function position(event: PointerEvent) { const r = paperRef.current!.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (event.clientY - r.top) / r.height)) }; }
    function paperDown(event: PointerEvent) { if (busy || rendering || !bytes || !image || event.button !== 0)
        return; if (["select", "pages", "replace", "image", "signature"].includes(tool)) {
        setSelected(null);
        return;
    } event.preventDefault(); const p = position(event); gesture.current = { mode: "draw", startX: p.x, startY: p.y }; setDraft({ x: p.x, y: p.y, w: 0, h: 0 }); paperRef.current?.setPointerCapture(event.pointerId); }
    function paperMove(event: PointerEvent) { const g = gesture.current; if (!g)
        return; const p = position(event); if (g.mode === "draw")
        setDraft({ x: Math.min(g.startX, p.x), y: Math.min(g.startY, p.y), w: Math.abs(p.x - g.startX), h: Math.abs(p.y - g.startY) });
    else {
        setMarks(ms => ms.map(m => m.id === g.id ? { ...m, x: Math.max(0, Math.min(1 - m.w, g.x! + p.x - g.startX)), y: Math.max(0, Math.min(1 - m.h, g.y! + p.y - g.startY)) } : m));
        setDirty(true);
    } }
    function paperUp(event: PointerEvent) { const g = gesture.current; if (!g)
        return; gesture.current = null; if (paperRef.current?.hasPointerCapture(event.pointerId))
        paperRef.current.releasePointerCapture(event.pointerId); if (g.mode === "draw" && draft) {
        const box = draft.w > .008 && draft.h > .008 ? draft : { x: Math.min(g.startX, .6), y: Math.min(g.startY, .9), w: tool === "field" && fieldKind === "checkbox" ? .04 : .35, h: tool === "field" ? .05 : .075 };
        if (tool === "text" || tool === "field" || tool === "highlight" || tool === "redact") {
            addMark({ ...box, kind: tool, text: tool === "text" ? t("اكتب نصك هنا") : "", name: tool === "field" ? "field_" + (marks.length + 1) : undefined, fieldKind: tool === "field" ? fieldKind : undefined, options: tool === "field" && fieldKind === "dropdown" ? [t("الخيار الأول"), t("الخيار الثاني")] : undefined, color: tool === "highlight" ? "#f8cf54" : color });
        }
    } setDraft(null); }
    function startMove(event: PointerEvent, mark: Mark) { if (busy)
        return; event.stopPropagation(); event.preventDefault(); setSelected(mark.id); const p = position(event); gesture.current = { mode: "move", startX: p.x, startY: p.y, id: mark.id, x: mark.x, y: mark.y }; paperRef.current?.setPointerCapture(event.pointerId); }
    function chooseReplace(line: TextLine) { addMark({ ...line, source: { x: Math.max(0, line.x - .003), y: Math.max(0, line.y - .002), w: Math.min(1 - line.x, line.w + .006), h: line.h + .006 }, x: Math.max(0, line.x - .003), y: Math.max(0, line.y - .002), w: Math.min(1 - line.x, line.w + .006), h: line.h + .006, kind: "replace", text: line.text, size: Math.max(8, line.size) }); setTool("select"); }
    async function chooseCategory(key: ToolKey, loadedBytes?: Bytes) { setActiveExtraId(null); pendingExtra.current = null; pendingCategory.current = null; setCategory(key); setView("editor"); const source = loadedBytes || bytes; if (key === "share") { setShareOpen(true); return; } if (key === "templates") {
        setLocalTool("templates");
        return;
    } if (key === "convert") {
        setModal("convert");
        return;
    } if (!source) {
        pendingCategory.current = key;
        fileRef.current?.click();
        return;
    } if (key === "markdown") {
        setTool("select"); setSelected(null); setMarkdownOpen(true); return;
    } if (isLocalTool(key)) {
        setTool("select");
        setSelected(null);
        setLocalTool(key);
        return;
    } if (key === "edit")
        setTool("select"); if (key === "sign")
        setModal("sign"); if (key === "redact")
        setTool("redact"); if (key === "pages")
        setTool("pages"); if (key === "merge")
        mergeRef.current?.click(); if (key === "compress") {
        setCompression("lossless");
        setFlattenAccepted(false);
        setModal("compress");
    } if (key === "forms") {
        setTool("field");
        const read = async () => { const found = await engine.readFields(loadedBytes ? source : await applied()); setFields(found); setValues(Object.fromEntries(found.map(f => [f.name, f.value]))); };
        if (loadedBytes)
            await read();
        else
            await run(t("قراءة خانات المستند…"), read);
    } }
    function openExtraDialog(custom: CustomTool) {
        if (custom.action === "openLink")
            return;
        setExtraTool(custom);
        setActiveExtraId(custom.id);
        setCategory("edit");
        setView("editor");
        setTool("select");
        setSelected(null);
        setFields([]);
        setValues({});
        setExtraColor(custom.color);
        setNumberStart(1);
        setNumberPosition("bottomCenter");
        setExtraSize(custom.action === "watermark" ? 38 : 11);
        setWatermarkText(custom.defaultText || t("نسخة للمراجعة"));
        setWatermarkOpacity(18);
        setBlankPosition("after");
        if (isLocalTool(custom.action)) {
            setLocalTool(custom.action);
            return;
        }
        setModal(custom.action);
    }
    function openFilePicker() { pendingExtra.current = null; pendingCategory.current = null; fileRef.current?.click(); }
    function chooseExtra(custom: CustomTool) { if (busy)
        return; if (!bytes && custom.action !== "templates") {
        pendingCategory.current = null;
        pendingExtra.current = custom;
        setView("editor");
        fileRef.current?.click();
        return;
    } openExtraDialog(custom); }
    function chooseEntry(entry: ToolEntry) { if (entry.kind === "builtin")
        void chooseCategory(entry.key);
    else
        chooseExtra(entry.tool); }
    function entryIcon(entry: ToolEntry, size: number) { if (entry.kind === "custom")
        return <CustomToolIcon icon={entry.tool.icon} size={size}/>; const Icon = icons[entry.key]; return <Icon size={size}/>; }
    function entryStyle(entry: ToolEntry): CSSProperties | undefined { return entry.kind === "custom" ? { "--tool-color": entry.tool.color } as CSSProperties : undefined; }
    function extraAction() {
        if (!extraTool)
            return;
        void run(t("تطبيق") + " " + extraTool.name + "…", async () => {
            const data = await applied();
            let output: Bytes;
            if (modal === "numberPages")
                output = await engine.numberPages(data, { start: numberStart, position: numberPosition, size: extraSize, color: extraColor });
            else if (modal === "watermark")
                output = await engine.watermark(data, { text: watermarkText, size: extraSize, color: extraColor, opacity: watermarkOpacity / 100 });
            else if (modal === "blankPage") {
                const index = blankPosition === "before" ? page : blankPosition === "after" ? page + 1 : pages.length;
                output = await engine.insertBlankPage(data, index);
                await changeBytes(output);
                setPage(index);
                setModal(null);
                setStatus({ text: t("تمت إضافة الصفحة. نزّل PDF لحفظ النسخة.") });
                return;
            }
            else
                return;
            await changeBytes(output);
            setModal(null);
            setStatus({ text: t("تم تطبيق الأداة. نزّل PDF لحفظ النسخة المعدّلة.") });
        });
    }
    async function movePage(from: number, to: number) {
        if (!bytes || !settings.tools.pages || busy || from === to)
            return;
        await run(t("تغيير ترتيب الصفحات…"), async () => {
            const order = movedPageOrder(pages.length, from, to), afterMarks = remapPageMarks(marks, order);
            const output = await engine.reorder(bytes, order), info = await engine.inspect(output), currentFields = category === "forms" ? await engine.readFields(output) : [];
            setHistory(h => [...h, { bytes, marks, page, dirty, afterMarks }].slice(-4));
            setBytes(output);
            setPages(info);
            setPage(order.indexOf(page));
            setMarks(afterMarks);
            setSelected(null);
            setQuery("");
            setFields(currentFields);
            setValues(Object.fromEntries(currentFields.map(field => [field.name, field.value])));
            setDirty(true);
            setStatus({ text: t("نُقلت الصفحة {0} إلى الموضع {1}. نزّل PDF لحفظ الترتيب.", { "0": from + 1, "1": to + 1 }) });
        });
    }
    async function pageAction(action: "rotate" | "delete" | "up" | "down", index = page) { if (action === "up" || action === "down") {
        const to = index + (action === "up" ? -1 : 1);
        if (to >= 0 && to < pages.length)
            await movePage(index, to);
        return;
    } await run(t("تنظيم الصفحات…"), async () => { const current = await applied(); let output: Bytes; if (action === "rotate")
        output = await engine.rotatePage(current, index);
    else {
        const order = pages.map((_, i) => i);
        if (action === "delete") {
            if (order.length === 1)
                throw new Error(t("لا يمكن حذف الصفحة الوحيدة."));
            order.splice(index, 1);
        }
        output = await engine.reorder(current, order);
    } await changeBytes(output); }); }
    async function addImage(file: File) { await run(t("تجهيز الصورة…"), async () => { validate(file); const bitmap = await createImageBitmap(file); if (bitmap.width * bitmap.height > 30000000) {
        bitmap.close();
        throw new Error(t("أبعاد الصورة كبيرة جداً."));
    } const canvas = document.createElement("canvas"); const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height)); canvas.width = bitmap.width * scale; canvas.height = bitmap.height * scale; canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close(); const w = .3, h = Math.min(.4, w * (canvas.height / canvas.width) * (pageInfo.width / pageInfo.height)); addMark({ kind: "image", image: canvas.toDataURL("image/png"), x: .35, y: .35, w, h }); setTool("select"); }); }
    async function undo() { const previous = history[history.length - 1]; const documentWasLast = previous && marks.length === previous.afterMarks.length && marks.every((mark, index) => mark === previous.afterMarks[index]); if (previous && (documentWasLast || !marks.length)) {
        await run(t("التراجع…"), async () => { const info = await engine.inspect(previous.bytes), currentFields = category === "forms" ? await engine.readFields(previous.bytes) : []; setHistory(h => h.slice(0, -1)); setBytes(previous.bytes); setPages(info); setPage(Math.min(previous.page, info.length - 1)); setMarks(previous.marks); setSelected(null); setFields(currentFields); setValues(Object.fromEntries(currentFields.map(field => [field.name, field.value]))); setQuery(""); setDirty(previous.dirty); setStatus({ text: t("تم التراجع عن العملية الأخيرة.") }); });
    }
    else if (marks.length) {
        setMarks(ms => ms.slice(0, -1));
        setSelected(null);
        setDirty(true);
    } }
    async function clearDocument() { if (dirty && !await confirmChoice(t("لديك تعديلات لم تُنزّل. إغلاق المستند؟")))
        return; setBytes(null); setPages([]); setMarks([]); setName(""); setHistory([]); setDirty(false); setImage(""); setFields([]); }
    function signaturePoint(e: PointerEvent<HTMLCanvasElement>) { const c = e.currentTarget, r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * c.width / r.width, y: (e.clientY - r.top) * c.height / r.height }; }
    function signDown(e: PointerEvent<HTMLCanvasElement>) { e.preventDefault(); signatureDrawing.current = true; hasSignature.current = true; e.currentTarget.setPointerCapture(e.pointerId); const p = signaturePoint(e), ctx = e.currentTarget.getContext("2d")!; ctx.strokeStyle = color; ctx.lineWidth = 3.5; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + .1, p.y + .1); ctx.stroke(); }
    function signMove(e: PointerEvent<HTMLCanvasElement>) { if (!signatureDrawing.current)
        return; const p = signaturePoint(e), ctx = e.currentTarget.getContext("2d")!; ctx.lineTo(p.x, p.y); ctx.stroke(); }
    async function convert(kind: "word" | "images") { await run(kind === "word" ? t("استخراج النص إلى Word…") : t("تحويل الصفحات إلى صور…"), async () => { const data = await applied(); const output = kind === "word" ? await engine.toWord(data, base) : await engine.toImages(data, setProgress); engine.download(output, base + (kind === "word" ? ".docx" : t("-صور.zip")), kind === "word" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/zip"); setModal(null); setStatus({ text: t("اكتمل التحويل وتم تنزيل الملف.") }); }); }
    async function compress() { await run(t("ضغط المستند…"), async () => { const current = await applied(); const output = compression === "lossless" ? await engine.compressLossless(current) : await engine.compressVisual(current, compression === "strong" ? .5 : .72, setProgress); if (output.length >= current.length) {
        setStatus({ text: t("النسخة الحالية أصغر بالفعل؛ لم نغيّرها.") });
        return;
    } engine.download(output, base + t("-مضغوط.pdf")); setModal(null); setStatus({ text: t("تم تقليل الحجم من {0} إلى {1} ({2}%).", { "0": formatSize(current.length), "1": formatSize(output.length), "2": Math.round((1 - output.length / current.length) * 100) }) }); }); }
    function jump(index: number) { setPage(index); setSelected(null); setQuery(""); }
    const found = query.trim() ? lines.filter(l => l.text.toLocaleLowerCase().includes(query.toLocaleLowerCase())) : [];
    const hiddenInputs = <><input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f)
        void openFile(f); }}/><input ref={mergeRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ""; if (files.length)
        void run(t("دمج المستندات…"), async () => { files.forEach(validate); const total = files.reduce((n, f) => n + f.size, bytes?.length || 0); if (total > settings.maxFileMB * 1024 * 1024)
            throw new Error(t("مجموع ملفات الدمج يتجاوز حد الحجم.")); const data = await applied(), others = await Promise.all(files.map(async (f) => new Uint8Array(await f.arrayBuffer()))); await changeBytes(await engine.appendPdfs(data, others)); setStatus({ text: t("تم دمج {0} ملف مع المستند.", { "0": files.length }) }); }); }}/><input ref={imageRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f)
        void addImage(f); }}/><input ref={imagesPdfRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ""; if (files.length)
        void run(t("إنشاء PDF من الصور…"), async () => { files.forEach(validate); if (files.length > 250 || files.reduce((n, f) => n + f.size, 0) > settings.maxFileMB * 1024 * 1024)
            throw new Error(t("الصور تتجاوز حد الحجم أو عدد الصفحات.")); if (dirty && !await confirmChoice(t("سيُفتح مستند الصور بدلاً من الحالي. متابعة؟")))
            return; await loadDocument(await engine.imagesToPdf(files), t("صور.pdf")); setDirty(true); setModal(null); setStatus({ text: t("تم إنشاء المستند. نزّله لحفظ نسخة على جهازك.") }); }); }}/></>;
    return <div className={`editor-app ${bytes ? "document-open" : "home-view"}`} dir={dir} style={appearance}>
    {hiddenInputs}
    <header className="app-header"><a href="/" className="brand" onClick={e => { e.preventDefault(); setView("editor"); }}><span className="brand-icon"><Files size={22}/></span><strong>{siteName}</strong></a><Tabs value={view} onValueChange={v => setView(v as "editor" | "tools")} className="header-tabs-root"><TabsList className="header-tabs" aria-label={t("الصفحات")}><TabsTrigger value="editor" className={view === "editor" ? "active" : ""}>{t("المحرر")}</TabsTrigger><TabsTrigger value="tools" className={view === "tools" ? "active" : ""}>{t("جميع الأدوات") + " "}<span>{entries.length}</span></TabsTrigger></TabsList></Tabs><div className="header-end"><LanguageSwitcher/><span className="privacy-top"><LockKeyhole size={13}/>{" " + t("التعديل محلي · المشاركة اختيارية")}</span><button className="icon-button help-button" aria-label={t("مساعدة")} onClick={() => setModal("help")}><CircleHelp size={19}/></button>{isOwner && <a className="admin-link" href="/admin" target="_blank" rel="noopener noreferrer" title={t("فتح لوحة الإدارة في تبويب جديد")} aria-label={t("إدارة الموقع — فتح في تبويب جديد")}><Settings2 size={16}/><span>{t("إدارة الموقع")}</span></a>}</div></header>
    {announcement && <div className="announcement">{announcement}</div>}
    {settings.maintenance ? <main className="access-page"><Minimize2 size={40}/><h1>{t("نرتّب المساحة لك")}</h1><p>{t("الموقع في وضع الصيانة. يمكنك العودة لاحقاً.")}</p>{isOwner && <a href="/admin" target="_blank" rel="noopener noreferrer" className="primary-link">{t("لوحة الإدارة")}</a>}</main> : <SidebarProvider className="app-body">
      {bytes && <Sidebar className="tool-sidebar" side={dir === "rtl" ? "right" : "left"} collapsible="none"><div className="sidebar-label">{t("مساحة العمل")}</div><button className="sidebar-open" onClick={() => fileRef.current?.click()} disabled={!!busy}><Plus size={18}/>{" " + t("فتح مستند")}</button><div className="sidebar-label tools-label">{t("أدوات المستند")}</div><nav>{entries.map(entry => { const selected = entry.kind === "custom" ? activeExtraId === entry.id : !activeExtraId && category === entry.key; const className = selected && view === "editor" ? "tool-nav active" : "tool-nav"; const contents = <>{entryIcon(entry, 19)}<span>{entry.name}</span>{selected && <span className="active-dot"/>}</>; return entry.kind === "custom" && entry.tool.action === "openLink" ? <a key={entry.id} className="tool-nav" style={entryStyle(entry)} href={entry.tool.url} target="_blank" rel="noopener noreferrer" title={t("يفتح رابطاً خارجياً في تبويب جديد")}>{contents}<ArrowUpRight size={13}/></a> : <button key={entry.id} className={className} style={entryStyle(entry)} onClick={() => chooseEntry(entry)} disabled={!!busy}>{contents}</button>; })}</nav><div className="sidebar-bottom"><div className="privacy-card"><span className="privacy-icon"><Shield size={17}/></span><strong>{t("خصوصيتك أولاً")}</strong><p>{t("التعديل داخل متصفحك.")}<br />{t("المشاركة ترفع النسخة التي تختارها فقط.")}</p></div><span className="version-tag">{siteName} · PDF</span></div></Sidebar>}
      <main className="editor-main">
        {bytes && <div className="document-toolbar"><div className="file-heading"><span className="file-type"><FileText size={19}/></span><div><strong title={name}>{name || t("مساحة عمل جديدة")}</strong><span>{bytes ? <>{pages.length} {pages.length === 1 ? t("صفحة") : t("صفحات")} <i /> <b dir="ltr">{formatSize(bytes.length)}</b> <i /> {dirty ? t("تعديلات لم تُنزّل") : t("جاهز للعمل")}</> : siteTagline}</span></div>{bytes && <button className="icon-button" aria-label={t("إغلاق المستند")} onClick={() => void clearDocument()} disabled={!!busy}><X size={16}/></button>}</div><div className="document-actions"><Button variant="ghost" size="icon" title={t("التراجع عن آخر إضافة أو عملية")} aria-label={t("تراجع")} disabled={(!marks.length && !history.length) || !!busy} onClick={() => void undo()}><Undo2 /></Button><span className="toolbar-divider"/><Button className="brand-button download-button" disabled={!bytes || !!busy} onClick={() => void exportPdf()}><Download />{" " + t("تنزيل PDF")}</Button></div></div>}
        {view === "tools" || !bytes ? <HomeWorkspace mode={view === "tools" ? "tools" : "home"} siteName={siteName} maxFileMB={settings.maxFileMB} entries={entries} busy={!!busy} icon={entryIcon} toolStyle={entryStyle} onChoose={chooseEntry} onOpen={openFilePicker} onFile={file=>void openFile(file)} onDemo={()=>void run(t("فتح مستند التجربة…"),async()=>{await loadDocument(await engine.makeDemo(),t("فاتورة-تجريبية.pdf"));})} onHelp={()=>setModal("help")}/> : <>
          <div className="editing-toolbar"><div className="editing-tools"><button className={tool === "select" ? "active" : ""} title={t("تحديد وتحريك")} aria-label={t("تحديد وتحريك")} onClick={() => setTool("select")}><MousePointer2 size={17}/></button>{settings.tools.edit && <><button className={tool === "replace" ? "active" : ""} onClick={() => { setTool("replace"); setActiveExtraId(null); setCategory("edit"); setSelected(null); }}><Type size={17}/><span>{t("تعديل نص")}</span></button><button className={tool === "text" ? "active" : ""} onClick={() => { setTool("text"); setActiveExtraId(null); setCategory("edit"); setSelected(null); }}><Plus size={16}/><span>{t("نص")}</span></button><button onClick={() => { imageRef.current?.click(); setActiveExtraId(null); setCategory("edit"); }}><ImageIcon size={17}/><span>{t("صورة")}</span></button><button className={tool === "highlight" ? "active" : ""} onClick={() => { setTool("highlight"); setActiveExtraId(null); setCategory("edit"); setSelected(null); }}><Highlighter size={17}/><span>{t("تظليل")}</span></button></>}{settings.tools.sign && <button onClick={() => { setActiveExtraId(null); setCategory("sign"); setModal("sign"); }}><PenLine size={17}/><span>{t("توقيع")}</span></button>}{settings.tools.redact && <button className={tool === "redact" ? "active" : ""} onClick={() => { setTool("redact"); setActiveExtraId(null); setCategory("redact"); setSelected(null); }}><Shield size={17}/><span>{t("حجب")}</span></button>}</div><button className="icon-button" title={t("ابحث في الصفحة")} aria-label={t("ابحث في الصفحة")} onClick={() => setShowSearch(v => !v)}><Search size={17}/></button></div>
          {showSearch && <div className="search-row"><Search size={16}/><Input autoFocus placeholder={t("ابحث في نص الصفحة الحالية…")} value={query} onChange={e => setQuery(e.target.value)}/><span>{query ? t("{0} نتيجة", { "0": found.length }) : ""}</span><button aria-label={t("إغلاق البحث")} className="icon-button" onClick={() => { setShowSearch(false); setQuery(""); }}><X size={16}/></button></div>}
          <div className="workspace-grid">
            <PageRail pages={pages} page={page} thumbnails={thumbnails} canArrange={settings.tools.pages} busy={!!busy} onSelect={jump} onMove={(from, to) => void movePage(from, to)} onRotate={index => void pageAction("rotate", index)} onDelete={index => void confirmChoice(t("حذف الصفحة {0}؟", { "0": index + 1 })).then(answer => { if (answer)
                void pageAction("delete", index); })} onAdd={settings.tools.merge ? () => mergeRef.current?.click() : undefined}/>

            <div className="canvas-area" ref={workspaceRef}><div className="canvas-scroll"><div className="paper" ref={paperRef} style={{ width: paperWidth, aspectRatio: `${pageInfo.width}/${pageInfo.height}`, cursor: tool === "select" || tool === "pages" ? "default" : tool === "replace" ? "text" : "crosshair" }} onPointerDown={paperDown} onPointerMove={paperMove} onPointerUp={paperUp} onPointerCancel={() => { gesture.current = null; setDraft(null); }}>
              {image && <img className="page-image" src={image} alt={t("الصفحة {0} من {1}", { "0": page + 1, "1": name })} draggable={false}/>}{rendering && <div className="page-loading"><LoaderCircle className="spin" size={28}/><span>{t("عرض الصفحة…")}</span></div>}
              {tool === "replace" && !rendering && lines.map((line, i) => <button key={i} className="text-hit" style={{ left: line.x * 100 + "%", top: line.y * 100 + "%", width: line.w * 100 + "%", height: line.h * 100 + "%" }} title={line.text} aria-label={t("تعديل") + " " + line.text} onPointerDown={e => e.stopPropagation()} onClick={() => chooseReplace(line)}/>)}
              {pageMarks.filter(m => m.kind === "replace" && m.source).map(m => <span key={"source" + m.id} className="replacement-cover" style={{ left: m.source!.x * 100 + "%", top: m.source!.y * 100 + "%", width: m.source!.w * 100 + "%", height: m.source!.h * 100 + "%" }}/>)}
              {found.map((line, i) => <span key={"search" + i} className="search-hit" style={{ left: line.x * 100 + "%", top: line.y * 100 + "%", width: line.w * 100 + "%", height: line.h * 100 + "%" }}/>)}
              {pageMarks.map(mark => <div key={mark.id} className={`mark mark-${mark.kind} ${mark.id === selected ? "selected" : ""}`} style={{ left: mark.x * 100 + "%", top: mark.y * 100 + "%", width: mark.w * 100 + "%", height: mark.h * 100 + "%", color: mark.color, fontSize: mark.size * paperWidth / pageInfo.width, background: mark.kind === "highlight" ? mark.color + "65" : undefined }} onPointerDown={e => startMove(e, mark)}>{mark.kind === "text" || mark.kind === "replace" ? <span dir="auto">{mark.text}</span> : mark.kind === "image" || mark.kind === "signature" ? <img src={mark.image} alt={mark.kind === "signature" ? t("توقيعك") : t("صورة مضافة")} draggable={false}/> : mark.kind === "field" ? <span className="field-preview">{mark.fieldKind === "checkbox" ? (mark.checked ? "☑" : "☐") : mark.text || mark.name}{mark.fieldKind === "dropdown" ? " ▾" : null}<FormInput size={12}/></span> : mark.kind === "redact" ? <span className="redact-preview"><Shield size={14}/>{" " + t("حجب")}</span> : null}{mark.id === selected && <span className="mark-handle"><GripVertical size={13}/></span>}</div>)}
              {draft && <div className={tool === "redact" ? "draw-box redaction" : "draw-box"} style={{ left: draft.x * 100 + "%", top: draft.y * 100 + "%", width: draft.w * 100 + "%", height: draft.h * 100 + "%" }}/>}
            </div></div><div className="canvas-controls"><Pagination dir={dir} className="page-control" aria-label={t("صفحات المستند")}><PaginationContent><PaginationItem><button disabled={page === 0} onClick={() => jump(page - 1)} aria-label={t("الصفحة السابقة")}><ChevronRight size={16}/></button></PaginationItem><PaginationItem><span>{page + 1} <i>/</i> {pages.length}</span></PaginationItem><PaginationItem><button disabled={page === pages.length - 1} onClick={() => jump(page + 1)} aria-label={t("الصفحة التالية")}><ChevronLeft size={16}/></button></PaginationItem></PaginationContent></Pagination><span className="control-divider"/><div className="zoom-control"><button onClick={() => setZoom(z => Math.max(.5, z - .1))} disabled={zoom <= .5} aria-label={t("تصغير")}><ZoomOut size={16}/></button><button className="zoom-label" title={t("ملاءمة الصفحة")} onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><button onClick={() => setZoom(z => Math.min(2, z + .1))} disabled={zoom >= 2} aria-label={t("تكبير")}><ZoomIn size={16}/></button></div></div></div>
            <aside className="inspector"><div className="inspector-heading"><Settings2 size={16}/><h2>{active ? t("خصائص العنصر") : t(toolNames[tool])}</h2>{active && <button className="icon-button" aria-label={t("إلغاء التحديد")} onClick={() => setSelected(null)}><X size={14}/></button>}</div><div className="inspector-content">
              {active ? <><span className="inspector-kicker">{t(toolNames[active.kind === "field" ? "field" : active.kind as Tool])}{" " + t("· الصفحة") + " "}{page + 1}</span>{(active.kind === "text" || active.kind === "replace") && <label className="form-label">{t("النص")}<Textarea rows={4} dir="auto" value={active.text || ""} onChange={e => updateMark({ text: e.target.value })}/></label>}{active.kind === "field" && <FieldProperties mark={active} onChange={updateMark}/>}{["text", "replace", "highlight"].includes(active.kind) && <label className="form-label">{t("اللون")}<div className="editor-color-row"><input type="color" aria-label={t("لون العنصر")} value={active.color} onChange={e => updateMark({ color: e.target.value })}/><code>{active.color}</code></div></label>}{["text", "replace"].includes(active.kind) && <label className="form-label">{t("حجم الخط")}<Input type="number" min={6} max={72} value={active.size} onChange={e => updateMark({ size: Math.max(6, Math.min(72, Number(e.target.value))) })}/></label>}
                <div className="dimension-row"><label className="form-label">{t("العرض %")}<Input type="number" min={1} max={100} value={Math.round(active.w * 100)} onChange={e => updateMark({ w: Math.min(1 - active.x, Math.max(.01, Number(e.target.value) / 100)) })}/></label><label className="form-label">{t("الارتفاع %")}<Input type="number" min={1} max={100} value={Math.round(active.h * 100)} onChange={e => updateMark({ h: Math.min(1 - active.y, Math.max(.01, Number(e.target.value) / 100)) })}/></label></div>
                <p className="inspector-hint">{t("اسحب العنصر على الصفحة لتغيير موضعه.")}</p>{active.kind === "redact" && <div className="small-warning">{t("المحتوى المحدد يُزال عند تنزيل PDF، بما فيه النص وأجزاء الصور. راجع النسخة الناتجة قبل مشاركتها.")}</div>}{active.kind === "signature" && <p className="inspector-hint">{t("توقيع مرئي بخط اليد؛ لا يتضمن شهادة رقمية.")}</p>}<Button variant="outline" className="delete-mark" onClick={() => { setMarks(ms => ms.filter(m => m.id !== active.id)); setSelected(null); setDirty(true); }}><Trash2 />{" " + t("حذف العنصر")}</Button>
              </> : tool === "pages" ? <><p className="inspector-hint">{t("اسحب مصغّر الصفحة إلى موضعه الجديد، أو استخدم الأزرار. يمكنك التراجع قبل تنزيل النسخة.")}</p><div className="page-action-grid"><Button variant="outline" disabled={page === 0 || !!busy} onClick={() => void pageAction("up")}><ArrowUp />{" " + t("للأعلى")}</Button><Button variant="outline" disabled={page === pages.length - 1 || !!busy} onClick={() => void pageAction("down")}><ArrowDown />{" " + t("للأسفل")}</Button><Button variant="outline" disabled={!!busy} onClick={() => void pageAction("rotate")}><RotateCw />{" " + t("تدوير")}</Button><Button variant="outline" disabled={pages.length === 1 || !!busy} onClick={() => void confirmChoice(t("حذف الصفحة {0}؟", { "0": page + 1 })).then(answer => { if (answer)
                    void pageAction("delete"); })}><Trash2 />{" " + t("حذف")}</Button></div><Button className="brand-button full-width" onClick={() => { setRange(String(page + 1)); setModal("extract"); }}><Files />{" " + t("استخراج / تقسيم")}</Button></> : category === "forms" ? <><p className="inspector-hint">{t("اختر نوع الخانة، ثم اسحب مكانها على الصفحة.")}</p><FieldKindSelect value={fieldKind} onChange={setFieldKind}/><Button variant="outline" className="full-width" onClick={() => { setSelected(null); setTool("field"); }}>{t("إضافة خانة جديدة")}</Button>{fields.length > 0 && <div className="existing-fields"><h3>{t("الخانات الموجودة (")}{fields.length})</h3>{fields.map((field, i) => <label className="form-label" key={i}>{field.name}{field.required ? " *" : ""}<small>{t("الصفحة") + " "}{field.page + 1}</small>{field.kind === "checkbox" ? <Checkbox checked={values[field.name] !== "Off" && values[field.name] !== ""} onCheckedChange={checked => setValues(v => ({ ...v, [field.name]: checked === true ? "Yes" : "Off" }))} aria-label={field.name}/> : field.kind === "choice" ? <select value={values[field.name]} onChange={e => setValues(v => ({ ...v, [field.name]: e.target.value }))}>{field.options.map(option => <option key={option}>{option}</option>)}</select> : <Input dir="auto" value={values[field.name] || ""} onChange={e => setValues(v => ({ ...v, [field.name]: e.target.value }))}/>}</label>)}<Button className="brand-button full-width" disabled={!!busy} onClick={() => void run(t("تعبئة الخانات…"), async () => { const output = await engine.fillFields(await applied(), values); await changeBytes(output); setFields(await engine.readFields(output)); setStatus({ text: t("تمت تعبئة الخانات. نزّل الملف لحفظه.") }); })}><Check />{" " + t("تطبيق القيم")}</Button></div>}{!fields.length && <div className="quiet-box"><FormInput size={25}/><span>{t("لا توجد خانات جاهزة.")}<br />{t("تقدر تضيف خاناتك بنفسك.")}</span></div>}</> : <><div className="tool-instruction-icon">{tool === "redact" ? <Shield size={28}/> : tool === "replace" ? <Type size={28}/> : tool === "text" ? <Type size={28}/> : tool === "highlight" ? <Highlighter size={28}/> : <MousePointer2 size={28}/>}</div><h3>{tool === "replace" ? t("اضغط على النص") : tool === "select" ? t("مساحة جاهزة لك") : t("ارسم مكان العنصر")}</h3><p className="inspector-hint">{tool === "replace" ? t("اختر سطراً من النص داخل الصفحة، ثم اكتب البديل هنا. المحتوى القديم يُزال عند التنزيل.") : tool === "select" ? t("اختر أداة من الشريط العلوي، أو حدّد عنصراً أضفته لتعديل خصائصه.") : tool === "redact" ? t("اسحب فوق البيانات الحساسة لتحديد المنطقة المطلوب حذف محتواها.") : tool === "highlight" ? t("اسحب مستطيلاً فوق النص الذي تريد تظليله.") : t("اسحب على الصفحة لتحديد مساحة النص، ثم اكتب محتواه.")}</p>{tool === "replace" && !lines.length && !rendering && <div className="small-warning">{t("لا يوجد نص قابل للتعديل في هذه الصفحة. قد تكون صورة ممسوحة ضوئياً. يمكنك إضافة نص جديد.")}</div>}{tool === "redact" && <div className="small-warning">{t("قد تُحذف أيضاً رسومات تتقاطع مع التحديد. الحجب يطبّق في النسخة المنزّلة.")}</div>}<div className="inspector-tip"><Sparkles size={15}/><p>{t("التعديلات تبقى في هذه الجلسة.")}<br />{t("نزّل نسختك قبل إغلاق الصفحة.")}</p></div></>}
            </div><div className="inspector-bottom"><LockKeyhole size={12}/>{" " + t("معالجة محلية")}</div></aside>
          </div>
          <footer className="workspace-footer"><span><span className="tiny-dot"/> {busy ? localizeMessage(busy) : t("المستند على جهازك")}</span><span>{marks.length ? t("{0} إضافات قيد التطبيق", { "0": marks.length }) : "PDF"} <i /> {t(toolNames[tool])}</span></footer>
        </>}
      </main>
    </SidebarProvider>}
    <Toaster theme="light" dir={dir} position="bottom-center" richColors closeButton/>

    <Dialog open={shareOpen} onOpenChange={setShareOpen}><DialogContent className="editor-dialog share-dialog" dir={dir} style={appearance}><DialogTitle>{t("PDF إلى رابط")}</DialogTitle><DialogDescription>{t("رفع نسخة وإنشاء رابط لعرض الملف وتنزيله")}</DialogDescription><SharePanel currentName={name} enabled={settings.tools.share && !settings.maintenance} getCurrentFile={bytes ? async () => new File([Uint8Array.from(await applied()).buffer], name || "document.pdf", {type:"application/pdf"}) : undefined}/></DialogContent></Dialog>
    {markdownOpen && bytes && <MarkdownDialog settings={settings} name={name} pageCount={pages.length} getBytes={applied} onBusy={setBusy} onClose={() => setMarkdownOpen(false)}/>}

    {localTool && <LocalToolsDialog key={localTool} tool={localTool} label={activeExtraId && extraTool ? (uiLanguage === "en" ? extraTool.nameEn || t(extraTool.name) : extraTool.name) : undefined} settings={settings} name={name} page={page} pages={pages} preview={image} getBytes={applied} onBusy={setBusy} onClose={() => setLocalTool(null)} onApply={async (data) => { await changeBytes(data); setTool("select"); setStatus({ text: t("تم قص الصفحات. نزّل PDF لحفظ النسخة المعدّلة.") }); }} onCreate={async (template) => { if (dirty && !await confirmChoice(t("لديك تعديلات لم تُنزّل. فتح القالب بدلاً من المستند الحالي؟")))
        throw new Error(t("تم إلغاء فتح القالب.")); pendingCategory.current = null; pendingExtra.current = null; await loadDocument(template.bytes, template.title + ".pdf"); setMarks(template.marks); setDirty(true); setCategory("edit"); setActiveExtraId(null); setTool("select"); setStatus({ text: t("القالب جاهز. حدّد النص لتعديله واسحبه لتغيير مكانه.") }); }}/>}

    {busy && <div className="busy-indicator" role="status"><LoaderCircle className="spin" size={18}/><span>{localizeMessage(busy)}</span>{progress > 0 && <Progress className="operation-progress" value={progress * 100}/>}</div>}
    <AlertDialog open={!!confirmationText} onOpenChange={open => { if (!open)
        finishConfirmation(false); }}><AlertDialogContent dir={dir} className="editor-dialog" style={appearance}><AlertDialogTitle>{t("تأكيد الإجراء")}</AlertDialogTitle><AlertDialogDescription>{localizeMessage(confirmationText)}</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel onClick={() => finishConfirmation(false)}>{t("إلغاء")}</AlertDialogCancel><AlertDialogAction className="brand-button" onClick={() => finishConfirmation(true)}>{t("متابعة")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <Dialog open={modal !== null} onOpenChange={open => { if (!open && !busy) {
        setModal(null);
        signatureDrawing.current = false;
        hasSignature.current = false;
        setPendingFile(null);
    } }}><DialogContent className="editor-dialog" dir={dir} style={appearance}><DialogTitle>{modal === "sign" ? t("توقيعك، بخط يدك") : modal === "convert" ? t("تحويل الملفات") : modal === "compress" ? t("ملف أخف، مشاركة أسهل") : modal === "extract" ? t("استخرج الصفحات التي تحتاجها") : modal === "password" ? t("هذا المستند محمي") : (modal === "numberPages" || modal === "watermark" || modal === "blankPage") ? extraTitle || t("أداة إضافية") : t("مساحة مستند")}</DialogTitle><DialogDescription>{modal === "sign" ? t("ارسم توقيعك، ثم ضعه في المكان المناسب داخل الصفحة.") : modal === "convert" ? t("كل التحويلات تتم على جهازك داخل المتصفح.") : modal === "compress" ? t("اختر طريقة الضغط المناسبة لمستندك.") : modal === "extract" ? t("تُحفظ نسخة جديدة، ويظل مستندك الحالي مفتوحاً.") : modal === "password" ? t("أدخل كلمة مرور المستند لفتحه محلياً.") : modal === "numberPages" ? t("أضف أرقاماً إلى جميع الصفحات مع اختيار المكان واللون.") : modal === "watermark" ? t("تُضاف علامة نصية مائلة إلى جميع الصفحات دون تحويلها إلى صور.") : modal === "blankPage" ? t("أضف صفحة فارغة بمقاس الصفحة المجاورة.") : t("محرر PDF محلي للتعديل والتحويل والتنظيم.")}</DialogDescription>
      {modal === "sign" && <><canvas className="signature-canvas" ref={signatureRef} width={800} height={300} onPointerDown={signDown} onPointerMove={signMove} onPointerUp={() => { signatureDrawing.current = false; }} onPointerCancel={() => { signatureDrawing.current = false; }}/><div className="signature-actions"><button className="text-link" onClick={() => { const c = signatureRef.current; c?.getContext("2d")?.clearRect(0, 0, c.width, c.height); hasSignature.current = false; }}>{t("مسح التوقيع")}</button><label className="signature-color">{t("لون التوقيع") + " "}<input type="color" aria-label={t("لون التوقيع")} value={color} onChange={e => setColor(e.target.value)}/></label></div><p className="dialog-note">{t("توقيع مرئي دون شهادة توقيع رقمية.")}</p><Button className="brand-button" onClick={() => { if (!hasSignature.current) {
        setStatus({ text: t("ارسم توقيعك أولاً."), error: true });
        return;
    } addMark({ kind: "signature", image: signatureRef.current!.toDataURL("image/png"), x: .5, y: .7, w: .35, h: .35 * (300 / 800) * (pageInfo.width / pageInfo.height) }); setTool("select"); setModal(null); hasSignature.current = false; }}><PenLine />{" " + t("إضافة التوقيع")}</Button></>}
      {modal === "convert" && <><div className="conversion-options"><button disabled={!bytes || !!busy} onClick={() => void convert("word")}><span className="format-tag word">W</span><div><strong>{t("PDF إلى Word")}</strong><small>{t("استخراج النص إلى ملف DOCX")}</small></div><ChevronLeft size={18}/></button><button disabled={!bytes || !!busy} onClick={() => void convert("images")}><span className="format-tag"><ImageIcon size={23}/></span><div><strong>{t("PDF إلى صور")}</strong><small>{t("صور PNG داخل ملف ZIP")}</small></div><ChevronLeft size={18}/></button><button disabled={!!busy} onClick={() => imagesPdfRef.current?.click()}><span className="format-tag"><FileText size={23}/></span><div><strong>{t("صور إلى PDF")}</strong><small>{t("اجمع صورك في مستند واحد")}</small></div><ChevronLeft size={18}/></button></div>{!bytes && <Button variant="outline" onClick={() => { setModal(null); openFilePicker(); }}><Upload />{" " + t("افتح PDF للتحويل")}</Button>}<p className="dialog-note">{t("تحويل Word يدعم ملفات PDF النصية. لا يحافظ بالضرورة على تخطيط الجداول والصور، للصفحات المصوّرة استخدم «استخراج نص الصور» ثم نزّل Word.")}</p></>}
      {modal === "compress" && <><RadioGroup className="compress-options" value={compression} onValueChange={setCompression}>{[{ id: "lossless", title: t("الحفاظ على المحتوى"), detail: t("تنظيف الملف وضغط البيانات دون تحويل الصفحات إلى صور") }, { id: "balanced", title: t("ضغط متوازن"), detail: t("تحويل الصفحات إلى صور بجودة مناسبة للمشاركة") }, { id: "strong", title: t("أصغر حجم"), detail: t("صور بدقة وجودة أقل") }].map(option => <label className={compression === option.id ? "compress-option selected" : "compress-option"} key={option.id}><RadioGroupItem value={option.id} aria-label={option.title}/><span><strong>{option.title}</strong><small>{option.detail}</small></span></label>)}</RadioGroup>{compression !== "lossless" && <label className="flatten-check"><Checkbox checked={flattenAccepted} onCheckedChange={v => setFlattenAccepted(v === true)} aria-label={t("أوافق على تحويل الصفحات إلى صور")}/><span>{t("أوافق على تحويل الصفحات إلى صور. سيُفقد البحث النصي والخانات التفاعلية والشهادات الرقمية إن وجدت.")}</span></label>}<Button className="brand-button" disabled={!!busy || (compression !== "lossless" && !flattenAccepted)} onClick={() => void compress()}><Minimize2 />{" " + t("ضغط وتنزيل")}</Button></>}
      {modal === "extract" && <><label className="form-label">{t("الصفحات")}<Input dir="ltr" value={range} onChange={e => setRange(e.target.value)} placeholder="1-3, 5"/><small>{t("مثال: 1-3, 5 · مستندك يحتوي") + " "}{pages.length}{" " + t("صفحة")}</small></label><Button className="brand-button" disabled={!!busy} onClick={() => void run(t("استخراج الصفحات…"), async () => { const data = await applied(); const output = await engine.reorder(data, engine.parseRange(range, pages.length)); engine.download(output, base + t("-صفحات.pdf")); setModal(null); setStatus({ text: t("تم استخراج الصفحات وتنزيل النسخة الجديدة.") }); })}><Download />{" " + t("تنزيل الصفحات المحددة")}</Button><Button variant="outline" disabled={!!busy} onClick={() => void run(t("تقسيم المستند…"), async () => { const { zipSync } = await import("fflate"); const data = await applied(); const files: Record<string, Bytes> = {}; for (let i = 0; i < pages.length; i++) {
        files[`page-${i + 1}.pdf`] = await engine.reorder(data, [i]);
        setProgress((i + 1) / pages.length);
        await nextFrame();
    } engine.download(zipSync(files, { level: 0 }), base + t("-مقسّم.zip"), "application/zip"); setModal(null); })}>{t("كل صفحة في PDF منفصل (ZIP)")}</Button></>}
      {modal === "password" && <form onSubmit={e => { e.preventDefault(); void run(t("فتح المستند المحمي…"), async () => { if (!pendingFile)
        return; try {
        const output = await engine.unlock(pendingFile.bytes, password);
        setModal(null);
        await loadDocument(output, pendingFile.name);
        setPendingFile(null);
        setPassword("");
    }
    catch (e) {
        if (e instanceof Error && localizeMessage(e.message) === "PASSWORD")
            throw new Error(t("كلمة المرور غير صحيحة."));
        throw e;
    } }); }}><label className="form-label">{t("كلمة المرور")}<Input autoFocus type="password" dir="ltr" value={password} onChange={e => setPassword(e.target.value)}/></label><Button className="brand-button full-width" type="submit" disabled={!!busy || !password}>{t("فتح المستند")}</Button><p className="dialog-note">{t("النسخة المعدّلة تُنزّل دون كلمة المرور الأصلية.")}</p></form>}
      {modal === "numberPages" && <><div className="dimension-row"><label className="form-label">{t("البدء من رقم")}<Input type="number" min={1} max={99999} value={numberStart} onChange={e => setNumberStart(Number(e.target.value))}/></label><label className="form-label">{t("حجم الخط")}<Input type="number" min={6} max={30} value={extraSize} onChange={e => setExtraSize(Number(e.target.value))}/></label></div><label className="form-label">{t("مكان الرقم")}<Select dir={dir} value={numberPosition} onValueChange={value => setNumberPosition(value as engine.NumberPosition)}><SelectTrigger className="full-width"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bottomCenter">{t("أسفل الصفحة — الوسط")}</SelectItem><SelectItem value="bottomRight">{t("أسفل الصفحة — اليمين")}</SelectItem><SelectItem value="bottomLeft">{t("أسفل الصفحة — اليسار")}</SelectItem><SelectItem value="topCenter">{t("أعلى الصفحة — الوسط")}</SelectItem></SelectContent></Select></label><ColorControl label={t("لون الأرقام")} value={extraColor} onChange={setExtraColor}/><p className="dialog-note">{t("يُضاف الترقيم إلى") + " "}{pages.length}{" " + t("صفحة. أي أرقام موجودة مسبقاً تبقى في مكانها.")}</p><Button className="brand-button" disabled={!!busy} onClick={extraAction}><Check />{" " + t("تطبيق الترقيم")}</Button></>}
      {modal === "watermark" && <><label className="form-label">{t("نص العلامة المائية")}<Input dir="auto" value={watermarkText} maxLength={120} onChange={e => setWatermarkText(e.target.value)}/></label><div className="dimension-row"><label className="form-label">{t("حجم الخط")}<Input type="number" min={10} max={100} value={extraSize} onChange={e => setExtraSize(Number(e.target.value))}/></label><label className="form-label">{t("وضوح العلامة %")}<Input type="number" min={5} max={60} value={watermarkOpacity} onChange={e => setWatermarkOpacity(Number(e.target.value))}/></label></div><ColorControl label={t("لون العلامة")} value={extraColor} onChange={setExtraColor}/><p className="dialog-note">{t("نسبة أقل تعني علامة أخف. تُطبّق على جميع الصفحات.")}</p><Button className="brand-button" disabled={!!busy || !watermarkText.trim()} onClick={extraAction}><Check />{" " + t("إضافة العلامة المائية")}</Button></>}
      {modal === "blankPage" && <><label className="form-label">{t("موضع الصفحة الجديدة")}<Select dir={dir} value={blankPosition} onValueChange={setBlankPosition}><SelectTrigger className="full-width"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="before">{t("قبل الصفحة الحالية (")}{page + 1})</SelectItem><SelectItem value="after">{t("بعد الصفحة الحالية (")}{page + 1})</SelectItem><SelectItem value="end">{t("في نهاية المستند")}</SelectItem></SelectContent></Select></label><p className="dialog-note">{t("مستندك يحتوي") + " "}{pages.length}{" " + t("صفحة، والحد الحالي 250 صفحة.")}</p><Button className="brand-button" disabled={!!busy || pages.length >= 250} onClick={extraAction}><Plus />{" " + t("إضافة صفحة فارغة")}</Button></>}
      {modal === "help" && <div className="help-content"><div><strong>{t("01 · افتح المستند")}</strong><p>{t("اختر PDF من جهازك، أو جرّب الفاتورة التجريبية.")}</p></div><div><strong>{t("02 · اختر أداتك")}</strong><p>{t("أضف النصوص والصور، وقّع، احجب البيانات، أو رتّب الصفحات.")}</p></div><div><strong>{t("03 · نزّل نسختك")}</strong><p>{t("التعديلات في الذاكرة أثناء الجلسة. تنزيل PDF يحفظ النسخة المعدّلة على جهازك.")}</p></div><div className="help-limit"><strong>{t("عن هذه النسخة")}</strong><p>{t("تعديل النص يتم على مستوى السطر، وإعادة التدفق تلقائياً على كامل المستند غير مدعومة. النماذج المدعومة AcroForm؛ تتوفر قراءة الصور بالعربية والإنجليزية. نماذج XFA والتوقيعات بشهادة رقمية غير مدعومة.")}</p></div><a className="text-link" href="/source.zip">{t("تنزيل المصدر · AGPL-3.0") + " "}<ArrowUpRight size={15}/></a></div>}
    </DialogContent></Dialog>
  </div>;
}

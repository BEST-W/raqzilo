import { z } from "zod";
import { brand } from "./brand";
export const toolKeys = ["edit", "sign", "redact", "pages", "merge", "markdown", "convert", "compress", "forms", "crop", "protect", "compare", "ocr", "templates", "share"] as const;
export type ToolKey = typeof toolKeys[number];
export const toolLabels: Record<ToolKey, { name: string; description: string }> = {
  edit: { name: "تعديل المستند", description: "النصوص والصور والتظليل" },
  sign: { name: "التوقيع", description: "رسم توقيع وإضافته للمستند" },
  redact: { name: "حجب البيانات", description: "إزالة محتوى المنطقة المحددة" },
  pages: { name: "تنظيم الصفحات", description: "ترتيب وتدوير وحذف واستخراج" },
  merge: { name: "دمج الملفات", description: "جمع ملفات PDF في مستند واحد" },
  convert: { name: "تحويل الملفات", description: "Word والصور وPDF" },
  markdown: { name: "PDF إلى Markdown", description: "نص منظم في ملف MD للذكاء الاصطناعي" },
  compress: { name: "ضغط PDF", description: "تقليل الحجم داخل المتصفح" },
  forms: { name: "خانات النماذج", description: "نصوص ومربعات اختيار وقوائم منسدلة" },
  crop: { name: "قص الصفحات", description: "اختيار الإطار وتقليل الهوامش" },
  protect: { name: "حماية PDF", description: "تنزيل نسخة مشفّرة بكلمة مرور" },
  compare: { name: "مقارنة مستندين", description: "مقارنة النص والمظهر صفحة بصفحة" },
  ocr: { name: "استخراج نص الصور", description: "قراءة العربية والإنجليزية محلياً باستخدام OCR" },
  templates: { name: "قوالب المستندات", description: "إنشاء فاتورة أو خطاب أو نموذج قابل للتعديل" },
  share: { name: "PDF إلى رابط", description: "رفع نسخة وإنشاء رابط لعرض الملف وتنزيله" },
};
export const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const defaultTheme = { background:"#f7f8fc", surface:"#ffffff", sidebar:"#141c30", canvas:"#e9edf5", text:"#17233c" };
export const extraActions = ["numberPages","watermark","blankPage","openLink","crop","protect","compare","ocr","templates"] as const;
export const extraActionLabels = {
  numberPages:{name:"ترقيم الصفحات",description:"إضافة أرقام أعلى أو أسفل صفحات PDF"},
  watermark:{name:"علامة مائية",description:"إضافة نص شفاف إلى جميع الصفحات"},
  blankPage:{name:"صفحة فارغة",description:"إدراج صفحة جديدة داخل المستند"},
  openLink:{name:"فتح رابط",description:"فتح موقع أو خدمة تختارها"},
  crop:toolLabels.crop, protect:toolLabels.protect, compare:toolLabels.compare, ocr:toolLabels.ocr, templates:toolLabels.templates,
};
export const customToolSchema = z.object({
  id:z.string().regex(/^custom_[A-Za-z0-9_-]{6,64}$/),
  name:z.string().trim().min(2).max(40), description:z.string().trim().max(140),
  nameEn:z.string().trim().max(40).default(""), descriptionEn:z.string().trim().max(140).default(""),
  action:z.enum(extraActions), enabled:z.boolean(),
  icon:z.enum(["file","stamp","hash","plus","link","sparkles","shield","image"]),
  color:colorSchema, url:z.string().trim().max(2000).default(""),
  defaultText:z.string().trim().max(120).default(""),
}).strict().superRefine((tool,ctx)=>{
  if(tool.action==="openLink"){
    try{const url=new URL(tool.url);if(url.protocol!=="https:"||url.username||url.password)throw new Error();}
    catch{ctx.addIssue({code:z.ZodIssueCode.custom,path:["url"],message:"أدخل رابطاً كاملاً يبدأ بـ https://"});}
  }
});
export type CustomTool = z.infer<typeof customToolSchema>;
export const settingsSchema = z.object({
  name: z.string().trim().min(2).max(40), tagline: z.string().trim().max(100),
  nameEn:z.string().trim().max(40).default(""), taglineEn:z.string().trim().max(100).default(""),
  accent: colorSchema, announcement: z.string().trim().max(240),
  announcementEn:z.string().trim().max(240).default(""),
  maxFileMB: z.number().int().min(5).max(100), maintenance: z.boolean(),
  tools: z.object(Object.fromEntries(toolKeys.map(k => [k, z.boolean().default(true)])) as Record<ToolKey, z.ZodDefault<z.ZodBoolean>>),
  theme:z.object({
    background:colorSchema, surface:colorSchema, sidebar:colorSchema, canvas:colorSchema, text:colorSchema,
  }).strict().default(defaultTheme),
  customTools:z.array(customToolSchema).max(24).default([]),
  toolOrder:z.array(z.string().max(80)).max(48).default([...toolKeys]),
}).strict().superRefine((settings,ctx)=>{
  const ids=settings.customTools.map(t=>t.id);
  if(new Set(ids).size!==ids.length)ctx.addIssue({code:z.ZodIssueCode.custom,path:["customTools"],message:"كل أداة تحتاج معرّفاً مختلفاً."});
  const allowed=new Set<string>([...toolKeys,...ids]);
  if(new Set(settings.toolOrder).size!==settings.toolOrder.length||settings.toolOrder.some(id=>!allowed.has(id)))ctx.addIssue({code:z.ZodIssueCode.custom,path:["toolOrder"],message:"ترتيب الأدوات غير صالح."});
});
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = {
  name: brand.name, nameEn:brand.nameEn, tagline: "مساحتك للعمل على PDF", taglineEn:"Your private PDF workspace", accent: "#4f46e5", announcement: "", announcementEn:"", maxFileMB: 50,
  maintenance: false, tools: { edit: true, sign: true, redact: true, pages: true, merge: true, markdown:true, convert: true, compress: true, forms: true, crop:true, protect:true, compare:true, ocr:true, templates:true, share:true },
  theme:defaultTheme,customTools:[],toolOrder:[...toolKeys],
};
export type ToolEntry =
  | {kind:"builtin";id:ToolKey;key:ToolKey;name:string;description:string;enabled:boolean}
  | {kind:"custom";id:string;tool:CustomTool;name:string;description:string;enabled:boolean};
export function getToolEntries(settings:Settings):ToolEntry[]{
  const entries:ToolEntry[]=[
    ...toolKeys.map(key=>({kind:"builtin" as const,id:key,key,...toolLabels[key],enabled:settings.tools[key]})),
    ...settings.customTools.map(tool=>({kind:"custom" as const,id:tool.id,tool,name:tool.name,description:tool.description,enabled:tool.enabled})),
  ];
  const order=[...settings.toolOrder,...entries.map(e=>e.id)];
  const unique=[...new Set(order)];
  return unique.flatMap(id=>{const entry=entries.find(e=>e.id===id);return entry?[entry]:[];});
}
export function moveTool(order:string[],id:string,target:string):string[]{
  if(id===target||!order.includes(id)||!order.includes(target))return order;
  const next=order.filter(value=>value!==id);next.splice(order.indexOf(target),0,id);return next;
}
export function readableForeground(hex:string):string{
  const rgb=[1,3,5].map(index=>parseInt(hex.slice(index,index+2),16)/255).map(value=>value<=.04045?value/12.92:Math.pow((value+.055)/1.055,2.4));
  const luminance=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
  return (luminance+.05)/.05>=1.05/(luminance+.05)?"#17202a":"#ffffff";
}
export function appearanceVariables(settings:Settings):Record<string,string>{
  return {"--brand":settings.accent,"--brand-foreground":readableForeground(settings.accent),
    "--site-background":settings.theme.background,"--site-surface":settings.theme.surface,
    "--site-sidebar":settings.theme.sidebar,"--site-canvas":settings.theme.canvas,"--site-text":settings.theme.text,
    "--sidebar-ink":readableForeground(settings.theme.sidebar)};
}

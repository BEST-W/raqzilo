"use client";
import type {CSSProperties,ReactNode} from "react";
import {Download,ExternalLink,FileText,Link as LinkIcon} from "lucide-react";
import {type Settings,appearanceVariables} from "@/lib/settings-model";
import type {SharedFile} from "@/lib/sharing-model";
import {useLanguage} from "./language-provider";
import LanguageSwitcher from "./language-switcher";
import SharePanel from "./share-panel";
function Shell({settings,children}:{settings:Settings;children:ReactNode}){
  const {t,dir,language}=useLanguage();const name=language==="en"?settings.nameEn||t(settings.name):settings.name;
  return <div className="editor-app sharing-page" dir={dir} style={appearanceVariables(settings) as CSSProperties}><header className="app-header"><a href="/" className="brand"><span className="brand-icon"><FileText size={22}/></span><strong>{name}</strong></a><div className="header-end"><LanguageSwitcher/><a className="header-link" href="/">{t("جميع الأدوات")}</a></div></header><main className="share-page-content">{children}</main></div>;
}
export function SharePage({settings}:{settings:Settings}){return <Shell settings={settings}><SharePanel enabled={settings.tools.share&&!settings.maintenance}/></Shell>;}
export function SharedLinkPage({settings,file}:{settings:Settings;file:SharedFile}){
  const {t}=useLanguage();const source="/api/shares/"+file.id+"/file";
  return <Shell settings={settings}><div className="shared-link-heading"><span className="section-kicker"><LinkIcon size={15}/>{t("مستند مشترك")}</span><h1 dir="auto">{file.filename}</h1><p>{t("هذا الملف متاح لكل من لديه الرابط. يمكنك عرضه أو تنزيل نسخة منه.")}</p><div className="share-actions"><a className="share-button" href={source+"?download=1"}><Download size={17}/>{t("تنزيل PDF")}</a><a className="text-link" href={source} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>{t("فتح PDF في تبويب جديد")}</a></div></div><iframe className="shared-pdf-frame" title={t("عرض PDF المشترك")} src={source}/><p className="share-small">{t("إذا لم يظهر الملف في المتصفح، استخدم زر التنزيل أو افتحه في تبويب جديد.")}</p></Shell>;
}
export function MissingShare({unavailable=false}:{unavailable?:boolean}){const {t,dir}=useLanguage();return <main className="share-missing" dir={dir}><LanguageSwitcher/><FileText size={40}/><h1>{t(unavailable?"مشاركة الملفات غير متاحة الآن. حاول لاحقاً.":"هذا الرابط غير متاح أو تم حذف الملف.")}</h1><a href="/">{t("العودة إلى أدوات PDF")}</a></main>;}

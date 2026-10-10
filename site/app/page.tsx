import Editor from "@/components/pdf-editor";
import { readSettings, ownerStatus } from "@/lib/settings-server";
import {cookies,headers} from "next/headers";
import {isPublicHost,publicOrigin} from "@/lib/search-config";
import {languageCookie,translate} from "@/lib/translations";
import { requestLanguage } from "@/lib/language-preference";
export const dynamic = "force-dynamic";
export async function generateMetadata(){
  const {settings}=await readSettings();
  const [cookieJar, requestHeaders] = await Promise.all([cookies(), headers()]);
  const language=requestLanguage(cookieJar.get(languageCookie)?.value,requestHeaders.get("accept-language"));
  const name=language==="en"?settings.nameEn||translate(language,settings.name):settings.name;
  const title=name+" · "+translate(language,"أدوات PDF مجانية في متصفحك");
  const description=translate(language,"عدّل النصوص والصور، رتّب الصفحات، ووقّع ملفاتك محلياً. شارك نسخة عبر رابط عندما تختار ذلك.");
  const index=isPublicHost(requestHeaders.get("host"));
  return {title,description,robots:{index,follow:index},...(index?{alternates:{canonical:publicOrigin+"/"}}:{}),openGraph:{title,description,type:"website",...(index?{url:publicOrigin+"/"}:{})}};
}
export default async function Home() {
  const [{ settings }, owner] = await Promise.all([readSettings(), ownerStatus()]);
  return <Editor settings={settings} isOwner={owner.allowed} />;
}

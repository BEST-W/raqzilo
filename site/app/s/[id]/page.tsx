import {MissingShare,SharedLinkPage} from "@/components/share-pages";
import {readSettings} from "@/lib/settings-server";
import {getSharedFile,ShareError} from "@/lib/sharing-server";
import {notFound} from "next/navigation";
export const dynamic="force-dynamic";
export const metadata={title:"مستند مشترك · Shared PDF",robots:{index:false,follow:false},referrer:"no-referrer"};
export default async function Page({params}:{params:Promise<{id:string}>}){
  try{const [{settings},file]=await Promise.all([readSettings(),getSharedFile((await params).id)]);return <SharedLinkPage settings={settings} file={file}/>;}
  catch(error){if(error instanceof ShareError&&error.status===404)notFound();return <MissingShare unavailable/>;}
}

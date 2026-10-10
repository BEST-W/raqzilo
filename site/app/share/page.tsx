import {SharePage} from "@/components/share-pages";
import {readSettings} from "@/lib/settings-server";
export const dynamic="force-dynamic";
export const metadata={title:"PDF إلى رابط · PDF sharing",robots:{index:false,follow:false}};
export default async function Page(){const {settings}=await readSettings();return <SharePage settings={settings}/>;}

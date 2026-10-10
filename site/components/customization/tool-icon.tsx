import {FileText,Stamp,Hash,PlusSquare,ExternalLink,Sparkles,Shield,Image as ImageIcon} from "lucide-react";
import type {CustomTool} from "@/lib/settings-model";
const icons={file:FileText,stamp:Stamp,hash:Hash,plus:PlusSquare,link:ExternalLink,sparkles:Sparkles,shield:Shield,image:ImageIcon};
export const iconLabels={file:"مستند",stamp:"ختم",hash:"أرقام",plus:"إضافة",link:"رابط",sparkles:"نجمة",shield:"حماية",image:"صورة"};
export default function CustomToolIcon({icon,size=20}:{icon:CustomTool["icon"];size?:number}){const Icon=icons[icon];return <Icon size={size}/>;}

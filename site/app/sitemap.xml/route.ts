import {publicOrigin,isPublicHost} from "@/lib/search-config";
export function GET(request: Request) {
  if(!isPublicHost(request.headers.get("host"))) return new Response("Not found",{status:404,headers:{"X-Robots-Tag":"noindex","Cache-Control":"no-store"}});
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${publicOrigin}/</loc></url></urlset>`,{headers:{"Content-Type":"application/xml; charset=utf-8","Cache-Control":"no-store"}});
}

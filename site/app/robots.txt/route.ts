import {robotsText} from "@/lib/search-config";
export function GET(request: Request) {
  return new Response(robotsText(request.headers.get("host")), {headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}});
}

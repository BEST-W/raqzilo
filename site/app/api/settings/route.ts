import { readSettings, writeSettings, ownerStatus } from "@/lib/settings-server";
import { settingsSchema } from "@/lib/settings-model";
import { z } from "zod";
export const dynamic = "force-dynamic";
const noCache = { "Cache-Control": "no-store" };
export async function GET() {
  try { return Response.json(await readSettings(), { headers: noCache }); }
  catch { return Response.json({error:"تعذر قراءة إعدادات الموقع."}, {status:503, headers:noCache}); }
}
export async function PUT(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return Response.json({error:"طلب غير مسموح."}, {status:403});
  try {
    const owner = await ownerStatus();
    if (!owner.allowed) return Response.json({error:"هذه الإعدادات خاصة بمالك الموقع."}, {status:403});
    if (Number(request.headers.get("content-length") || 0) > 131072) return Response.json({error:"الطلب كبير جداً."}, {status:413});
    const raw = await request.text();
    if (raw.length > 131072) return Response.json({error:"الطلب كبير جداً."}, {status:413});
    const parsed = z.object({settings:settingsSchema, revision:z.number().int().min(0)}).strict().safeParse(JSON.parse(raw));
    if (!parsed.success) return Response.json({error:"راجع قيم الإعدادات."}, {status:400});
    return Response.json(await writeSettings(parsed.data.settings,parsed.data.revision), {headers:noCache});
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({error:"صيغة الطلب غير صحيحة."}, {status:400});
    if (error instanceof Error && error.message === "CONFLICT") return Response.json({error:"تغيّرت الإعدادات من نافذة أخرى. حدّث الصفحة ثم أعد التعديل."}, {status:409});
    return Response.json({error:"تعذر الحفظ. حاول مرة أخرى."}, {status:503});
  }
}

import { serveSharedFile, shareFailure } from "@/lib/sharing-server";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { try { return await serveSharedFile(request, (await context.params).id); } catch (error) { return shareFailure(error); } }
export async function HEAD(request: Request, context: Context) { return GET(request, context); }

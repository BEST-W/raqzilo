import { uploadShare, deleteShare, shareFailure } from "@/lib/sharing-server";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, context: Context) { try { return await uploadShare(request, (await context.params).id); } catch (error) { return shareFailure(error); } }
export async function DELETE(request: Request, context: Context) { try { return await deleteShare(request, (await context.params).id); } catch (error) { return shareFailure(error); } }

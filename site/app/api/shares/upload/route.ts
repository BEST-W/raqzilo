import { authorizeBlobUpload, shareFailure } from "@/lib/sharing-server";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { try { return await authorizeBlobUpload(request); } catch (error) { return shareFailure(error); } }

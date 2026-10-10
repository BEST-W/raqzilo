import { createShare, listShares, shareFailure } from "@/lib/sharing-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { return await listShares(request); } catch (error) { return shareFailure(error); } }
export async function POST(request: Request) { try { return await createShare(request); } catch (error) { return shareFailure(error); } }

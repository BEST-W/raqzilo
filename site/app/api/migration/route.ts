import { migrateData } from "@/lib/migrate-data";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function POST(request: Request) {
  try { return await migrateData(request); }
  catch { return Response.json({ error: "Migration could not complete. Inspect the source and retry before promotion." }, { status: 503, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } }); }
}

import "server-only";
import { z } from "zod";
import { database } from "./database";
import { files } from "./file-storage";
import { settingsSchema } from "./settings-model";
import { SHARE_MAX_BYTES, SHARE_MAX_FILES, SHARE_STORAGE_BYTES } from "./sharing-model";
import { boundedBody } from "./sharing-server";
import { setupAllowed } from "./owner-auth-core";

const shareSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{32}$/), filename: z.string().min(1).max(150),
  size: z.number().int().positive().max(SHARE_MAX_BYTES), creator_hash: z.string().regex(/^[a-f0-9]{64}$/),
  created_at: z.number().int().nonnegative(),
}).strict();
const manifestSchema = z.object({
  settings: z.object({ config: settingsSchema, revision: z.number().int().min(1), updated_at: z.string().datetime() }).strict().optional(),
  shares: z.array(shareSchema).max(SHARE_MAX_FILES),
}).strict();
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
export async function migrateData(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!setupAllowed(token, process.env.MIGRATION_TOKEN, process.env.MIGRATION_EXPIRES)) return new Response(null, { status: 404, headers });
  if (await database.prepare("SELECT id FROM migration_state WHERE id = 'main'").first()) return Response.json({ complete: true }, { headers });
  const now = Date.now(), lease = now + 180000;
  const locked = await database.prepare(`INSERT INTO migration_state (id, completed_at) VALUES ('lock', ?)
    ON CONFLICT(id) DO UPDATE SET completed_at = excluded.completed_at WHERE migration_state.completed_at <= ? RETURNING id`).bind(lease, now).first();
  if (!locked) return Response.json({ error: "Migration is already running; retry after it finishes." }, { status: 409, headers });
  try {
  const manifest = manifestSchema.parse(JSON.parse(new TextDecoder().decode(await boundedBody(request, 131072))));
  if (new Set(manifest.shares.map(row => row.id)).size !== manifest.shares.length || manifest.shares.reduce((sum, row) => sum + row.size, 0) > SHARE_STORAGE_BYTES) throw new Error("Invalid migration manifest");
  if (manifest.settings) {
    const row = manifest.settings;
    const existing = await database.prepare("SELECT config, revision FROM site_settings WHERE id = 'main'").first<{ config: string; revision: number }>();
    if (existing && (existing.revision !== row.revision || JSON.stringify(settingsSchema.parse(JSON.parse(existing.config))) !== JSON.stringify(row.config))) throw new Error("Settings changed; migration refused");
    await database.prepare("INSERT OR IGNORE INTO site_settings (id, config, revision, updated_at) VALUES ('main', ?, ?, ?)").bind(JSON.stringify(row.config), row.revision, row.updated_at).run();
  }
  for (const row of manifest.shares) {
    const existing = await database.prepare("SELECT filename, size, creator_hash, created_at, status FROM pdf_shares WHERE id = ?").bind(row.id).first<{ filename: string; size: number; creator_hash: string; created_at: number; status: string }>();
    if (existing) {
      if (existing.filename !== row.filename || existing.size !== row.size || existing.creator_hash !== row.creator_hash || existing.created_at !== row.created_at || existing.status !== "ready") throw new Error("Share changed; migration refused");
      const object = await files.head("pdf-shares/" + row.id + ".pdf");
      if (!object || object.size !== row.size) throw new Error("Migrated file is missing");
      continue;
    }
    // The stable domain still serves the old backend while this production candidate is staged.
    // Fixed host and validated IDs prevent the import endpoint from fetching arbitrary URLs.
    const source = await fetch("https://raqzilo.vercel.app/api/shares/" + row.id + "/file", { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(45000) });
    if (!source.ok) throw new Error("Source PDF could not be read");
    const bytes = await boundedBody(new Request("https://migration.local/", { method: "POST", body: source.body, duplex: "half" } as RequestInit), SHARE_MAX_BYTES);
    if (bytes.length !== row.size || !/%PDF-[12]\.\d/.test(new TextDecoder("latin1").decode(bytes.subarray(0, 1024))) || !new TextDecoder("latin1").decode(bytes.subarray(Math.max(0, bytes.length - 4096))).includes("%%EOF")) throw new Error("Source PDF validation failed");
    const path = "pdf-shares/" + row.id + ".pdf";
    // A prior interrupted run may have copied the private object before inserting its metadata.
    if (await files.head(path)) await files.delete(path);
    await files.put(path, bytes);
    await database.prepare("INSERT INTO pdf_shares (id, filename, size, creator_hash, upload_hash, status, created_at, upload_expires) VALUES (?, ?, ?, ?, '', 'ready', ?, 0)").bind(row.id, row.filename, row.size, row.creator_hash, row.created_at).run();
  }
  await database.prepare("INSERT OR IGNORE INTO migration_state (id, completed_at) VALUES ('main', ?)").bind(Date.now()).run();
  return Response.json({ complete: true, files: manifest.shares.length, settings: !!manifest.settings }, { headers });
  } finally {
    await database.prepare("DELETE FROM migration_state WHERE id = 'lock' AND completed_at = ?").bind(lease).run();
  }
}

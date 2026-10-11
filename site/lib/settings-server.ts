import { database } from "./database";
import { getOwnerUser } from "./owner-auth";
import { defaultSettings, settingsSchema, type Settings } from "./settings-model";
import { brand } from "./brand";
function db() {
  return database;
}
export async function readSettings(): Promise<{ settings: Settings; revision: number; updatedAt: string | null }> {
  const row = await db().prepare("SELECT config, revision, updated_at FROM site_settings WHERE id = ?").bind("main").first<{config:string; revision:number; updated_at:string}>();
  if (!row) return { settings: defaultSettings, revision: 0, updatedAt: null };
  const settings = settingsSchema.parse(JSON.parse(row.config));
  // Migrate the prior default brand without replacing the owner's other saved settings.
  if (settings.name === "ملفك" && (!settings.nameEn || settings.nameEn === "Malafak")) {
    settings.name = brand.name; settings.nameEn = brand.nameEn;
  }
  return { settings, revision: row.revision, updatedAt: row.updated_at };
}
export async function ownerStatus() {
  const user = await getOwnerUser();
  return { user, allowed: !!user };
}
export async function writeSettings(settings: Settings, expectedRevision: number) {
  const now = new Date().toISOString();
  if (expectedRevision === 0) {
    const r = await db().prepare("INSERT OR IGNORE INTO site_settings (id, config, revision, updated_at) VALUES (?, ?, 1, ?)").bind("main", JSON.stringify(settings), now).run();
    if (!r.meta.changes) throw new Error("CONFLICT");
  } else {
    const r = await db().prepare("UPDATE site_settings SET config = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?").bind(JSON.stringify(settings), now, "main", expectedRevision).run();
    if (!r.meta.changes) throw new Error("CONFLICT");
  }
  return readSettings();
}

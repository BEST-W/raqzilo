import { env } from "cloudflare:workers";
import { ownerStatus, readSettings } from "./settings-server";
import { SHARE_COOKIE, SHARE_MAX_BYTES, SHARE_STORAGE_BYTES, SHARE_MAX_FILES, type SharedFile } from "./sharing-model";

type Row = { id: string; filename: string; size: number; creator_hash: string; upload_hash: string; status: string; created_at: number; upload_expires: number };
export class ShareError extends Error { constructor(public status: number, message: string) { super(message); } }
export const shareHeaders = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
function stores() {
  if (!env.DB || !env.FILES) throw new ShareError(503, "مشاركة الملفات غير متاحة الآن. حاول لاحقاً.");
  return { db: env.DB, files: env.FILES };
}
function token() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, "0")).join(""); }
async function hash(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), n => n.toString(16).padStart(2, "0")).join(""); }
function device(request: Request) {
  const value = request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(SHARE_COOKIE + "="))?.slice(SHARE_COOKIE.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
function key(id: string) { return "pdf-shares/" + id + ".pdf"; }
function validId(id: string) { if (!/^[a-f0-9]{32}$/.test(id)) throw new ShareError(404, "هذا الرابط غير متاح أو تم حذف الملف."); }
function publicFile(row: Row): SharedFile { return { id: row.id, filename: row.filename, size: row.size, createdAt: row.created_at, path: "/api/shares/" + row.id + "/file" }; }
export function sameOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) throw new ShareError(403, "طلب غير مسموح.");
}
async function enabled() {
  const { settings } = await readSettings();
  if (settings.maintenance || !settings.tools.share) throw new ShareError(403, "إنشاء روابط المشاركة غير متاح حالياً.");
}
export async function boundedBody(request: Request, limit: number) {
  if (Number(request.headers.get("content-length") || 0) > limit) throw new ShareError(413, "الملف أكبر من الحد المتاح للمشاركة.");
  if (!request.body) throw new ShareError(400, "اختر ملف PDF أولاً.");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ShareError(408, "انتهت مهلة الرفع. حاول مرة أخرى.")), 60000); });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      total += value.byteLength; if (total > limit) throw new ShareError(413, "الملف أكبر من الحد المتاح للمشاركة.");
      chunks.push(value);
    }
  } catch (error) { void reader.cancel().catch(() => {}); throw error; }
  finally { clearTimeout(timer); }
  const output = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}
async function cleanIncomplete() {
  const { db, files } = stores(); const now = Date.now();
  const { results } = await db.prepare("SELECT id FROM pdf_shares WHERE status != 'ready' AND upload_expires < ? LIMIT 10").bind(now).all<{ id: string }>();
  for (const row of results) {
    await files.delete(key(row.id));
    await db.prepare("DELETE FROM pdf_shares WHERE id = ? AND status != 'ready' AND upload_expires < ?").bind(row.id, now).run();
  }
  await db.prepare("DELETE FROM share_events WHERE id IN (SELECT id FROM share_events WHERE created_at < ? LIMIT 1000)").bind(now - 3 * 86400000).run();
}
export async function createShare(request: Request) {
  sameOrigin(request); await enabled(); const { db } = stores();
  const body = JSON.parse(new TextDecoder().decode(await boundedBody(request, 4096)));
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ShareError(400, "صيغة الطلب غير صحيحة.");
  if (body.consent !== true) throw new ShareError(400, "وافق على رفع نسخة للمشاركة أولاً.");
  if (typeof body.filename !== "string" || body.filename.length > 150 || !/\.pdf$/i.test(body.filename)) throw new ShareError(400, "اختر ملف PDF صالحاً.");
  if (!Number.isInteger(body.size) || body.size <= 0 || body.size > SHARE_MAX_BYTES) throw new ShareError(413, "الملف أكبر من الحد المتاح للمشاركة.");
  const filename = new TextDecoder().decode(new TextEncoder().encode(body.filename)).replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069/\\]/g, "_").trim();
  await cleanIncomplete();
  const secret = device(request) || token(); const creator = await hash(secret); const uploadToken = token();
  const id = token().slice(0, 32); const now = Date.now(); const day = now - now % 86400000;
  const inserted = await db.batch([
    db.prepare(`INSERT INTO pdf_shares (id,filename,size,creator_hash,upload_hash,status,created_at,upload_expires)
      SELECT ?,?,?,?,?,'pending',?,?
      WHERE (SELECT COALESCE(SUM(size),0) FROM pdf_shares) + ? <= ?
      AND (SELECT COUNT(*) FROM pdf_shares) < ?
      AND (SELECT COUNT(*) FROM pdf_shares WHERE status IN ('pending','uploading')) < 3
      AND (SELECT COUNT(*) FROM share_events WHERE created_at >= ?) < 100
      AND (SELECT COUNT(*) FROM share_events WHERE creator_hash = ? AND created_at >= ?) < 5`)
      .bind(id, filename, body.size, creator, await hash(uploadToken), now, now + 900000, body.size, SHARE_STORAGE_BYTES, SHARE_MAX_FILES, day, creator, day),
    db.prepare("INSERT INTO share_events (id,creator_hash,created_at) SELECT id,creator_hash,created_at FROM pdf_shares WHERE id = ?").bind(id),
  ]);
  if (!inserted[0].meta.changes) throw new ShareError(429, "وصلت المشاركة إلى الحد المتاح. احذف ملفات قديمة أو حاول لاحقاً.");
  // Embedded previews are cross-site frames. Partition this capability by the
  // top-level site, while keeping it HttpOnly and retaining same-origin writes.
  const cookiePolicy = new URL(request.url).protocol === "https:" ? "; SameSite=None; Secure; Partitioned" : "; SameSite=Lax";
  return Response.json({ id, uploadToken }, { headers: { ...shareHeaders, "Set-Cookie": `${SHARE_COOKIE}=${secret}; Path=/; Max-Age=31536000; HttpOnly${cookiePolicy}` } });
}
export async function uploadShare(request: Request, id: string) {
  sameOrigin(request); await enabled(); validId(id); const { db, files } = stores();
  const secret = device(request); const grant = request.headers.get("x-upload-token");
  if (!secret || !grant || !/^[a-f0-9]{64}$/.test(grant)) throw new ShareError(403, "طلب الرفع غير مسموح. أعد اختيار الملف.");
  const row = await db.prepare("SELECT * FROM pdf_shares WHERE id = ?").bind(id).first<Row>();
  if (!row || row.creator_hash !== await hash(secret) || row.upload_hash !== await hash(grant) || row.upload_expires <= Date.now()) throw new ShareError(403, "انتهت صلاحية الرفع. حاول مرة أخرى.");
  const claimed = await db.prepare("UPDATE pdf_shares SET status = 'uploading' WHERE id = ? AND status = 'pending' AND upload_expires > ?").bind(id, Date.now()).run();
  if (!claimed.meta.changes) throw new ShareError(409, "طلب الرفع مستخدم بالفعل. راجع ملفاتك المشتركة.");
  try {
    const data = await boundedBody(request, SHARE_MAX_BYTES);
    if (data.byteLength !== row.size) throw new ShareError(400, "حجم الملف لا يطابق طلب الرفع. حاول مرة أخرى.");
    const header = new TextDecoder("latin1").decode(data.subarray(0, 1024));
    const ending = new TextDecoder("latin1").decode(data.subarray(Math.max(0, data.length - 4096)));
    if (!/%PDF-[12]\.\d/.test(header) || !ending.includes("%%EOF")) throw new ShareError(400, "اختر ملف PDF صالحاً.");
    const stored = await files.put(key(id), data, { httpMetadata: { contentType: "application/pdf", cacheControl: "no-store" } });
    if (!stored) throw new Error("R2_PUT_FAILED");
    const ready = await db.prepare("UPDATE pdf_shares SET status = 'ready', upload_hash = '' WHERE id = ? AND status = 'uploading' AND upload_expires > ?").bind(id, Date.now()).run();
    if (!ready.meta.changes) throw new ShareError(409, "تعذر إكمال الرفع. حاول مرة أخرى.");
    return Response.json({ file: publicFile(row) }, { headers: shareHeaders });
  } catch (error) {
    try { await files.delete(key(id)); await db.prepare("DELETE FROM pdf_shares WHERE id = ? AND status != 'ready'").bind(id).run(); }
    catch { console.error("Failed to clean an incomplete PDF share"); }
    throw error;
  }
}
export async function listShares(request: Request) {
  const { db } = stores(); const all = new URL(request.url).searchParams.get("scope") === "all";
  if (all && !(await ownerStatus()).allowed) throw new ShareError(403, "هذه الملفات خاصة بمالك الموقع.");
  const secret = device(request);
  if (!all && !secret) return Response.json({ items: [] }, { headers: shareHeaders });
  await cleanIncomplete();
  const statement = all ? db.prepare("SELECT * FROM pdf_shares WHERE status = 'ready' ORDER BY created_at DESC LIMIT 100") : db.prepare("SELECT * FROM pdf_shares WHERE creator_hash = ? AND status = 'ready' ORDER BY created_at DESC LIMIT 100").bind(await hash(secret!));
  const { results } = await statement.all<Row>();
  const stats = all ? await db.prepare("SELECT COALESCE(SUM(size),0) AS bytes, COUNT(*) AS count FROM pdf_shares").first<{ bytes: number; count: number }>() : undefined;
  return Response.json({ items: results.map(publicFile), ...(stats ? { storage: { ...stats, maxBytes: SHARE_STORAGE_BYTES } } : {}) }, { headers: shareHeaders });
}
export async function getSharedFile(id: string) {
  validId(id); const { db } = stores();
  const row = await db.prepare("SELECT * FROM pdf_shares WHERE id = ? AND status = 'ready'").bind(id).first<Row>();
  if (!row) throw new ShareError(404, "هذا الرابط غير متاح أو تم حذف الملف.");
  return publicFile(row);
}
export async function deleteShare(request: Request, id: string) {
  sameOrigin(request); validId(id); const { db, files } = stores();
  const row = await db.prepare("SELECT * FROM pdf_shares WHERE id = ? AND status IN ('ready','deleting')").bind(id).first<Row>();
  if (!row) throw new ShareError(404, "هذا الرابط غير متاح أو تم حذف الملف.");
  const secret = device(request);
  if ((!secret || row.creator_hash !== await hash(secret)) && !(await ownerStatus()).allowed) throw new ShareError(403, "لا تملك صلاحية حذف هذا الملف.");
  await db.prepare("UPDATE pdf_shares SET status = 'deleting', upload_expires = ? WHERE id = ? AND status IN ('ready','deleting')").bind(Date.now() + 900000, id).run();
  await files.delete(key(id));
  await db.prepare("DELETE FROM pdf_shares WHERE id = ? AND status = 'deleting'").bind(id).run();
  return Response.json({ deleted: true }, { headers: shareHeaders });
}
export async function serveSharedFile(request: Request, id: string) {
  const meta = await getSharedFile(id); const { files } = stores();
  const range = request.headers.get("range"); let partial: { offset: number; length: number } | undefined;
  if (range && request.method !== "HEAD") {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { ...shareHeaders, "Content-Range": `bytes */${meta.size}` } });
    const start = match[1] ? Number(match[1]) : Math.max(0, meta.size - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(meta.size - 1, Number(match[2])) : meta.size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= meta.size) return new Response(null, { status: 416, headers: { ...shareHeaders, "Content-Range": `bytes */${meta.size}` } });
    partial = { offset: start, length: end - start + 1 };
  }
  const object = request.method === "HEAD" ? await files.head(key(id)) : await files.get(key(id), partial ? { range: partial } : undefined);
  if (!object) throw new ShareError(404, "هذا الرابط غير متاح أو تم حذف الملف.");
  const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
  const encoded = encodeURIComponent(meta.filename).replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  const headers = new Headers({ ...shareHeaders, "Content-Type": "application/pdf", "X-Content-Type-Options": "nosniff", "Content-Disposition": `${disposition}; filename="document.pdf"; filename*=UTF-8''${encoded}`, "Content-Length": String(partial?.length ?? object.size), "Accept-Ranges": "bytes", ETag: object.httpEtag, "Content-Security-Policy": "default-src 'none'; frame-ancestors 'self'" });
  if (partial) headers.set("Content-Range", `bytes ${partial.offset}-${partial.offset + partial.length - 1}/${meta.size}`);
  return new Response(request.method === "HEAD" ? null : (object as R2ObjectBody).body, { status: partial ? 206 : 200, headers });
}
export function shareFailure(error: unknown) {
  if (error instanceof ShareError) return Response.json({ error: error.message }, { status: error.status, headers: shareHeaders });
  if (error instanceof SyntaxError) return Response.json({ error: "صيغة الطلب غير صحيحة." }, { status: 400, headers: shareHeaders });
  console.error("PDF sharing storage operation failed");
  return Response.json({ error: "تعذر إكمال العملية. حاول مرة أخرى." }, { status: 503, headers: shareHeaders });
}

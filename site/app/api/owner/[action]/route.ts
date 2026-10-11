import { database } from "@/lib/database";
import { validSetupToken } from "@/lib/owner-auth";
import { cookiePolicy, ownerCookie, passwordAllowed, passwordHash, passwordMatches, randomToken, sessionSeconds, tokenHash } from "@/lib/owner-auth-core";
import { isSameOrigin } from "@/lib/request-origin";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
const reply = (error: string, status: number) => Response.json({ error }, { status, headers });
export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  if (!isSameOrigin(request)) return reply("طلب غير مسموح.", 403);
  try {
    const { action } = await context.params;
    if (action === "logout") {
      const token = request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(ownerCookie + "="))?.slice(ownerCookie.length + 1);
      if (token && /^[a-f0-9]{64}$/.test(token)) await database.prepare("DELETE FROM owner_sessions WHERE token_hash = ?").bind(tokenHash(token)).run();
      return new Response(null, { status: 303, headers: { ...headers, Location: "/admin", "Set-Cookie": `${ownerCookie}=; Max-Age=0; ${cookiePolicy(request.url)}` } });
    }
    if (action !== "login" && action !== "setup") return reply("غير متاح.", 404);
    if (Number(request.headers.get("content-length") || 0) > 2048) return reply("الطلب كبير جداً.", 413);
    const raw = await request.text();
    if (raw.length > 2048) return reply("الطلب كبير جداً.", 413);
    let body; try { body = JSON.parse(raw); } catch { return reply("صيغة الطلب غير صحيحة.", 400); }
    if (!passwordAllowed(body?.password)) return reply("كلمة المرور يجب أن تكون بين 14 و128 حرفاً.", 400);
    const now = Date.now();
    const attempts = await database.prepare(`INSERT INTO login_attempts (id, count, reset_at) VALUES ('owner', 1, ?)
      ON CONFLICT(id) DO UPDATE SET count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
      reset_at = CASE WHEN reset_at <= ? THEN excluded.reset_at ELSE reset_at END RETURNING count`).bind(now + 900000, now, now).first<{ count: number }>();
    if (attempts && attempts.count > 20) return reply("محاولات كثيرة. أعد المحاولة بعد 15 دقيقة.", 429);
    let owner = await database.prepare("SELECT password_hash, session_version FROM owner_login WHERE id = 'main'").first<{ password_hash: string; session_version: string }>();
    if (action === "setup") {
      if (owner || !validSetupToken(body.token)) return reply("رابط التفعيل غير صالح أو مستخدم بالفعل.", 403);
      const hash = await passwordHash(body.password), version = randomToken();
      const inserted = await database.prepare("INSERT OR IGNORE INTO owner_login (id, password_hash, session_version, updated_at) VALUES ('main', ?, ?, ?)").bind(hash, version, now).run();
      if (!inserted.meta.changes) return reply("تم تفعيل الحساب بالفعل.", 409);
      owner = { password_hash: hash, session_version: version };
    } else if (!owner || !await passwordMatches(body.password, owner.password_hash)) return reply("كلمة المرور غير صحيحة أو الحساب غير مفعّل.", 401);
    const token = randomToken();
    await database.batch([
      database.prepare("DELETE FROM owner_sessions WHERE expires_at <= ?").bind(now),
      database.prepare("INSERT INTO owner_sessions (token_hash, expires_at, version) VALUES (?, ?, ?)").bind(tokenHash(token), now + sessionSeconds * 1000, owner.session_version),
      database.prepare("DELETE FROM login_attempts WHERE id = 'owner'"),
    ]);
    return Response.json({ ok: true }, { headers: { ...headers, "Set-Cookie": `${ownerCookie}=${token}; Max-Age=${sessionSeconds}; ${cookiePolicy(request.url)}` } });
  } catch { return reply("تعذر الدخول الآن. حاول مرة أخرى.", 503); }
}

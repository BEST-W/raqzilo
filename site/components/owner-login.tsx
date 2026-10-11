"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useLanguage } from "./language-provider";
export function OwnerLogout() {
  const { language } = useLanguage();
  return <form className="owner-logout" action="/api/owner/logout" method="POST"><button type="submit">{language === "en" ? "Sign out" : "تسجيل الخروج"}</button></form>;
}
export default function OwnerLogin({ setup = false }: { setup?: boolean }) {
  const { language } = useLanguage();
  const en = language === "en";
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!setup) return;
    setToken(new URLSearchParams(location.hash.slice(1)).get("token") || "");
    history.replaceState(null, "", location.pathname);
  }, [setup]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (setup && password !== confirm) { setError(en ? "Passwords do not match." : "كلمتا المرور غير متطابقتين."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/owner/" + (setup ? "setup" : "login"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password, ...(setup ? { token } : {}) }) });
      if (!response.ok) {
        setError(en ? (response.status === 429 ? "Too many attempts. Try again in 15 minutes." : "Unable to sign in. Check your password or activation link.") : (response.status === 429 ? "محاولات كثيرة. أعد المحاولة بعد 15 دقيقة." : "تعذر الدخول. راجع كلمة المرور أو رابط التفعيل."));
      } else location.assign("/admin");
    } catch { setError(en ? "Connection failed. Try again." : "تعذر الاتصال. حاول مرة أخرى."); }
    finally { setBusy(false); }
  }
  return <main className="owner-access"><form className="owner-login" onSubmit={submit}>
    <h1>{en ? (setup ? "Activate owner access" : "Owner sign in") : (setup ? "تفعيل دخول المالك" : "دخول مالك الموقع")}</h1>
    <p>{en ? "Manage your website with your own password." : "تحكم بموقعك باستخدام كلمة مرور خاصة بك."}</p>
    {setup && !token ? <p role="alert">{en ? "Open your private activation link." : "افتح رابط التفعيل الخاص بك."}</p> : <>
      <label>{en ? "Password (at least 14 characters)" : "كلمة المرور (14 حرفاً على الأقل)"}<input type="password" name="password" minLength={14} maxLength={128} autoComplete={setup ? "new-password" : "current-password"} value={password} required disabled={busy} onChange={event => setPassword(event.target.value)} /></label>
      {setup && <label>{en ? "Confirm password" : "تأكيد كلمة المرور"}<input type="password" name="confirm" minLength={14} maxLength={128} autoComplete="new-password" value={confirm} required disabled={busy} onChange={event => setConfirm(event.target.value)} /></label>}
      <button className="brand-button" type="submit" disabled={busy}>{en ? (busy ? "Please wait…" : setup ? "Save and open dashboard" : "Sign in") : (busy ? "انتظر…" : setup ? "حفظ وفتح الإدارة" : "دخول")}</button>
    </>}
    {error && <p className="notice error" role="alert">{error}</p>}
    <a href="/">{en ? "Back to website" : "العودة للموقع"}</a>
  </form></main>;
}

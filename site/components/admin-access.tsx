"use client";
import LanguageSwitcher from "@/components/language-switcher";
import { FileText } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
type Props = {
    reason: "signin";
    signInHref: string;
} | {
    reason: "denied";
    signOutHref: string;
};
export default function AdminAccess(props: Props) {
    const { t, dir, language: uiLanguage, message: localizeMessage } = useLanguage();
    const signIn = props.reason === "signin";
    return <main className="access-page admin-access">
    <LanguageSwitcher/><div className="brand-icon"><FileText size={25}/></div>
    <h1>{signIn ? t("الدخول إلى إدارة الموقع") : t("لوحة الإدارة خاصة بالمالك")}</h1>
    <p>{signIn ? t("سجّل الدخول بنفس حسابك الذي أنشأت به الموقع، لتعديل الاسم والألوان والإعدادات.") : t("الحساب الحالي لا يملك صلاحية الإدارة. ادخل بحساب مالك الموقع.")}</p>
    <div className="admin-access-actions">
      {props.reason === "signin"
            ? <a className="primary-link" href={props.signInHref} target="_top">{t("الدخول بحساب ChatGPT")}</a>
            : <a className="primary-link" href={props.signOutHref} target="_top">{t("تغيير الحساب")}</a>}
      <a className="admin-return-link" href="/">{t("العودة للمحرر")}</a>
    </div>
    <p className="admin-access-note">{t("لوحة الإدارة متاحة للمالك فقط. الزوار يستخدمون المحرر دون تسجيل.")}</p>
  </main>;
}

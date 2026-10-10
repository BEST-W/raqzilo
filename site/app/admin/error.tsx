"use client";
import LanguageSwitcher from "@/components/language-switcher";
import { FileText } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
export default function AdminError({ reset }: {
    error: Error & {
        digest?: string;
    };
    reset: () => void;
}) {
    const { t, dir, language: uiLanguage, message: localizeMessage } = useLanguage();
    return <main className="access-page admin-access">
    <LanguageSwitcher/><div className="brand-icon"><FileText size={25}/></div>
    <h1>{t("تعذر فتح لوحة الإدارة")}</h1>
    <p>{t("حاول تحميل اللوحة مرة أخرى. إعداداتك المحفوظة تبقى كما هي.")}</p>
    <Button className="brand-button" onClick={reset}>{t("إعادة المحاولة")}</Button>
    <a className="admin-return-link" href="/">{t("العودة للمحرر")}</a>
  </main>;
}

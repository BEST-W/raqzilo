"use client";
import { Globe2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/language-provider";

export default function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  return <Button variant="outline" className="language-switcher" onClick={() => setLanguage(language === "ar" ? "en" : "ar")} aria-label={language === "ar" ? "Switch to English" : "التبديل إلى العربية"}>
    <Globe2 size={17} aria-hidden="true" /><span lang={language === "ar" ? "en" : "ar"}>{language === "ar" ? "English" : "العربية"}</span>
  </Button>;
}

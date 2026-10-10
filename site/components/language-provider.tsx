"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { DirectionProvider } from "@/components/ui/direction";
import { translate, translateMessage, languageCookie, type Language } from "@/lib/translations";
import { preferredLanguage, savedLanguage } from "@/lib/language-preference";

type LanguageContextValue = {
  language: Language;
  dir: "rtl" | "ltr";
  setLanguage: (language: Language) => void;
  t: (source: string, values?: Record<string, unknown>) => string;
  message: (source: string) => string;
};
const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ initialLanguage = "en", explicitLanguage, children }: { initialLanguage?: Language; explicitLanguage?: Language; children: React.ReactNode }) {
  const [language, updateLanguage] = useState<Language>(initialLanguage);
  const explicitChoice = useRef(!!explicitLanguage);
  const dir = language === "ar" ? "rtl" : "ltr";
  const setLanguage = useCallback((next: Language) => {
    explicitChoice.current = true;
    updateLanguage(next);
    try { localStorage.setItem(languageCookie, next); } catch { /* Browser storage can be disabled. */ }
    document.cookie = `${languageCookie}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  }, []);
  useEffect(() => {
    let saved = explicitLanguage;
    if (!saved) {
      try { saved = savedLanguage(localStorage.getItem(languageCookie)); }
      catch { /* Automatic detection works with browser storage disabled. */ }
    }
    if (saved) {
      explicitChoice.current = true;
      updateLanguage(saved);
    }
    const detect = () => {
      if (!explicitChoice.current) updateLanguage(preferredLanguage(navigator.languages?.length ? navigator.languages : [navigator.language], initialLanguage));
    };
    detect();
    window.addEventListener("languagechange", detect);
    return () => window.removeEventListener("languagechange", detect);
  }, [explicitLanguage, initialLanguage]);
  useEffect(() => { document.documentElement.lang = language; document.documentElement.dir = dir; }, [language, dir]);
  const t = useCallback((source: string, values?: Record<string, unknown>) => translate(language, source, values), [language]);
  const message = useCallback((source: string) => translateMessage(language, source), [language]);
  return <LanguageContext.Provider value={{ language, dir, setLanguage, t, message }}><DirectionProvider dir={dir}>{children}</DirectionProvider></LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("LanguageProvider is required.");
  return context;
}

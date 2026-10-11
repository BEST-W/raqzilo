import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { LanguageProvider } from "@/components/language-provider";
import { languageCookie } from "@/lib/translations";
import { requestLanguage, savedLanguage } from "@/lib/language-preference";
import { brand } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: `${brand.name} | ${brand.nameEn} — PDF`,
  description: "عدّل ووقّع ونظّم ملفات PDF داخل متصفحك.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [cookieJar, requestHeaders] = await Promise.all([cookies(), headers()]);
  const choice = savedLanguage(cookieJar.get(languageCookie)?.value);
  const language = requestLanguage(choice, requestHeaders.get("accept-language"));
  return (
    <html lang={language} dir={language === "ar" ? "rtl" : "ltr"}>
      <head>
        <meta name="google-site-verification" content="igXaVHtprFJQ2Ec484l3KIr0dWpe8RxLuQokknki5cE" />
        <meta name="google-site-verification" content="rmIC3PZ1db-Sz-IMj0ol5oSiBdgwxCNromXVvBQfWZs" />
        <meta name="google-site-verification" content="YwY_bsc369Ux4sjFNNZe60sVvva6JYv3bMGie4RfKCQ" />
      </head>
      <body className="antialiased"><LanguageProvider initialLanguage={language} explicitLanguage={choice}>{children}</LanguageProvider></body>
    </html>
  );
}

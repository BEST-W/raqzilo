import dictionary from "./english.json";
export type Language = "ar" | "en";
export const languageCookie = "waraqira-language";
export const english: Record<string, string> = dictionary;

export function translate(language: Language, source: string, values?: Record<string, unknown>): string {
  const text = language === "en" ? english[source] ?? source : source;
  return values ? text.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match)) : text;
}

export function translateMessage(language: Language, source: string): string {
  if (language === "en" && english[source]) return english[source];
  for (const [key, value] of Object.entries(english)) {
    const from = language === "en" ? key : value;
    const to = language === "en" ? value : key;
    if (source === from) return to;
    if (!/\{\w+\}/.test(from)) continue;
    const names: string[] = [];
    const pattern = from.split(/(\{\w+\})/).map(part => {
      if (/^\{\w+\}$/.test(part)) { names.push(part.slice(1, -1)); return "([\\s\\S]*?)"; }
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("");
    const match = source.match(new RegExp("^" + pattern + "$"));
    if (match) return to.replace(/\{(\w+)\}/g, (placeholder, name: string) => match[names.indexOf(name) + 1] ?? placeholder);
  }
  return source;
}

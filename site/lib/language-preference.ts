import type { Language } from "./translations";

export function savedLanguage(value: string | null | undefined): Language | undefined {
  return value === "ar" || value === "en" ? value : undefined;
}

export function preferredLanguage(languages: readonly string[], fallback: Language = "en"): Language {
  for (const tag of languages) {
    const base = tag.trim().toLowerCase().split(/[-_]/)[0];
    if (base === "ar" || base === "en") return base;
  }
  return fallback;
}

export function requestLanguage(choice: string | undefined, acceptLanguage: string | null): Language {
  const saved = savedLanguage(choice);
  if (saved) return saved;
  const candidates = (acceptLanguage || "").split(",").map((entry, index) => {
    const [tag, ...parameters] = entry.trim().split(";");
    const weight = parameters.find(value => value.trim().startsWith("q="));
    const quality = weight ? Number(weight.trim().slice(2)) : 1;
    return { tag, quality, index };
  }).filter(value => Number.isFinite(value.quality) && value.quality > 0 && value.quality <= 1)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  return preferredLanguage(candidates.map(value => value.tag));
}

import { getToolEntries, type Settings, type ToolEntry } from "./settings-model";
import { translate, type Language } from "./translations";

export function getLocalizedToolEntries(settings: Settings, language: Language): ToolEntry[] {
  return getToolEntries(settings).map(entry => ({
    ...entry,
    name: language === "en" ? (entry.kind === "custom" && entry.tool.nameEn ? entry.tool.nameEn : translate(language, entry.name)) : entry.name,
    description: language === "en" ? (entry.kind === "custom" && entry.tool.descriptionEn ? entry.tool.descriptionEn : translate(language, entry.description)) : entry.description,
  }));
}

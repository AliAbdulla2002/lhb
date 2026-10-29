import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import ar from "./ar.json";
import en from "./en.json";

export type Lang = "ar" | "en";
export const LANGS: Lang[] = ["ar", "en"];
const STORAGE_KEY = "lahab.lang";

// Prerendered HTML is always Arabic (primary audience); the stored preference is
// applied after hydration so server and client markup match.
void i18n.use(initReactI18next).init({
  resources: { ar: { translation: ar }, en: { translation: en } },
  lng: "ar",
  fallbackLng: "ar",
  interpolation: { escapeValue: false },
  returnObjects: true,
});

export function readStoredLang(): Lang | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "ar" || v === "en" ? v : null;
  } catch {
    return null;
  }
}

export function setLang(lang: Lang) {
  void i18n.changeLanguage(lang);
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Storage unavailable (private mode) — language still applies for this visit.
  }
}

export const dirOf = (lang: Lang) => (lang === "ar" ? "rtl" : "ltr");

/** useTranslation plus the narrowed current language. */
export function useLang() {
  const { t, i18n: instance } = useTranslation();
  const lang: Lang = instance.language === "en" ? "en" : "ar";
  /** Pick the column for the current language, e.g. pick(row, "name") → row.name_ar. */
  const pick = (row: object, field: string): string => {
    const r = row as Record<string, unknown>;
    const value = r[`${field}_${lang}`] ?? r[`${field}_${lang === "ar" ? "en" : "ar"}`];
    return typeof value === "string" ? value : "";
  };
  return { t, lang, pick };
}

export default i18n;

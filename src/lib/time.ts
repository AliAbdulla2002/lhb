import type { Lang } from "~/i18n";

export const BAHRAIN_TZ = "Asia/Bahrain";

export function formatTime(value: string, lang: Lang): string {
  // Postgres "time" values such as "17:00:00".
  const [h = "0", m = "0"] = value.split(":");
  const d = new Date(Date.UTC(2000, 0, 1, Number(h), Number(m)));
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-BH-u-nu-latn" : "en-BH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(d);
}

export function formatDateTime(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-BH-u-nu-latn" : "en-BH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: BAHRAIN_TZ,
  }).format(new Date(iso));
}

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

/** ISO timestamp → value for <input type="datetime-local"> in Bahrain time. */
export function toBahrainInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: BAHRAIN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
  return parts.replace(" ", "T");
}

/** <input type="datetime-local"> value interpreted as Bahrain time (UTC+3) → ISO. */
export function fromBahrainInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value.length === 16 ? `${value}:00` : value}+03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

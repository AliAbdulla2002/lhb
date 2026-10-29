import type { Lang } from "~/i18n";

/** BHD has three decimal places (1 BHD = 1000 fils). Latin digits in both languages. */
export function formatBHD(value: number | string, lang: Lang): string {
  const amount = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat(lang === "ar" ? "ar-BH-u-nu-latn" : "en-BH", {
    style: "currency",
    currency: "BHD",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(amount);
}

/** Integer fils, for exact client-side arithmetic on display estimates. */
export const toFils = (value: number | string) => Math.round(Number(value) * 1000);
export const fromFils = (fils: number) => fils / 1000;

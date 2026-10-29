import type { TFunction } from "i18next";

/**
 * Turn a Supabase/PostgREST error into a translated, user-safe message. Only coded
 * business errors ("lahab.<code>") and a few known Postgres classes are mapped; raw
 * database text is never shown.
 */
export function errorMessage(error: unknown, t: TFunction): string {
  const e = error as { message?: string; code?: string } | null;
  const message = e?.message ?? "";
  const coded = /^lahab\.([a-z_]+)$/.exec(message);
  if (coded) return t(`errors.${coded[1]}`, { defaultValue: t("errors.generic") });
  if (e?.code === "23505") return t("errors.duplicate");
  if (e?.code === "23503") return t("errors.in_use");
  // PGRST116: an update/delete matched no row the caller may change (RLS filtered it out).
  if (e?.code === "42501" || e?.code === "PGRST116" || /row-level security/i.test(message)) return t("errors.not_allowed");
  if (e?.code === "23514" || e?.code === "22P02") return t("errors.invalid_request");
  return t("errors.generic");
}

/** Unwrap a supabase-js result, throwing its error so React Query can handle it. */
export function must<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

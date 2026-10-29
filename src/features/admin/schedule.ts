export type ScheduleState = "live" | "scheduled" | "expired" | "off";

/** Whether an offer or coupon is currently live, mirroring the public RLS filter. */
export function promotionState(p: { is_active: boolean; starts_at: string; ends_at: string | null }, now = Date.now()): ScheduleState {
  if (!p.is_active) return "off";
  if (new Date(p.starts_at).getTime() > now) return "scheduled";
  if (p.ends_at && new Date(p.ends_at).getTime() <= now) return "expired";
  return "live";
}

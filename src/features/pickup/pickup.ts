import { requireSupabase } from "~/lib/supabase";
import { must } from "~/lib/errors";
import type { CustomerOrder } from "~/features/orders/customer-orders";

export const NOTIFY_COOLDOWN_MS = 60_000;
export const MAX_NOTIFICATIONS = 5;
export const NOTIFY_WINDOW_MS = 12 * 3600_000;

export interface NotifyResult {
  order_id: string;
  arrival_status: string;
  arrived_at: string | null;
  notify_count: number;
  replayed: boolean;
}

export async function notifyArrival(orderId: string, clientRequestId: string): Promise<NotifyResult> {
  return must(await requireSupabase().rpc("notify_arrival", { p_order_id: orderId, p_client_request_id: clientRequestId })) as NotifyResult;
}

/** Seconds to wait, from a lahab.notify_cooldown / lahab.rate_limited error's detail. */
export function retryAfterSeconds(error: unknown): number | null {
  const details = (error as { details?: string } | null)?.details;
  if (!details) return null;
  try {
    const n = Number((JSON.parse(details) as { retry_after_seconds?: number }).retry_after_seconds);
    return Number.isFinite(n) && n > 0 ? Math.ceil(n) : null;
  } catch {
    return null;
  }
}

export type PickupPhase = "not_confirmed" | "can_notify" | "notified" | "acknowledged" | "handed_over" | "closed" | "expired" | "limit";

/** What the pickup screen should offer, mirroring app.notify_arrival's rules. */
export function pickupPhase(order: Pick<CustomerOrder, "status" | "created_at" | "pickup_details">, now = Date.now()): PickupPhase {
  const arrival = order.pickup_details?.arrival_status ?? "not_arrived";
  if (arrival === "handed_over" || order.status === "completed") return "handed_over";
  if (order.status === "cancelled") return "closed";
  if (now - new Date(order.created_at).getTime() > NOTIFY_WINDOW_MS) return "expired";
  if (order.status === "pending") return "not_confirmed";
  if (arrival === "acknowledged") return "acknowledged";
  if ((order.pickup_details?.notify_count ?? 0) >= MAX_NOTIFICATIONS) return "limit";
  if (arrival === "arrived") return "notified";
  return "can_notify";
}

/** Milliseconds until another notification is accepted (0 = now). */
export function cooldownRemaining(lastNotifiedAt: string | null | undefined, now = Date.now()): number {
  if (!lastNotifiedAt) return 0;
  return Math.max(0, new Date(lastNotifiedAt).getTime() + NOTIFY_COOLDOWN_MS - now);
}

/** "4:05" for under an hour, "1:02:10" otherwise. */
export function elapsed(fromIso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

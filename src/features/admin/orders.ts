import { getSupabase } from "~/lib/supabase";
import { must } from "~/lib/errors";

export type OrderStatus = "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled";

export interface AdminOrder {
  id: string;
  order_number: string;
  status: OrderStatus;
  branch_id: string;
  fulfillment_type: "pickup" | "delivery";
  payment_method: string;
  payment_status: string;
  requested_pickup_at: string | null;
  subtotal: number;
  options_total: number;
  discount_total: number;
  total: number;
  coupon_code: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  cancel_reason: string | null;
  created_at: string;
  branches: { name_ar: string; name_en: string } | null;
  pickup_details: {
    vehicle_plate: string | null;
    vehicle_color: string | null;
    arrival_status: string;
    arrived_at: string | null;
    notify_count: number;
  } | null;
  order_items: {
    id: string;
    product_name_ar: string;
    product_name_en: string;
    quantity: number;
    line_total: number;
    notes: string | null;
    order_item_options: { option_name_ar: string; option_name_en: string; value_name_ar: string; value_name_en: string; price_delta: number }[];
  }[];
  order_status_history: { from_status: string | null; to_status: string; reason: string | null; created_at: string }[];
}

const SELECT = `id, order_number, status, branch_id, fulfillment_type, payment_method, payment_status, requested_pickup_at,
  subtotal, options_total, discount_total, total, coupon_code, customer_name, customer_phone, notes, cancel_reason, created_at,
  branches(name_ar, name_en),
  pickup_details(vehicle_plate, vehicle_color, arrival_status, arrived_at, notify_count),
  order_items(id, product_name_ar, product_name_en, quantity, line_total, notes,
    order_item_options(option_name_ar, option_name_en, value_name_ar, value_name_en, price_delta)),
  order_status_history(from_status, to_status, reason, created_at)`.replace(/\s+/g, " ");

export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: "confirmed",
  confirmed: "preparing",
  preparing: "ready",
  ready: "completed",
};

export const ACTIVE_STATUSES: OrderStatus[] = ["pending", "confirmed", "preparing", "ready"];

/** Start of the current day in Bahrain (UTC+3, no daylight saving) as an ISO string. */
export function bahrainDayStart(daysAgo = 0, now = new Date()): string {
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bahrain", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const start = new Date(`${local}T00:00:00+03:00`);
  start.setUTCDate(start.getUTCDate() - daysAgo);
  return start.toISOString();
}

export interface OrderFilters {
  branch: string;
  status: string; // "" | "active" | OrderStatus
  range: "today" | "week" | "all";
  search: string;
  page: number;
}

export const PAGE_SIZE = 25;

export async function fetchOrders(f: OrderFilters) {
  let q = getSupabase()!.from("orders").select(SELECT, { count: "exact" }).order("created_at", { ascending: false });
  if (f.branch) q = q.eq("branch_id", f.branch);
  if (f.status === "active") q = q.in("status", ACTIVE_STATUSES);
  else if (f.status) q = q.eq("status", f.status);
  if (f.range !== "all") q = q.gte("created_at", bahrainDayStart(f.range === "week" ? 6 : 0));
  const search = f.search.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (search) q = q.ilike("order_number", `%${search}%`);
  const { data, error, count } = await q.range(f.page * PAGE_SIZE, f.page * PAGE_SIZE + PAGE_SIZE - 1);
  if (error) throw error;
  const rows = (data ?? []) as unknown as AdminOrder[];
  for (const o of rows) o.order_status_history.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { rows, count: count ?? 0 };
}

export async function transitionOrder(orderId: string, to: OrderStatus, reason?: string) {
  return must(await getSupabase()!.rpc("transition_order_status", { p_order_id: orderId, p_to: to, p_reason: reason ?? null }));
}

export async function acknowledgeArrival(orderId: string) {
  return must(await getSupabase()!.rpc("acknowledge_arrival", { p_order_id: orderId }));
}

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase, requireSupabase } from "~/lib/supabase";
import { must } from "~/lib/errors";

export type OrderStatus = "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled";

export interface CustomerOrder {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_method: string;
  payment_status: string;
  requested_pickup_at: string | null;
  subtotal: number;
  options_total: number;
  discount_total: number;
  total: number;
  coupon_code: string | null;
  notes: string | null;
  cancel_reason: string | null;
  created_at: string;
  branches: { name_ar: string; name_en: string; address_ar: string | null; address_en: string | null; pickup_instructions_ar: string | null; pickup_instructions_en: string | null } | null;
  pickup_details: { vehicle_plate: string | null; vehicle_color: string | null; arrival_status: string } | null;
  order_items: {
    id: string;
    product_id: string | null;
    product_name_ar: string;
    product_name_en: string;
    quantity: number;
    line_total: number;
    notes: string | null;
    order_item_options: { option_value_id: string | null; value_name_ar: string; value_name_en: string }[];
  }[];
}

const SELECT = `id, order_number, status, payment_method, payment_status, requested_pickup_at, subtotal, options_total,
  discount_total, total, coupon_code, notes, cancel_reason, created_at,
  branches(name_ar, name_en, address_ar, address_en, pickup_instructions_ar, pickup_instructions_en),
  pickup_details(vehicle_plate, vehicle_color, arrival_status),
  order_items(id, product_id, product_name_ar, product_name_en, quantity, line_total, notes,
    order_item_options(option_value_id, value_name_ar, value_name_en))`.replace(/\s+/g, " ");

export const ACTIVE: OrderStatus[] = ["pending", "confirmed", "preparing", "ready"];
export const STEPS: OrderStatus[] = ["pending", "confirmed", "preparing", "ready", "completed"];

/** One customer order. RLS returns nothing for other customers' orders. */
export function useCustomerOrder(orderNumber: string) {
  const queryClient = useQueryClient();
  const key = ["my-orders", "one", orderNumber];
  const query = useQuery({
    queryKey: key,
    queryFn: async () =>
      must(await requireSupabase().from("orders").select(SELECT).eq("order_number", orderNumber).maybeSingle()) as unknown as CustomerOrder | null,
    // Fallback when the realtime socket is down or the tab was in the background.
    refetchInterval: (q) => (q.state.data && ACTIVE.includes(q.state.data.status) ? 15_000 : false),
    refetchOnWindowFocus: true,
  });

  const orderId = query.data?.id;
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !orderId) return;
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["my-orders", "one", orderNumber] });
    const channel = sb
      .channel(`order-${orderId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "pickup_details", filter: `order_id=eq.${orderId}` }, refresh)
      .subscribe((status) => status === "SUBSCRIBED" && refresh());
    return () => {
      void sb.removeChannel(channel);
    };
  }, [orderId, orderNumber, queryClient]);

  return query;
}

export async function fetchMyOrders(page: number, pageSize = 10) {
  const { data, error, count } = await requireSupabase()
    .from("orders")
    .select(SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) throw error;
  return { rows: (data ?? []) as unknown as CustomerOrder[], count: count ?? 0 };
}

export async function cancelMyOrder(orderId: string, reason: string) {
  return must(await requireSupabase().rpc("transition_order_status", { p_order_id: orderId, p_to: "cancelled", p_reason: reason }));
}

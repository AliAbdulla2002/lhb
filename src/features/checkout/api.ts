import type { TFunction } from "i18next";
import { requireSupabase } from "~/lib/supabase";
import { errorMessage, must } from "~/lib/errors";
import type { CartLine } from "~/features/cart/store";

export const VEHICLE_COLORS = ["white", "black", "silver", "grey", "red", "blue", "green", "beige", "brown", "gold", "orange", "yellow", "other"] as const;
export type VehicleColor = (typeof VEHICLE_COLORS)[number];

export const SWATCH: Record<VehicleColor, string> = {
  white: "#ffffff", black: "#111111", silver: "#c0c4c8", grey: "#6b7076", red: "#c42d15", blue: "#2456b8", green: "#2f7a3d",
  beige: "#d9c6a1", brown: "#6b4426", gold: "#c9a227", orange: "#f2701c", yellow: "#f3c623", other: "conic-gradient(#c42d15,#f3c623,#2f7a3d,#2456b8,#c42d15)",
};

/** Same rule as the database check on pickup_details.vehicle_plate. */
export function normalizePlate(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, " ");
}
export const PLATE_RE = /^[A-Z0-9][A-Z0-9 -]{0,10}[A-Z0-9]$/;

export interface OrderRequest {
  branch_id: string;
  fulfillment_type: "pickup";
  payment_method: "cash_on_pickup";
  pickup_at: string | null;
  items: { product_id: string; quantity: number; option_value_ids: string[]; notes?: string }[];
  coupon_code?: string;
  notes?: string;
  vehicle?: { plate: string; color?: string };
}

export function itemsFromCart(lines: CartLine[]): OrderRequest["items"] {
  return lines.map((l) => ({
    product_id: l.productId,
    quantity: l.quantity,
    option_value_ids: [...l.optionValueIds].sort(),
    ...(l.notes ? { notes: l.notes } : {}),
  }));
}

export interface PlacedOrder {
  order_id: string;
  order_number: string;
  status: string;
  total: number;
  replayed: boolean;
}

export async function placeOrder(request: OrderRequest, idempotencyKey: string): Promise<PlacedOrder> {
  return must(await requireSupabase().rpc("place_order", { p_payload: { ...request, idempotency_key: idempotencyKey } })) as PlacedOrder;
}

export async function fetchPickupSlots(branchId: string): Promise<{ slot_start: string; available: boolean }[]> {
  return must(await requireSupabase().rpc("get_pickup_slots", { p_branch: branchId, p_hours: 24 })) as { slot_start: string; available: boolean }[];
}

/** Code of a coded server error ("lahab.<code>"), if any. */
export function errorCode(error: unknown): string | null {
  const m = /^lahab\.([a-z_]+)$/.exec((error as { message?: string } | null)?.message ?? "");
  return m ? m[1]! : null;
}

/** Customer-facing message for order errors; network failures get a safe-retry hint. */
export function orderErrorMessage(error: unknown, t: TFunction): string {
  const code = errorCode(error);
  if (code) return t(`orderErrors.${code}`, { defaultValue: errorMessage(error, t) });
  const msg = (error as { message?: string } | null)?.message ?? "";
  if (error instanceof TypeError || /fetch|network|Failed to fetch/i.test(msg)) return t("checkout.retry");
  return errorMessage(error, t);
}

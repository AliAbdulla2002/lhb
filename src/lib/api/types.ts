/**
 * Row types for the tables the frontend reads. Hand-maintained until the local Supabase
 * stack is available; then replace with `npm run db:types` (src/types/database.ts).
 * Numeric columns arrive from PostgREST as numbers.
 */

export interface Category {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  image_path: string | null;
  sort_order: number;
}

export interface ProductImage {
  id: string;
  storage_path: string;
  alt_ar: string | null;
  alt_en: string | null;
  sort_order: number;
  is_primary: boolean;
}

export interface OptionValue {
  id: string;
  name_ar: string;
  name_en: string;
  price_delta: number;
  is_default: boolean;
  is_available: boolean;
  sort_order: number;
}

export interface ProductOption {
  id: string;
  name_ar: string;
  name_en: string;
  min_select: number;
  max_select: number;
  sort_order: number;
  product_option_values: OptionValue[];
}

export interface Product {
  id: string;
  category_id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  base_price: number;
  is_available: boolean;
  is_featured: boolean;
  is_best_seller: boolean;
  sort_order: number;
  product_images: ProductImage[];
}

export interface ProductDetail extends Product {
  product_options: ProductOption[];
}

export interface Promotion {
  id: string;
  title_ar: string;
  title_en: string;
  body_ar: string | null;
  body_en: string | null;
  image_path: string | null;
  cta_label_ar: string | null;
  cta_label_en: string | null;
  link_path: string | null;
  ends_at: string | null;
}

export interface BusinessHours {
  weekday: number;
  opens_at: string;
  closes_at: string;
  closes_next_day: boolean;
}

export interface Branch {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  address_ar: string | null;
  address_en: string | null;
  phone: string | null;
  maps_url: string | null;
  pickup_paused: boolean;
  accepts_pickup: boolean;
  pickup_lead_minutes: number;
  pickup_instructions_ar: string | null;
  pickup_instructions_en: string | null;
  business_hours: BusinessHours[];
}

export interface RestaurantSettings {
  display_name_ar: string;
  display_name_en: string;
  tagline_ar: string | null;
  tagline_en: string | null;
  phones: string[];
  whatsapp: string | null;
  instagram_url: string | null;
  ordering_enabled: boolean;
  cash_on_pickup_enabled: boolean;
  online_payment_enabled: boolean;
}

export interface SiteContent {
  key: string;
  value_ar: string | null;
  value_en: string | null;
}

export type CartIssueCode =
  | "product_unavailable"
  | "product_not_found"
  | "option_unavailable"
  | "option_invalid"
  | "option_selection_invalid";

export interface QuoteLine {
  index: number;
  product_id: string;
  product_name_ar: string;
  product_name_en: string;
  unit_base_price: number;
  unit_options_price: number;
  quantity: number;
  line_total: number;
}

export interface Quote {
  lines: QuoteLine[];
  issues: { index: number; product_id: string; code: CartIssueCode }[];
  subtotal: number;
  options_total: number;
  discount_total: number;
  delivery_fee: number;
  total: number;
  coupon: { code: string; valid: boolean; reason: string | null; discount: number } | null;
}

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  preferred_language: "ar" | "en";
}

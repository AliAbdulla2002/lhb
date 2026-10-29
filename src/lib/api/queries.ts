import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "~/lib/supabase";
import * as menu from "./menu";

// Queries are disabled when the backend is not configured (and during prerender),
// so pages render their configuration notice instead of erroring.
const enabled = () => getSupabase() !== null;

export const queryKeys = {
  categories: ["categories"] as const,
  products: ["products"] as const,
  featured: ["products", "featured"] as const,
  product: (slug: string) => ["product", slug] as const,
  promotions: ["promotions"] as const,
  branches: ["branches"] as const,
  settings: ["settings"] as const,
  content: (keys: string[]) => ["content", ...keys] as const,
};

export const useCategories = () => useQuery({ queryKey: queryKeys.categories, queryFn: menu.fetchCategories, enabled: enabled() });
export const useProducts = () => useQuery({ queryKey: queryKeys.products, queryFn: menu.fetchProducts, enabled: enabled() });
export const useFeaturedProducts = () => useQuery({ queryKey: queryKeys.featured, queryFn: menu.fetchFeaturedProducts, enabled: enabled() });
export const useProduct = (slug: string) => useQuery({ queryKey: queryKeys.product(slug), queryFn: () => menu.fetchProduct(slug), enabled: enabled() });
export const usePromotions = () => useQuery({ queryKey: queryKeys.promotions, queryFn: menu.fetchPromotions, enabled: enabled() });
export const useBranches = () => useQuery({ queryKey: queryKeys.branches, queryFn: menu.fetchBranches, enabled: enabled() });
export const useSettings = () => useQuery({ queryKey: queryKeys.settings, queryFn: menu.fetchSettings, enabled: enabled(), staleTime: 5 * 60_000 });
export const useContent = (keys: string[]) =>
  useQuery({ queryKey: queryKeys.content(keys), queryFn: () => menu.fetchContent(keys), enabled: enabled(), staleTime: 5 * 60_000 });

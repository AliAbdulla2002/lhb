import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "~/config/env";

let client: SupabaseClient | null = null;

/** Browser client using the publishable anon key only. Returns null if not configured. */
export function getSupabase(): SupabaseClient | null {
  if (!env) return null;
  if (typeof window === "undefined") return null; // prerender: no data fetching at build time
  client ??= createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}

export class BackendNotConfiguredError extends Error {
  constructor() {
    super("backend_not_configured");
  }
}

export function requireSupabase(): SupabaseClient {
  const sb = getSupabase();
  if (!sb) throw new BackendNotConfiguredError();
  return sb;
}

/** Public URL for an object in the menu-media bucket. */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path || !env) return null;
  return `${env.VITE_SUPABASE_URL}/storage/v1/object/public/menu-media/${path.split("/").map(encodeURIComponent).join("/")}`;
}

import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "~/lib/supabase";
import { must } from "~/lib/errors";
import type { Profile } from "~/lib/api/types";

export const profileKey = (userId: string) => ["profile", userId] as const;

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: profileKey(userId ?? "none"),
    queryFn: async () =>
      must(await requireSupabase().from("profiles").select("id, full_name, phone, preferred_language").eq("id", userId!).single()) as Profile,
    enabled: !!userId,
  });
}

export async function updatePhone(userId: string, phone: string) {
  must(await requireSupabase().from("profiles").update({ phone }).eq("id", userId).select("id").single());
}

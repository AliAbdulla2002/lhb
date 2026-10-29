import { useEffect, useId } from "react";
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { getSupabase } from "~/lib/supabase";
import { must } from "~/lib/errors";

/**
 * Refetch the given queries whenever rows in `tables` change. Realtime respects RLS, so
 * staff only receive events for rows they may read. Also refetches on reconnect.
 */
export function useRealtimeInvalidate(tables: string[], keys: QueryKey[]) {
  const queryClient = useQueryClient();
  const id = useId();
  const tableKey = tables.join(",");
  const keysKey = JSON.stringify(keys);
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const invalidate = () => {
      for (const key of JSON.parse(keysKey) as QueryKey[]) void queryClient.invalidateQueries({ queryKey: key });
    };
    let channel = sb.channel(`admin-${id}`);
    for (const table of tableKey.split(",")) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, invalidate);
    }
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") invalidate();
    });
    return () => {
      void sb.removeChannel(channel);
    };
  }, [id, tableKey, keysKey, queryClient]);
}

export interface AdminBranch {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
}

/** Branches visible to the current staff member (RLS scopes inactive ones to staff). */
export function useAdminBranches() {
  return useQuery({
    queryKey: ["admin", "branches", "list"],
    queryFn: async () =>
      must(await getSupabase()!.from("branches").select("id, slug, name_ar, name_en").order("sort_order")) as AdminBranch[],
    staleTime: 5 * 60_000,
  });
}

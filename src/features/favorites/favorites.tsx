import { Link, useLocation } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { useLang } from "~/i18n";
import { requireSupabase } from "~/lib/supabase";
import { errorMessage, must } from "~/lib/errors";
import { useAuth } from "~/features/auth/AuthProvider";
import { useToast } from "~/ui/Toast";
import { cn } from "~/ui/cn";

const key = (userId: string) => ["favorites", userId] as const;

/** Favourite product ids of the signed-in customer (RLS: own rows only). */
export function useFavoriteIds() {
  const { user } = useAuth();
  return useQuery({
    queryKey: key(user?.id ?? "none"),
    queryFn: async () =>
      new Set((must(await requireSupabase().from("favorites").select("product_id")) as { product_id: string }[]).map((f) => f.product_id)),
    enabled: !!user,
  });
}

export function FavoriteButton({ productId }: { productId: string }) {
  const { t } = useLang();
  const toast = useToast();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const favorites = useFavoriteIds();
  const saved = favorites.data?.has(productId) ?? false;

  const toggle = useMutation({
    mutationFn: async () => {
      const sb = requireSupabase();
      if (saved) must(await sb.from("favorites").delete().eq("user_id", user!.id).eq("product_id", productId).select("product_id"));
      else must(await sb.from("favorites").insert({ user_id: user!.id, product_id: productId }).select("product_id"));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key(user!.id) });
      void queryClient.invalidateQueries({ queryKey: ["favorite-products"] });
    },
    onError: (e) => toast(errorMessage(e, t), "error"),
  });

  const className = "grid size-12 shrink-0 place-items-center rounded-full border border-char-900/10 bg-white shadow-[var(--shadow-card)] transition hover:scale-105";
  if (!user) {
    return (
      <Link to={`/login?next=${encodeURIComponent(pathname)}`} className={className} aria-label={t("favorites.loginToSave")} title={t("favorites.loginToSave")}>
        <Heart className="size-5 text-char-700" aria-hidden />
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={className}
      aria-pressed={saved}
      aria-label={saved ? t("favorites.remove") : t("favorites.add")}
      disabled={toggle.isPending || favorites.isPending}
      onClick={() => toggle.mutate()}
    >
      <Heart className={cn("size-5 transition", saved ? "fill-ember-500 text-ember-500" : "text-char-700")} aria-hidden />
    </button>
  );
}

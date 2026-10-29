import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import type { Route } from "./+types/favorites";
import { useLang } from "~/i18n";
import { requireSupabase } from "~/lib/supabase";
import { must } from "~/lib/errors";
import type { Product } from "~/lib/api/types";
import { useAuth } from "~/features/auth/AuthProvider";
import { RequireAuth } from "~/features/auth/RequireAuth";
import { AccountTabs } from "~/features/account/AccountTabs";
import { ProductCard, ProductCardSkeleton, ProductGrid } from "~/features/menu/ProductCard";
import { ButtonLink } from "~/ui/Button";
import { Container, PageHeader } from "~/ui/Container";
import { EmptyState, ErrorState } from "~/ui/Feedback";

export const meta: Route.MetaFunction = () => [{ title: "المفضلة | Favourites — لهب LAHAB" }, { name: "robots", content: "noindex" }];

function FavoritesGrid() {
  const { t } = useLang();
  const { user } = useAuth();
  const favorites = useQuery({
    queryKey: ["favorite-products", user!.id],
    queryFn: async () => {
      const rows = must(
        await requireSupabase()
          .from("favorites")
          .select(
            "created_at, products(id, category_id, slug, name_ar, name_en, description_ar, description_en, base_price, is_available, is_featured, is_best_seller, sort_order, product_images(id, storage_path, alt_ar, alt_en, sort_order, is_primary))",
          )
          .order("created_at", { ascending: false }),
      ) as unknown as { products: Product | null }[];
      // Archived or hidden products drop out through RLS on products.
      return rows.map((r) => r.products).filter((p): p is Product => !!p);
    },
  });

  if (favorites.isError) return <ErrorState onRetry={() => favorites.refetch()} />;
  if (favorites.isPending) return <ProductGrid>{Array.from({ length: 4 }, (_, i) => <ProductCardSkeleton key={i} />)}</ProductGrid>;
  if (favorites.data.length === 0)
    return <EmptyState title={t("favorites.none")} icon={<Heart className="size-6" aria-hidden />} action={<ButtonLink to="/menu">{t("cart.browse")}</ButtonLink>} />;
  return <ProductGrid>{favorites.data.map((p) => <ProductCard key={p.id} product={p} />)}</ProductGrid>;
}

export default function FavoritesPage() {
  const { t } = useLang();
  return (
    <>
      <PageHeader title={t("favorites.title")} />
      <AccountTabs />
      <Container className="py-8">
        <RequireAuth>
          <FavoritesGrid />
        </RequireAuth>
      </Container>
    </>
  );
}

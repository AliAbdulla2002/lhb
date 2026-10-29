import { NavLink, useParams } from "react-router";
import type { Route } from "./+types/menu";
import { useLang } from "~/i18n";
import { env } from "~/config/env";
import { useCategories, useProducts } from "~/lib/api/queries";
import { ProductCard, ProductCardSkeleton, ProductGrid } from "~/features/menu/ProductCard";
import { Container, PageHeader } from "~/ui/Container";
import { BackendNotice, EmptyState, ErrorState, Skeleton } from "~/ui/Feedback";
import { ButtonLink } from "~/ui/Button";
import { cn } from "~/ui/cn";

export const meta: Route.MetaFunction = () => [
  { title: "المنيو | Menu — لهب LAHAB" },
  { name: "description", content: "منيو مطعم لهب — شاورما وبوكسات وسلطات. Lahab menu with prices in BHD." },
];

export default function MenuPage() {
  const { t, pick } = useLang();
  const { categorySlug } = useParams();
  const categories = useCategories();
  const products = useProducts();

  const chip = ({ isActive }: { isActive: boolean }) =>
    cn(
      "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
      isActive ? "bg-char-900 text-cream-50" : "bg-white text-char-800 shadow-[var(--shadow-card)] hover:text-ember-600",
    );

  const activeCategory = categories.data?.find((c) => c.slug === categorySlug);
  const visibleCategories = activeCategory ? [activeCategory] : (categories.data ?? []);
  const loading = categories.isPending || products.isPending;
  const failed = categories.isError || products.isError;

  return (
    <>
      <PageHeader title={t("menu.title")} subtitle={t("menu.subtitle")} />

      <div className="sticky top-16 z-30 border-b border-char-900/5 bg-cream-50/90 backdrop-blur">
        <Container>
          <nav aria-label={t("menu.categoryFilter")} className="-mx-4 flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
            <NavLink to="/menu" end className={chip}>
              {t("menu.all")}
            </NavLink>
            {categories.data?.map((c) => (
              <NavLink key={c.id} to={`/menu/${c.slug}`} className={chip}>
                {pick(c, "name")}
              </NavLink>
            ))}
            {categories.isPending && env && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-full" />)}
          </nav>
        </Container>
      </div>

      <Container className="space-y-14 py-10">
        {!env ? (
          <BackendNotice />
        ) : failed ? (
          <ErrorState
            onRetry={() => {
              void categories.refetch();
              void products.refetch();
            }}
          />
        ) : loading ? (
          <ProductGrid>{Array.from({ length: 8 }, (_, i) => <ProductCardSkeleton key={i} />)}</ProductGrid>
        ) : categorySlug && !activeCategory ? (
          <EmptyState title={t("menu.empty")} action={<ButtonLink to="/menu" variant="secondary">{t("menu.all")}</ButtonLink>} />
        ) : products.data.length === 0 ? (
          <EmptyState title={t("menu.emptyAll")} />
        ) : (
          visibleCategories.map((category) => {
            const items = products.data.filter((p) => p.category_id === category.id);
            if (items.length === 0 && !activeCategory) return null;
            return (
              <section key={category.id} aria-labelledby={`cat-${category.slug}`} className="scroll-mt-32 space-y-5">
                <div>
                  <h2 id={`cat-${category.slug}`} className="text-2xl font-black sm:text-3xl">{pick(category, "name")}</h2>
                  {pick(category, "description") && <p className="mt-1 text-char-700">{pick(category, "description")}</p>}
                </div>
                {items.length === 0 ? (
                  <EmptyState title={t("menu.empty")} />
                ) : (
                  <ProductGrid>{items.map((p) => <ProductCard key={p.id} product={p} />)}</ProductGrid>
                )}
              </section>
            );
          })
        )}
      </Container>
    </>
  );
}

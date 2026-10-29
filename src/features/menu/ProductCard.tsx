import { Link } from "react-router";
import { Flame } from "lucide-react";
import { useLang } from "~/i18n";
import type { Product } from "~/lib/api/types";
import { mediaUrl } from "~/lib/supabase";
import { FoodPlaceholder } from "~/ui/Brand";
import { Skeleton } from "~/ui/Feedback";
import { Price } from "~/ui/Price";
import { cn } from "~/ui/cn";

export function primaryImage(product: Pick<Product, "product_images">) {
  const imgs = [...product.product_images].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order);
  return imgs[0] ?? null;
}

export function ProductImage({ product, className, sizes }: { product: Product; className?: string; sizes?: string }) {
  const { pick } = useLang();
  const image = primaryImage(product);
  const src = mediaUrl(image?.storage_path);
  if (!image || !src) return <FoodPlaceholder className={className} />;
  return (
    <img
      src={src}
      alt={pick(image, "alt") || pick(product, "name")}
      loading="lazy"
      decoding="async"
      sizes={sizes ?? "(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"}
      className={cn("object-cover", className)}
    />
  );
}

export function ProductCard({ product }: { product: Product }) {
  const { t, pick } = useLang();
  const name = pick(product, "name");
  return (
    <Link
      to={`/menu/item/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-[var(--radius-card)] bg-white shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-glow)]"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <ProductImage product={product} className={cn("size-full transition duration-500 group-hover:scale-105", !product.is_available && "grayscale")} />
        <div className="absolute start-3 top-3 flex flex-wrap gap-1.5">
          {product.is_best_seller && (
            <span className="inline-flex items-center gap-1 rounded-full bg-flame-400 px-2.5 py-1 text-xs font-bold text-char-950">
              <Flame className="size-3" aria-hidden />
              {t("common.bestSeller")}
            </span>
          )}
          {!product.is_available && (
            <span className="rounded-full bg-char-950/80 px-2.5 py-1 text-xs font-semibold text-cream-50">{t("common.unavailable")}</span>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="text-lg font-bold leading-snug text-char-900">{name}</h3>
        {pick(product, "description") && <p className="line-clamp-2 text-sm text-char-700">{pick(product, "description")}</p>}
        <div className="mt-auto pt-2">
          {/* Yellow price tag, as on the printed menu. */}
          <Price value={product.base_price} className="inline-block rounded-lg bg-flame-400 px-3 py-1 text-sm font-bold text-char-900" />
        </div>
      </div>
    </Link>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] bg-white shadow-[var(--shadow-card)]">
      <Skeleton className="aspect-[4/3] rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-5 w-16" />
      </div>
    </div>
  );
}

export function ProductGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, ArrowRight, Check, Minus, Plus } from "lucide-react";
import { seo } from "~/lib/seo";
import { siteUrl } from "~/config/env";
import { mediaUrl } from "~/lib/supabase";
import type { Route } from "./+types/product";
import { useLang } from "~/i18n";
import { env } from "~/config/env";
import { useProduct } from "~/lib/api/queries";
import type { ProductDetail, ProductOption } from "~/lib/api/types";
import { cart, MAX_QUANTITY } from "~/features/cart/store";
import { initialSelections, invalidOptions, selectedLabels, toggleValue, unitEstimate, type Selections } from "~/features/menu/customize";
import { primaryImage, ProductImage } from "~/features/menu/ProductCard";
import { FavoriteButton } from "~/features/favorites/favorites";
import { Button, ButtonLink } from "~/ui/Button";
import { Container } from "~/ui/Container";
import { BackendNotice, EmptyState, ErrorState, Skeleton } from "~/ui/Feedback";
import { TextareaField } from "~/ui/Field";
import { Price } from "~/ui/Price";
import { useToast } from "~/ui/Toast";
import { formatBHD } from "~/lib/money";
import { cn } from "~/ui/cn";

// Title, description and share image depend on the product, so ProductSeo renders them
// once it has loaded; the route only sets what is known from the URL.
export const meta: Route.MetaFunction = ({ params }) =>
  seo({ title: "", path: `/menu/item/${params.productSlug}` }).filter(
    (t) => !("title" in t) && !/^(og|twitter):(title|description|image)/.test(String("property" in t ? t.property : "name" in t ? t.name : "")),
  );

/**
 * Product-specific title, description and share photo (React hoists these into <head>).
 * The build also writes them into each product's HTML for crawlers that don't run
 * JavaScript (scripts/postbuild.mjs); those copies are removed here to avoid duplicates.
 */
function ProductSeo({ product }: { product: ProductDetail }) {
  useEffect(() => {
    for (const el of document.head.querySelectorAll("[data-prerender-seo]")) el.remove();
  }, []);
  const title = `${product.name_ar} | ${product.name_en} — لهب LAHAB`;
  const price = `${product.base_price.toFixed(3)} د.ب.`;
  const description = [product.description_ar, `السعر ${price}`, product.description_en].filter(Boolean).join(" · ");
  const image = mediaUrl(primaryImage(product)?.storage_path) ?? new URL("/og-image.jpg", siteUrl).toString();
  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:image:alt" content={product.name_ar} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
    </>
  );
}

function OptionGroup({
  option,
  value,
  onToggle,
  invalid,
}: {
  option: ProductOption;
  value: string[];
  onToggle: (valueId: string) => void;
  invalid: boolean;
}) {
  const { t, pick } = useLang();
  const single = option.max_select === 1;
  const rule =
    option.min_select === option.max_select
      ? t("product.chooseExactly", { count: option.min_select })
      : option.min_select === 0
        ? t("product.chooseUpTo", { count: option.max_select })
        : t("product.chooseBetween", { min: option.min_select, max: option.max_select });

  return (
    <fieldset className={cn("rounded-2xl border p-4", invalid ? "border-ember-500" : "border-char-900/10")}>
      <legend className="flex w-full items-center justify-between gap-2 px-1">
        <span className="font-bold">{pick(option, "name")}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-xs", option.min_select > 0 ? "bg-ember-50 text-ember-700" : "bg-cream-200 text-char-700")}>
          {option.min_select > 0 ? t("common.required") : t("common.optional")} · {rule}
        </span>
      </legend>
      <div className="mt-2 grid gap-2">
        {option.product_option_values.map((v) => {
          const checked = value.includes(v.id);
          return (
            <label
              key={v.id}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition",
                checked ? "border-ember-500 bg-ember-50" : "border-char-900/10 hover:border-char-900/25",
                !v.is_available && "cursor-not-allowed opacity-50",
              )}
            >
              <input
                type={single ? "radio" : "checkbox"}
                name={option.id}
                className="peer sr-only"
                checked={checked}
                disabled={!v.is_available}
                onChange={() => onToggle(v.id)}
              />
              <span
                aria-hidden
                className={cn(
                  "grid size-5 shrink-0 place-items-center border-2 peer-focus-visible:ring-4 peer-focus-visible:ring-flame-400/40",
                  single ? "rounded-full" : "rounded-md",
                  checked ? "border-ember-500 bg-ember-500 text-white" : "border-char-900/30",
                )}
              >
                {checked && <Check className="size-3.5" strokeWidth={3} />}
              </span>
              <span className="flex-1">{pick(v, "name")}</span>
              {!v.is_available ? (
                <span className="text-xs text-char-700">{t("product.optionUnavailable")}</span>
              ) : v.price_delta > 0 ? (
                <span className="text-sm text-char-700">
                  + <Price value={v.price_delta} />
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function ProductView({ product }: { product: ProductDetail }) {
  const { t, lang, pick } = useLang();
  const toast = useToast();
  const navigate = useNavigate();
  const [selections, setSelections] = useState<Selections>(() => initialSelections(product));
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  const invalid = useMemo(() => invalidOptions(product, selections), [product, selections]);
  const unit = useMemo(() => unitEstimate(product, selections), [product, selections]);
  const name = pick(product, "name");
  const Back = lang === "ar" ? ArrowRight : ArrowLeft;

  const add = () => {
    if (invalid.length > 0) {
      setShowErrors(true);
      toast(t("product.selectRequired"), "error");
      return;
    }
    cart.add({
      productId: product.id,
      slug: product.slug,
      nameAr: product.name_ar,
      nameEn: product.name_en,
      quantity,
      optionValueIds: Object.values(selections).flat(),
      optionLabels: selectedLabels(product, selections),
      notes: notes.trim(),
      unitEstimate: unit,
    });
    toast(t("product.added"));
    navigate("/menu");
  };

  return (
    <Container className="py-8 sm:py-12">
      <Link to="/menu" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-char-700 hover:text-ember-600">
        <Back className="size-4" aria-hidden />
        {t("product.backToMenu")}
      </Link>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-card)] lg:sticky lg:top-24 lg:self-start">
          <ProductImage product={product} className={cn("aspect-square w-full", !product.is_available && "grayscale")} sizes="(min-width: 1024px) 50vw, 100vw" />
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-4xl font-black leading-tight">{name}</h1>
              <FavoriteButton productId={product.id} />
            </div>
            {pick(product, "description") && <p className="text-lg text-char-700">{pick(product, "description")}</p>}
            <p className="text-2xl font-bold text-ember-600">
              <Price value={product.base_price} />
            </p>
            {!product.is_available && (
              <p role="status" className="rounded-xl bg-char-900 px-4 py-3 font-semibold text-cream-50">
                {t("common.unavailable")}
              </p>
            )}
          </div>

          {product.is_available && (
            <>
              {product.product_options.map((option) => (
                <OptionGroup
                  key={option.id}
                  option={option}
                  value={selections[option.id] ?? []}
                  invalid={showErrors && invalid.includes(option.id)}
                  onToggle={(valueId) =>
                    setSelections((s) => ({ ...s, [option.id]: toggleValue(option, s[option.id] ?? [], valueId) }))
                  }
                />
              ))}

              <TextareaField
                label={t("product.notes")}
                placeholder={t("product.notesPlaceholder")}
                maxLength={200}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />

              <div className="flex flex-wrap items-center gap-4">
                <div className="inline-flex items-center rounded-full bg-white shadow-[var(--shadow-card)]" role="group" aria-label={t("product.quantity")}>
                  <button
                    type="button"
                    className="grid size-12 place-items-center rounded-full hover:bg-char-900/5 disabled:opacity-40"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    aria-label={t("product.decrease")}
                  >
                    <Minus className="size-4" aria-hidden />
                  </button>
                  <output aria-live="polite" className="w-8 text-center text-lg font-bold tabular-nums">
                    {quantity}
                  </output>
                  <button
                    type="button"
                    className="grid size-12 place-items-center rounded-full hover:bg-char-900/5 disabled:opacity-40"
                    onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}
                    disabled={quantity >= MAX_QUANTITY}
                    aria-label={t("product.increase")}
                  >
                    <Plus className="size-4" aria-hidden />
                  </button>
                </div>
                <Button size="lg" className="flex-1" onClick={add}>
                  {t("product.addToCart", { price: formatBHD(unit * quantity, lang) })}
                </Button>
              </div>
              <p className="text-xs text-char-700">{t("product.estimateNote")}</p>
            </>
          )}
        </div>
      </div>
    </Container>
  );
}

export default function ProductPage() {
  const { t } = useLang();
  const { productSlug = "" } = useParams();
  const product = useProduct(productSlug);

  if (!env) return <Container className="py-12"><BackendNotice /></Container>;
  if (product.isError) return <Container className="py-12"><ErrorState onRetry={() => product.refetch()} /></Container>;
  if (product.isPending)
    return (
      <Container className="grid gap-8 py-12 lg:grid-cols-2">
        <Skeleton className="aspect-square" />
        <div className="space-y-4">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </Container>
    );
  if (!product.data)
    return (
      <Container className="py-12">
        <EmptyState title={t("product.notFound")} action={<ButtonLink to="/menu" variant="secondary">{t("product.backToMenu")}</ButtonLink>} />
      </Container>
    );
  return (
    <>
      <ProductSeo product={product.data} />
      <ProductView key={product.data.id} product={product.data} />
    </>
  );
}

import { useMemo } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import type { Route } from "./+types/cart";
import { useLang } from "~/i18n";
import { env } from "~/config/env";
import { getSupabase } from "~/lib/supabase";
import { quoteCart } from "~/lib/api/menu";
import type { Quote } from "~/lib/api/types";
import { cart, MAX_QUANTITY, useCart, type CartLine } from "~/features/cart/store";
import { Button, ButtonLink } from "~/ui/Button";
import { Container, PageHeader } from "~/ui/Container";
import { BackendNotice, EmptyState, ErrorState, Skeleton } from "~/ui/Feedback";
import { Price } from "~/ui/Price";
import { cn } from "~/ui/cn";

export const meta: Route.MetaFunction = () => [{ title: "السلة | Cart — لهب LAHAB" }, { name: "robots", content: "noindex" }];

function LineRow({ line, issue, serverTotal }: { line: CartLine; issue?: string; serverTotal?: number }) {
  const { t, lang } = useLang();
  const name = lang === "ar" ? line.nameAr : line.nameEn;
  return (
    <li className={cn("flex gap-4 rounded-2xl bg-white p-4 shadow-[var(--shadow-card)]", issue && "ring-2 ring-ember-500")}>
      <div className="min-w-0 flex-1 space-y-1">
        <Link to={`/menu/item/${line.slug}`} className="font-bold hover:text-ember-600">
          {name}
        </Link>
        {line.optionLabels.length > 0 && <p className="text-sm text-char-700">{line.optionLabels.map((o) => o[lang]).join(" · ")}</p>}
        {line.notes && <p className="text-sm italic text-char-700/80">“{line.notes}”</p>}
        {issue && (
          <p role="alert" className="flex items-start gap-1.5 text-sm font-medium text-ember-700">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t(`cart.issue.${issue}`)}
          </p>
        )}
        <div className="flex items-center gap-3 pt-2">
          <div className="inline-flex items-center rounded-full border border-char-900/10" role="group" aria-label={t("product.quantity")}>
            <button
              type="button"
              className="grid size-9 place-items-center rounded-full hover:bg-char-900/5"
              onClick={() => cart.setQuantity(line.key, line.quantity - 1)}
              aria-label={t("product.decrease")}
            >
              <Minus className="size-3.5" aria-hidden />
            </button>
            <span className="w-7 text-center font-semibold tabular-nums">{line.quantity}</span>
            <button
              type="button"
              className="grid size-9 place-items-center rounded-full hover:bg-char-900/5 disabled:opacity-40"
              onClick={() => cart.setQuantity(line.key, line.quantity + 1)}
              disabled={line.quantity >= MAX_QUANTITY}
              aria-label={t("product.increase")}
            >
              <Plus className="size-3.5" aria-hidden />
            </button>
          </div>
          <button
            type="button"
            onClick={() => cart.remove(line.key)}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-char-700 hover:bg-ember-50 hover:text-ember-700"
            aria-label={t("cart.remove", { name })}
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      <div className="shrink-0 text-end font-bold">
        {serverTotal !== undefined ? <Price value={serverTotal} /> : issue ? null : <Skeleton className="h-5 w-16" />}
      </div>
    </li>
  );
}

export default function CartPage() {
  const { t } = useLang();
  const lines = useCart();
  const items = useMemo(
    () => lines.map((l) => ({ product_id: l.productId, quantity: l.quantity, option_value_ids: l.optionValueIds, notes: l.notes || undefined })),
    [lines],
  );

  // Prices, availability and totals always come from the server.
  const quote = useQuery<Quote>({
    queryKey: ["quote", items],
    queryFn: () => quoteCart(items),
    enabled: items.length > 0 && getSupabase() !== null,
    placeholderData: (prev) => prev,
  });

  if (lines.length === 0) {
    return (
      <>
        <PageHeader title={t("cart.title")} />
        <Container className="py-12">
          <EmptyState
            title={t("cart.empty")}
            icon={<ShoppingBag className="size-6" aria-hidden />}
            action={<ButtonLink to="/menu">{t("cart.browse")}</ButtonLink>}
          />
        </Container>
      </>
    );
  }

  const issues = new Map((quote.data?.issues ?? []).map((i) => [i.index, i.code]));
  const totals = new Map((quote.data?.lines ?? []).map((l) => [l.index, l.line_total]));
  const fresh = quote.isSuccess && !quote.isPlaceholderData;

  return (
    <>
      <PageHeader title={t("cart.title")} subtitle={t("cart.itemCount", { count: lines.reduce((n, l) => n + l.quantity, 0) })} />
      <Container className="grid gap-8 py-10 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          {!env && <BackendNotice />}
          {issues.size > 0 && (
            <p role="alert" className="rounded-2xl bg-ember-50 px-4 py-3 font-semibold text-ember-800">
              {t("cart.issuesTitle")}
            </p>
          )}
          <ul className="space-y-3">
            {lines.map((line, index) => (
              <LineRow key={line.key} line={line} issue={issues.get(index)} serverTotal={totals.get(index)} />
            ))}
          </ul>
        </div>

        <aside className="h-fit space-y-4 rounded-[var(--radius-card)] bg-white p-6 shadow-[var(--shadow-card)] lg:sticky lg:top-24" aria-live="polite">
          {quote.isError ? (
            <ErrorState onRetry={() => quote.refetch()} />
          ) : !quote.data ? (
            <p className="text-sm text-char-700">{t("cart.checkingPrices")}</p>
          ) : (
            <dl className={cn("space-y-2 text-sm", !fresh && "opacity-60")}>
              <div className="flex justify-between">
                <dt>{t("cart.subtotal")}</dt>
                <dd><Price value={quote.data.subtotal} /></dd>
              </div>
              {quote.data.options_total > 0 && (
                <div className="flex justify-between">
                  <dt>{t("cart.options")}</dt>
                  <dd><Price value={quote.data.options_total} /></dd>
                </div>
              )}
              {quote.data.discount_total > 0 && (
                <div className="flex justify-between text-ember-700">
                  <dt>{t("cart.discount")}</dt>
                  <dd>− <Price value={quote.data.discount_total} /></dd>
                </div>
              )}
              <div className="flex justify-between border-t border-char-900/10 pt-3 text-lg font-black">
                <dt>{t("cart.total")}</dt>
                <dd><Price value={quote.data.total} /></dd>
              </div>
            </dl>
          )}
          {issues.size > 0 || !fresh ? (
            <Button size="lg" className="w-full" disabled>
              {t("cart.checkout")}
            </Button>
          ) : (
            <ButtonLink to="/checkout" size="lg" className="w-full">
              {t("cart.checkout")}
            </ButtonLink>
          )}
        </aside>
      </Container>
    </>
  );
}

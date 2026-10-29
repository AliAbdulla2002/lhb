import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { Receipt, RotateCcw } from "lucide-react";
import type { Route } from "./+types/orders";
import { useLang } from "~/i18n";
import { formatDateTime } from "~/lib/time";
import { RequireAuth } from "~/features/auth/RequireAuth";
import { AccountTabs } from "~/features/account/AccountTabs";
import { fetchMyOrders, type CustomerOrder } from "~/features/orders/customer-orders";
import { reorder } from "~/features/orders/reorder";
import { orderErrorMessage } from "~/features/checkout/api";
import { Pager, StatusBadge } from "~/features/admin/ui";
import { Button, ButtonLink } from "~/ui/Button";
import { Container, PageHeader } from "~/ui/Container";
import { EmptyState, ErrorState, Skeleton } from "~/ui/Feedback";
import { Price } from "~/ui/Price";
import { useToast } from "~/ui/Toast";

export const meta: Route.MetaFunction = () => [{ title: "طلباتي | My orders — لهب LAHAB" }, { name: "robots", content: "noindex" }];

const PAGE = 10;

function OrderCard({ order }: { order: CustomerOrder }) {
  const { t, lang, pick } = useLang();
  const toast = useToast();
  const navigate = useNavigate();
  const again = useMutation({
    mutationFn: () => reorder(order),
    onSuccess: ({ added, skipped }) => {
      if (added === 0) return toast(t("orders.reorderNone"), "error");
      toast(skipped > 0 ? t("orders.reorderPartial") : t("orders.reordered"), skipped > 0 ? "error" : "success");
      navigate("/cart");
    },
    onError: (e) => toast(orderErrorMessage(e, t), "error"),
  });
  return (
    <li className="space-y-3 rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to={`/orders/${order.order_number}`} className="font-display text-lg font-black hover:text-ember-600" dir="ltr" aria-label={t("orders.view", { number: order.order_number })}>
          {order.order_number}
        </Link>
        <StatusBadge kind="order" value={order.status} />
      </div>
      <p className="text-sm text-char-700">
        {formatDateTime(order.created_at, lang)}
        {order.branches && ` · ${pick(order.branches, "name")}`}
      </p>
      <p className="line-clamp-2 text-sm">{order.order_items.map((i) => `${i.quantity}× ${pick(i, "product_name")}`).join("، ")}</p>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-char-900/10 pt-3">
        <Price value={order.total} className="font-bold" />
        <div className="flex gap-2">
          <ButtonLink to={`/orders/${order.order_number}`} variant="ghost" size="sm">
            {t("admin.common.details")}
          </ButtonLink>
          <Button variant="secondary" size="sm" loading={again.isPending} onClick={() => again.mutate()}>
            <RotateCcw className="size-4" aria-hidden />
            {t("orders.reorder")}
          </Button>
        </div>
      </div>
    </li>
  );
}

function OrdersList() {
  const { t } = useLang();
  const [page, setPage] = useState(0);
  const orders = useQuery({ queryKey: ["my-orders", "list", page], queryFn: () => fetchMyOrders(page, PAGE), placeholderData: keepPreviousData });

  if (orders.isError) return <ErrorState onRetry={() => orders.refetch()} />;
  if (orders.isPending) return <Skeleton className="h-64" />;
  if (orders.data.rows.length === 0)
    return <EmptyState title={t("orders.none")} icon={<Receipt className="size-6" aria-hidden />} action={<ButtonLink to="/menu">{t("cart.browse")}</ButtonLink>} />;
  return (
    <div className="space-y-4">
      <ul className="grid gap-4 md:grid-cols-2">
        {orders.data.rows.map((o) => (
          <OrderCard key={o.id} order={o} />
        ))}
      </ul>
      <Pager page={page} pageSize={PAGE} total={orders.data.count} onPage={setPage} />
    </div>
  );
}

export default function MyOrdersPage() {
  const { t } = useLang();
  return (
    <>
      <PageHeader title={t("orders.title")} />
      <AccountTabs />
      <Container className="py-8">
        <RequireAuth>
          <OrdersList />
        </RequireAuth>
      </Container>
    </>
  );
}

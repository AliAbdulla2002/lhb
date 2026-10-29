import { Link, useLocation, useParams } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CarFront, Check, CircleCheckBig, MapPin, Radio, XCircle } from "lucide-react";
import type { Route } from "./+types/order";
import { useLang } from "~/i18n";
import { env } from "~/config/env";
import { formatDateTime } from "~/lib/time";
import { RequireAuth } from "~/features/auth/RequireAuth";
import { cancelMyOrder, STEPS, useCustomerOrder, type CustomerOrder } from "~/features/orders/customer-orders";
import { orderErrorMessage } from "~/features/checkout/api";
import { ConfirmButton } from "~/features/admin/ui";
import { ButtonLink } from "~/ui/Button";
import { Container } from "~/ui/Container";
import { BackendNotice, EmptyState, ErrorState, Skeleton } from "~/ui/Feedback";
import { Price } from "~/ui/Price";
import { useToast } from "~/ui/Toast";
import { cn } from "~/ui/cn";

export const meta: Route.MetaFunction = () => [{ title: "طلبك | Your order — لهب LAHAB" }, { name: "robots", content: "noindex" }];

function Progress({ status }: { status: CustomerOrder["status"] }) {
  const { t } = useLang();
  if (status === "cancelled") {
    return (
      <p className="flex items-center gap-2 rounded-2xl bg-ember-50 px-4 py-3 font-semibold text-ember-800">
        <XCircle className="size-5" aria-hidden />
        {t("orders.step.cancelled")}
      </p>
    );
  }
  const current = STEPS.indexOf(status);
  return (
    <ol className="space-y-3" aria-label={t("admin.common.status")}>
      {STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={step} className="flex items-center gap-3" aria-current={active ? "step" : undefined}>
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-full border-2 text-sm font-bold",
                done && "border-ember-500 bg-ember-500 text-white",
                active && "border-ember-500 bg-white text-ember-600 motion-safe:animate-pulse",
                !done && !active && "border-char-900/15 text-char-700/50",
              )}
            >
              {done ? <Check className="size-4" strokeWidth={3} aria-hidden /> : i + 1}
            </span>
            <span className={cn("font-medium", active ? "text-char-900" : done ? "text-char-700" : "text-char-700/50")}>{t(`orders.step.${step}`)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function OrderView({ order }: { order: CustomerOrder }) {
  const { t, lang, pick } = useLang();
  const toast = useToast();
  const queryClient = useQueryClient();
  const location = useLocation();
  const justPlaced = (location.state as { justPlaced?: boolean } | null)?.justPlaced;
  const cancel = useMutation({
    mutationFn: () => cancelMyOrder(order.id, t("orders.cancelReason")),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["my-orders"] }),
    onError: (e) => toast(orderErrorMessage(e, t), "error"),
  });
  const pickup = order.pickup_details;
  const live = order.status !== "completed" && order.status !== "cancelled";

  return (
    <Container className="grid gap-6 py-8 lg:grid-cols-[1fr_22rem] lg:py-12">
      <div className="space-y-6">
        {justPlaced && (
          <p role="status" className="flex items-center gap-3 rounded-2xl bg-char-950 px-5 py-4 text-lg font-bold text-cream-50 motion-safe:animate-fade-up">
            <CircleCheckBig className="size-6 text-flame-400" aria-hidden />
            {t("orders.thanks")}
          </p>
        )}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-char-700">{t("admin.orders.number")}</p>
            <h1 className="font-display text-4xl font-black tracking-wide" dir="ltr">
              {order.order_number}
            </h1>
          </div>
          {live && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
              <Radio className="size-3.5 motion-safe:animate-pulse" aria-hidden />
              {t("orders.live")}
            </span>
          )}
        </div>

        <section aria-live="polite" className="rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)]">
          <Progress status={order.status} />
          {order.cancel_reason && <p className="mt-3 text-sm text-char-700">{order.cancel_reason}</p>}
        </section>

        <section className="grid gap-4 rounded-[var(--radius-card)] bg-white p-5 text-sm shadow-[var(--shadow-card)] sm:grid-cols-2">
          {order.branches && (
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-ember-500" aria-hidden />
              <div>
                <p className="font-semibold">{pick(order.branches, "name")}</p>
                {pick(order.branches, "address") && <p className="text-char-700">{pick(order.branches, "address")}</p>}
                {pick(order.branches, "pickup_instructions") && <p className="mt-1 text-char-700">{pick(order.branches, "pickup_instructions")}</p>}
              </div>
            </div>
          )}
          <dl className="space-y-1">
            <div className="flex justify-between gap-3">
              <dt className="text-char-700">{t("orders.placedAt")}</dt>
              <dd>{formatDateTime(order.created_at, lang)}</dd>
            </div>
            {order.requested_pickup_at && (
              <div className="flex justify-between gap-3">
                <dt className="text-char-700">{t("orders.pickupAt")}</dt>
                <dd>{formatDateTime(order.requested_pickup_at, lang)}</dd>
              </div>
            )}
            {pickup?.vehicle_plate && (
              <div className="flex justify-between gap-3">
                <dt className="flex items-center gap-1 text-char-700">
                  <CarFront className="size-4" aria-hidden />
                  {t("orders.vehicle")}
                </dt>
                <dd className="font-bold" dir="ltr">
                  {pickup.vehicle_plate}
                  {pickup.vehicle_color && <span className="ms-1 font-normal">({t(`vehicleColor.${pickup.vehicle_color}`)})</span>}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-char-700">{t("checkout.payment")}</dt>
              <dd>{t(`status.method.${order.payment_method}`)}</dd>
            </div>
          </dl>
        </section>

        {order.status === "pending" && (
          <ConfirmButton label={t("orders.cancel")} message={t("orders.cancelConfirm")} onConfirm={() => cancel.mutateAsync().then(() => undefined, () => undefined)} />
        )}
      </div>

      <aside className="h-fit space-y-4 rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] lg:sticky lg:top-24">
        <h2 className="text-lg font-black">{t("orders.items")}</h2>
        <ul className="space-y-3 text-sm">
          {order.order_items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3">
              <span>
                {i.quantity} × {pick(i, "product_name")}
                {i.order_item_options.length > 0 && <span className="block text-xs text-char-700">{i.order_item_options.map((o) => pick(o, "value_name")).join(" · ")}</span>}
                {i.notes && <span className="block text-xs italic text-char-700">“{i.notes}”</span>}
              </span>
              <Price value={i.line_total} />
            </li>
          ))}
        </ul>
        <dl className="space-y-2 border-t border-char-900/10 pt-3 text-sm">
          {order.discount_total > 0 && (
            <div className="flex justify-between text-emerald-700">
              <dt>
                {t("cart.discount")} {order.coupon_code && <span dir="ltr">({order.coupon_code})</span>}
              </dt>
              <dd>− <Price value={order.discount_total} /></dd>
            </div>
          )}
          <div className="flex justify-between text-lg font-black">
            <dt>{t("cart.total")}</dt>
            <dd><Price value={order.total} /></dd>
          </div>
        </dl>
        <Link to="/account/orders" className="block text-center text-sm font-semibold text-ember-600 hover:underline">
          {t("orders.back")}
        </Link>
      </aside>
    </Container>
  );
}

function OrderLoader() {
  const { t } = useLang();
  const { orderNumber = "" } = useParams();
  const order = useCustomerOrder(orderNumber);
  if (order.isError) return <Container className="py-12"><ErrorState onRetry={() => order.refetch()} /></Container>;
  if (order.isPending)
    return (
      <Container className="space-y-4 py-12">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-64" />
      </Container>
    );
  if (!order.data)
    return (
      <Container className="py-12">
        <EmptyState title={t("orders.notFound")} action={<ButtonLink to="/account/orders" variant="secondary">{t("orders.back")}</ButtonLink>} />
      </Container>
    );
  return <OrderView order={order.data} />;
}

export default function OrderPage() {
  if (!env) return <Container className="py-12"><BackendNotice /></Container>;
  return (
    <RequireAuth>
      <OrderLoader />
    </RequireAuth>
  );
}

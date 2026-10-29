import { useState } from "react";
import { useSearchParams } from "react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CarFront, RefreshCw } from "lucide-react";
import { useLang } from "~/i18n";
import { errorMessage } from "~/lib/errors";
import { formatDateTime } from "~/lib/time";
import {
  acknowledgeArrival,
  fetchOrders,
  NEXT_STATUS,
  PAGE_SIZE,
  transitionOrder,
  type AdminOrder,
  type OrderFilters,
  type OrderStatus,
} from "~/features/admin/orders";
import { AdminPage, DataTable, Modal, Pager, Pill, SearchInput, SelectFilter, StatusBadge } from "~/features/admin/ui";
import { useAdminBranches, useRealtimeInvalidate } from "~/features/admin/hooks";
import { Button } from "~/ui/Button";
import { ErrorState, Skeleton } from "~/ui/Feedback";
import { TextareaField } from "~/ui/Field";
import { Price } from "~/ui/Price";
import { useToast } from "~/ui/Toast";

function useOrderActions() {
  const { t } = useLang();
  const toast = useToast();
  const queryClient = useQueryClient();
  const done = () => void queryClient.invalidateQueries({ queryKey: ["admin"] });
  const onError = (e: unknown) => toast(errorMessage(e, t), "error");
  const transition = useMutation({
    mutationFn: ({ id, to, reason }: { id: string; to: OrderStatus; reason?: string }) => transitionOrder(id, to, reason),
    onSuccess: done,
    onError,
  });
  const acknowledge = useMutation({ mutationFn: (id: string) => acknowledgeArrival(id), onSuccess: done, onError });
  return { transition, acknowledge };
}

function OrderDetail({ order, onClose }: { order: AdminOrder; onClose: () => void }) {
  const { t, lang, pick } = useLang();
  const { transition, acknowledge } = useOrderActions();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const next = NEXT_STATUS[order.status];
  const pickup = order.pickup_details;
  const busy = transition.isPending || acknowledge.isPending;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge kind="order" value={order.status} />
        <StatusBadge kind="payment" value={order.payment_status} />
        <Pill>{t(`status.method.${order.payment_method}`)}</Pill>
        {pickup && pickup.arrival_status !== "not_arrived" && <StatusBadge kind="arrival" value={pickup.arrival_status} />}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-char-700">{t("admin.orders.customer")}</dt>
        <dd>{order.customer_name ?? "—"}</dd>
        <dt className="text-char-700">{t("admin.orders.phone")}</dt>
        <dd>
          {order.customer_phone ? (
            <a href={`tel:${order.customer_phone}`} className="text-ember-600 underline" dir="ltr">
              {order.customer_phone}
            </a>
          ) : (
            "—"
          )}
        </dd>
        <dt className="text-char-700">{t("admin.common.branch")}</dt>
        <dd>{order.branches ? pick(order.branches, "name") : "—"}</dd>
        <dt className="text-char-700">{t("admin.orders.placed")}</dt>
        <dd>{formatDateTime(order.created_at, lang)}</dd>
        {order.requested_pickup_at && (
          <>
            <dt className="text-char-700">{t("admin.orders.pickupAt")}</dt>
            <dd>{formatDateTime(order.requested_pickup_at, lang)}</dd>
          </>
        )}
        {pickup?.vehicle_plate && (
          <>
            <dt className="text-char-700">{t("admin.orders.vehicle")}</dt>
            <dd className="font-bold" dir="ltr">
              {pickup.vehicle_plate}
              {pickup.vehicle_color && <span className="ms-2 font-normal text-char-700">({t(`vehicleColor.${pickup.vehicle_color}`)})</span>}
            </dd>
          </>
        )}
      </dl>

      <div>
        <h3 className="mb-2 font-bold">{t("admin.orders.items")}</h3>
        <ul className="divide-y divide-char-900/10 rounded-xl border border-char-900/10 bg-white">
          {order.order_items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3 p-3 text-sm">
              <div>
                <p className="font-semibold">
                  {item.quantity} × {pick(item, "product_name")}
                </p>
                {item.order_item_options.length > 0 && (
                  <p className="text-char-700">{item.order_item_options.map((o) => pick(o, "value_name")).join(" · ")}</p>
                )}
                {item.notes && <p className="italic text-ember-700">“{item.notes}”</p>}
              </div>
              <Price value={item.line_total} />
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 text-sm">
          {order.discount_total > 0 && (
            <div className="flex justify-between text-ember-700">
              <dt>
                {t("cart.discount")} {order.coupon_code && <span dir="ltr">({order.coupon_code})</span>}
              </dt>
              <dd>
                − <Price value={order.discount_total} />
              </dd>
            </div>
          )}
          <div className="flex justify-between text-base font-black">
            <dt>{t("admin.common.total")}</dt>
            <dd>
              <Price value={order.total} />
            </dd>
          </div>
        </dl>
      </div>

      {order.notes && (
        <div className="rounded-xl bg-flame-300/20 p-3 text-sm">
          <p className="font-semibold">{t("admin.orders.customerNotes")}</p>
          <p className="whitespace-pre-line">{order.notes}</p>
        </div>
      )}
      {order.cancel_reason && <p className="rounded-xl bg-ember-50 p-3 text-sm text-ember-800">{order.cancel_reason}</p>}

      <div>
        <h3 className="mb-2 font-bold">{t("admin.orders.history")}</h3>
        <ol className="space-y-1 text-sm">
          {order.order_status_history.map((h, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <StatusBadge kind="order" value={h.to_status} />
              <span className="text-char-700">{formatDateTime(h.created_at, lang)}</span>
              {h.reason && <span className="text-char-700">— {h.reason}</span>}
            </li>
          ))}
        </ol>
      </div>

      {cancelling ? (
        <form
          className="space-y-3 rounded-xl border border-ember-200 bg-ember-50 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            transition.mutate({ id: order.id, to: "cancelled", reason }, { onSuccess: onClose });
          }}
        >
          <TextareaField
            label={t("admin.orders.cancelReason")}
            placeholder={t("admin.orders.cancelReasonPlaceholder")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            minLength={3}
            maxLength={300}
            required
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCancelling(false)}>
              {t("admin.common.cancel")}
            </Button>
            <Button type="submit" loading={transition.isPending} disabled={reason.trim().length < 3}>
              {t("admin.orders.cancelConfirm")}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2 border-t border-char-900/10 pt-4">
          {pickup?.arrival_status === "arrived" && (
            <Button variant="secondary" loading={acknowledge.isPending} disabled={busy} onClick={() => acknowledge.mutate(order.id)}>
              <BellRing className="size-4" aria-hidden />
              {t("admin.orders.acknowledge")}
            </Button>
          )}
          {next && (
            <Button loading={transition.isPending} disabled={busy} onClick={() => transition.mutate({ id: order.id, to: next })}>
              {t(`admin.orders.advance.${next}`)}
            </Button>
          )}
          {order.status !== "completed" && order.status !== "cancelled" && (
            <Button variant="ghost" disabled={busy} onClick={() => setCancelling(true)}>
              {t("admin.orders.cancel")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminOrders() {
  const { t, lang, pick } = useLang();
  const [params] = useSearchParams();
  const branches = useAdminBranches();
  const [filters, setFilters] = useState<OrderFilters>({
    branch: "",
    status: params.get("status") ?? "active",
    range: "today",
    search: "",
    page: 0,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const set = (patch: Partial<OrderFilters>) => setFilters((f) => ({ ...f, page: 0, ...patch }));

  const orders = useQuery({
    queryKey: ["admin", "orders", filters],
    queryFn: () => fetchOrders(filters),
    placeholderData: keepPreviousData,
  });
  useRealtimeInvalidate(["orders", "pickup_details", "order_status_history"], [["admin", "orders"]]);
  const { transition } = useOrderActions();
  const selected = orders.data?.rows.find((o) => o.id === selectedId) ?? null;

  const statusOptions = [
    { value: "active", label: t("admin.orders.live") },
    { value: "", label: t("admin.common.all") },
    ...(["pending", "confirmed", "preparing", "ready", "completed", "cancelled"] as const).map((s) => ({ value: s, label: t(`status.order.${s}`) })),
  ];

  return (
    <AdminPage
      title={t("admin.orders.title")}
      actions={
        <Button variant="ghost" size="sm" onClick={() => orders.refetch()} aria-label={t("admin.common.refresh")}>
          <RefreshCw className={orders.isFetching ? "size-4 animate-spin" : "size-4"} aria-hidden />
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={filters.search} onChange={(search) => set({ search })} placeholder={t("admin.orders.searchPlaceholder")} />
        <SelectFilter label={t("admin.common.status")} value={filters.status} onChange={(status) => set({ status })} options={statusOptions} />
        <SelectFilter
          label={t("admin.common.branch")}
          value={filters.branch}
          onChange={(branch) => set({ branch })}
          options={[{ value: "", label: t("admin.common.allBranches") }, ...(branches.data ?? []).map((b) => ({ value: b.id, label: pick(b, "name") }))]}
        />
        <SelectFilter
          label={t("admin.orders.placed")}
          value={filters.range}
          onChange={(range) => set({ range: range as OrderFilters["range"] })}
          options={(["today", "week", "all"] as const).map((r) => ({ value: r, label: t(`admin.orders.range.${r}`) }))}
        />
      </div>

      {orders.isError ? (
        <ErrorState onRetry={() => orders.refetch()} />
      ) : orders.isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <DataTable
            rows={orders.data.rows}
            rowKey={(o) => o.id}
            empty={t("admin.orders.none")}
            onRowClick={(o) => setSelectedId(o.id)}
            columns={[
              {
                header: t("admin.orders.number"),
                cell: (o) => (
                  <span className="font-bold" dir="ltr">
                    {o.order_number}
                  </span>
                ),
              },
              { header: t("admin.common.status"), cell: (o) => <StatusBadge kind="order" value={o.status} /> },
              {
                header: t("admin.orders.arrival"),
                cell: (o) =>
                  o.pickup_details && o.pickup_details.arrival_status !== "not_arrived" ? (
                    <span className="inline-flex items-center gap-1">
                      <CarFront className="size-4" aria-hidden />
                      <StatusBadge kind="arrival" value={o.pickup_details.arrival_status} />
                    </span>
                  ) : (
                    "—"
                  ),
              },
              { header: t("admin.orders.customer"), cell: (o) => o.customer_name ?? "—", mobileHidden: true },
              { header: t("admin.orders.vehicle"), cell: (o) => <span dir="ltr">{o.pickup_details?.vehicle_plate ?? "—"}</span>, mobileHidden: true },
              { header: t("admin.common.branch"), cell: (o) => (o.branches ? pick(o.branches, "name") : "—"), mobileHidden: true },
              { header: t("admin.orders.placed"), cell: (o) => formatDateTime(o.created_at, lang) },
              { header: t("admin.common.total"), cell: (o) => <Price value={o.total} className="font-semibold" /> },
              {
                header: t("admin.common.actions"),
                cell: (o) => {
                  const next = NEXT_STATUS[o.status];
                  return next ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={transition.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        transition.mutate({ id: o.id, to: next });
                      }}
                    >
                      {t(`admin.orders.advance.${next}`)}
                    </Button>
                  ) : null;
                },
              },
            ]}
          />
          <Pager page={filters.page} pageSize={PAGE_SIZE} total={orders.data.count} onPage={(page) => setFilters((f) => ({ ...f, page }))} />
        </>
      )}

      <Modal open={!!selected} onClose={() => setSelectedId(null)} title={selected ? `${t("admin.orders.number")} ${selected.order_number}` : ""} wide>
        {selected && <OrderDetail order={selected} onClose={() => setSelectedId(null)} />}
      </Modal>
    </AdminPage>
  );
}

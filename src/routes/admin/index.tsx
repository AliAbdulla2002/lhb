import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { PackageX } from "lucide-react";
import { useLang } from "~/i18n";
import { getSupabase } from "~/lib/supabase";
import { must } from "~/lib/errors";
import { AdminPage, Panel, SelectFilter, Stat, StatusBadge } from "~/features/admin/ui";
import { useAdminBranches, useRealtimeInvalidate } from "~/features/admin/hooks";
import { ErrorState, Skeleton } from "~/ui/Feedback";
import { Price } from "~/ui/Price";

interface Dashboard {
  orders_today: number;
  by_status: Record<string, number>;
  sales_today: number;
  open_value: number;
  active_orders: number;
  waiting_pickup: number;
  best_sellers: { product_id: string | null; name_ar: string; name_en: string; quantity: number }[];
  inventory_tracking: boolean;
}

const STATUSES = ["pending", "confirmed", "preparing", "ready", "completed", "cancelled"];

export default function AdminOverview() {
  const { t, pick } = useLang();
  const branches = useAdminBranches();
  const [branch, setBranch] = useState("");
  const key = ["admin", "dashboard", branch];
  const dashboard = useQuery({
    queryKey: key,
    queryFn: async () => must(await getSupabase()!.rpc("admin_dashboard", { p_branch: branch || null })) as Dashboard,
    refetchInterval: 60_000,
  });
  useRealtimeInvalidate(["orders", "pickup_details"], [["admin", "dashboard"]]);

  return (
    <AdminPage
      title={t("admin.overview.title")}
      actions={
        <SelectFilter
          label={t("admin.common.branch")}
          value={branch}
          onChange={setBranch}
          options={[{ value: "", label: t("admin.common.allBranches") }, ...(branches.data ?? []).map((b) => ({ value: b.id, label: pick(b, "name") }))]}
        />
      }
    >
      {dashboard.isError ? (
        <ErrorState onRetry={() => dashboard.refetch()} />
      ) : dashboard.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t("admin.overview.ordersToday")} value={dashboard.data.orders_today} />
            <Link to="/admin/orders?status=active" className="block rounded-2xl focus-visible:outline-2">
              <Stat label={t("admin.overview.activeOrders")} value={dashboard.data.active_orders} hint={undefined} />
            </Link>
            <Stat
              label={t("admin.overview.waitingPickup")}
              value={dashboard.data.waiting_pickup}
              tone={dashboard.data.waiting_pickup > 0 ? "alert" : "default"}
            />
            <Stat label={t("admin.overview.salesToday")} value={<Price value={dashboard.data.sales_today} />} hint={t("admin.overview.salesNote")} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={t("admin.overview.byStatus")}>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {STATUSES.map((s) => (
                  <li key={s} className="flex items-center justify-between gap-2 rounded-xl bg-cream-100 px-3 py-2">
                    <StatusBadge kind="order" value={s} />
                    <span className="text-lg font-bold tabular-nums">{dashboard.data.by_status[s] ?? 0}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-char-700">
                {t("admin.overview.openValue")}: <Price value={dashboard.data.open_value} className="font-semibold" />
              </p>
            </Panel>

            <Panel title={t("admin.overview.bestSellers")}>
              <p className="-mt-2 mb-3 text-xs text-char-700/70">{t("admin.overview.bestSellersNote")}</p>
              {dashboard.data.best_sellers.length === 0 ? (
                <p className="text-sm text-char-700">{t("admin.common.empty")}</p>
              ) : (
                <ol className="space-y-2">
                  {dashboard.data.best_sellers.map((b, i) => (
                    <li key={b.product_id ?? i} className="flex items-center justify-between gap-3 text-sm">
                      <span>
                        <span className="me-2 font-bold text-ember-600">{i + 1}.</span>
                        {pick(b, "name")}
                      </span>
                      <span className="font-semibold tabular-nums">× {b.quantity}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          </div>

          {!dashboard.data.inventory_tracking && (
            <p className="flex items-center gap-2 text-sm text-char-700">
              <PackageX className="size-4" aria-hidden />
              {t("admin.overview.inventoryOff")}
            </p>
          )}
        </>
      )}
    </AdminPage>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLang } from "~/i18n";
import { errorMessage, must } from "~/lib/errors";
import { getSupabase } from "~/lib/supabase";
import { useAdminBranches } from "~/features/admin/hooks";
import { AdminPage, DataTable, Panel, SelectFilter, Stat } from "~/features/admin/ui";
import { ErrorState, Skeleton } from "~/ui/Feedback";
import { InputField } from "~/ui/Field";
import { Price } from "~/ui/Price";

interface Report {
  totals: { orders: number; completed: number; cancelled: number; revenue: number; discounts: number };
  daily: { day: string; orders: number; revenue: number }[];
  top_products: { product_id: string | null; name_ar: string; name_en: string; quantity: number; revenue: number }[];
}

/** Bahrain calendar date `daysAgo` days before today, as YYYY-MM-DD. */
const bahrainDate = (daysAgo: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bahrain" }).format(Date.now() - daysAgo * 86_400_000);

export default function AdminReports() {
  const { t, pick } = useLang();
  const branches = useAdminBranches();
  const [from, setFrom] = useState(bahrainDate(6));
  const [to, setTo] = useState(bahrainDate(0));
  const [branch, setBranch] = useState("");
  const report = useQuery({
    queryKey: ["admin", "report", from, to, branch],
    queryFn: async () => must(await getSupabase()!.rpc("admin_sales_report", { p_from: from, p_to: to, p_branch: branch || null })) as Report,
    enabled: !!from && !!to && from <= to,
  });
  const maxRevenue = Math.max(1, ...(report.data?.daily.map((d) => Number(d.revenue)) ?? [1]));

  return (
    <AdminPage title={t("admin.reports.title")}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <InputField label={t("admin.reports.from")} type="date" dir="ltr" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="w-44">
          <InputField label={t("admin.reports.to")} type="date" dir="ltr" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </div>
        <SelectFilter
          label={t("admin.common.branch")}
          value={branch}
          onChange={setBranch}
          options={[{ value: "", label: t("admin.common.allBranches") }, ...(branches.data ?? []).map((b) => ({ value: b.id, label: pick(b, "name") }))]}
        />
      </div>

      {report.isError ? (
        <ErrorState message={errorMessage(report.error, t)} onRetry={() => report.refetch()} />
      ) : report.isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t("admin.reports.revenue")} value={<Price value={report.data.totals.revenue} />} hint={t("admin.reports.revenueNote")} />
            <Stat label={t("admin.reports.orders")} value={report.data.totals.orders} />
            <Stat label={t("admin.reports.completed")} value={report.data.totals.completed} />
            <Stat label={t("admin.reports.cancelled")} value={report.data.totals.cancelled} />
          </div>
          <p className="text-sm text-char-700">
            {t("admin.reports.discounts")}: <Price value={report.data.totals.discounts} />
          </p>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={t("admin.reports.daily")}>
              <ul className="space-y-1.5">
                {report.data.daily.map((d) => (
                  <li key={d.day} className="grid grid-cols-[6.5rem_1fr_5.5rem] items-center gap-2 text-sm">
                    <span className="tabular-nums text-char-700" dir="ltr">
                      {d.day}
                    </span>
                    {/* Simple bar for scanning; exact values are in the next column. */}
                    <span className="h-3 overflow-hidden rounded-full bg-cream-200" aria-hidden>
                      <span className="block h-full rounded-full bg-ember-500" style={{ width: `${(Number(d.revenue) / maxRevenue) * 100}%` }} />
                    </span>
                    <span className="text-end">
                      <Price value={d.revenue} />
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title={t("admin.reports.top")}>
              <DataTable
                rows={report.data.top_products}
                rowKey={(p) => p.product_id ?? p.name_en}
                empty={t("admin.common.empty")}
                columns={[
                  { header: t("admin.common.nameEn"), cell: (p) => pick(p, "name") },
                  { header: t("admin.reports.quantity"), cell: (p) => p.quantity },
                  { header: t("admin.reports.revenue"), cell: (p) => <Price value={p.revenue} /> },
                ]}
              />
            </Panel>
          </div>
        </>
      )}
    </AdminPage>
  );
}

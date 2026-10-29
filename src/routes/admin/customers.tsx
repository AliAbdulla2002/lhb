import { useDeferredValue, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { useLang } from "~/i18n";
import { errorMessage, must } from "~/lib/errors";
import { getSupabase } from "~/lib/supabase";
import { formatDateTime } from "~/lib/time";
import { AdminPage, DataTable, Pager, SearchInput } from "~/features/admin/ui";
import { ErrorState, Skeleton } from "~/ui/Feedback";
import { Price } from "~/ui/Price";

interface CustomerRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  orders_count: number;
  completed_total: number;
  last_order_at: string | null;
  total_count: number;
}

const PAGE = 25;

export default function AdminCustomers() {
  const { t, lang } = useLang();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const deferred = useDeferredValue(search);
  const customers = useQuery({
    queryKey: ["admin", "customers", deferred, page],
    queryFn: async () =>
      must(await getSupabase()!.rpc("admin_list_customers", { p_search: deferred || null, p_limit: PAGE, p_offset: page * PAGE })) as CustomerRow[],
    placeholderData: keepPreviousData,
  });

  return (
    <AdminPage title={t("admin.customers.title")}>
      <p className="flex items-center gap-2 text-sm text-char-700">
        <ShieldCheck className="size-4 text-emerald-700" aria-hidden />
        {t("admin.customers.privacyNote")}
      </p>
      <SearchInput
        value={search}
        onChange={(v) => {
          setSearch(v);
          setPage(0);
        }}
        placeholder={t("admin.customers.searchPlaceholder")}
      />
      {customers.isError ? (
        <ErrorState message={errorMessage(customers.error, t)} onRetry={() => customers.refetch()} />
      ) : customers.isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <DataTable
            rows={customers.data}
            rowKey={(c) => c.id}
            empty={t("admin.customers.none")}
            columns={[
              { header: t("admin.customers.name"), cell: (c) => <span className="font-semibold">{c.full_name ?? "—"}</span> },
              { header: t("admin.customers.email"), cell: (c) => <span dir="ltr">{c.email ?? "—"}</span> },
              { header: t("admin.customers.phone"), cell: (c) => <span dir="ltr">{c.phone ?? "—"}</span> },
              { header: t("admin.customers.orders"), cell: (c) => c.orders_count },
              { header: t("admin.customers.spent"), cell: (c) => <Price value={c.completed_total} />, mobileHidden: true },
              { header: t("admin.customers.lastOrder"), cell: (c) => (c.last_order_at ? formatDateTime(c.last_order_at, lang) : "—"), mobileHidden: true },
              { header: t("admin.customers.joined"), cell: (c) => formatDateTime(c.created_at, lang), mobileHidden: true },
            ]}
          />
          <Pager page={page} pageSize={PAGE} total={customers.data[0]?.total_count ?? 0} onPage={setPage} />
        </>
      )}
    </AdminPage>
  );
}

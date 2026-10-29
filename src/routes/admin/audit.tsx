import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLang } from "~/i18n";
import { errorMessage } from "~/lib/errors";
import { getSupabase } from "~/lib/supabase";
import { formatDateTime } from "~/lib/time";
import { AdminPage, DataTable, Pager, SelectFilter } from "~/features/admin/ui";
import { changedFields } from "~/features/admin/audit";
import { ErrorState, Skeleton } from "~/ui/Feedback";

interface AuditRow {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

const PAGE = 50;
const ENTITIES = [
  "orders", "products", "categories", "product_options", "product_option_values", "product_images", "promotions",
  "coupons", "branches", "business_hours", "restaurant_settings", "site_content", "user_roles", "staff_branch_assignments",
];

export default function AdminAudit() {
  const { t, lang } = useLang();
  const [entity, setEntity] = useState("");
  const [page, setPage] = useState(0);
  const audit = useQuery({
    queryKey: ["admin", "audit", entity, page],
    queryFn: async () => {
      let q = getSupabase()!.from("audit_logs").select("*", { count: "exact" }).order("created_at", { ascending: false });
      if (entity) q = q.eq("entity_type", entity);
      const { data, error, count } = await q.range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw error;
      return { rows: data as AuditRow[], count: count ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
  // Resolve actor ids to names where the caller may read profiles (managers can).
  const actorIds = [...new Set((audit.data?.rows ?? []).map((r) => r.actor_id).filter(Boolean))] as string[];
  const actors = useQuery({
    queryKey: ["admin", "audit-actors", actorIds],
    queryFn: async () => {
      const { data } = await getSupabase()!.from("profiles").select("id, full_name").in("id", actorIds);
      return new Map((data ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]));
    },
    enabled: actorIds.length > 0,
  });

  return (
    <AdminPage title={t("admin.audit.title")}>
      <SelectFilter
        label={t("admin.audit.entity")}
        value={entity}
        onChange={(v) => {
          setEntity(v);
          setPage(0);
        }}
        options={[{ value: "", label: t("admin.common.all") }, ...ENTITIES.map((e) => ({ value: e, label: e }))]}
      />
      {audit.isError ? (
        <ErrorState message={errorMessage(audit.error, t)} onRetry={() => audit.refetch()} />
      ) : audit.isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <DataTable
            rows={audit.data.rows}
            rowKey={(r) => String(r.id)}
            empty={t("admin.audit.none")}
            columns={[
              { header: t("admin.audit.when"), cell: (r) => formatDateTime(r.created_at, lang) },
              {
                header: t("admin.audit.actor"),
                cell: (r) => (r.actor_id ? (actors.data?.get(r.actor_id) ?? <span dir="ltr">{r.actor_id.slice(0, 8)}</span>) : t("admin.audit.system")),
              },
              { header: t("admin.audit.action"), cell: (r) => <span className="font-mono text-xs" dir="ltr">{r.action}</span> },
              {
                header: t("admin.audit.entity"),
                cell: (r) => (
                  <span className="font-mono text-xs" dir="ltr">
                    {r.entity_type}
                    {r.entity_id && ` · ${r.entity_id.slice(0, 8)}`}
                  </span>
                ),
              },
              {
                header: t("admin.audit.changes"),
                mobileHidden: true,
                cell: (r) => <span className="font-mono text-xs text-char-700" dir="ltr">{changedFields(r).join(", ") || "—"}</span>,
              },
            ]}
          />
          <Pager page={page} pageSize={PAGE} total={audit.data.count} onPage={setPage} />
        </>
      )}
    </AdminPage>
  );
}

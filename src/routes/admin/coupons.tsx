import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useLang } from "~/i18n";
import { errorMessage, must } from "~/lib/errors";
import { getSupabase } from "~/lib/supabase";
import { formatDateTime, fromBahrainInput, toBahrainInput } from "~/lib/time";
import { AdminPage, DataTable, Modal, Pill, Toggle } from "~/features/admin/ui";
import { promotionState } from "~/features/admin/schedule";
import { Button } from "~/ui/Button";
import { ErrorState, Skeleton } from "~/ui/Feedback";
import { InputField, SelectField } from "~/ui/Field";
import { Price } from "~/ui/Price";
import { useToast } from "~/ui/Toast";

interface Coupon {
  id?: string;
  code: string;
  discount_type: "percent" | "fixed";
  value: number;
  min_subtotal: number;
  max_discount: number | null;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  per_user_limit: number | null;
  is_active: boolean;
  coupon_redemptions?: { count: number }[];
}

const money = /^\d{1,3}(\.\d{1,3})?$/;

function CouponForm({ initial, onSaved }: { initial: Coupon; onSaved: () => void }) {
  const { t } = useLang();
  const toast = useToast();
  const [d, setD] = useState(initial);
  const [value, setValue] = useState(initial.id ? String(initial.value) : "");
  const [min, setMin] = useState(Number(initial.min_subtotal).toFixed(3));
  const [max, setMax] = useState(initial.max_discount == null ? "" : String(initial.max_discount));
  const [starts, setStarts] = useState(toBahrainInput(initial.starts_at));
  const [ends, setEnds] = useState(toBahrainInput(initial.ends_at));
  const [saving, setSaving] = useState(false);

  const codeOk = /^[A-Za-z0-9_-]{3,32}$/.test(d.code);
  const valueOk = money.test(value) && Number(value) > 0 && (d.discount_type === "fixed" || Number(value) <= 100);
  const valid = codeOk && valueOk && money.test(min) && (!max || money.test(max));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const row = {
      code: d.code.toUpperCase(),
      discount_type: d.discount_type,
      value: Number(value),
      min_subtotal: Number(min),
      max_discount: max ? Number(max) : null,
      starts_at: fromBahrainInput(starts),
      ends_at: fromBahrainInput(ends),
      usage_limit: d.usage_limit || null,
      per_user_limit: d.per_user_limit || null,
      is_active: d.is_active,
    };
    try {
      const sb = getSupabase()!;
      if (d.id) must(await sb.from("coupons").update(row).eq("id", d.id).select("id").single());
      else must(await sb.from("coupons").insert(row).select("id").single());
      toast(t("admin.common.saved"));
      onSaved();
    } catch (err) {
      toast(errorMessage(err, t), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField
          label={t("admin.coupons.code")}
          dir="ltr"
          className="uppercase"
          hint={t("admin.coupons.codeHint")}
          error={d.code && !codeOk ? t("admin.coupons.codeHint") : undefined}
          value={d.code}
          onChange={(e) => setD({ ...d, code: e.target.value.trim() })}
        />
        <SelectField label={t("admin.coupons.type")} value={d.discount_type} onChange={(e) => setD({ ...d, discount_type: e.target.value as Coupon["discount_type"] })}>
          <option value="percent">{t("admin.coupons.percent")}</option>
          <option value="fixed">{t("admin.coupons.fixed")}</option>
        </SelectField>
        <InputField
          label={`${t("admin.coupons.value")} ${d.discount_type === "percent" ? "(%)" : "(BHD)"}`}
          dir="ltr"
          inputMode="decimal"
          error={value && !valueOk ? t("errors.invalid_request") : undefined}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <InputField label={t("admin.coupons.minSubtotal")} dir="ltr" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} />
        <InputField label={t("admin.coupons.maxDiscount")} dir="ltr" inputMode="decimal" hint={t("admin.common.optional")} value={max} onChange={(e) => setMax(e.target.value)} />
        <div />
        <InputField
          label={t("admin.coupons.usageLimit")}
          type="number"
          min={1}
          hint={t("admin.coupons.unlimited")}
          value={d.usage_limit ?? ""}
          onChange={(e) => setD({ ...d, usage_limit: e.target.value ? Number(e.target.value) : null })}
        />
        <InputField
          label={t("admin.coupons.perUserLimit")}
          type="number"
          min={1}
          hint={t("admin.coupons.unlimited")}
          value={d.per_user_limit ?? ""}
          onChange={(e) => setD({ ...d, per_user_limit: e.target.value ? Number(e.target.value) : null })}
        />
        <InputField label={t("admin.promotions.startsAt")} type="datetime-local" dir="ltr" value={starts} onChange={(e) => setStarts(e.target.value)} />
        <InputField label={t("admin.promotions.endsAt")} type="datetime-local" dir="ltr" value={ends} onChange={(e) => setEnds(e.target.value)} />
      </div>
      <Toggle checked={d.is_active} onChange={(v) => setD({ ...d, is_active: v })} label={t("admin.common.active")} />
      <div className="flex justify-end">
        <Button type="submit" loading={saving} disabled={!valid}>
          {t("admin.common.save")}
        </Button>
      </div>
    </form>
  );
}

export default function AdminCoupons() {
  const { t, lang } = useLang();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Coupon | null>(null);
  const coupons = useQuery({
    queryKey: ["admin", "coupons"],
    queryFn: async () => must(await getSupabase()!.from("coupons").select("*, coupon_redemptions(count)").order("created_at", { ascending: false })) as Coupon[],
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["admin", "coupons"] });
  const toggle = useMutation({
    mutationFn: async (c: Coupon) => must(await getSupabase()!.from("coupons").update({ is_active: !c.is_active }).eq("id", c.id!).select("id").single()),
    onSuccess: refresh,
    onError: (e) => toast(errorMessage(e, t), "error"),
  });
  const blank: Coupon = {
    code: "", discount_type: "percent", value: 0, min_subtotal: 0, max_discount: null, starts_at: null, ends_at: null,
    usage_limit: null, per_user_limit: 1, is_active: true,
  };

  return (
    <AdminPage
      title={t("admin.coupons.title")}
      actions={
        <Button size="sm" onClick={() => setEditing(blank)}>
          <Plus className="size-4" aria-hidden />
          {t("admin.coupons.new")}
        </Button>
      }
    >
      {coupons.isError ? (
        <ErrorState onRetry={() => coupons.refetch()} />
      ) : coupons.isPending ? (
        <Skeleton className="h-48" />
      ) : (
        <DataTable
          rows={coupons.data}
          rowKey={(c) => c.id!}
          empty={t("admin.coupons.none")}
          onRowClick={(c) => setEditing(c)}
          columns={[
            { header: t("admin.coupons.code"), cell: (c) => <span className="font-mono font-bold" dir="ltr">{c.code}</span> },
            {
              header: t("admin.coupons.value"),
              cell: (c) => (c.discount_type === "percent" ? <span dir="ltr">{Number(c.value)}%</span> : <Price value={c.value} />),
            },
            {
              header: t("admin.common.status"),
              cell: (c) => {
                const s = promotionState({ is_active: c.is_active, starts_at: c.starts_at ?? new Date(0).toISOString(), ends_at: c.ends_at });
                return <Pill tone={s === "live" ? "good" : "muted"}>{t(`admin.promotions.state.${s}`)}</Pill>;
              },
            },
            {
              header: t("admin.coupons.usageLimit"),
              cell: (c) => `${t("admin.coupons.used", { count: c.coupon_redemptions?.[0]?.count ?? 0 })}${c.usage_limit ? ` / ${c.usage_limit}` : ""}`,
              mobileHidden: true,
            },
            { header: t("admin.promotions.endsAt"), cell: (c) => (c.ends_at ? formatDateTime(c.ends_at, lang) : "—"), mobileHidden: true },
            {
              header: t("admin.common.active"),
              cell: (c) => (
                <span onClick={(e) => e.stopPropagation()}>
                  <Toggle checked={c.is_active} disabled={toggle.isPending} onChange={() => toggle.mutate(c)} label={c.is_active ? t("admin.common.active") : t("admin.common.inactive")} />
                </span>
              ),
            },
          ]}
        />
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? t("admin.common.edit") : t("admin.coupons.new")} wide>
        {editing && (
          <CouponForm
            key={editing.id ?? "new"}
            initial={editing}
            onSaved={() => {
              setEditing(null);
              refresh();
            }}
          />
        )}
      </Modal>
    </AdminPage>
  );
}

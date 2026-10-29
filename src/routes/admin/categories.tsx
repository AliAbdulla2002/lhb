import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useLang } from "~/i18n";
import { errorMessage, must } from "~/lib/errors";
import { getSupabase } from "~/lib/supabase";
import { fetchAdminCategories, moved, reorder, slugify, type AdminCategory } from "~/features/admin/menu-admin";
import { AdminPage, DataTable, Modal, MoveButtons, Pill, Toggle } from "~/features/admin/ui";
import { Button } from "~/ui/Button";
import { ErrorState, Skeleton } from "~/ui/Feedback";
import { InputField, TextareaField } from "~/ui/Field";
import { useToast } from "~/ui/Toast";

type Draft = Pick<AdminCategory, "slug" | "name_ar" | "name_en" | "description_ar" | "description_en" | "is_visible"> & { id?: string };
const blank: Draft = { slug: "", name_ar: "", name_en: "", description_ar: "", description_en: "", is_visible: true };

function CategoryForm({ initial, onSaved }: { initial: Draft; onSaved: () => void }) {
  const { t } = useLang();
  const toast = useToast();
  const [d, setD] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  const slugOk = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.slug);
  const valid = d.name_ar.trim() && d.name_en.trim() && slugOk;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const row = {
      slug: d.slug,
      name_ar: d.name_ar.trim(),
      name_en: d.name_en.trim(),
      description_ar: d.description_ar?.trim() || null,
      description_en: d.description_en?.trim() || null,
      is_visible: d.is_visible,
    };
    try {
      const sb = getSupabase()!;
      if (d.id) must(await sb.from("categories").update(row).eq("id", d.id).select("id").single());
      else must(await sb.from("categories").insert(row).select("id").single());
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
        <InputField label={t("admin.common.nameAr")} dir="rtl" value={d.name_ar} onChange={(e) => setD({ ...d, name_ar: e.target.value })} required />
        <InputField
          label={t("admin.common.nameEn")}
          dir="ltr"
          value={d.name_en}
          onChange={(e) => setD({ ...d, name_en: e.target.value })}
          onBlur={() => !d.slug && setD((x) => ({ ...x, slug: slugify(x.name_en) }))}
          required
        />
      </div>
      <InputField
        label={t("admin.common.slug")}
        dir="ltr"
        hint={t("admin.common.slugHint")}
        error={d.slug && !slugOk ? t("admin.common.slugHint") : undefined}
        value={d.slug}
        onChange={(e) => setD({ ...d, slug: e.target.value })}
      />
      <TextareaField label={t("admin.common.descriptionAr")} dir="rtl" maxLength={300} value={d.description_ar ?? ""} onChange={(e) => setD({ ...d, description_ar: e.target.value })} />
      <TextareaField label={t("admin.common.descriptionEn")} dir="ltr" maxLength={300} value={d.description_en ?? ""} onChange={(e) => setD({ ...d, description_en: e.target.value })} />
      <Toggle checked={d.is_visible} onChange={(v) => setD({ ...d, is_visible: v })} label={t("admin.common.visible")} />
      <div className="flex justify-end">
        <Button type="submit" loading={saving} disabled={!valid}>
          {t("admin.common.save")}
        </Button>
      </div>
    </form>
  );
}

export default function AdminCategories() {
  const { t, pick } = useLang();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Draft | null>(null);
  const categories = useQuery({ queryKey: ["admin", "categories"], queryFn: fetchAdminCategories });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
    void queryClient.invalidateQueries({ queryKey: ["categories"] });
  };
  const patch = useMutation({
    mutationFn: async ({ id, change }: { id: string; change: Partial<AdminCategory> }) =>
      must(await getSupabase()!.from("categories").update(change).eq("id", id).select("id").single()),
    onSuccess: refresh,
    onError: (e) => toast(errorMessage(e, t), "error"),
  });
  const order = useMutation({ mutationFn: (ids: string[]) => reorder("categories", ids), onSuccess: refresh, onError: (e) => toast(errorMessage(e, t), "error") });
  const rows = categories.data ?? [];

  return (
    <AdminPage
      title={t("admin.categories.title")}
      actions={
        <Button size="sm" onClick={() => setEditing(blank)}>
          <Plus className="size-4" aria-hidden />
          {t("admin.categories.new")}
        </Button>
      }
    >
      {categories.isError ? (
        <ErrorState onRetry={() => categories.refetch()} />
      ) : categories.isPending ? (
        <Skeleton className="h-48" />
      ) : (
        <DataTable
          rows={rows}
          rowKey={(c) => c.id}
          empty={t("admin.categories.none")}
          onRowClick={(c) => setEditing(c)}
          columns={[
            {
              header: t("admin.common.nameEn"),
              cell: (c) => (
                <span className="font-semibold">
                  {pick(c, "name")}
                  {c.archived_at && (
                    <span className="ms-2">
                      <Pill tone="muted">{t("admin.common.archived")}</Pill>
                    </span>
                  )}
                </span>
              ),
            },
            { header: t("admin.nav.products"), cell: (c) => t("admin.categories.products", { count: c.products[0]?.count ?? 0 }) },
            {
              header: t("admin.common.visible"),
              cell: (c) => (
                <span onClick={(e) => e.stopPropagation()}>
                  <Toggle
                    checked={c.is_visible}
                    disabled={patch.isPending}
                    onChange={(v) => patch.mutate({ id: c.id, change: { is_visible: v } })}
                    label={c.is_visible ? t("admin.common.visible") : t("admin.common.hidden")}
                  />
                </span>
              ),
            },
            {
              header: t("admin.common.actions"),
              cell: (c) => {
                const i = rows.indexOf(c);
                return (
                  <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <MoveButtons
                      first={i === 0}
                      last={i === rows.length - 1}
                      onUp={() => order.mutate(moved(rows, i, -1).map((r) => r.id))}
                      onDown={() => order.mutate(moved(rows, i, 1).map((r) => r.id))}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => patch.mutate({ id: c.id, change: { archived_at: c.archived_at ? null : new Date().toISOString() } })}
                    >
                      {c.archived_at ? t("admin.common.restore") : t("admin.common.archive")}
                    </Button>
                  </span>
                );
              },
            },
          ]}
        />
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? t("admin.common.edit") : t("admin.categories.new")}>
        {editing && (
          <CategoryForm
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

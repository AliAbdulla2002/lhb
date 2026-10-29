import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageOff, Plus } from "lucide-react";
import { useLang } from "~/i18n";
import { errorMessage } from "~/lib/errors";
import { mediaUrl } from "~/lib/supabase";
import { fetchAdminCategories, fetchAdminProducts, moved, reorder, updateProduct, type AdminProduct } from "~/features/admin/menu-admin";
import { AdminPage, DataTable, MoveButtons, Pill, SearchInput, SelectFilter, Toggle } from "~/features/admin/ui";
import { useRealtimeInvalidate } from "~/features/admin/hooks";
import { ButtonLink } from "~/ui/Button";
import { ErrorState, Skeleton } from "~/ui/Feedback";
import { Price } from "~/ui/Price";
import { useToast } from "~/ui/Toast";

export default function AdminProducts() {
  const { t, pick } = useLang();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const categories = useQuery({ queryKey: ["admin", "categories"], queryFn: fetchAdminCategories });
  const products = useQuery({ queryKey: ["admin", "products"], queryFn: fetchAdminProducts });
  useRealtimeInvalidate(["products"], [["admin", "products"]]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    // Public menu caches too, so the change shows immediately on the site in this browser.
    void queryClient.invalidateQueries({ queryKey: ["products"] });
  };
  const patch = useMutation({
    mutationFn: ({ id, change }: { id: string; change: Partial<AdminProduct> }) => updateProduct(id, change),
    onSuccess: () => {
      invalidate();
      toast(t("admin.common.saved"));
    },
    onError: (e) => toast(errorMessage(e, t), "error"),
  });
  const order = useMutation({
    mutationFn: (ids: string[]) => reorder("products", ids),
    onSuccess: invalidate,
    onError: (e) => toast(errorMessage(e, t), "error"),
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products.data ?? []).filter(
      (p) =>
        (showArchived || !p.archived_at) &&
        (!category || p.category_id === category) &&
        (!q || p.name_ar.toLowerCase().includes(q) || p.name_en.toLowerCase().includes(q) || p.slug.includes(q)),
    );
  }, [products.data, search, category, showArchived]);

  const categoryName = (id: string) => {
    const c = categories.data?.find((x) => x.id === id);
    return c ? pick(c, "name") : "—";
  };
  const canReorder = !!category && !search;

  return (
    <AdminPage
      title={t("admin.products.title")}
      actions={
        <ButtonLink to="/admin/products/new" size="sm">
          <Plus className="size-4" aria-hidden />
          {t("admin.products.new")}
        </ButtonLink>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} />
        <SelectFilter
          label={t("admin.products.category")}
          value={category}
          onChange={setCategory}
          options={[{ value: "", label: t("admin.common.all") }, ...(categories.data ?? []).map((c) => ({ value: c.id, label: pick(c, "name") }))]}
        />
        <Toggle checked={showArchived} onChange={setShowArchived} label={t("admin.products.showArchived")} />
      </div>

      {products.isError || categories.isError ? (
        <ErrorState onRetry={() => void products.refetch()} />
      ) : products.isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <DataTable
          rows={rows}
          rowKey={(p) => p.id}
          empty={t("admin.products.none")}
          onRowClick={(p) => navigate(`/admin/products/${p.id}`)}
          columns={[
            {
              header: "",
              mobileHidden: true,
              className: "w-16",
              cell: (p) => {
                const img = p.product_images.find((i) => i.is_primary) ?? p.product_images[0];
                const src = mediaUrl(img?.storage_path);
                return src ? (
                  <img src={src} alt="" className="size-12 rounded-lg object-cover" loading="lazy" />
                ) : (
                  <span className="grid size-12 place-items-center rounded-lg bg-cream-200 text-char-700/50">
                    <ImageOff className="size-4" aria-hidden />
                  </span>
                );
              },
            },
            {
              header: t("admin.common.nameEn"),
              cell: (p) => (
                <Link to={`/admin/products/${p.id}`} className="font-semibold hover:text-ember-600" onClick={(e) => e.stopPropagation()}>
                  {pick(p, "name")}
                  {p.archived_at && (
                    <span className="ms-2">
                      <Pill tone="muted">{t("admin.common.archived")}</Pill>
                    </span>
                  )}
                </Link>
              ),
            },
            { header: t("admin.products.category"), cell: (p) => categoryName(p.category_id), mobileHidden: true },
            { header: t("admin.products.price"), cell: (p) => <Price value={p.base_price} /> },
            {
              header: t("admin.products.available"),
              cell: (p) => (
                <span onClick={(e) => e.stopPropagation()}>
                  <Toggle
                    checked={p.is_available}
                    disabled={patch.isPending || !!p.archived_at}
                    onChange={(v) => patch.mutate({ id: p.id, change: { is_available: v } })}
                    label={p.is_available ? t("admin.products.available") : t("admin.products.unavailable")}
                  />
                </span>
              ),
            },
            {
              header: t("admin.products.featured"),
              mobileHidden: true,
              cell: (p) => (
                <span onClick={(e) => e.stopPropagation()}>
                  <Toggle
                    checked={p.is_featured}
                    disabled={patch.isPending}
                    onChange={(v) => patch.mutate({ id: p.id, change: { is_featured: v } })}
                    label={p.is_featured ? t("admin.common.yes") : t("admin.common.no")}
                  />
                </span>
              ),
            },
            ...(canReorder
              ? [
                  {
                    header: t("admin.common.actions"),
                    cell: (p: AdminProduct) => {
                      const i = rows.indexOf(p);
                      return (
                        <span onClick={(e) => e.stopPropagation()}>
                          <MoveButtons
                            first={i === 0}
                            last={i === rows.length - 1}
                            onUp={() => order.mutate(moved(rows, i, -1).map((r) => r.id))}
                            onDown={() => order.mutate(moved(rows, i, 1).map((r) => r.id))}
                          />
                        </span>
                      );
                    },
                  },
                ]
              : []),
          ]}
        />
      )}
    </AdminPage>
  );
}

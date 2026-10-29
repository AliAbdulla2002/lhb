import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ImagePlus, Plus, Star, Trash2 } from "lucide-react";
import { useLang } from "~/i18n";
import { errorMessage } from "~/lib/errors";
import { checkImage } from "~/lib/image";
import { mediaUrl } from "~/lib/supabase";
import {
  deleteOption,
  deleteProduct,
  deleteProductImage,
  fetchAdminCategories,
  fetchAdminProduct,
  saveOption,
  saveProduct,
  setPrimaryImage,
  slugify,
  updateProduct,
  uploadProductImage,
  type AdminOption,
  type AdminProduct,
} from "~/features/admin/menu-admin";
import { AdminPage, ConfirmButton, Panel, Toggle } from "~/features/admin/ui";
import { Button } from "~/ui/Button";
import { ErrorState, Skeleton } from "~/ui/Feedback";
import { InputField, SelectField, TextareaField } from "~/ui/Field";
import { useToast } from "~/ui/Toast";

const price = z.string().trim().regex(/^\d{1,3}(\.\d{1,3})?$/, "admin.products.priceInvalid");
const time = z.string().regex(/^(\d{2}:\d{2}(:\d{2})?)?$/);

const schema = z
  .object({
    name_ar: z.string().trim().min(1, "validation.nameRequired").max(120),
    name_en: z.string().trim().min(1, "validation.nameRequired").max(120),
    slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "admin.common.slugHint").max(80),
    category_id: z.string().min(1, "errors.invalid_request"),
    description_ar: z.string().max(600),
    description_en: z.string().max(600),
    base_price: price,
    is_available: z.boolean(),
    is_featured: z.boolean(),
    is_best_seller: z.boolean(),
    available_from: time,
    available_until: time,
    staff_notes: z.string().max(1000),
  })
  .refine((v) => !!v.available_from === !!v.available_until, { path: ["available_until"], message: "admin.products.scheduleHint" });

type FormValues = z.infer<typeof schema>;

const toForm = (p: AdminProduct | null): FormValues => ({
  name_ar: p?.name_ar ?? "",
  name_en: p?.name_en ?? "",
  slug: p?.slug ?? "",
  category_id: p?.category_id ?? "",
  description_ar: p?.description_ar ?? "",
  description_en: p?.description_en ?? "",
  base_price: p ? Number(p.base_price).toFixed(3) : "",
  is_available: p?.is_available ?? true,
  is_featured: p?.is_featured ?? false,
  is_best_seller: p?.is_best_seller ?? false,
  available_from: p?.available_from?.slice(0, 5) ?? "",
  available_until: p?.available_until?.slice(0, 5) ?? "",
  staff_notes: p?.product_staff_notes?.notes ?? "",
});

function ProductForm({ product }: { product: AdminProduct | null }) {
  const { t, pick } = useLang();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const categories = useQuery({ queryKey: ["admin", "categories"], queryFn: fetchAdminCategories });
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toForm(product) });
  const { errors, isSubmitting } = form.formState;
  const err = (m?: string) => (m ? t(m) : undefined);
  const flags = useWatch({ control: form.control, name: ["is_available", "is_featured", "is_best_seller"] });

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      const id = await saveProduct(
        product?.id ?? null,
        {
          category_id: v.category_id,
          slug: v.slug,
          name_ar: v.name_ar,
          name_en: v.name_en,
          description_ar: v.description_ar.trim() || null,
          description_en: v.description_en.trim() || null,
          base_price: Number(v.base_price),
          is_available: v.is_available,
          is_featured: v.is_featured,
          is_best_seller: v.is_best_seller,
          available_from: v.available_from || null,
          available_until: v.available_until || null,
        },
        v.staff_notes,
      );
      toast(t("admin.common.saved"));
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      if (!product) navigate(`/admin/products/${id}`, { replace: true });
    } catch (e) {
      toast(errorMessage(e, t), "error");
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <Panel>
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField label={t("admin.common.nameAr")} dir="rtl" error={err(errors.name_ar?.message)} {...form.register("name_ar")} />
          <InputField
            label={t("admin.common.nameEn")}
            dir="ltr"
            error={err(errors.name_en?.message)}
            {...form.register("name_en", {
              onBlur: (e) => {
                if (!form.getValues("slug")) form.setValue("slug", slugify(e.target.value));
              },
            })}
          />
          <InputField label={t("admin.common.slug")} dir="ltr" hint={t("admin.common.slugHint")} error={err(errors.slug?.message)} {...form.register("slug")} />
          <SelectField label={t("admin.products.category")} error={err(errors.category_id?.message)} {...form.register("category_id")}>
            <option value="">—</option>
            {categories.data
              ?.filter((c) => !c.archived_at || c.id === product?.category_id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {pick(c, "name")}
                </option>
              ))}
          </SelectField>
          <TextareaField label={t("admin.common.descriptionAr")} dir="rtl" maxLength={600} {...form.register("description_ar")} />
          <TextareaField label={t("admin.common.descriptionEn")} dir="ltr" maxLength={600} {...form.register("description_en")} />
          <InputField label={t("admin.products.price")} inputMode="decimal" dir="ltr" error={err(errors.base_price?.message)} {...form.register("base_price")} />
        </div>
      </Panel>

      <Panel>
        <div className="grid gap-4 sm:grid-cols-3">
          <Toggle checked={flags[0]} onChange={(v) => form.setValue("is_available", v, { shouldDirty: true })} label={t("admin.products.available")} />
          <Toggle checked={flags[1]} onChange={(v) => form.setValue("is_featured", v, { shouldDirty: true })} label={t("admin.products.featured")} />
          <Toggle checked={flags[2]} onChange={(v) => form.setValue("is_best_seller", v, { shouldDirty: true })} label={t("admin.products.bestSeller")} />
        </div>
        <fieldset className="mt-5">
          <legend className="text-sm font-semibold">{t("admin.products.schedule")}</legend>
          <p className="text-xs text-char-700/70">{t("admin.products.scheduleHint")}</p>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <InputField label={t("admin.products.availableFrom")} type="time" dir="ltr" {...form.register("available_from")} />
            <InputField label={t("admin.products.availableUntil")} type="time" dir="ltr" error={err(errors.available_until?.message)} {...form.register("available_until")} />
          </div>
        </fieldset>
        <div className="mt-5">
          <TextareaField label={t("admin.products.staffNotes")} maxLength={1000} {...form.register("staff_notes")} />
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={isSubmitting}>
          {t("admin.common.save")}
        </Button>
        {product && (
          <>
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  await updateProduct(product.id, { archived_at: product.archived_at ? null : new Date().toISOString() });
                  toast(t("admin.common.saved"));
                  void queryClient.invalidateQueries({ queryKey: ["admin"] });
                } catch (e) {
                  toast(errorMessage(e, t), "error");
                }
              }}
            >
              {product.archived_at ? t("admin.common.restore") : t("admin.common.archive")}
            </Button>
            <ConfirmButton
              label={t("admin.common.delete")}
              message={t("admin.common.confirmDelete")}
              icon={<Trash2 className="size-4" aria-hidden />}
              onConfirm={async () => {
                try {
                  await deleteProduct(product.id);
                  toast(t("admin.common.deleted"));
                  void queryClient.invalidateQueries({ queryKey: ["admin"] });
                  navigate("/admin/products", { replace: true });
                } catch (e) {
                  toast(errorMessage(e, t), "error");
                }
              }}
            />
          </>
        )}
      </div>
    </form>
  );
}

const emptyValue = (sort: number) => ({ name_ar: "", name_en: "", price_delta: 0, is_default: false, is_available: true, sort_order: sort });

function OptionEditor({ productId, option, onDone }: { productId: string; option: AdminOption; onDone: () => void }) {
  const { t } = useLang();
  const toast = useToast();
  const [draft, setDraft] = useState<AdminOption>(option);
  const [saving, setSaving] = useState(false);
  const previousIds = option.product_option_values.map((v) => v.id!).filter(Boolean);
  const setValue = (i: number, patch: Partial<AdminOption["product_option_values"][number]>) =>
    setDraft((d) => ({ ...d, product_option_values: d.product_option_values.map((v, j) => (j === i ? { ...v, ...patch } : v)) }));
  const valid =
    draft.name_ar.trim() &&
    draft.name_en.trim() &&
    draft.max_select >= Math.max(1, draft.min_select) &&
    draft.product_option_values.every((v) => v.name_ar.trim() && v.name_en.trim() && v.price_delta >= 0 && v.price_delta < 100);

  const save = async () => {
    setSaving(true);
    try {
      await saveOption(productId, draft, previousIds);
      toast(t("admin.common.saved"));
      onDone();
    } catch (e) {
      toast(errorMessage(e, t), "error");
    } finally {
      setSaving(false);
    }
  };

  const num = "block w-full rounded-lg border border-char-900/15 bg-white px-3 py-2 text-sm";
  return (
    <div className="space-y-3 rounded-xl border border-char-900/10 bg-cream-50 p-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <InputField label={`${t("admin.products.optionName")} (AR)`} dir="rtl" value={draft.name_ar} onChange={(e) => setDraft({ ...draft, name_ar: e.target.value })} />
        <InputField label={`${t("admin.products.optionName")} (EN)`} dir="ltr" value={draft.name_en} onChange={(e) => setDraft({ ...draft, name_en: e.target.value })} />
        <InputField
          label={t("admin.products.minSelect")}
          type="number"
          min={0}
          max={20}
          value={draft.min_select}
          onChange={(e) => setDraft({ ...draft, min_select: Math.max(0, Number(e.target.value)) })}
        />
        <InputField
          label={t("admin.products.maxSelect")}
          type="number"
          min={1}
          max={20}
          value={draft.max_select}
          onChange={(e) => setDraft({ ...draft, max_select: Math.max(1, Number(e.target.value)) })}
        />
      </div>
      <p className="text-xs text-char-700/70">{t("admin.products.requiredHint")}</p>

      <div className="space-y-2">
        <p className="text-sm font-semibold">{t("admin.products.values")}</p>
        {draft.product_option_values.map((v, i) => (
          <div key={v.id ?? `new-${i}`} className="grid items-center gap-2 rounded-lg bg-white p-2 sm:grid-cols-[1fr_1fr_8rem_auto_auto_auto]">
            <input aria-label={`${t("admin.common.nameAr")} ${i + 1}`} dir="rtl" className={num} value={v.name_ar} onChange={(e) => setValue(i, { name_ar: e.target.value })} />
            <input aria-label={`${t("admin.common.nameEn")} ${i + 1}`} dir="ltr" className={num} value={v.name_en} onChange={(e) => setValue(i, { name_en: e.target.value })} />
            <input
              aria-label={t("admin.products.priceDelta")}
              dir="ltr"
              inputMode="decimal"
              className={num}
              defaultValue={Number(v.price_delta).toFixed(3)}
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (/^\d{1,2}(\.\d{1,3})?$/.test(e.target.value.trim())) setValue(i, { price_delta: n });
                else e.target.value = Number(v.price_delta).toFixed(3);
              }}
            />
            <Toggle checked={v.is_available} onChange={(c) => setValue(i, { is_available: c })} label={t("admin.products.available")} />
            <Toggle checked={v.is_default} onChange={(c) => setValue(i, { is_default: c })} label={t("admin.products.isDefault")} />
            <button
              type="button"
              aria-label={t("admin.products.deleteValue")}
              className="grid size-9 place-items-center rounded-full text-ember-700 hover:bg-ember-50"
              onClick={() => setDraft((d) => ({ ...d, product_option_values: d.product_option_values.filter((_, j) => j !== i) }))}
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDraft((d) => ({ ...d, product_option_values: [...d.product_option_values, emptyValue(d.product_option_values.length)] }))}
        >
          <Plus className="size-4" aria-hidden />
          {t("admin.products.addValue")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-char-900/10 pt-3">
        <Button size="sm" onClick={save} loading={saving} disabled={!valid}>
          {t("admin.common.save")}
        </Button>
        <Toggle checked={draft.is_active} onChange={(c) => setDraft({ ...draft, is_active: c })} label={t("admin.common.active")} />
        {option.id && (
          <ConfirmButton
            label={t("admin.products.deleteOption")}
            message={t("admin.common.confirmDelete")}
            onConfirm={async () => {
              try {
                await deleteOption(option.id!);
                onDone();
              } catch (e) {
                toast(errorMessage(e, t), "error");
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

function OptionsPanel({ product, onChange }: { product: AdminProduct; onChange: () => void }) {
  const { t } = useLang();
  const [adding, setAdding] = useState(false);
  return (
    <Panel
      title={t("admin.products.options")}
      actions={
        !adding && (
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden />
            {t("admin.products.addOption")}
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {product.product_options.map((o) => (
          <OptionEditor key={`${o.id}-${JSON.stringify(o)}`} productId={product.id} option={o} onDone={onChange} />
        ))}
        {adding && (
          <OptionEditor
            productId={product.id}
            option={{ name_ar: "", name_en: "", min_select: 0, max_select: 1, sort_order: product.product_options.length, is_active: true, product_option_values: [emptyValue(0)] }}
            onDone={() => {
              setAdding(false);
              onChange();
            }}
          />
        )}
        {product.product_options.length === 0 && !adding && <p className="text-sm text-char-700">{t("admin.common.empty")}</p>}
      </div>
    </Panel>
  );
}

function ImagesPanel({ product, onChange }: { product: AdminProduct; onChange: () => void }) {
  const { t } = useLang();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: (file: File) => uploadProductImage(product.id, file, product.product_images.length === 0),
    onSuccess: () => {
      toast(t("admin.common.saved"));
      onChange();
    },
    onError: (e) => toast(errorMessage(e, t), "error"),
  });
  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
      onChange();
    } catch (e) {
      toast(errorMessage(e, t), "error");
    }
  };

  return (
    <Panel
      title={t("admin.products.images")}
      actions={
        <>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="sr-only"
            aria-label={t("admin.products.upload")}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const check = checkImage(file);
              if (check !== "ok") return toast(t(check === "type" ? "admin.products.imageType" : "admin.products.imageTooLarge"), "error");
              upload.mutate(file);
            }}
          />
          <Button variant="secondary" size="sm" loading={upload.isPending} onClick={() => input.current?.click()}>
            <ImagePlus className="size-4" aria-hidden />
            {upload.isPending ? t("admin.products.uploading") : t("admin.products.upload")}
          </Button>
        </>
      }
    >
      <p className="-mt-2 mb-4 text-xs text-char-700/70">{t("admin.products.uploadHint")}</p>
      {product.product_images.length === 0 ? (
        <p className="text-sm text-char-700">{t("admin.common.empty")}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {product.product_images.map((img) => (
            <li key={img.id} className="overflow-hidden rounded-xl border border-char-900/10 bg-white">
              <img src={mediaUrl(img.storage_path) ?? ""} alt="" className="aspect-square w-full object-cover" loading="lazy" />
              <div className="flex items-center justify-between gap-1 p-2">
                {img.is_primary ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-ember-600">
                    <Star className="size-3.5 fill-current" aria-hidden />
                    {t("admin.products.primary")}
                  </span>
                ) : (
                  <button type="button" className="text-xs font-semibold hover:text-ember-600" onClick={() => run(() => setPrimaryImage(product.id, img.id))}>
                    {t("admin.products.makePrimary")}
                  </button>
                )}
                <button
                  type="button"
                  aria-label={t("admin.products.removeImage")}
                  className="grid size-8 place-items-center rounded-full text-ember-700 hover:bg-ember-50"
                  onClick={() => run(() => deleteProductImage(img.id, img.storage_path))}
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default function AdminProductEdit() {
  const { t, lang, pick } = useLang();
  const { productId = "new" } = useParams();
  const isNew = productId === "new";
  const queryClient = useQueryClient();
  const product = useQuery({ queryKey: ["admin", "product", productId], queryFn: () => fetchAdminProduct(productId), enabled: !isNew });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "product", productId] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    void queryClient.invalidateQueries({ queryKey: ["product"] });
  };
  const Back = lang === "ar" ? ArrowRight : ArrowLeft;

  return (
    <AdminPage title={isNew ? t("admin.products.new") : product.data ? pick(product.data, "name") : t("admin.products.edit")}>
      <Link to="/admin/products" className="inline-flex items-center gap-2 text-sm font-semibold text-char-700 hover:text-ember-600">
        <Back className="size-4" aria-hidden />
        {t("admin.products.title")}
      </Link>
      {isNew ? (
        <>
          <ProductForm product={null} />
          <p className="text-sm text-char-700">{t("admin.products.saveFirst")}</p>
        </>
      ) : product.isError ? (
        <ErrorState onRetry={() => product.refetch()} />
      ) : product.isPending ? (
        <Skeleton className="h-96" />
      ) : !product.data ? (
        <ErrorState message={t("product.notFound")} />
      ) : (
        <>
          <ProductForm key={product.data.id} product={product.data} />
          <ImagesPanel product={product.data} onChange={refresh} />
          <OptionsPanel product={product.data} onChange={refresh} />
        </>
      )}
    </AdminPage>
  );
}

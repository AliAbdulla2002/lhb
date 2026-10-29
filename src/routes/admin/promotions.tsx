import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { useLang } from "~/i18n";
import { errorMessage, must } from "~/lib/errors";
import { checkImage, optimiseImage } from "~/lib/image";
import { getSupabase, mediaUrl } from "~/lib/supabase";
import { formatDateTime, fromBahrainInput, toBahrainInput } from "~/lib/time";
import { moved, reorder } from "~/features/admin/menu-admin";
import { promotionState } from "~/features/admin/schedule";
import { AdminPage, ConfirmButton, DataTable, Modal, MoveButtons, Pill, Toggle } from "~/features/admin/ui";
import { Button } from "~/ui/Button";
import { ErrorState, Skeleton } from "~/ui/Feedback";
import { InputField, TextareaField } from "~/ui/Field";
import { useToast } from "~/ui/Toast";

interface Promo {
  id?: string;
  title_ar: string;
  title_en: string;
  body_ar: string | null;
  body_en: string | null;
  cta_label_ar: string | null;
  cta_label_en: string | null;
  link_path: string | null;
  image_path: string | null;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  sort_order: number;
}

const TONE = { live: "good", scheduled: "default", expired: "muted", off: "muted" } as const;

function PromotionForm({ initial, onSaved }: { initial: Promo; onSaved: () => void }) {
  const { t } = useLang();
  const toast = useToast();
  const [d, setD] = useState(initial);
  const [starts, setStarts] = useState(toBahrainInput(initial.starts_at));
  const [ends, setEnds] = useState(toBahrainInput(initial.ends_at));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const linkOk = !d.link_path || /^\/[A-Za-z0-9/_?=&-]*$/.test(d.link_path);
  const startIso = fromBahrainInput(starts);
  const endIso = fromBahrainInput(ends);
  const datesOk = !!startIso && (!endIso || endIso > startIso);
  const valid = d.title_ar.trim() && d.title_en.trim() && linkOk && datesOk;

  const upload = async (file: File) => {
    const check = checkImage(file);
    if (check !== "ok") return toast(t(check === "type" ? "admin.products.imageType" : "admin.products.imageTooLarge"), "error");
    setUploading(true);
    try {
      const { blob, ext, type } = await optimiseImage(file, 2000);
      const path = `promotions/${crypto.randomUUID()}.${ext}`;
      const { error } = await getSupabase()!.storage.from("menu-media").upload(path, blob, { contentType: type, cacheControl: "31536000" });
      if (error) throw error;
      setD((x) => ({ ...x, image_path: path }));
    } catch (e) {
      toast(errorMessage(e, t), "error");
    } finally {
      setUploading(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const row = {
      title_ar: d.title_ar.trim(),
      title_en: d.title_en.trim(),
      body_ar: d.body_ar?.trim() || null,
      body_en: d.body_en?.trim() || null,
      cta_label_ar: d.cta_label_ar?.trim() || null,
      cta_label_en: d.cta_label_en?.trim() || null,
      link_path: d.link_path?.trim() || null,
      image_path: d.image_path,
      starts_at: startIso!,
      ends_at: endIso,
      is_active: d.is_active,
    };
    try {
      const sb = getSupabase()!;
      if (d.id) must(await sb.from("promotions").update(row).eq("id", d.id).select("id").single());
      else must(await sb.from("promotions").insert(row).select("id").single());
      toast(t("admin.common.saved"));
      onSaved();
    } catch (err) {
      toast(errorMessage(err, t), "error");
    } finally {
      setSaving(false);
    }
  };

  const text = (key: keyof Promo) => ({
    value: (d[key] as string | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD({ ...d, [key]: e.target.value }),
  });

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField label={t("admin.promotions.titleAr")} dir="rtl" required {...text("title_ar")} />
        <InputField label={t("admin.promotions.titleEn")} dir="ltr" required {...text("title_en")} />
        <TextareaField label={t("admin.promotions.bodyAr")} dir="rtl" maxLength={400} {...text("body_ar")} />
        <TextareaField label={t("admin.promotions.bodyEn")} dir="ltr" maxLength={400} {...text("body_en")} />
        <InputField label={t("admin.promotions.ctaAr")} dir="rtl" {...text("cta_label_ar")} />
        <InputField label={t("admin.promotions.ctaEn")} dir="ltr" {...text("cta_label_en")} />
        <InputField
          label={t("admin.promotions.link")}
          dir="ltr"
          hint={t("admin.promotions.linkHint")}
          error={linkOk ? undefined : t("admin.promotions.linkHint")}
          {...text("link_path")}
        />
        <div />
        <InputField label={t("admin.promotions.startsAt")} type="datetime-local" dir="ltr" value={starts} onChange={(e) => setStarts(e.target.value)} required />
        <InputField
          label={t("admin.promotions.endsAt")}
          type="datetime-local"
          dir="ltr"
          hint={t("admin.promotions.endsHint")}
          error={datesOk ? undefined : t("errors.invalid_request")}
          value={ends}
          onChange={(e) => setEnds(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {d.image_path && <img src={mediaUrl(d.image_path) ?? ""} alt="" className="h-20 w-32 rounded-lg object-cover" />}
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="sr-only"
          aria-label={t("admin.promotions.image")}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
        <Button variant="secondary" size="sm" loading={uploading} onClick={() => fileInput.current?.click()}>
          <ImagePlus className="size-4" aria-hidden />
          {t("admin.promotions.image")}
        </Button>
        {d.image_path && (
          <Button variant="ghost" size="sm" onClick={() => setD({ ...d, image_path: null })}>
            <Trash2 className="size-4" aria-hidden />
          </Button>
        )}
      </div>

      <Toggle checked={d.is_active} onChange={(v) => setD({ ...d, is_active: v })} label={t("admin.common.active")} />
      <div className="flex justify-end">
        <Button type="submit" loading={saving} disabled={!valid || uploading}>
          {t("admin.common.save")}
        </Button>
      </div>
    </form>
  );
}

export default function AdminPromotions() {
  const { t, lang, pick } = useLang();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Promo | null>(null);
  const promos = useQuery({
    queryKey: ["admin", "promotions"],
    queryFn: async () => must(await getSupabase()!.from("promotions").select("*").order("sort_order").order("starts_at", { ascending: false })) as Promo[],
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "promotions"] });
    void queryClient.invalidateQueries({ queryKey: ["promotions"] });
  };
  const order = useMutation({ mutationFn: (ids: string[]) => reorder("promotions", ids), onSuccess: refresh, onError: (e) => toast(errorMessage(e, t), "error") });
  const rows = promos.data ?? [];
  const blank: Promo = {
    title_ar: "", title_en: "", body_ar: "", body_en: "", cta_label_ar: "", cta_label_en: "", link_path: "", image_path: null,
    starts_at: new Date().toISOString(), ends_at: null, is_active: true, sort_order: rows.length,
  };

  return (
    <AdminPage
      title={t("admin.promotions.title")}
      actions={
        <Button size="sm" onClick={() => setEditing(blank)}>
          <Plus className="size-4" aria-hidden />
          {t("admin.promotions.new")}
        </Button>
      }
    >
      {promos.isError ? (
        <ErrorState onRetry={() => promos.refetch()} />
      ) : promos.isPending ? (
        <Skeleton className="h-48" />
      ) : (
        <DataTable
          rows={rows}
          rowKey={(p) => p.id!}
          empty={t("admin.promotions.none")}
          onRowClick={(p) => setEditing(p)}
          columns={[
            { header: t("admin.promotions.titleEn"), cell: (p) => <span className="font-semibold">{pick(p, "title")}</span> },
            {
              header: t("admin.common.status"),
              cell: (p) => {
                const s = promotionState(p);
                return <Pill tone={TONE[s]}>{t(`admin.promotions.state.${s}`)}</Pill>;
              },
            },
            { header: t("admin.promotions.startsAt"), cell: (p) => formatDateTime(p.starts_at, lang), mobileHidden: true },
            { header: t("admin.promotions.endsAt"), cell: (p) => (p.ends_at ? formatDateTime(p.ends_at, lang) : "—") },
            {
              header: t("admin.common.actions"),
              cell: (p) => {
                const i = rows.indexOf(p);
                return (
                  <span className="inline-flex items-center" onClick={(e) => e.stopPropagation()}>
                    <MoveButtons
                      first={i === 0}
                      last={i === rows.length - 1}
                      onUp={() => order.mutate(moved(rows, i, -1).map((r) => r.id!))}
                      onDown={() => order.mutate(moved(rows, i, 1).map((r) => r.id!))}
                    />
                    <ConfirmButton
                      label={t("admin.common.delete")}
                      message={t("admin.common.confirmDelete")}
                      onConfirm={async () => {
                        try {
                          must(await getSupabase()!.from("promotions").delete().eq("id", p.id!).select("id").single());
                          refresh();
                        } catch (e) {
                          toast(errorMessage(e, t), "error");
                        }
                      }}
                    />
                  </span>
                );
              },
            },
          ]}
        />
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? t("admin.common.edit") : t("admin.promotions.new")} wide>
        {editing && (
          <PromotionForm
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

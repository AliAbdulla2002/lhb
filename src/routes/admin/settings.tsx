import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useLang } from "~/i18n";
import { errorMessage, must } from "~/lib/errors";
import { getSupabase } from "~/lib/supabase";
import { useAuth } from "~/features/auth/AuthProvider";
import { normalizePhone } from "~/features/auth/schemas";
import { AdminPage, Panel, Toggle } from "~/features/admin/ui";
import { Button } from "~/ui/Button";
import { ErrorState, Skeleton } from "~/ui/Feedback";
import { InputField, TextareaField } from "~/ui/Field";
import { useToast } from "~/ui/Toast";

interface Settings {
  display_name_ar: string;
  display_name_en: string;
  tagline_ar: string | null;
  tagline_en: string | null;
  phones: string[];
  whatsapp: string | null;
  instagram_url: string | null;
  ordering_enabled: boolean;
  cash_on_pickup_enabled: boolean;
  online_payment_enabled: boolean;
  delivery_enabled: boolean;
  max_lines_per_order: number;
}

interface Content {
  key: string;
  value_ar: string | null;
  value_en: string | null;
}

const sb = () => getSupabase()!;

function BusinessSettings({ initial, editable }: { initial: Settings; editable: boolean }) {
  const { t } = useLang();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [d, setD] = useState(initial);
  const [phones, setPhones] = useState(initial.phones.join("\n"));
  const [saving, setSaving] = useState(false);
  const parsedPhones = phones.split(/\n+/).map((p) => p.trim()).filter(Boolean).map(normalizePhone);
  const phonesOk = parsedPhones.every(Boolean);
  const instaOk = !d.instagram_url || d.instagram_url.startsWith("https://");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      must(
        await sb()
          .from("restaurant_settings")
          .update({
            display_name_ar: d.display_name_ar.trim(),
            display_name_en: d.display_name_en.trim(),
            tagline_ar: d.tagline_ar?.trim() || null,
            tagline_en: d.tagline_en?.trim() || null,
            phones: parsedPhones as string[],
            whatsapp: d.whatsapp?.trim() ? normalizePhone(d.whatsapp) : null,
            instagram_url: d.instagram_url?.trim() || null,
            ordering_enabled: d.ordering_enabled,
            cash_on_pickup_enabled: d.cash_on_pickup_enabled,
            max_lines_per_order: d.max_lines_per_order,
          })
          .eq("id", true)
          .select("id")
          .single(),
      );
      toast(t("admin.common.saved"));
      void queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    } catch (err) {
      toast(errorMessage(err, t), "error");
    } finally {
      setSaving(false);
    }
  };

  const text = (k: keyof Settings, dir: "rtl" | "ltr" = "ltr") => ({
    dir,
    disabled: !editable,
    value: (d[k] as string | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value }),
  });

  return (
    <form onSubmit={save} className="space-y-5">
      <Panel title={t("admin.settings.business")}>
        {!editable && <p className="-mt-2 mb-4 text-xs text-char-700/70">{t("admin.settings.superAdminOnly")}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField label={t("admin.settings.displayNameAr")} {...text("display_name_ar", "rtl")} />
          <InputField label={t("admin.settings.displayNameEn")} {...text("display_name_en")} />
          <InputField label={t("admin.settings.taglineAr")} {...text("tagline_ar", "rtl")} />
          <InputField label={t("admin.settings.taglineEn")} {...text("tagline_en")} />
          <TextareaField
            label={t("admin.settings.phones")}
            dir="ltr"
            disabled={!editable}
            hint={t("admin.settings.phonesHint")}
            error={phonesOk ? undefined : t("validation.phone")}
            value={phones}
            onChange={(e) => setPhones(e.target.value)}
          />
          <div className="space-y-4">
            <InputField label={t("admin.settings.whatsapp")} type="tel" {...text("whatsapp")} />
            <InputField label={t("admin.settings.instagram")} type="url" error={instaOk ? undefined : t("errors.invalid_request")} {...text("instagram_url")} />
          </div>
        </div>
      </Panel>

      <Panel title={t("admin.settings.ordering")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Toggle checked={d.ordering_enabled} disabled={!editable} onChange={(v) => setD({ ...d, ordering_enabled: v })} label={t("admin.settings.orderingEnabled")} />
          <Toggle checked={d.cash_on_pickup_enabled} disabled={!editable} onChange={(v) => setD({ ...d, cash_on_pickup_enabled: v })} label={t("admin.settings.cashEnabled")} />
          {/* Not switchable until the integrations exist — see docs/PHASE1_AUDIT_AND_PLAN.md (D5, D6). */}
          <Toggle checked={false} disabled onChange={() => {}} label={t("admin.settings.onlineEnabled")} hint={t("admin.settings.onlineHint")} />
          <Toggle checked={false} disabled onChange={() => {}} label={t("admin.settings.deliveryEnabled")} hint={t("admin.settings.deliveryHint")} />
          <InputField
            label={t("admin.settings.maxLines")}
            type="number"
            min={1}
            max={100}
            disabled={!editable}
            value={d.max_lines_per_order}
            onChange={(e) => setD({ ...d, max_lines_per_order: Number(e.target.value) })}
          />
        </div>
      </Panel>

      {editable && (
        <Button type="submit" loading={saving} disabled={!phonesOk || !instaOk || !d.display_name_ar.trim() || !d.display_name_en.trim()}>
          {t("admin.common.save")}
        </Button>
      )}
    </form>
  );
}

function ContentEditor({ row, onSaved }: { row: Content; onSaved: () => void }) {
  const { t } = useLang();
  const toast = useToast();
  const [d, setD] = useState(row);
  const [saving, setSaving] = useState(false);
  const dirty = d.value_ar !== row.value_ar || d.value_en !== row.value_en;
  return (
    <div className="space-y-3 rounded-xl border border-char-900/10 p-4">
      <p className="font-mono text-xs text-char-700" dir="ltr">
        {row.key}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextareaField label="العربية" dir="rtl" value={d.value_ar ?? ""} onChange={(e) => setD({ ...d, value_ar: e.target.value })} />
        <TextareaField label="English" dir="ltr" value={d.value_en ?? ""} onChange={(e) => setD({ ...d, value_en: e.target.value })} />
      </div>
      <Button
        size="sm"
        disabled={!dirty}
        loading={saving}
        onClick={async () => {
          setSaving(true);
          try {
            must(await sb().from("site_content").upsert({ key: d.key, value_ar: d.value_ar, value_en: d.value_en }).select("key").single());
            toast(t("admin.common.saved"));
            onSaved();
          } catch (e) {
            toast(errorMessage(e, t), "error");
          } finally {
            setSaving(false);
          }
        }}
      >
        {t("admin.common.save")}
      </Button>
    </div>
  );
}

export default function AdminSettings() {
  const { t } = useLang();
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();
  const [newKey, setNewKey] = useState("");
  const [extraKeys, setExtraKeys] = useState<string[]>([]);
  const settings = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: async () => must(await sb().from("restaurant_settings").select("*").single()) as Settings,
  });
  const content = useQuery({
    queryKey: ["admin", "content"],
    queryFn: async () => must(await sb().from("site_content").select("key, value_ar, value_en").order("key")) as Content[],
  });
  const refreshContent = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "content"] });
    void queryClient.invalidateQueries({ queryKey: ["content"] });
  };
  const keyOk = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/.test(newKey);
  const rows = [...(content.data ?? []), ...extraKeys.filter((k) => !content.data?.some((c) => c.key === k)).map((key) => ({ key, value_ar: "", value_en: "" }))];

  return (
    <AdminPage title={t("admin.settings.title")}>
      {settings.isError ? (
        <ErrorState onRetry={() => settings.refetch()} />
      ) : settings.isPending ? (
        <Skeleton className="h-80" />
      ) : (
        <BusinessSettings initial={settings.data} editable={hasRole("super_admin")} />
      )}

      <Panel title={t("admin.settings.content")}>
        <p className="-mt-2 mb-4 text-xs text-char-700/70">{t("admin.settings.contentHint")}</p>
        {content.isError ? (
          <ErrorState onRetry={() => content.refetch()} />
        ) : content.isPending ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="space-y-4">
            {rows.map((row) => (
              <ContentEditor key={`${row.key}-${row.value_ar}-${row.value_en}`} row={row} onSaved={refreshContent} />
            ))}
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-64">
                <InputField label="key" dir="ltr" placeholder="home.hero.title" value={newKey} onChange={(e) => setNewKey(e.target.value.trim())} />
              </div>
              <Button
                variant="ghost"
                disabled={!keyOk}
                onClick={() => {
                  setExtraKeys((k) => [...k, newKey]);
                  setNewKey("");
                }}
              >
                <Plus className="size-4" aria-hidden />
                {t("admin.common.create")}
              </Button>
            </div>
          </div>
        )}
      </Panel>
    </AdminPage>
  );
}

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PauseCircle, Plus, Trash2 } from "lucide-react";
import { useLang } from "~/i18n";
import { errorMessage, must } from "~/lib/errors";
import { getSupabase } from "~/lib/supabase";
import { useAuth } from "~/features/auth/AuthProvider";
import { slugify } from "~/features/admin/menu-admin";
import { AdminPage, Panel, Pill, SelectFilter, Toggle } from "~/features/admin/ui";
import { Button } from "~/ui/Button";
import { ErrorState, Skeleton } from "~/ui/Feedback";
import { InputField, TextareaField } from "~/ui/Field";
import { useToast } from "~/ui/Toast";

interface Shift {
  id?: string;
  weekday: number;
  opens_at: string;
  closes_at: string;
  closes_next_day: boolean;
}

interface SpecialDay {
  id?: string;
  date: string;
  is_closed: boolean;
  opens_at: string | null;
  closes_at: string | null;
  closes_next_day: boolean;
  note_en: string | null;
  note_ar: string | null;
}

interface Branch {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  address_ar: string | null;
  address_en: string | null;
  phone: string | null;
  maps_url: string | null;
  is_active: boolean;
  accepts_pickup: boolean;
  pickup_paused: boolean;
  pickup_paused_reason: string | null;
  pickup_lead_minutes: number;
  slot_minutes: number;
  max_orders_per_slot: number;
  pickup_instructions_ar: string | null;
  pickup_instructions_en: string | null;
  business_hours: Shift[];
  business_hour_exceptions: SpecialDay[];
}

const sb = () => getSupabase()!;

function useSave() {
  const { t } = useLang();
  const toast = useToast();
  const queryClient = useQueryClient();
  return async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      toast(t("admin.common.saved"));
      void queryClient.invalidateQueries({ queryKey: ["admin", "branches"] });
      void queryClient.invalidateQueries({ queryKey: ["branches"] });
      return true;
    } catch (e) {
      toast(errorMessage(e, t), "error");
      return false;
    }
  };
}

function Operations({ branch }: { branch: Branch }) {
  const { t } = useLang();
  const save = useSave();
  const [d, setD] = useState(branch);
  const num = (k: "pickup_lead_minutes" | "slot_minutes" | "max_orders_per_slot") => ({
    value: d[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: Number(e.target.value) }),
  });
  const update = (patch: Partial<Branch>) => save(async () => must(await sb().from("branches").update(patch).eq("id", branch.id).select("id").single()));

  return (
    <Panel title={t("admin.branches.operations")}>
      <div className={d.pickup_paused ? "mb-5 rounded-xl border border-ember-500 bg-ember-50 p-4" : "mb-5 rounded-xl border border-char-900/10 p-4"}>
        <Toggle
          checked={d.pickup_paused}
          onChange={async (v) => {
            const reason = v ? d.pickup_paused_reason : null;
            if (await update({ pickup_paused: v, pickup_paused_reason: reason })) setD({ ...d, pickup_paused: v, pickup_paused_reason: reason });
          }}
          label={d.pickup_paused ? t("admin.branches.paused") : t("admin.branches.pause")}
        />
        {d.pickup_paused && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="flex-1">
              <InputField label={t("admin.branches.pauseReason")} maxLength={200} value={d.pickup_paused_reason ?? ""} onChange={(e) => setD({ ...d, pickup_paused_reason: e.target.value })} />
            </div>
            <Button variant="secondary" onClick={() => update({ pickup_paused_reason: d.pickup_paused_reason?.trim() || null })}>
              {t("admin.common.save")}
            </Button>
          </div>
        )}
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void update({
            pickup_lead_minutes: d.pickup_lead_minutes,
            slot_minutes: d.slot_minutes,
            max_orders_per_slot: d.max_orders_per_slot,
            pickup_instructions_ar: d.pickup_instructions_ar?.trim() || null,
            pickup_instructions_en: d.pickup_instructions_en?.trim() || null,
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <InputField label={t("admin.branches.leadMinutes")} type="number" min={0} max={240} {...num("pickup_lead_minutes")} />
          <label className="space-y-1.5 text-sm font-medium">
            <span className="block text-char-800">{t("admin.branches.slotMinutes")}</span>
            <select className="block w-full rounded-xl border border-char-900/15 bg-white px-4 py-3" value={d.slot_minutes} onChange={(e) => setD({ ...d, slot_minutes: Number(e.target.value) })}>
              {[5, 10, 15, 20, 30, 60].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <InputField label={t("admin.branches.capacity")} type="number" min={1} max={500} {...num("max_orders_per_slot")} />
          <TextareaField label={t("admin.branches.instructionsAr")} dir="rtl" maxLength={500} value={d.pickup_instructions_ar ?? ""} onChange={(e) => setD({ ...d, pickup_instructions_ar: e.target.value })} />
          <TextareaField label={t("admin.branches.instructionsEn")} dir="ltr" maxLength={500} value={d.pickup_instructions_en ?? ""} onChange={(e) => setD({ ...d, pickup_instructions_en: e.target.value })} />
        </div>
        <Button type="submit">{t("admin.common.save")}</Button>
      </form>
    </Panel>
  );
}

function Identity({ branch, editable }: { branch: Branch | null; editable: boolean }) {
  const { t } = useLang();
  const save = useSave();
  const [d, setD] = useState<Partial<Branch>>(branch ?? { is_active: true, accepts_pickup: true });
  const text = (k: keyof Branch, dir: "rtl" | "ltr" = "ltr") => ({
    dir,
    disabled: !editable,
    value: (d[k] as string | null | undefined) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value }),
  });
  const mapsOk = !d.maps_url || d.maps_url.startsWith("https://");
  const slugOk = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.slug ?? "");

  return (
    <Panel title={t("admin.branches.identity")}>
      {!editable && <p className="-mt-2 mb-4 text-xs text-char-700">{t("admin.branches.identityHint")}</p>}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const row = {
            slug: d.slug,
            name_ar: d.name_ar?.trim(),
            name_en: d.name_en?.trim(),
            address_ar: d.address_ar?.trim() || null,
            address_en: d.address_en?.trim() || null,
            phone: d.phone?.trim() || null,
            maps_url: d.maps_url?.trim() || null,
            is_active: d.is_active,
            accepts_pickup: d.accepts_pickup,
          };
          void save(async () =>
            branch
              ? must(await sb().from("branches").update(row).eq("id", branch.id).select("id").single())
              : must(await sb().from("branches").insert(row).select("id").single()),
          );
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField label={t("admin.common.nameAr")} {...text("name_ar", "rtl")} required />
          <InputField
            label={t("admin.common.nameEn")}
            {...text("name_en")}
            onBlur={() => !d.slug && setD((x) => ({ ...x, slug: slugify(x.name_en ?? "") }))}
            required
          />
          <InputField label={t("admin.common.slug")} hint={t("admin.common.slugHint")} {...text("slug")} error={d.slug && !slugOk ? t("admin.common.slugHint") : undefined} />
          <InputField label={t("admin.branches.phone")} type="tel" {...text("phone")} />
          <InputField label={t("admin.branches.addressAr")} {...text("address_ar", "rtl")} />
          <InputField label={t("admin.branches.addressEn")} {...text("address_en")} />
          <InputField label={t("admin.branches.mapsUrl")} type="url" {...text("maps_url")} error={mapsOk ? undefined : t("errors.invalid_request")} />
        </div>
        <div className="flex flex-wrap gap-6">
          <Toggle checked={!!d.is_active} disabled={!editable} onChange={(v) => setD({ ...d, is_active: v })} label={t("admin.common.active")} />
          <Toggle checked={!!d.accepts_pickup} disabled={!editable} onChange={(v) => setD({ ...d, accepts_pickup: v })} label={t("admin.branches.acceptsPickup")} />
        </div>
        {editable && (
          <Button type="submit" disabled={!slugOk || !mapsOk || !d.name_ar?.trim() || !d.name_en?.trim()}>
            {t("admin.common.save")}
          </Button>
        )}
      </form>
    </Panel>
  );
}

const timeInput = "rounded-lg border border-char-900/15 bg-white px-2 py-1.5 text-sm";

function Hours({ branch }: { branch: Branch }) {
  const { t } = useLang();
  const save = useSave();
  const weekdays = t("weekday", { returnObjects: true }) as string[];
  const [adding, setAdding] = useState<Shift | null>(null);

  return (
    <Panel
      title={t("admin.branches.hours")}
      actions={
        <Button variant="ghost" size="sm" onClick={() => setAdding({ weekday: 6, opens_at: "17:00", closes_at: "00:00", closes_next_day: true })}>
          <Plus className="size-4" aria-hidden />
          {t("admin.branches.addShift")}
        </Button>
      }
    >
      <ul className="divide-y divide-char-900/5">
        {[6, 0, 1, 2, 3, 4, 5].map((day) => {
          const shifts = branch.business_hours.filter((s) => s.weekday === day);
          return (
            <li key={day} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <span className="w-24 font-semibold">{weekdays[day]}</span>
              {shifts.length === 0 && <Pill tone="muted">{t("contact.closed")}</Pill>}
              {shifts.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-cream-100 py-1 ps-3 pe-1" dir="ltr">
                  {s.opens_at.slice(0, 5)} – {s.closes_at.slice(0, 5)}
                  {s.closes_next_day && "⁺¹"}
                  <button
                    type="button"
                    aria-label={t("admin.common.delete")}
                    className="grid size-6 place-items-center rounded-full hover:bg-ember-50 hover:text-ember-700"
                    onClick={() => void save(async () => must(await sb().from("business_hours").delete().eq("id", s.id!).select("id").single()))}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </span>
              ))}
            </li>
          );
        })}
      </ul>

      {adding && (
        <form
          className="mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-cream-100 p-3 text-sm"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await save(async () => must(await sb().from("business_hours").insert({ ...adding, branch_id: branch.id }).select("id").single()))) setAdding(null);
          }}
        >
          <label className="space-y-1">
            <span className="block">{t("contact.hours")}</span>
            <select className={timeInput} value={adding.weekday} onChange={(e) => setAdding({ ...adding, weekday: Number(e.target.value) })}>
              {weekdays.map((w, i) => (
                <option key={i} value={i}>
                  {w}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block">{t("admin.branches.opensAt")}</span>
            <input type="time" className={timeInput} value={adding.opens_at} onChange={(e) => setAdding({ ...adding, opens_at: e.target.value })} required />
          </label>
          <label className="space-y-1">
            <span className="block">{t("admin.branches.closesAt")}</span>
            <input type="time" className={timeInput} value={adding.closes_at} onChange={(e) => setAdding({ ...adding, closes_at: e.target.value })} required />
          </label>
          <Toggle checked={adding.closes_next_day} onChange={(v) => setAdding({ ...adding, closes_next_day: v })} label={t("admin.branches.nextDay")} />
          <Button type="submit" size="sm">
            {t("admin.common.save")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAdding(null)}>
            {t("admin.common.cancel")}
          </Button>
        </form>
      )}
    </Panel>
  );
}

function SpecialDays({ branch }: { branch: Branch }) {
  const { t, pick } = useLang();
  const save = useSave();
  const [adding, setAdding] = useState<SpecialDay | null>(null);
  const upcoming = [...branch.business_hour_exceptions].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Panel
      title={t("admin.branches.exceptions")}
      actions={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAdding({ date: "", is_closed: true, opens_at: null, closes_at: null, closes_next_day: false, note_en: "", note_ar: "" })}
        >
          <Plus className="size-4" aria-hidden />
          {t("admin.branches.addException")}
        </Button>
      }
    >
      {upcoming.length === 0 && !adding && <p className="text-sm text-char-700">{t("admin.common.empty")}</p>}
      <ul className="space-y-2 text-sm">
        {upcoming.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-cream-100 px-3 py-2">
            <span className="font-semibold tabular-nums" dir="ltr">
              {x.date}
            </span>
            {x.is_closed ? <Pill tone="warn">{t("admin.branches.closedAllDay")}</Pill> : <span dir="ltr">{x.opens_at?.slice(0, 5)} – {x.closes_at?.slice(0, 5)}</span>}
            <span className="text-char-700">{pick(x, "note")}</span>
            <button
              type="button"
              aria-label={t("admin.common.delete")}
              className="ms-auto grid size-8 place-items-center rounded-full hover:bg-ember-50 hover:text-ember-700"
              onClick={() => void save(async () => must(await sb().from("business_hour_exceptions").delete().eq("id", x.id!).select("id").single()))}
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {adding && (
        <form
          className="mt-4 grid gap-3 rounded-xl bg-cream-100 p-3 text-sm sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const row = {
              branch_id: branch.id,
              date: adding.date,
              is_closed: adding.is_closed,
              opens_at: adding.is_closed ? null : adding.opens_at,
              closes_at: adding.is_closed ? null : adding.closes_at,
              closes_next_day: !adding.is_closed && adding.closes_next_day,
              note_ar: adding.note_ar?.trim() || null,
              note_en: adding.note_en?.trim() || null,
            };
            if (await save(async () => must(await sb().from("business_hour_exceptions").insert(row).select("id").single()))) setAdding(null);
          }}
        >
          <InputField label={t("admin.branches.date")} type="date" dir="ltr" value={adding.date} onChange={(e) => setAdding({ ...adding, date: e.target.value })} required />
          <div className="self-end">
            <Toggle checked={adding.is_closed} onChange={(v) => setAdding({ ...adding, is_closed: v })} label={t("admin.branches.closedAllDay")} />
          </div>
          {!adding.is_closed && (
            <>
              <InputField label={t("admin.branches.opensAt")} type="time" dir="ltr" value={adding.opens_at ?? ""} onChange={(e) => setAdding({ ...adding, opens_at: e.target.value })} required />
              <InputField label={t("admin.branches.closesAt")} type="time" dir="ltr" value={adding.closes_at ?? ""} onChange={(e) => setAdding({ ...adding, closes_at: e.target.value })} required />
              <Toggle checked={adding.closes_next_day} onChange={(v) => setAdding({ ...adding, closes_next_day: v })} label={t("admin.branches.nextDay")} />
              <div />
            </>
          )}
          <InputField label={`${t("admin.common.notes")} (AR)`} dir="rtl" value={adding.note_ar ?? ""} onChange={(e) => setAdding({ ...adding, note_ar: e.target.value })} />
          <InputField label={`${t("admin.common.notes")} (EN)`} dir="ltr" value={adding.note_en ?? ""} onChange={(e) => setAdding({ ...adding, note_en: e.target.value })} />
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm">
              {t("admin.common.save")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAdding(null)}>
              {t("admin.common.cancel")}
            </Button>
          </div>
        </form>
      )}
    </Panel>
  );
}

export default function AdminBranches() {
  const { t, pick } = useLang();
  const { hasRole } = useAuth();
  const isSuper = hasRole("super_admin");
  const branches = useQuery({
    queryKey: ["admin", "branches"],
    queryFn: async () => must(await sb().from("branches").select("*, business_hours(*), business_hour_exceptions(*)").order("sort_order")) as Branch[],
  });
  const [selected, setSelected] = useState("");
  const [creating, setCreating] = useState(false);
  const branch = branches.data?.find((b) => b.id === selected) ?? branches.data?.[0] ?? null;

  return (
    <AdminPage
      title={t("admin.branches.title")}
      actions={
        <>
          {branches.data && branches.data.length > 1 && (
            <SelectFilter
              label={t("admin.common.branch")}
              value={branch?.id ?? ""}
              onChange={(v) => {
                setSelected(v);
                setCreating(false);
              }}
              options={branches.data.map((b) => ({ value: b.id, label: pick(b, "name") }))}
            />
          )}
          {isSuper && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden />
              {t("admin.branches.new")}
            </Button>
          )}
        </>
      }
    >
      {branches.isError ? (
        <ErrorState onRetry={() => branches.refetch()} />
      ) : branches.isPending ? (
        <Skeleton className="h-96" />
      ) : creating ? (
        <Identity branch={null} editable />
      ) : !branch ? (
        <p className="text-char-700">{t("admin.branches.none")}</p>
      ) : (
        <div key={branch.id} className="space-y-5">
          {branch.pickup_paused && (
            <p className="flex items-center gap-2 rounded-xl bg-ember-600 px-4 py-3 font-semibold text-white">
              <PauseCircle className="size-5" aria-hidden />
              {t("admin.branches.paused")}
              {branch.pickup_paused_reason && <span className="font-normal">— {branch.pickup_paused_reason}</span>}
            </p>
          )}
          <Operations key={`ops-${branch.id}-${branch.pickup_paused}`} branch={branch} />
          <Hours branch={branch} />
          <SpecialDays branch={branch} />
          <Identity key={`id-${branch.id}`} branch={branch} editable={isSuper} />
        </div>
      )}
    </AdminPage>
  );
}

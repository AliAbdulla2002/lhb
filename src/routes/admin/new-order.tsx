import { useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, CarFront, Check, CreditCard, MessageSquarePlus, Minus, Plus, Search, ShoppingBag, Store, Trash2, UserRound } from "lucide-react";
import { useLang } from "~/i18n";
import { quoteCart } from "~/lib/api/menu";
import { useCategories } from "~/lib/api/queries";
import type { ProductDetail, Quote } from "~/lib/api/types";
import { useAdminBranches } from "~/features/admin/hooks";
import { AdminPage, Modal, SelectFilter } from "~/features/admin/ui";
import {
  addLine,
  fetchCounterMenu,
  itemsFromLines,
  phoneOk,
  MAX_NOTE,
  MAX_QTY,
  placeCounterOrder,
  QUICK_NOTES,
  setNotes as setLineNotes,
  setQuantity,
  toggleNotePhrase,
  type CounterLine,
  type CounterPayment,
  type CounterPlaced,
  type CounterRequest,
} from "~/features/admin/counter";
import { initialSelections, invalidOptions, selectedLabels, toggleValue, unitEstimate, type Selections } from "~/features/menu/customize";
import { ProductImage } from "~/features/menu/ProductCard";
import { normalizePlate, orderErrorMessage, PLATE_RE, SWATCH, VEHICLE_COLORS, type VehicleColor } from "~/features/checkout/api";
import { Button } from "~/ui/Button";
import { ErrorState, Skeleton } from "~/ui/Feedback";
import { InputField, TextareaField } from "~/ui/Field";
import { Price } from "~/ui/Price";
import { cn } from "~/ui/cn";

type Where = "car" | "inside";

/** Big, touch-sized segmented choice (works with gloves on a tablet). */
function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon: typeof CarFront }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex h-14 items-center justify-center gap-2 rounded-xl border-2 text-base font-bold transition",
            value === o.value ? "border-ember-500 bg-ember-50 text-ember-700" : "border-char-900/10 bg-white hover:border-char-900/25",
          )}
        >
          <o.icon className="size-5" aria-hidden />
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Quick requests ("no salad", "spicy"…) as big chips, plus free text for anything else. */
function NoteEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useLang();
  const parts = value.split(/[،,]\s*/).map((p) => p.trim());
  return (
    <div className="space-y-3">
      <p className="font-bold">{t("admin.newOrder.itemNote")}</p>
      <div className="flex flex-wrap gap-2">
        {QUICK_NOTES.map((k) => {
          const phrase = t(`admin.newOrder.quick.${k}`);
          const on = parts.includes(phrase);
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(toggleNotePhrase(value, phrase))}
              className={cn(
                "h-11 rounded-full border-2 px-4 font-bold transition",
                on ? "border-ember-500 bg-ember-500 text-white" : "border-char-900/10 bg-white hover:border-char-900/25",
              )}
            >
              {phrase}
            </button>
          );
        })}
      </div>
      <TextareaField
        label={t("admin.newOrder.otherNote")}
        placeholder={t("admin.newOrder.itemNotePlaceholder")}
        rows={2}
        maxLength={MAX_NOTE}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function LineNote({ line, onClose, onSave }: { line: CounterLine; onClose: () => void; onSave: (notes: string) => void }) {
  const { t, lang } = useLang();
  const [notes, setNotesText] = useState(line.notes ?? "");
  return (
    <Modal open onClose={onClose} title={lang === "ar" ? line.nameAr : line.nameEn}>
      <div className="space-y-4">
        <NoteEditor value={notes} onChange={setNotesText} />
        <Button size="lg" className="w-full" onClick={() => onSave(notes)}>
          <Check className="size-5" aria-hidden />
          {t("admin.newOrder.saveNote")}
        </Button>
      </div>
    </Modal>
  );
}

function ProductSheet({ product, onClose, onAdd }: { product: ProductDetail; onClose: () => void; onAdd: (line: Omit<CounterLine, "key">) => void }) {
  const { t, pick } = useLang();
  const [sel, setSel] = useState<Selections>(() => initialSelections(product));
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const bad = invalidOptions(product, sel);
  return (
    <Modal open onClose={onClose} title={pick(product, "name")} wide>
      <div className="space-y-5">
        {product.product_options.map((o) => (
          <fieldset key={o.id}>
            <legend className="mb-2 font-bold">
              {pick(o, "name")}{" "}
              <span className={cn("text-sm font-normal", bad.includes(o.id) ? "text-ember-700" : "text-char-700")}>
                {o.min_select > 0 ? t("admin.newOrder.required") : t("common.optional")}
                {o.max_select > 1 && ` · ${t("admin.newOrder.upTo", { count: o.max_select })}`}
              </span>
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {o.product_option_values.map((v) => {
                const on = (sel[o.id] ?? []).includes(v.id);
                return (
                  <button
                    key={v.id}
                    type="button"
                    aria-pressed={on}
                    disabled={!v.is_available}
                    onClick={() => setSel({ ...sel, [o.id]: toggleValue(o, sel[o.id] ?? [], v.id) })}
                    className={cn(
                      "min-h-14 rounded-xl border-2 px-3 py-2 text-start transition disabled:opacity-40",
                      on ? "border-ember-500 bg-ember-50" : "border-char-900/10 bg-white hover:border-char-900/25",
                    )}
                  >
                    <span className="block font-bold">{pick(v, "name")}</span>
                    {Number(v.price_delta) > 0 && (
                      <span className="text-sm text-char-700">
                        + <Price value={v.price_delta} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
        <NoteEditor value={notes} onChange={setNotes} />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-char-900/10 pt-4">
          <div className="flex items-center gap-2">
            <button type="button" aria-label={t("admin.newOrder.less")} onClick={() => setQty(Math.max(1, qty - 1))} className="grid size-12 place-items-center rounded-full border-2 border-char-900/15">
              <Minus className="size-5" aria-hidden />
            </button>
            <span className="w-10 text-center text-2xl font-black" aria-live="polite">{qty}</span>
            <button type="button" aria-label={t("admin.newOrder.more")} onClick={() => setQty(Math.min(MAX_QTY, qty + 1))} className="grid size-12 place-items-center rounded-full border-2 border-char-900/15">
              <Plus className="size-5" aria-hidden />
            </button>
          </div>
          <Button
            size="lg"
            disabled={bad.length > 0}
            onClick={() => {
              const ids = Object.values(sel).flat();
              onAdd({
                productId: product.id,
                nameAr: product.name_ar,
                nameEn: product.name_en,
                choices: selectedLabels(product, sel),
                optionValueIds: ids,
                quantity: qty,
                notes: notes.trim() || undefined,
                unitPrice: unitEstimate(product, sel),
              });
            }}
          >
            <Plus className="size-5" aria-hidden />
            {t("admin.newOrder.add")} · <Price value={unitEstimate(product, sel) * qty} />
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Done({ placed, plate, onNext }: { placed: CounterPlaced; plate: string | null; onNext: () => void }) {
  const { t } = useLang();
  return (
    <div role="dialog" aria-modal aria-labelledby="done-title" className="fixed inset-0 z-50 grid place-items-center bg-char-950/80 p-4">
      <div className="w-full max-w-md rounded-3xl bg-cream-50 p-8 text-center shadow-2xl">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-500 text-white">
          <Check className="size-9" strokeWidth={3} aria-hidden />
        </span>
        <h2 id="done-title" className="mt-4 text-lg font-bold text-char-700">{t("admin.newOrder.doneTitle")}</h2>
        <p className="mt-1 font-display text-5xl font-black tracking-wider" dir="ltr">{placed.order_number.slice(-4)}</p>
        <p className="mt-1 text-sm text-char-700" dir="ltr">{placed.order_number}</p>
        <p className="mt-3 text-2xl font-black"><Price value={placed.total} /></p>
        {plate && <p className="mt-2 text-char-700">{t("admin.newOrder.doneCar", { plate })}</p>}
        {placed.linked_customer && <p className="mt-2 text-sm text-emerald-700">{t("admin.newOrder.linked")}</p>}
        <div className="mt-6 grid gap-2">
          <Button size="lg" onClick={onNext} autoFocus>
            <Plus className="size-5" aria-hidden />
            {t("admin.newOrder.next")}
          </Button>
          <Link to="/admin/pickup" className="py-2 text-sm font-semibold text-ember-700 underline-offset-4 hover:underline">
            {t("admin.newOrder.toBoard")}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function NewOrder() {
  const { t, lang, pick } = useLang();
  const qc = useQueryClient();
  const branches = useAdminBranches();
  const categories = useCategories();
  const menu = useQuery({ queryKey: ["admin", "counter-menu"], queryFn: fetchCounterMenu, staleTime: 60_000 });

  const [branchId, setBranchId] = useState("");
  const branch = branchId || branches.data?.[0]?.id || "";
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<ProductDetail | null>(null);
  const [lines, setLines] = useState<CounterLine[]>([]);
  const [where, setWhere] = useState<Where>("car");
  const [plate, setPlate] = useState("");
  const [color, setColor] = useState<VehicleColor | null>(null);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [payment, setPayment] = useState<CounterPayment>("cash");
  const [paidNow, setPaidNow] = useState(true);
  const [placed, setPlaced] = useState<{ order: CounterPlaced; plate: string | null } | null>(null);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const noteLine = lines.find((l) => l.key === noteFor) ?? null;
  // One key per ticket so a double tap or a retry after a dropped connection never makes two orders.
  const key = useRef(crypto.randomUUID());

  const items = useMemo(() => itemsFromLines(lines), [lines]);
  const quote = useQuery<Quote>({ queryKey: ["counter-quote", items], queryFn: () => quoteCart(items), enabled: items.length > 0, placeholderData: (p) => p });

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (menu.data ?? []).filter(
      (p) => (!category || p.category_id === category) && (!q || p.name_ar.toLowerCase().includes(q) || p.name_en.toLowerCase().includes(q)),
    );
  }, [menu.data, category, search]);
  const usedCategories = useMemo(() => {
    const ids = new Set((menu.data ?? []).map((p) => p.category_id));
    return (categories.data ?? []).filter((c) => ids.has(c.id));
  }, [menu.data, categories.data]);

  const normalizedPlate = normalizePlate(plate);
  const plateOk = where === "inside" || normalizedPlate === "" || PLATE_RE.test(normalizedPlate);
  const carMissing = where === "car" && normalizedPlate === "";
  const count = lines.reduce((n, l) => n + l.quantity, 0);
  const issues = quote.data?.issues ?? [];
  const ready = !!branch && lines.length > 0 && plateOk && !carMissing && phoneOk(phone) && quote.isSuccess && !quote.isFetching && issues.length === 0;

  const reset = () => {
    setLines([]);
    setPlate("");
    setColor(null);
    setPhone("");
    setName("");
    setNotes("");
    setPayment("cash");
    setPaidNow(true);
    setTicketOpen(false);
    key.current = crypto.randomUUID();
  };

  const place = useMutation({
    mutationFn: () => {
      const req: CounterRequest = {
        branch_id: branch,
        payment,
        paid: paidNow,
        items,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(phone.trim() || name.trim() ? { customer: { ...(phone.trim() ? { phone: phone.trim() } : {}), ...(name.trim() ? { name: name.trim() } : {}) } } : {}),
        ...(where === "car" && normalizedPlate ? { vehicle: { plate: normalizedPlate, ...(color ? { color } : {}) } } : {}),
      };
      return placeCounterOrder(req, key.current);
    },
    onSuccess: (order) => {
      setPlaced({ order, plate: where === "car" ? normalizedPlate : null });
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
  });

  const add = (p: ProductDetail) => {
    if (!p.is_available) return;
    if (p.product_options.length) return setOpen(p);
    setLines((ls) => addLine(ls, { productId: p.id, nameAr: p.name_ar, nameEn: p.name_en, choices: [], optionValueIds: [], quantity: 1, unitPrice: Number(p.base_price) }));
  };

  const ticket = (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="mb-2 flex items-center gap-2 text-lg font-black">
          <ShoppingBag className="size-5 text-ember-500" aria-hidden />
          {t("admin.newOrder.ticket")} {count > 0 && <span className="text-char-700">({count})</span>}
        </h2>
        {lines.length === 0 ? (
          <p className="rounded-xl border-2 border-dashed border-char-900/10 p-6 text-center text-char-700">{t("admin.newOrder.empty")}</p>
        ) : (
          <ul className="divide-y divide-char-900/10 rounded-xl bg-white">
            {lines.map((l, i) => (
              <li key={l.key} className={cn("flex items-center gap-2 p-3", issues.some((x) => x.index === i) && "bg-ember-50")}>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{lang === "ar" ? l.nameAr : l.nameEn}</p>
                  {l.choices.length > 0 && <p className="truncate text-sm text-char-700">{l.choices.map((c) => (lang === "ar" ? c.ar : c.en)).join(" · ")}</p>}
                  <button
                    type="button"
                    onClick={() => setNoteFor(l.key)}
                    className={cn(
                      "mt-1 inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold",
                      l.notes ? "bg-amber-100 text-amber-900" : "bg-char-900/5 text-char-700",
                    )}
                  >
                    <MessageSquarePlus className="size-4 shrink-0" aria-hidden />
                    <span className="line-clamp-2 text-start">{l.notes || t("admin.newOrder.addNote")}</span>
                  </button>
                  <p className="text-sm"><Price value={quote.data?.lines.find((q) => q.index === i)?.line_total ?? l.unitPrice * l.quantity} /></p>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" aria-label={l.quantity === 1 ? t("admin.newOrder.remove") : t("admin.newOrder.less")} onClick={() => setLines(setQuantity(lines, l.key, l.quantity - 1))} className="grid size-11 place-items-center rounded-full border-2 border-char-900/10">
                    {l.quantity === 1 ? <Trash2 className="size-4 text-ember-700" aria-hidden /> : <Minus className="size-4" aria-hidden />}
                  </button>
                  <span className="w-7 text-center text-lg font-black">{l.quantity}</span>
                  <button type="button" aria-label={t("admin.newOrder.more")} disabled={l.quantity >= MAX_QTY} onClick={() => setLines(setQuantity(lines, l.key, l.quantity + 1))} className="grid size-11 place-items-center rounded-full border-2 border-char-900/10">
                    <Plus className="size-4" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {issues.length > 0 && <p className="mt-2 text-sm font-semibold text-ember-700">{t("admin.newOrder.unavailable")}</p>}
      </div>

      <Segmented
        label={t("admin.newOrder.where")}
        value={where}
        onChange={setWhere}
        options={[
          { value: "car", label: t("admin.newOrder.atCar"), icon: CarFront },
          { value: "inside", label: t("admin.newOrder.inside"), icon: Store },
        ]}
      />
      {where === "car" && (
        <div className="space-y-3">
          <InputField
            label={t("checkout.plate")}
            dir="ltr"
            inputMode="text"
            autoCapitalize="characters"
            className="text-center font-display text-2xl tracking-widest"
            value={plate}
            maxLength={12}
            error={plate && !plateOk ? t("orderErrors.vehicle_plate_invalid") : undefined}
            onChange={(e) => setPlate(e.target.value)}
          />
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("checkout.color")}>
            {VEHICLE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={t(`vehicleColor.${c}`)}
                title={t(`vehicleColor.${c}`)}
                onClick={() => setColor(color === c ? null : c)}
                className={cn("size-10 rounded-full border-2 transition", color === c ? "scale-110 border-ember-500 ring-4 ring-flame-400/40" : "border-char-900/15")}
                style={{ background: SWATCH[c] }}
              />
            ))}
          </div>
        </div>
      )}

      <details className="rounded-xl bg-white p-3" open={!!(phone || name)}>
        <summary className="flex cursor-pointer items-center gap-2 font-bold">
          <UserRound className="size-5 text-ember-500" aria-hidden />
          {t("admin.newOrder.customer")} <span className="text-sm font-normal text-char-700">({t("common.optional")})</span>
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <InputField label={t("admin.newOrder.phone")} hint={t("admin.newOrder.phoneHint")} type="tel" inputMode="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} error={!phoneOk(phone) ? t("admin.newOrder.phoneBad") : undefined} />
          <InputField label={t("admin.newOrder.name")} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          <div className="sm:col-span-2">
            <InputField label={t("admin.newOrder.orderNote")} value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </details>

      <Segmented
        label={t("admin.newOrder.payment")}
        value={payment}
        onChange={setPayment}
        options={[
          { value: "cash", label: t("admin.newOrder.cash"), icon: Banknote },
          { value: "card", label: t("admin.newOrder.card"), icon: CreditCard },
        ]}
      />
      <Segmented
        label={t("admin.newOrder.whenPaid")}
        value={paidNow ? "now" : "later"}
        onChange={(v) => setPaidNow(v === "now")}
        options={[
          { value: "now", label: t("admin.newOrder.paidNow"), icon: Check },
          { value: "later", label: t("admin.newOrder.paidLater"), icon: CarFront },
        ]}
      />

      <div className="sticky bottom-0 -mx-1 space-y-2 bg-cream-50 px-1 pb-1 pt-2">
        {place.isError && <p role="alert" className="text-sm font-semibold text-ember-700">{orderErrorMessage(place.error, t)}</p>}
        {carMissing && lines.length > 0 && <p className="text-sm text-char-700">{t("admin.newOrder.needPlate")}</p>}
        <Button size="lg" className="h-16 w-full text-lg" disabled={!ready || place.isPending} loading={place.isPending} onClick={() => place.mutate()}>
          {t("admin.newOrder.place")}
          {quote.data && lines.length > 0 && (
            <>
              {" · "}
              <Price value={quote.data.total} />
            </>
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <AdminPage
      title={t("admin.newOrder.title")}
      actions={
        (branches.data?.length ?? 0) > 1 ? (
          <SelectFilter label={t("admin.common.branch")} value={branch} onChange={setBranchId} options={(branches.data ?? []).map((b) => ({ value: b.id, label: pick(b, "name") }))} />
        ) : undefined
      }
    >
      <div className="grid gap-6 pb-24 md:grid-cols-[minmax(0,1fr)_20rem] md:pb-0 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <section aria-label={t("admin.newOrder.menu")} className="min-w-0 space-y-4">
          <label className="relative block">
            <span className="sr-only">{t("admin.newOrder.search")}</span>
            <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-char-700" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("admin.newOrder.search")}
              className="h-12 w-full rounded-full border border-char-900/15 bg-white ps-12 pe-4 text-base outline-none focus:border-ember-500 focus:ring-4 focus:ring-flame-400/30"
            />
          </label>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {[{ id: "", label: t("admin.newOrder.all") }, ...usedCategories.map((c) => ({ id: c.id, label: pick(c, "name") }))].map((c) => (
              <button
                key={c.id || "all"}
                type="button"
                aria-pressed={category === c.id}
                onClick={() => setCategory(c.id)}
                className={cn("h-11 shrink-0 rounded-full px-5 font-bold transition", category === c.id ? "bg-char-900 text-cream-50" : "bg-white text-char-900 hover:bg-char-900/5")}
              >
                {c.label}
              </button>
            ))}
          </div>
          {menu.isPending ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
              {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="aspect-[4/5] rounded-2xl" />)}
            </div>
          ) : menu.isError ? (
            <ErrorState onRetry={() => void menu.refetch()} />
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
              {shown.map((p) => {
                const inTicket = lines.filter((l) => l.productId === p.id).reduce((n, l) => n + l.quantity, 0);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => add(p)}
                      disabled={!p.is_available}
                      className="group relative flex h-full w-full flex-col overflow-hidden rounded-2xl bg-white text-start shadow-[var(--shadow-card)] transition active:scale-[0.97] disabled:opacity-50"
                    >
                      <ProductImage product={p} className={cn("aspect-[4/3] w-full object-cover", !p.is_available && "grayscale")} sizes="200px" />
                      <span className="flex flex-1 flex-col p-3">
                        <span className="font-bold leading-tight">{pick(p, "name")}</span>
                        <span className="mt-auto pt-1 text-sm text-char-700">
                          {p.is_available ? <Price value={p.base_price} /> : t("admin.newOrder.soldOut")}
                        </span>
                      </span>
                      {inTicket > 0 && (
                        <span className="absolute end-2 top-2 grid size-8 place-items-center rounded-full bg-ember-600 font-black text-white shadow">{inTicket}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Tablets and computers: the ticket stays beside the menu. Phones: a bar opens it. */}
        <aside className="hidden md:block">
          <div className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-char-900/10 bg-cream-50 p-4">{ticket}</div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-char-900/10 bg-cream-50 p-3 md:hidden">
        <Button size="lg" className="w-full" onClick={() => setTicketOpen(true)}>
          <ShoppingBag className="size-5" aria-hidden />
          {t("admin.newOrder.openTicket", { count })}
          {quote.data && lines.length > 0 && (
            <>
              {" · "}
              <Price value={quote.data.total} />
            </>
          )}
        </Button>
      </div>
      <Modal open={ticketOpen} onClose={() => setTicketOpen(false)} title={t("admin.newOrder.ticket")}>
        {ticket}
      </Modal>

      {open && (
        <ProductSheet
          product={open}
          onClose={() => setOpen(null)}
          onAdd={(line) => {
            setLines((ls) => addLine(ls, line));
            setOpen(null);
          }}
        />
      )}
      {noteLine && (
        <LineNote
          line={noteLine}
          onClose={() => setNoteFor(null)}
          onSave={(n) => {
            setLines((ls) => setLineNotes(ls, noteLine.key, n));
            setNoteFor(null);
          }}
        />
      )}
      {placed && (
        <Done
          placed={placed.order}
          plate={placed.plate}
          onNext={() => {
            setPlaced(null);
            reset();
          }}
        />
      )}
    </AdminPage>
  );
}

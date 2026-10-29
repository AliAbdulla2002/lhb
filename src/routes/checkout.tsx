import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CarFront, Check, Clock, MapPin, Wallet } from "lucide-react";
import type { Route } from "./+types/checkout";
import { useLang } from "~/i18n";
import { formatBHD } from "~/lib/money";
import { env } from "~/config/env";
import { quoteCart } from "~/lib/api/menu";
import { useBranches, useSettings } from "~/lib/api/queries";
import type { Quote } from "~/lib/api/types";
import { cart, useCart } from "~/features/cart/store";
import { useAuth } from "~/features/auth/AuthProvider";
import { RequireAuth } from "~/features/auth/RequireAuth";
import { normalizePhone } from "~/features/auth/schemas";
import { profileKey, updatePhone, useProfile } from "~/features/account/profile";
import {
  errorCode,
  fetchPickupSlots,
  itemsFromCart,
  normalizePlate,
  orderErrorMessage,
  placeOrder,
  PLATE_RE,
  SWATCH,
  VEHICLE_COLORS,
  type OrderRequest,
  type VehicleColor,
} from "~/features/checkout/api";
import { clearIdempotencyKey, idempotencyKeyFor } from "~/features/checkout/idempotency";
import { Button, ButtonLink } from "~/ui/Button";
import { Container, PageHeader } from "~/ui/Container";
import { BackendNotice, EmptyState, ErrorState, Skeleton } from "~/ui/Feedback";
import { InputField, TextareaField } from "~/ui/Field";
import { Price } from "~/ui/Price";
import { useToast } from "~/ui/Toast";
import { cn } from "~/ui/cn";

export const meta: Route.MetaFunction = () => [{ title: "إتمام الطلب | Checkout — لهب LAHAB" }, { name: "robots", content: "noindex" }];

function Section({ icon: Icon, title, children }: { icon: typeof Clock; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)]">
      <h2 className="flex items-center gap-2 text-lg font-black">
        <Icon className="size-5 text-ember-500" aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  );
}

function ChoiceCard({ checked, onChange, name, children, disabled }: { checked: boolean; onChange: () => void; name: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition",
        checked ? "border-ember-500 bg-ember-50" : "border-char-900/10 hover:border-char-900/25",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input type="radio" name={name} className="peer sr-only" checked={checked} disabled={disabled} onChange={onChange} />
      <span
        aria-hidden
        className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 peer-focus-visible:ring-4 peer-focus-visible:ring-flame-400/40", checked ? "border-ember-500 bg-ember-500 text-white" : "border-char-900/30")}
      >
        {checked && <Check className="size-3" strokeWidth={3} />}
      </span>
      <span className="flex-1">{children}</span>
    </label>
  );
}

function CheckoutForm() {
  const { t, lang, pick } = useLang();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const lines = useCart();
  const settings = useSettings();
  const branches = useBranches();
  const profile = useProfile(user?.id);

  const pickupBranches = (branches.data ?? []).filter((b) => b.accepts_pickup);
  const [branchId, setBranchId] = useState<string | null>(null);
  const branch = pickupBranches.find((b) => b.id === branchId) ?? pickupBranches.find((b) => !b.pickup_paused) ?? pickupBranches[0] ?? null;

  const [pickupAt, setPickupAt] = useState<string | null>(null); // null = ASAP
  const [byCar, setByCar] = useState(true);
  const [plate, setPlate] = useState("");
  const [color, setColor] = useState<VehicleColor | null>(null);
  const [notes, setNotes] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submitting = useRef(false);

  const items = useMemo(() => itemsFromCart(lines), [lines]);
  const quote = useQuery<Quote>({
    queryKey: ["quote", items, coupon],
    queryFn: () => quoteCart(items, coupon ?? undefined),
    enabled: items.length > 0,
    placeholderData: (prev) => prev,
  });
  const slots = useQuery({
    queryKey: ["slots", branch?.id],
    queryFn: () => fetchPickupSlots(branch!.id),
    enabled: !!branch && !branch.pickup_paused,
    refetchInterval: 60_000,
  });

  const normalizedPlate = normalizePlate(plate);
  const plateOk = !byCar || PLATE_RE.test(normalizedPlate);
  const hasPhone = !!profile.data?.phone;
  const issues = quote.data?.issues ?? [];
  const couponState = quote.data?.coupon;
  const orderingOpen = settings.data?.ordering_enabled ?? false;
  const cashOk = settings.data?.cash_on_pickup_enabled ?? false;
  const emailVerified = !!user?.email_confirmed_at;

  const request: OrderRequest | null = branch
    ? {
        branch_id: branch.id,
        fulfillment_type: "pickup",
        payment_method: "cash_on_pickup",
        pickup_at: pickupAt,
        items,
        ...(coupon && couponState?.valid ? { coupon_code: coupon } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(byCar && normalizedPlate ? { vehicle: { plate: normalizedPlate, ...(color ? { color } : {}) } } : {}),
      }
    : null;

  const blockers = [
    !orderingOpen && t("checkout.orderingOff"),
    !emailVerified && t("checkout.verifyEmail"),
    !cashOk && t("checkout.noPayment"),
    branch?.pickup_paused && t("checkout.branchPaused"),
    issues.length > 0 && t("checkout.fixCart"),
  ].filter(Boolean) as string[];
  const canSubmit = !!request && blockers.length === 0 && hasPhone && plateOk && quote.isSuccess && !quote.isPlaceholderData && !quote.isFetching;

  const savePhone = useMutation({
    mutationFn: async () => {
      const phone = normalizePhone(phoneInput);
      if (!phone) throw new Error("lahab.invalid_phone");
      await updatePhone(user!.id, phone);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: profileKey(user!.id) }),
    onError: () => toast(t("validation.phone"), "error"),
  });

  const submit = useMutation({
    mutationFn: async (req: OrderRequest) => placeOrder(req, idempotencyKeyFor(req)),
    onSuccess: (order) => {
      clearIdempotencyKey();
      cart.clear();
      void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      navigate(`/orders/${order.order_number}`, { replace: true, state: { justPlaced: true } });
    },
    onError: (error) => {
      const code = errorCode(error);
      setSubmitError(orderErrorMessage(error, t));
      if (code === "cart_invalid" || code === "coupon_invalid") void quote.refetch();
      if (code === "slot_full" || code === "branch_closed" || code === "pickup_time_too_soon") {
        setPickupAt(null);
        void slots.refetch();
      }
      if (code && code !== "rate_limited") clearIdempotencyKey(); // a rejected request can be changed and resent
    },
    onSettled: () => {
      submitting.current = false;
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !request || submitting.current) return; // guard against double taps
    submitting.current = true;
    setSubmitError(null);
    submit.mutate(request);
  };

  if (lines.length === 0 && !submit.isSuccess) {
    return (
      <Container className="py-12">
        <EmptyState title={t("cart.empty")} action={<ButtonLink to="/menu">{t("cart.browse")}</ButtonLink>} />
      </Container>
    );
  }

  if (settings.isError || branches.isError) return <Container className="py-12"><ErrorState onRetry={() => { void settings.refetch(); void branches.refetch(); }} /></Container>;
  if (settings.isPending || branches.isPending || profile.isPending) {
    return (
      <Container className="grid gap-6 py-10 lg:grid-cols-[1fr_22rem]">
        <Skeleton className="h-96" />
        <Skeleton className="h-64" />
      </Container>
    );
  }

  const total = quote.data?.total ?? 0;

  return (
    <form onSubmit={onSubmit} noValidate>
      <Container className="grid gap-6 py-8 lg:grid-cols-[1fr_22rem] lg:py-10">
        <div className="space-y-5">
          {blockers.map((b) => (
            <p key={b} role="alert" className="flex items-start gap-2 rounded-2xl bg-ember-50 px-4 py-3 text-ember-800">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
              <span>
                {b}{" "}
                {b === t("checkout.fixCart") && (
                  <Link to="/cart" className="font-semibold underline">
                    {t("checkout.editCart")}
                  </Link>
                )}
              </span>
            </p>
          ))}

          <Section icon={MapPin} title={t("checkout.branch")}>
            <fieldset className="grid gap-2">
              <legend className="sr-only">{t("checkout.branch")}</legend>
              {pickupBranches.map((b) => (
                <ChoiceCard key={b.id} name="branch" checked={branch?.id === b.id} onChange={() => { setBranchId(b.id); setPickupAt(null); }}>
                  <span className="block font-semibold">{pick(b, "name")}</span>
                  {pick(b, "address") && <span className="block text-sm text-char-700">{pick(b, "address")}</span>}
                  {b.pickup_paused && <span className="block text-sm font-semibold text-ember-700">{t("checkout.branchPaused")}</span>}
                </ChoiceCard>
              ))}
            </fieldset>
            {branch && pick(branch, "pickup_instructions") && <p className="rounded-xl bg-cream-100 px-4 py-3 text-sm">{pick(branch, "pickup_instructions")}</p>}
          </Section>

          {branch && !branch.pickup_paused && (
            <Section icon={Clock} title={t("checkout.pickupTime")}>
              <ChoiceCard name="time" checked={pickupAt === null} onChange={() => setPickupAt(null)}>
                <span className="block font-semibold">{t("checkout.asap")}</span>
                <span className="block text-sm text-char-700">{t("checkout.asapHint", { minutes: branch.pickup_lead_minutes })}</span>
              </ChoiceCard>
              <div>
                <p className="mb-2 text-sm font-semibold">{t("checkout.schedule")}</p>
                {slots.isPending ? (
                  <Skeleton className="h-12" />
                ) : slots.isError ? (
                  <ErrorState onRetry={() => slots.refetch()} />
                ) : slots.data.length === 0 ? (
                  <p className="text-sm text-char-700">{t("checkout.noSlots")}</p>
                ) : (
                  <div role="radiogroup" aria-label={t("checkout.schedule")} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
                    {slots.data.map((s) => {
                      const selected = pickupAt === s.slot_start;
                      const label = new Intl.DateTimeFormat(lang === "ar" ? "ar-BH-u-nu-latn" : "en-BH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Bahrain" }).format(new Date(s.slot_start));
                      return (
                        <button
                          key={s.slot_start}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={!s.available}
                          onClick={() => setPickupAt(s.slot_start)}
                          className={cn(
                            "shrink-0 rounded-full border px-4 py-2 text-sm font-semibold tabular-nums transition",
                            selected ? "border-ember-600 bg-ember-600 text-white" : "border-char-900/15 bg-white hover:border-char-900/40",
                            !s.available && "cursor-not-allowed line-through opacity-40",
                          )}
                        >
                          {label}
                          {!s.available && <span className="sr-only"> ({t("checkout.slotFull")})</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </Section>
          )}

          <Section icon={CarFront} title={t("checkout.vehicle")}>
            <label className="flex cursor-pointer items-center gap-3">
              <input type="checkbox" checked={byCar} onChange={(e) => setByCar(e.target.checked)} className="size-5 accent-ember-500" />
              <span className="font-medium">{t("checkout.byCar")}</span>
            </label>
            {byCar && (
              <>
                <InputField
                  label={t("checkout.plate")}
                  dir="ltr"
                  autoComplete="off"
                  autoCapitalize="characters"
                  maxLength={12}
                  hint={t("checkout.plateHint")}
                  error={plate && !plateOk ? t("orderErrors.vehicle_plate_invalid") : undefined}
                  value={plate}
                  onChange={(e) => setPlate(e.target.value)}
                  className="text-lg font-bold tracking-widest uppercase"
                />
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">
                    {t("checkout.color")} <span className="text-char-700/70">({t("common.optional")})</span>
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {VEHICLE_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={color === c}
                        aria-label={t(`vehicleColor.${c}`)}
                        title={t(`vehicleColor.${c}`)}
                        onClick={() => setColor(color === c ? null : c)}
                        className={cn(
                          "size-10 rounded-full border-2 transition",
                          color === c ? "scale-110 border-ember-500 ring-4 ring-flame-400/40" : "border-char-900/15",
                        )}
                        style={{ background: SWATCH[c] }}
                      />
                    ))}
                  </div>
                  {color && <p className="mt-2 text-sm text-char-700">{t(`vehicleColor.${color}`)}</p>}
                </fieldset>
              </>
            )}
          </Section>

          <Section icon={Wallet} title={t("checkout.payment")}>
            <ChoiceCard name="payment" checked={cashOk} onChange={() => {}} disabled={!cashOk}>
              <span className="block font-semibold">{t("checkout.cash")}</span>
              <span className="block text-sm text-char-700">{t("checkout.cashHint")}</span>
            </ChoiceCard>
            <p className="text-sm text-char-700/80">{t("checkout.onlineSoon")}</p>
          </Section>

          {!hasPhone && (
            <section className="space-y-3 rounded-[var(--radius-card)] border-2 border-flame-400 bg-white p-5">
              <p className="font-semibold">{t("checkout.phoneMissing")}</p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-56 flex-1">
                  <InputField label={t("checkout.phone")} type="tel" dir="ltr" autoComplete="tel" hint={t("auth.phoneHint")} value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} />
                </div>
                <Button variant="secondary" loading={savePhone.isPending} onClick={() => savePhone.mutate()}>
                  {t("checkout.savePhone")}
                </Button>
              </div>
            </section>
          )}

          <TextareaField label={t("checkout.notes")} placeholder={t("checkout.notesPlaceholder")} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <aside className="h-fit space-y-4 rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] lg:sticky lg:top-24">
          <h2 className="text-lg font-black">{t("checkout.summary")}</h2>
          <ul className="space-y-2 text-sm">
            {lines.map((l, index) => {
              const serverLine = quote.data?.lines.find((x) => x.index === index);
              const issue = issues.find((x) => x.index === index);
              return (
                <li key={l.key} className="flex justify-between gap-3">
                  <span className={cn(issue && "text-ember-700 line-through")}>
                    {l.quantity} × {lang === "ar" ? l.nameAr : l.nameEn}
                    {l.optionLabels.length > 0 && <span className="block text-xs text-char-700">{l.optionLabels.map((o) => o[lang]).join(" · ")}</span>}
                  </span>
                  {serverLine && <Price value={serverLine.line_total} />}
                </li>
              );
            })}
          </ul>

          <div className="flex gap-2 border-t border-char-900/10 pt-4">
            <label className="sr-only" htmlFor="coupon">
              {t("checkout.coupon")}
            </label>
            <input
              id="coupon"
              dir="ltr"
              placeholder={t("checkout.coupon")}
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
              className="h-10 min-w-0 flex-1 rounded-full border border-char-900/15 px-4 text-sm uppercase"
            />
            {coupon ? (
              <Button variant="ghost" size="sm" onClick={() => { setCoupon(null); setCouponInput(""); }}>
                {t("checkout.removeCoupon")}
              </Button>
            ) : (
              <Button variant="secondary" size="sm" disabled={!couponInput.trim()} onClick={() => setCoupon(couponInput.trim())}>
                {t("checkout.applyCoupon")}
              </Button>
            )}
          </div>
          {coupon && couponState && (
            <p role="status" className={cn("text-sm", couponState.valid ? "text-emerald-700" : "text-ember-700")}>
              {couponState.valid ? t("checkout.couponApplied", { code: couponState.code }) : t(`checkout.couponReason.${couponState.reason}`)}
            </p>
          )}

          {quote.isError ? (
            <ErrorState onRetry={() => quote.refetch()} />
          ) : !quote.data ? (
            <p className="text-sm text-char-700">{t("cart.checkingPrices")}</p>
          ) : (
            <dl className={cn("space-y-2 text-sm", quote.isFetching && "opacity-60")} aria-live="polite">
              <div className="flex justify-between">
                <dt>{t("cart.subtotal")}</dt>
                <dd><Price value={quote.data.subtotal} /></dd>
              </div>
              {quote.data.options_total > 0 && (
                <div className="flex justify-between">
                  <dt>{t("cart.options")}</dt>
                  <dd><Price value={quote.data.options_total} /></dd>
                </div>
              )}
              {quote.data.discount_total > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <dt>{t("cart.discount")}</dt>
                  <dd>− <Price value={quote.data.discount_total} /></dd>
                </div>
              )}
              <div className="flex justify-between border-t border-char-900/10 pt-3 text-lg font-black">
                <dt>{t("cart.total")}</dt>
                <dd><Price value={quote.data.total} /></dd>
              </div>
            </dl>
          )}

          {submitError && (
            <p role="alert" className="rounded-xl bg-ember-50 px-4 py-3 text-sm text-ember-800">
              {submitError}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" loading={submit.isPending} disabled={!canSubmit || submit.isPending}>
            {submit.isPending ? t("checkout.placing") : t("checkout.placeOrder", { total: formatBHD(total, lang) })}
          </Button>
          <p className="text-center text-xs text-char-700/70">{t("checkout.serverPrices")}</p>
        </aside>
      </Container>
    </form>
  );
}

export default function CheckoutPage() {
  const { t } = useLang();
  return (
    <>
      <PageHeader title={t("checkout.title")} />
      {!env ? (
        <Container className="py-12">
          <BackendNotice />
        </Container>
      ) : (
        <RequireAuth>
          <CheckoutForm />
        </RequireAuth>
      )}
    </>
  );
}

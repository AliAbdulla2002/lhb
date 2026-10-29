import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BellRing, CheckCircle2, Info, MapPin, Volume2, VolumeX } from "lucide-react";
import type { Route } from "./+types/pickup";
import { useLang } from "~/i18n";
import { env } from "~/config/env";
import { playChime, readSoundPref, unlockAudio, vibrate, writeSoundPref } from "~/lib/sound";
import { RequireAuth } from "~/features/auth/RequireAuth";
import { useCustomerOrder, type CustomerOrder } from "~/features/orders/customer-orders";
import { cooldownRemaining, notifyArrival, pickupPhase, retryAfterSeconds } from "~/features/pickup/pickup";
import { HornButton } from "~/features/pickup/HornButton";
import { errorCode, orderErrorMessage } from "~/features/checkout/api";
import { ButtonLink } from "~/ui/Button";
import { Container } from "~/ui/Container";
import { BackendNotice, EmptyState, ErrorState, Skeleton } from "~/ui/Feedback";
import { cn } from "~/ui/cn";

export const meta: Route.MetaFunction = () => [{ title: "الاستلام | Pickup — لهب LAHAB" }, { name: "robots", content: "noindex" }];

/** Keep the screen awake while the customer is waiting in the car, where supported. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let released = false;
    const acquire = () =>
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          if (released) void l.release();
          else lock = l;
        })
        .catch(() => undefined);
    void acquire();
    const onVisible = () => document.visibilityState === "visible" && void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [active]);
}

/** Current time, ticking once a second (drives the cooldown countdown). */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function PickupScreen({ order }: { order: CustomerOrder }) {
  const { t, lang, pick } = useLang();
  const queryClient = useQueryClient();
  const [sound, setSound] = useState(() => readSoundPref("customer", false));
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [serverWaitUntil, setServerWaitUntil] = useState(0);
  // One id per intended press; kept across network retries so the server can dedupe.
  const pendingRequest = useRef<string | null>(null);
  // Set synchronously on tap, so a fast double tap can't send before React re-renders.
  const inFlight = useRef(false);

  const now = useNow();
  const phase = pickupPhase(order, now);
  const waitMs = Math.max(cooldownRemaining(order.pickup_details?.last_notified_at, now), serverWaitUntil - now);
  const waitSeconds = Math.ceil(waitMs / 1000);
  useWakeLock(phase === "can_notify" || phase === "notified" || phase === "acknowledged");

  const notify = useMutation({
    mutationFn: () => {
      pendingRequest.current ??= crypto.randomUUID();
      return notifyArrival(order.id, pendingRequest.current);
    },
    onSuccess: () => {
      pendingRequest.current = null;
      setMessage({ tone: "ok", text: t("pickup.notified") });
      vibrate([60, 40, 60]);
      if (sound) playChime();
      void queryClient.invalidateQueries({ queryKey: ["my-orders", "one", order.order_number] });
    },
    onSettled: () => {
      inFlight.current = false;
    },
    onError: (error) => {
      const code = errorCode(error);
      if (code) pendingRequest.current = null; // the server answered; a new press is a new request
      const wait = retryAfterSeconds(error);
      if (wait) setServerWaitUntil(Date.now() + wait * 1000); // event handler, not render
      if (code === "notify_cooldown") setMessage({ tone: "ok", text: t("pickup.cooldown", { seconds: wait ?? 60 }) });
      else if (code === "notify_limit") setMessage({ tone: "ok", text: t("pickup.limit") });
      else if (code === "order_closed") setMessage({ tone: "error", text: t("pickup.closed") });
      else if (code === "order_expired") setMessage({ tone: "error", text: t("pickup.expired") });
      else if (code === "order_not_confirmed") setMessage({ tone: "error", text: t("pickup.waitConfirm") });
      else if (code) setMessage({ tone: "error", text: orderErrorMessage(error, t) });
      else setMessage({ tone: "error", text: t("pickup.failed") });
      void queryClient.invalidateQueries({ queryKey: ["my-orders", "one", order.order_number] });
    },
  });

  const press = () => {
    if (inFlight.current) return;
    inFlight.current = true;
    unlockAudio();
    vibrate(30);
    setMessage(null);
    notify.mutate();
  };

  const canPress = (phase === "can_notify" || phase === "notified" || phase === "acknowledged") && waitMs === 0;
  const Back = lang === "ar" ? ArrowRight : ArrowLeft;
  const pickup = order.pickup_details;

  const status =
    phase === "acknowledged" ? { icon: CheckCircle2, text: t("pickup.acknowledged"), tone: "bg-emerald-600 text-white" }
    : phase === "notified" ? { icon: BellRing, text: t("pickup.notified"), tone: "bg-flame-400 text-char-950" }
    : phase === "handed_over" ? { icon: CheckCircle2, text: t("pickup.handedOver"), tone: "bg-emerald-600 text-white" }
    : phase === "not_confirmed" ? { icon: Info, text: t("pickup.waitConfirm"), tone: "bg-cream-200 text-char-900" }
    : phase === "closed" ? { icon: Info, text: t("pickup.closed"), tone: "bg-cream-200 text-char-900" }
    : phase === "expired" ? { icon: Info, text: t("pickup.expired"), tone: "bg-cream-200 text-char-900" }
    : phase === "limit" ? { icon: BellRing, text: t("pickup.limit"), tone: "bg-flame-400 text-char-950" }
    : null;

  return (
    <div className="min-h-[calc(100dvh-4rem)] overflow-x-clip bg-char-950 pb-10 text-cream-50">
      <Container className="max-w-xl space-y-6 pt-6">
        <div className="flex items-center justify-between">
          <Link to={`/orders/${order.order_number}`} className="inline-flex items-center gap-2 text-sm font-semibold text-cream-100/80 hover:text-cream-50">
            <Back className="size-4" aria-hidden />
            {t("pickup.back")}
          </Link>
          <button
            type="button"
            onClick={() => {
              const next = !sound;
              setSound(next);
              writeSoundPref("customer", next);
              if (next) {
                unlockAudio();
                playChime({ volume: 0.05 });
              }
            }}
            aria-pressed={sound}
            aria-label={t("pickup.sound")}
            className="inline-flex items-center gap-2 rounded-full border border-cream-50/20 px-3 py-1.5 text-sm"
          >
            {sound ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
            {sound ? t("pickup.soundOn") : t("pickup.soundOff")}
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-cream-50/5 p-4">
            <dt className="text-xs uppercase tracking-wide text-cream-100/60">{t("pickup.order")}</dt>
            <dd className="mt-1 font-display text-2xl font-black" dir="ltr">
              {order.order_number.split("-").at(-1)}
            </dd>
            <dd className="text-xs text-cream-100/60" dir="ltr">
              {order.order_number}
            </dd>
          </div>
          <div className="rounded-2xl bg-cream-50/5 p-4">
            <dt className="text-xs uppercase tracking-wide text-cream-100/60">{t("pickup.plate")}</dt>
            {pickup?.vehicle_plate ? (
              <>
                <dd className="mt-1 font-display text-2xl font-black tracking-widest" dir="ltr">
                  {pickup.vehicle_plate}
                </dd>
                {pickup.vehicle_color && <dd className="text-xs text-cream-100/60">{t(`vehicleColor.${pickup.vehicle_color}`)}</dd>}
              </>
            ) : (
              <dd className="mt-1 text-sm text-cream-100/70">{t("pickup.noCar")}</dd>
            )}
          </div>
          {order.branches && (
            <div className="col-span-2 flex items-start gap-2 rounded-2xl bg-cream-50/5 p-4 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0 text-flame-400" aria-hidden />
              <div>
                <p className="font-semibold">{pick(order.branches, "name")}</p>
                {pick(order.branches, "pickup_instructions") && <p className="text-cream-100/70">{pick(order.branches, "pickup_instructions")}</p>}
              </div>
            </div>
          )}
        </dl>

        <p className="text-center text-sm text-cream-100/70">{t(`orders.step.${order.status}`)}</p>

        <HornButton
          label={t("pickup.horn")}
          sublabel={phase === "notified" || phase === "acknowledged" ? t("pickup.hornAgain") : t("pickup.hornSub")}
          onPress={press}
          sending={notify.isPending}
          disabled={!canPress}
          pulse={phase === "notified" || notify.isSuccess}
        />

        <div aria-live="polite" className="min-h-14 space-y-2 text-center">
          {notify.isPending && <p className="font-semibold">{t("pickup.sending")}</p>}
          {!notify.isPending && message && (
            <p role={message.tone === "error" ? "alert" : "status"} className={cn("rounded-2xl px-4 py-3 font-semibold", message.tone === "error" ? "bg-ember-600 text-white" : "bg-cream-50/10")}>
              {message.text}
            </p>
          )}
          {!notify.isPending && status && !message && (
            <p role="status" className={cn("inline-flex items-center gap-2 rounded-2xl px-4 py-3 font-semibold", status.tone)}>
              <status.icon className="size-5" aria-hidden />
              {status.text}
            </p>
          )}
          {waitSeconds > 0 && (phase === "notified" || phase === "acknowledged") && (
            <p className="text-sm text-cream-100/70">{t("pickup.cooldown", { seconds: waitSeconds })}</p>
          )}
        </div>

        <p className="text-center text-xs text-cream-100/50">{phase === "can_notify" ? t("pickup.howTo") : t("pickup.keepOpen")}</p>
      </Container>
    </div>
  );
}

function PickupLoader() {
  const { t } = useLang();
  const { orderNumber = "" } = useParams();
  const order = useCustomerOrder(orderNumber);
  if (order.isError) return <Container className="py-12"><ErrorState onRetry={() => order.refetch()} /></Container>;
  if (order.isPending) return <Container className="py-12"><Skeleton className="mx-auto size-64 rounded-full" /></Container>;
  if (!order.data || order.data.fulfillment_type !== "pickup")
    return (
      <Container className="py-12">
        <EmptyState title={t("orders.notFound")} action={<ButtonLink to="/account/orders" variant="secondary">{t("orders.back")}</ButtonLink>} />
      </Container>
    );
  return <PickupScreen order={order.data} />;
}

export default function PickupPage() {
  if (!env) return <Container className="py-12"><BackendNotice /></Container>;
  return (
    <RequireAuth>
      <PickupLoader />
    </RequireAuth>
  );
}

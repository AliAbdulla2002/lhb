import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing, CarFront, Check, Wifi, WifiOff } from "lucide-react";
import { useLang } from "~/i18n";
import { getSupabase } from "~/lib/supabase";
import { errorMessage, must } from "~/lib/errors";
import { formatDateTime } from "~/lib/time";
import { playChime, readSoundPref, unlockAudio, writeSoundPref } from "~/lib/sound";
import { acknowledgeArrival, NEXT_STATUS, transitionOrder, type OrderStatus } from "~/features/admin/orders";
import { useAdminBranches } from "~/features/admin/hooks";
import { AdminPage, SelectFilter, StatusBadge, Toggle } from "~/features/admin/ui";
import { SWATCH, type VehicleColor } from "~/features/checkout/api";
import { elapsed } from "~/features/pickup/pickup";
import { Button } from "~/ui/Button";
import { ErrorState, Skeleton } from "~/ui/Feedback";
import { useToast } from "~/ui/Toast";
import { cn } from "~/ui/cn";

interface QueueRow {
  order_id: string;
  order_number: string;
  branch_id: string;
  status: OrderStatus;
  customer_first_name: string;
  requested_pickup_at: string | null;
  created_at: string;
  vehicle_plate: string | null;
  vehicle_color: VehicleColor | null;
  arrival_status: "not_arrived" | "arrived" | "acknowledged" | "handed_over";
  arrived_at: string | null;
  last_notified_at: string | null;
  notify_count: number;
  acknowledged_at: string | null;
  branch_name_ar: string;
  branch_name_en: string;
}

const QUEUE_KEY = ["admin", "pickup-queue"];

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const ADVANCE_LABEL: Record<string, string> = {
  confirmed: "pickupQueue.confirm",
  preparing: "pickupQueue.start",
  ready: "pickupQueue.markReady",
  completed: "pickupQueue.handOver",
};

function QueueCard({ row, now, busy, onAcknowledge, onAdvance }: { row: QueueRow; now: number; busy: boolean; onAcknowledge: () => void; onAdvance: (to: OrderStatus) => void }) {
  const { t, lang, pick } = useLang();
  const arrived = row.arrival_status === "arrived";
  const waiting = arrived || row.arrival_status === "acknowledged";
  const next = NEXT_STATUS[row.status];
  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-2xl border-2 bg-white p-4",
        arrived ? "border-ember-500 shadow-[var(--shadow-glow)]" : waiting ? "border-emerald-500" : "border-char-900/10",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {row.vehicle_color && (
            <span aria-hidden className="size-10 shrink-0 rounded-full border-2 border-char-900/15" style={{ background: SWATCH[row.vehicle_color] }} />
          )}
          <div>
            <p className="whitespace-nowrap font-display text-2xl font-black tracking-wider sm:text-3xl" dir="ltr">
              {row.vehicle_plate ?? "—"}
            </p>
            <p className="text-sm text-char-700">
              {row.vehicle_color ? t(`vehicleColor.${row.vehicle_color}`) : t("pickup.noCar")}
              {row.customer_first_name && ` · ${row.customer_first_name}`}
            </p>
          </div>
        </div>
        <div className="text-end">
          <p className="font-display text-xl font-black" dir="ltr">
            #{row.order_number.split("-").at(-1)}
          </p>
          <p className="whitespace-nowrap text-xs text-char-700" dir="ltr">
            {row.order_number}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge kind="order" value={row.status} />
        {row.arrival_status !== "not_arrived" && <StatusBadge kind="arrival" value={row.arrival_status} />}
        {row.notify_count > 1 && <span className="font-semibold text-ember-700">{t("pickupQueue.notified", { count: row.notify_count })}</span>}
        <span className="text-char-700">{pick(row, "branch_name")}</span>
      </div>

      {waiting && row.arrived_at ? (
        <p className={cn("flex items-center gap-2 text-lg font-bold tabular-nums", arrived ? "text-ember-600" : "text-emerald-700")}>
          <BellRing className="size-5" aria-hidden />
          {t("pickupQueue.arrivedAgo", { time: elapsed(row.arrived_at, now) })}
        </p>
      ) : (
        row.requested_pickup_at && <p className="text-sm text-char-700">{t("orders.pickupAt")}: {formatDateTime(row.requested_pickup_at, lang)}</p>
      )}

      <div className="mt-auto flex flex-wrap gap-2">
        {arrived && (
          <Button size="lg" className="flex-1" disabled={busy} onClick={onAcknowledge}>
            <Check className="size-5" aria-hidden />
            {t("pickupQueue.acknowledge")}
          </Button>
        )}
        {next && (
          <Button size="lg" variant={arrived ? "secondary" : next === "completed" ? "primary" : "secondary"} className="flex-1" disabled={busy} onClick={() => onAdvance(next)}>
            {t(ADVANCE_LABEL[next]!)}
          </Button>
        )}
      </div>
    </li>
  );
}

export default function AdminPickupQueue() {
  const { t, pick } = useLang();
  const toast = useToast();
  const queryClient = useQueryClient();
  const branches = useAdminBranches();
  const [branch, setBranch] = useState("");
  const [sound, setSound] = useState(() => readSoundPref("staff", false));
  const [live, setLive] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const now = useNow();

  const queue = useQuery({
    queryKey: [...QUEUE_KEY, branch],
    queryFn: async () => {
      let q = getSupabase()!.from("staff_pickup_queue").select("*");
      if (branch) q = q.eq("branch_id", branch);
      return must(await q) as QueueRow[];
    },
    // Polling fallback: the queue is rebuilt from the database even if realtime drops.
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });

  // Realtime: any change to arrivals, pickup details or orders refreshes the queue.
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const refresh = () => void queryClient.invalidateQueries({ queryKey: QUEUE_KEY });
    const channel = sb
      .channel("pickup-queue")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pickup_arrival_events" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "pickup_details" }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, refresh)
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") refresh();
      });
    return () => {
      void sb.removeChannel(channel);
    };
  }, [queryClient]);

  // Alert on new arrivals, however the data arrived (realtime or polling).
  const seen = useRef<Map<string, number> | null>(null);
  useEffect(() => {
    if (!queue.data) return;
    const current = new Map(queue.data.filter((r) => r.arrival_status === "arrived").map((r) => [r.order_id, r.notify_count]));
    const previous = seen.current;
    seen.current = current;
    if (!previous) return; // first load: don't alert for the existing queue
    const fresh = queue.data.filter((r) => r.arrival_status === "arrived" && (previous.get(r.order_id) ?? 0) < r.notify_count);
    if (fresh.length === 0) return;
    if (sound) playChime({ volume: 0.15, notes: [880, 660, 880] });
    if (permission === "granted") {
      for (const r of fresh) {
        try {
          new Notification(t("pickupQueue.newArrival", { plate: r.vehicle_plate ?? "—", number: r.order_number }), { tag: r.order_id });
        } catch {
          // Some browsers only allow notifications from a service worker.
        }
      }
    }
  }, [queue.data, sound, permission, t]);

  const waiting = (queue.data ?? [])
    .filter((r) => r.arrival_status === "arrived" || r.arrival_status === "acknowledged")
    .sort((a, b) => Number(b.arrival_status === "arrived") - Number(a.arrival_status === "arrived") || (a.arrived_at ?? "").localeCompare(b.arrived_at ?? ""));
  const upcoming = (queue.data ?? [])
    .filter((r) => r.arrival_status === "not_arrived")
    .sort((a, b) => (a.requested_pickup_at ?? a.created_at).localeCompare(b.requested_pickup_at ?? b.created_at));
  const alerting = waiting.filter((r) => r.arrival_status === "arrived").length;

  useEffect(() => {
    const base = t("pickupQueue.title");
    document.title = alerting ? `(${alerting}) ${base}` : base;
    return () => {
      document.title = "Admin — لهب LAHAB";
    };
  }, [alerting, t]);

  const onError = (e: unknown) => toast(errorMessage(e, t), "error");
  const refresh = () => void queryClient.invalidateQueries({ queryKey: QUEUE_KEY });
  const acknowledge = useMutation({ mutationFn: acknowledgeArrival, onSuccess: refresh, onError });
  const advance = useMutation({ mutationFn: ({ id, to }: { id: string; to: OrderStatus }) => transitionOrder(id, to), onSuccess: refresh, onError });
  const busy = acknowledge.isPending || advance.isPending;

  return (
    <AdminPage
      title={t("pickupQueue.title")}
      actions={
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", live ? "bg-emerald-100 text-emerald-900" : "bg-flame-300/30 text-char-900")}>
          {live ? <Wifi className="size-3.5" aria-hidden /> : <WifiOff className="size-3.5" aria-hidden />}
          {live ? t("pickupQueue.connection") : t("pickupQueue.reconnecting")}
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-4">
        <SelectFilter
          label={t("admin.common.branch")}
          value={branch}
          onChange={setBranch}
          options={[{ value: "", label: t("admin.common.allBranches") }, ...(branches.data ?? []).map((b) => ({ value: b.id, label: pick(b, "name") }))]}
        />
        <Toggle
          checked={sound}
          onChange={(v) => {
            setSound(v);
            writeSoundPref("staff", v);
            if (v) {
              unlockAudio();
              playChime({ volume: 0.1 });
            }
          }}
          label={t("pickupQueue.sound")}
          hint={t("pickupQueue.soundHint")}
        />
        {permission === "default" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              try {
                setPermission(await Notification.requestPermission());
              } catch {
                setPermission("denied");
              }
            }}
          >
            <Bell className="size-4" aria-hidden />
            {t("pickupQueue.enableNotifications")}
          </Button>
        )}
        {permission === "denied" && <span className="text-xs text-char-700/70">{t("pickupQueue.notificationsBlocked")}</span>}
      </div>

      {queue.isError ? (
        <ErrorState onRetry={() => queue.refetch()} />
      ) : queue.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : (
        <>
          <section aria-labelledby="waiting-title" className="space-y-3">
            <h2 id="waiting-title" className="flex items-center gap-2 text-xl font-black">
              <CarFront className="size-5 text-ember-500" aria-hidden />
              {t("pickupQueue.waiting")}
              <span className="rounded-full bg-ember-600 px-2 text-sm text-white">{waiting.length}</span>
            </h2>
            {waiting.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-char-900/15 p-6 text-center text-char-700">{t("pickupQueue.empty")}</p>
            ) : (
              <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {waiting.map((r) => (
                  <QueueCard key={r.order_id} row={r} now={now} busy={busy} onAcknowledge={() => acknowledge.mutate(r.order_id)} onAdvance={(to) => advance.mutate({ id: r.order_id, to })} />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="upcoming-title" className="space-y-3">
            <h2 id="upcoming-title" className="text-xl font-black">
              {t("pickupQueue.upcoming")} <span className="text-base font-semibold text-char-700">({upcoming.length})</span>
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-char-700">{t("pickupQueue.noUpcoming")}</p>
            ) : (
              <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {upcoming.map((r) => (
                  <QueueCard key={r.order_id} row={r} now={now} busy={busy} onAcknowledge={() => acknowledge.mutate(r.order_id)} onAdvance={(to) => advance.mutate({ id: r.order_id, to })} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </AdminPage>
  );
}

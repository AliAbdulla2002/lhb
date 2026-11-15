import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign, Bookmark, Check, Copy, Gift, PartyPopper, Receipt, X } from "lucide-react";
import { useLang } from "~/i18n";
import { errorMessage, must } from "~/lib/errors";
import { getSupabase } from "~/lib/supabase";
import { useAdminBranches } from "~/features/admin/hooks";
import { parseComments, parseList, type ParseResult } from "~/features/admin/giveaway-parse";
import { collectorBookmarklet } from "~/features/admin/ig-collector";
import { AdminPage, Panel, Pill, SelectFilter, Toggle } from "~/features/admin/ui";
import { Button } from "~/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "~/ui/Feedback";
import { InputField, TextareaField } from "~/ui/Field";
import { cn } from "~/ui/cn";

type Source = "orders" | "instagram_comments" | "instagram_followers" | "list";

interface Winner {
  position: number;
  is_alternate: boolean;
  entry_key: string;
  label: string;
  order_id: string | null;
  order_number: string | null;
  phone: string | null;
}
interface Draw {
  id: string;
  title: string;
  source: Source;
  rules: Record<string, unknown>;
  entry_count: number;
  winners_count: number;
  alternates_count: number;
  seed: string;
  drawn_at: string;
  winners: Winner[];
}

const bahrainDate = (daysAgo: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bahrain" }).format(Date.now() - daysAgo * 86_400_000);
const clampInt = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));

export default function AdminGiveaways() {
  const { t } = useLang();
  const [tab, setTab] = useState<"orders" | "instagram">("orders");
  const [shown, setShown] = useState<{ draw: Draw; pool: string[]; animate: boolean } | null>(null);
  const history = useQuery({
    queryKey: ["admin", "giveaways"],
    queryFn: async () => must(await getSupabase()!.rpc("admin_list_giveaways", { p_limit: 30 })) as Draw[],
  });

  return (
    <AdminPage title={t("admin.giveaways.title")}>
      <p className="max-w-3xl text-sm text-char-700">{t("admin.giveaways.intro")}</p>

      <div role="tablist" className="inline-flex rounded-full bg-white p-1 shadow-[var(--shadow-card)]">
        {(
          [
            ["orders", Receipt, t("admin.giveaways.fromOrders")],
            ["instagram", AtSign, t("admin.giveaways.fromInstagram")],
          ] as const
        ).map(([key, Icon, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn("inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors", tab === key ? "bg-char-900 text-cream-50" : "text-char-800 hover:text-ember-600")}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {tab === "orders" ? (
        <OrdersDraw onDrawn={(draw) => setShown({ draw, pool: [], animate: true })} />
      ) : (
        <InstagramDraw onDrawn={(draw, pool) => setShown({ draw, pool, animate: true })} />
      )}

      <Panel title={t("admin.giveaways.history")}>
        {history.isError ? (
          <ErrorState message={errorMessage(history.error, t)} onRetry={() => history.refetch()} />
        ) : history.isPending ? (
          <Skeleton className="h-32" />
        ) : history.data.length === 0 ? (
          <EmptyState title={t("admin.giveaways.noHistory")} icon={<Gift className="size-8" />} />
        ) : (
          <ul className="divide-y divide-char-900/10">
            {history.data.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-bold">{d.title}</p>
                  <p className="text-sm text-char-700">
                    {t(`admin.giveaways.sources.${d.source}`)} · {t("admin.giveaways.entries", { count: d.entry_count })} ·{" "}
                    <span dir="ltr">{new Date(d.drawn_at).toLocaleString("en-GB", { timeZone: "Asia/Bahrain", dateStyle: "medium", timeStyle: "short" })}</span>
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    {d.winners.filter((w) => !w.is_alternate).map((w) => (
                      <Pill key={w.position} tone="good">{w.label}</Pill>
                    ))}
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setShown({ draw: d, pool: [], animate: false })}>
                  {t("admin.giveaways.show")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {shown && <Reveal draw={shown.draw} pool={shown.pool} animate={shown.animate} onClose={() => setShown(null)} />}
    </AdminPage>
  );
}

// ---- Draw from invoices ------------------------------------------------------------------

function OrdersDraw({ onDrawn }: { onDrawn: (d: Draw) => void }) {
  const { t, pick } = useLang();
  const qc = useQueryClient();
  const branches = useAdminBranches();
  const [title, setTitle] = useState("");
  const [from, setFrom] = useState(bahrainDate(29));
  const [to, setTo] = useState(bahrainDate(0));
  const [branch, setBranch] = useState("");
  const [minTotal, setMinTotal] = useState("0");
  const [perCustomer, setPerCustomer] = useState(true);
  const [winners, setWinners] = useState("1");
  const [alternates, setAlternates] = useState("1");
  const params = { p_from: from, p_to: to, p_branch: branch || null, p_min_total: Number(minTotal) || 0, p_per_customer: perCustomer };
  const count = useQuery({
    queryKey: ["admin", "giveaway-count", params],
    queryFn: async () => must(await getSupabase()!.rpc("admin_giveaway_order_count", params)) as number,
    enabled: !!from && !!to && from <= to,
  });
  const draw = useMutation({
    mutationFn: async () =>
      must(
        await getSupabase()!.rpc("admin_draw_orders", { ...params, p_title: title.trim() || defaultTitle(t("admin.giveaways.sources.orders")), p_winners: clampInt(winners, 1, 50), p_alternates: clampInt(alternates, 0, 20) }),
      ) as Draw,
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ["admin", "giveaways"] });
      onDrawn(d);
    },
  });

  return (
    <Panel>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <InputField label={t("admin.giveaways.name")} placeholder={t("admin.giveaways.namePlaceholder")} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        <InputField label={t("admin.giveaways.from")} type="date" dir="ltr" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        <InputField label={t("admin.giveaways.to")} type="date" dir="ltr" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        <SelectFilter
          label={t("admin.common.branch")}
          value={branch}
          onChange={setBranch}
          options={[{ value: "", label: t("admin.common.allBranches") }, ...(branches.data ?? []).map((b) => ({ value: b.id, label: pick(b, "name") }))]}
        />
        <InputField label={t("admin.giveaways.minTotal")} type="number" inputMode="decimal" min={0} step="0.1" dir="ltr" value={minTotal} onChange={(e) => setMinTotal(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <InputField label={t("admin.giveaways.winners")} type="number" min={1} max={50} dir="ltr" value={winners} onChange={(e) => setWinners(e.target.value)} />
          <InputField label={t("admin.giveaways.alternates")} type="number" min={0} max={20} dir="ltr" value={alternates} onChange={(e) => setAlternates(e.target.value)} hint={t("admin.giveaways.alternatesHint")} />
        </div>
      </div>
      <div className="mt-4">
        <Toggle checked={perCustomer} onChange={setPerCustomer} label={t("admin.giveaways.perCustomer")} hint={t("admin.giveaways.perCustomerHint")} />
      </div>
      <DrawBar
        count={count.data}
        countNote={t("admin.giveaways.eligibleNote")}
        disabled={!count.data || count.data < clampInt(winners, 1, 50)}
        pending={draw.isPending}
        error={draw.isError ? errorMessage(draw.error, t) : count.isError ? errorMessage(count.error, t) : null}
        onDraw={() => draw.mutate()}
      />
    </Panel>
  );
}

// ---- Draw from Instagram -----------------------------------------------------------------

/** Instagram blocks selecting usernames, so the manager pulls comments with a bookmark instead. */
function CollectorHelp() {
  const { t } = useLang();
  const link = useRef<HTMLAnchorElement>(null);
  // React refuses javascript: hrefs, so the bookmarklet is set on the element directly.
  useEffect(() => {
    link.current?.setAttribute("href", collectorBookmarklet());
  }, []);
  return (
    <div className="mt-4 rounded-2xl border border-ember-500/30 bg-ember-500/5 p-4 text-sm">
      <p className="font-bold">{t("admin.giveaways.collector.title")}</p>
      <ol className="mt-2 list-decimal space-y-1 ps-5 text-char-700">
        <li>
          {t("admin.giveaways.collector.step1")}{" "}
          <a
            ref={link}
            draggable
            onClick={(e) => e.preventDefault()}
            title={t("admin.giveaways.collector.dragMe")}
            className="mx-1 inline-flex cursor-grab items-center gap-1 rounded-full bg-ember-600 px-3 py-1 font-bold text-white active:cursor-grabbing"
          >
            <Bookmark className="size-3.5" aria-hidden />
            {t("admin.giveaways.collector.name")}
          </a>
        </li>
        <li>{t("admin.giveaways.collector.step2")}</li>
        <li>{t("admin.giveaways.collector.step3")}</li>
      </ol>
    </div>
  );
}

function InstagramDraw({ onDrawn }: { onDrawn: (d: Draw, pool: string[]) => void }) {
  const { t } = useLang();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [source, setSource] = useState<Source>("instagram_comments");
  const [text, setText] = useState("");
  const [minMentions, setMinMentions] = useState("0");
  const [exclude, setExclude] = useState("lahab.bh");
  const [winners, setWinners] = useState("1");
  const [alternates, setAlternates] = useState("1");
  const comments = source === "instagram_comments";
  const parsed: ParseResult = useMemo(() => {
    const ex = exclude.split(/[,\s]+/).filter(Boolean);
    return comments ? parseComments(text, { minMentions: clampInt(minMentions, 0, 20), exclude: ex }) : parseList(text, { exclude: ex });
  }, [text, minMentions, exclude, comments]);
  const pool = parsed.entries.map((e) => e.username);

  const draw = useMutation({
    mutationFn: async () =>
      must(
        await getSupabase()!.rpc("admin_draw_list", {
          p_title: title.trim() || defaultTitle(t(`admin.giveaways.sources.${source}`)),
          p_source: source,
          p_entries: pool,
          p_winners: clampInt(winners, 1, 50),
          p_alternates: clampInt(alternates, 0, 20),
          p_rules: comments ? { min_mentions: clampInt(minMentions, 0, 20), exclude: exclude.trim() } : { exclude: exclude.trim() },
        }),
      ) as Draw,
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ["admin", "giveaways"] });
      onDrawn(d, pool.map((p) => `@${p}`));
    },
  });

  return (
    <Panel>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <InputField label={t("admin.giveaways.name")} placeholder={t("admin.giveaways.namePlaceholder")} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        <SelectFilter
          label={t("admin.giveaways.source")}
          value={source}
          onChange={(v) => setSource(v as Source)}
          options={(["instagram_comments", "instagram_followers", "list"] as const).map((s) => ({ value: s, label: t(`admin.giveaways.sources.${s}`) }))}
        />
        <div className="grid grid-cols-2 gap-3">
          <InputField label={t("admin.giveaways.winners")} type="number" min={1} max={50} dir="ltr" value={winners} onChange={(e) => setWinners(e.target.value)} />
          <InputField label={t("admin.giveaways.alternates")} type="number" min={0} max={20} dir="ltr" value={alternates} onChange={(e) => setAlternates(e.target.value)} />
        </div>
      </div>
      {comments && <CollectorHelp />}
      <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <TextareaField
          label={comments ? t("admin.giveaways.pasteComments") : t("admin.giveaways.pasteList")}
          hint={comments ? t("admin.giveaways.pasteCommentsHint") : t("admin.giveaways.pasteListHint")}
          rows={10}
          dir="auto"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="space-y-4">
          {comments && (
            <InputField label={t("admin.giveaways.minMentions")} type="number" min={0} max={20} dir="ltr" value={minMentions} onChange={(e) => setMinMentions(e.target.value)} />
          )}
          <InputField label={t("admin.giveaways.exclude")} hint={t("admin.giveaways.excludeHint")} dir="ltr" value={exclude} onChange={(e) => setExclude(e.target.value)} />
        </div>
      </div>

      {text.trim() && (
        <div className="mt-4 rounded-2xl bg-cream-100 p-4">
          <p className="text-sm font-bold">
            {t("admin.giveaways.found", { count: parsed.entries.length })}
            {parsed.excluded.length > 0 && <span className="font-normal text-char-700"> · {t("admin.giveaways.excludedCount", { count: parsed.excluded.length })}</span>}
          </p>
          <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto" dir="ltr">
            {parsed.entries.slice(0, 300).map((e) => (
              <Pill key={e.username} tone="good">
                @{e.username}
                {comments && e.mentions > 0 && <span className="ms-1 opacity-70">· {t("admin.giveaways.mentionsShort", { count: e.mentions })}</span>}
              </Pill>
            ))}
            {parsed.excluded.slice(0, 100).map((e) => (
              <Pill key={`x-${e.username}`} tone="muted">
                <span className="line-through">@{e.username}</span>
                <span className="ms-1">({e.reason === "mentions" ? t("admin.giveaways.excludedMentions") : t("admin.giveaways.excludedListed")})</span>
              </Pill>
            ))}
          </div>
        </div>
      )}

      <DrawBar
        count={parsed.entries.length}
        disabled={parsed.entries.length < clampInt(winners, 1, 50)}
        pending={draw.isPending}
        error={draw.isError ? errorMessage(draw.error, t) : null}
        onDraw={() => draw.mutate()}
      />
    </Panel>
  );
}

/** Name used when the manager leaves the draw name empty, e.g. "Instagram comments · 15/11". */
function defaultTitle(source: string) {
  const d = new Date();
  return `${source} · ${d.getDate()}/${d.getMonth() + 1}`;
}

function DrawBar({ count, countNote, disabled, pending, error, onDraw }: { count: number | undefined; countNote?: string; disabled: boolean; pending: boolean; error: string | null; onDraw: () => void }) {
  const { t } = useLang();
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-char-900/10 pt-4">
      <div>
        <p className="text-sm text-char-700">{t("admin.giveaways.eligible")}</p>
        <p className="text-3xl font-black">{count ?? "—"}</p>
        {countNote && <p className="text-xs text-char-700">{countNote}</p>}
      </div>
      <div className="flex flex-col items-end gap-2">
        <Button size="lg" onClick={onDraw} disabled={disabled || pending} loading={pending}>
          <Gift className="size-5" aria-hidden />
          {pending ? t("admin.giveaways.drawing") : t("admin.giveaways.draw")}
        </Button>
        {error && <p role="alert" className="text-sm text-ember-700">{error}</p>}
      </div>
    </div>
  );
}

// ---- Full-screen reveal (made to be filmed for Instagram) --------------------------------

/** Name changes before landing; each one waits a little longer (about 2.5 s in all). */
const SPIN_STEPS = 24;

function Reveal({ draw, pool, animate, onClose }: { draw: Draw; pool: string[]; animate: boolean; onClose: () => void }) {
  const { t } = useLang();
  const main = draw.winners.filter((w) => !w.is_alternate);
  const alternates = draw.winners.filter((w) => w.is_alternate);
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [revealed, setRevealed] = useState(animate && !reduced ? 0 : main.length);
  const [spinning, setSpinning] = useState(animate && !reduced);
  const [shown, setShown] = useState("");
  const [copied, setCopied] = useState(false);
  const current = main[revealed];

  // Spin through names (or random order numbers), slowing down, then land on the winner.
  useEffect(() => {
    if (!spinning || !current) return;
    const names = pool.length ? pool : null;
    const fake = () => (draw.source === "orders" ? `LH-${current.label.slice(3, 9)}-${String(Math.floor(Math.random() * 9000) + 1000)}` : "@…");
    let step = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const p = step++ / SPIN_STEPS;
      if (p >= 1) {
        setShown(current.label);
        setSpinning(false);
        setRevealed((r) => r + 1);
        return;
      }
      setShown(names ? names[Math.floor(Math.random() * names.length)]! : fake());
      timer = setTimeout(tick, 40 + p * p * 260);
    };
    tick();
    return () => clearTimeout(timer);
  }, [spinning, current, pool, draw.source]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = async () => {
    const lines = [
      draw.title,
      ...main.map((w) => `${t("admin.giveaways.winnerN", { n: w.position })}: ${w.label}`),
      ...alternates.map((w, i) => `${t("admin.giveaways.alternate", { n: i + 1 })}: ${w.label}`),
      `${t("admin.giveaways.seed")}: ${draw.seed}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const finished = revealed >= main.length && !spinning;
  return (
    <div role="dialog" aria-modal="true" aria-label={draw.title} className="fixed inset-0 z-50 overflow-y-auto bg-char-950 text-cream-50">
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_bottom,var(--color-ember-500),transparent_60%)] opacity-50" />
      <button type="button" onClick={onClose} aria-label={t("admin.giveaways.close")} className="fixed end-4 top-4 z-10 grid size-11 place-items-center rounded-full bg-cream-50/10 hover:bg-cream-50/20">
        <X className="size-6" aria-hidden />
      </button>
      <div className="relative mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center gap-6 px-5 py-16 text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-cream-50/15 px-4 py-1.5 text-sm text-flame-300">
          <Gift className="size-4" aria-hidden />
          {t(`admin.giveaways.sources.${draw.source}`)} · {t("admin.giveaways.entries", { count: draw.entry_count })}
        </p>
        <h2 className="text-4xl font-black sm:text-5xl">{draw.title}</h2>

        {(spinning || (animate && revealed > 0 && !finished)) && current !== undefined && (
          <p className="text-sm text-cream-100/70">{t("admin.giveaways.winnerN", { n: current?.position ?? revealed + 1 })}</p>
        )}
        {spinning && (
          <div className="w-full rounded-3xl border-2 border-flame-400/40 bg-cream-50/5 px-6 py-8">
            <p dir="ltr" className="truncate text-4xl font-black text-flame-300 blur-[0.5px] sm:text-5xl">{shown}</p>
          </div>
        )}

        <ol className="w-full space-y-3">
          {main.slice(0, revealed).map((w, i) => (
            <li
              key={w.position}
              className={cn(
                "relative overflow-hidden rounded-3xl bg-cream-50 p-5 text-char-900 shadow-[0_20px_60px_rgba(229,65,53,0.45)]",
                i === revealed - 1 && animate && "motion-safe:animate-flare",
              )}
            >
              {i === revealed - 1 && animate && <Confetti />}
              <p className="text-sm font-semibold text-ember-600">{t("admin.giveaways.winnerN", { n: w.position })}</p>
              <p dir="ltr" className="text-3xl font-black sm:text-4xl">{w.label}</p>
              {w.order_id && (
                <p className="mt-1 flex flex-wrap justify-center gap-x-4 text-sm text-char-700">
                  {w.phone && <span dir="ltr">{t("admin.giveaways.contact")}: {w.phone}</span>}
                  <Link className="font-semibold text-ember-600 underline" to={`/admin/orders?search=${encodeURIComponent(w.order_number ?? "")}`}>
                    {t("admin.giveaways.openOrder")}
                  </Link>
                </p>
              )}
            </li>
          ))}
        </ol>

        {!spinning && !finished && (
          <Button size="lg" onClick={() => setSpinning(true)}>
            <PartyPopper className="size-5" aria-hidden />
            {revealed === 0 ? t("admin.giveaways.draw") : t("admin.giveaways.next")}
          </Button>
        )}

        {finished && (
          <>
            {alternates.length > 0 && (
              <div className="w-full rounded-3xl bg-cream-50/5 p-4">
                {alternates.map((w, i) => (
                  <p key={w.position} className="text-lg">
                    <span className="text-cream-100/60">{t("admin.giveaways.alternate", { n: i + 1 })}:</span>{" "}
                    <span dir="ltr" className="font-bold">{w.label}</span>
                  </p>
                ))}
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-3">
              <Button variant="outline-light" onClick={copy}>
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {copied ? t("admin.giveaways.copied") : t("admin.giveaways.copy")}
              </Button>
              <Button onClick={onClose}>{t("admin.giveaways.done")}</Button>
            </div>
            <div className="w-full text-start text-xs text-cream-100/60">
              <p>
                {t("admin.giveaways.seed")}: <code dir="ltr" className="break-all">{draw.seed}</code>
              </p>
              <p className="mt-1">{t("admin.giveaways.verify")}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const CONFETTI_COLORS = ["var(--color-flame-400)", "var(--color-ember-500)", "var(--color-cream-50)", "#ffd36b"];

function Confetti() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 [container-type:inline-size] motion-reduce:hidden">
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          className="absolute left-1/2 top-1/2 h-3 w-1.5 rounded-sm animate-ember-burst"
          style={{ background: CONFETTI_COLORS[i % CONFETTI_COLORS.length], ["--a" as string]: `${(360 / 28) * i}deg`, ["--d" as string]: 0.35 + (i % 4) * 0.08 }}
        />
      ))}
    </div>
  );
}

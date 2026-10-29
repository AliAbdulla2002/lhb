import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";
import { useLang } from "~/i18n";
import { Button } from "~/ui/Button";
import { cn } from "~/ui/cn";

export function AdminPage({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black sm:text-3xl">{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Panel({ title, children, className, actions }: { title?: string; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cn("rounded-2xl border border-char-900/10 bg-white p-4 sm:p-5", className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-lg font-bold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: ReactNode; hint?: string; tone?: "default" | "alert" }) {
  return (
    <div className={cn("rounded-2xl border p-4", tone === "alert" ? "border-flame-400 bg-flame-300/15" : "border-char-900/10 bg-white")}>
      <p className="text-sm text-char-700">{label}</p>
      <p className="mt-1 text-3xl font-black tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-char-700">{hint}</p>}
    </div>
  );
}

const STATUS_TONES: Record<string, string> = {
  pending: "bg-flame-300/30 text-char-900",
  confirmed: "bg-sky-100 text-sky-900",
  preparing: "bg-amber-100 text-amber-900",
  ready: "bg-emerald-100 text-emerald-900",
  completed: "bg-char-900/10 text-char-800",
  cancelled: "bg-ember-50 text-ember-700",
  arrived: "bg-ember-600 text-white",
  acknowledged: "bg-emerald-600 text-white",
  handed_over: "bg-char-900/10 text-char-800",
  not_arrived: "bg-char-900/5 text-char-700",
  paid: "bg-emerald-100 text-emerald-900",
  unpaid: "bg-char-900/5 text-char-700",
};

export function StatusBadge({ kind, value }: { kind: "order" | "arrival" | "payment"; value: string }) {
  const { t } = useLang();
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_TONES[value] ?? "bg-char-900/5")}>
      {t(`status.${kind}.${value}`)}
    </span>
  );
}

export function Pill({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "good" | "muted" | "warn" }) {
  const tones = {
    default: "bg-cream-200 text-char-800",
    good: "bg-emerald-100 text-emerald-900",
    muted: "bg-char-900/5 text-char-700",
    warn: "bg-ember-50 text-ember-700",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone])}>{children}</span>;
}

/** Accessible on/off switch. */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3", disabled && "cursor-not-allowed opacity-60")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-ember-500" : "bg-char-900/20",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow transition-[inset-inline-start]",
            checked ? "start-[1.375rem]" : "start-0.5",
          )}
        />
      </button>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-char-700">{hint}</span>}
      </span>
    </label>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const { t } = useLang();
  return (
    <label className="relative block w-full sm:w-72">
      <span className="sr-only">{t("admin.common.search")}</span>
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-char-700/60" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t("admin.common.search")}
        className="h-10 w-full rounded-full border border-char-900/15 bg-white ps-9 pe-4 text-sm focus:border-flame-500 focus:outline-none focus:ring-4 focus:ring-flame-400/25"
      />
    </label>
  );
}

export function SelectFilter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="text-char-700">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-full border border-char-900/15 bg-white px-3 focus:border-flame-500 focus:outline-none focus:ring-4 focus:ring-flame-400/25"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Native <dialog> modal: focus trapping, Escape and backdrop handled by the browser. */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useLang();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cn(
        "m-auto max-h-[92dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl bg-cream-50 p-0 text-char-900 shadow-2xl backdrop:bg-char-950/60",
        wide ? "max-w-3xl" : "max-w-lg",
      )}
    >
      {open && (
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-black">{title}</h2>
            <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full hover:bg-char-900/5" aria-label={t("admin.common.close")}>
              <X className="size-5" aria-hidden />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** Button that asks for confirmation in a modal before running a destructive action. */
export function ConfirmButton({
  label,
  message,
  onConfirm,
  variant = "ghost",
  size = "sm",
  icon,
}: {
  label: string;
  message: string;
  onConfirm: () => Promise<unknown> | void;
  variant?: "ghost" | "secondary" | "primary";
  size?: "sm" | "md";
  icon?: ReactNode;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        {icon}
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={label}>
        <p className="text-char-800">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t("admin.common.cancel")}
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                setOpen(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("admin.common.confirm")}
          </Button>
        </div>
      </Modal>
    </>
  );
}

export function MoveButtons({ onUp, onDown, first, last }: { onUp: () => void; onDown: () => void; first: boolean; last: boolean }) {
  const { t } = useLang();
  return (
    <span className="inline-flex">
      <button type="button" onClick={onUp} disabled={first} aria-label={t("admin.common.moveUp")} className="grid size-8 place-items-center rounded-full hover:bg-char-900/5 disabled:opacity-30">
        <ArrowUp className="size-4" aria-hidden />
      </button>
      <button type="button" onClick={onDown} disabled={last} aria-label={t("admin.common.moveDown")} className="grid size-8 place-items-center rounded-full hover:bg-char-900/5 disabled:opacity-30">
        <ArrowDown className="size-4" aria-hidden />
      </button>
    </span>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const { t } = useLang();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 text-sm">
      <Button variant="ghost" size="sm" disabled={page <= 0} onClick={() => onPage(page - 1)}>
        {t("admin.common.previous")}
      </Button>
      <span className="tabular-nums">
        {page + 1} / {pages}
      </span>
      <Button variant="ghost" size="sm" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
        {t("admin.common.next")}
      </Button>
    </div>
  );
}

/** Responsive table: a real table from sm up, stacked cards on phones. */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  empty,
  onRowClick,
}: {
  rows: T[];
  columns: { header: string; cell: (row: T) => ReactNode; className?: string; mobileHidden?: boolean }[];
  rowKey: (row: T) => string;
  empty: string;
  onRowClick?: (row: T) => void;
}) {
  if (rows.length === 0) return <p className="rounded-2xl border border-dashed border-char-900/15 p-8 text-center text-char-700">{empty}</p>;
  return (
    <>
      <div className="hidden overflow-x-auto rounded-2xl border border-char-900/10 bg-white sm:block">
        <table className="w-full text-sm">
          <thead className="bg-cream-100 text-start text-xs uppercase tracking-wide text-char-700">
            <tr>
              {columns.map((c) => (
                <th key={c.header} scope="col" className={cn("px-4 py-3 text-start font-semibold", c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-char-900/5">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={cn(onRowClick && "cursor-pointer hover:bg-cream-50")}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <td key={c.header} className={cn("px-4 py-3 align-middle", c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 sm:hidden">
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            className={cn("space-y-2 rounded-2xl border border-char-900/10 bg-white p-4", onRowClick && "cursor-pointer")}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
          >
            {columns
              .filter((c) => !c.mobileHidden)
              .map((c) => (
                <div key={c.header} className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-char-700">{c.header}</span>
                  <span className="text-end">{c.cell(row)}</span>
                </div>
              ))}
          </li>
        ))}
      </ul>
    </>
  );
}

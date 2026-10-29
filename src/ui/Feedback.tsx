import type { ReactNode } from "react";
import { AlertTriangle, PlugZap, UtensilsCrossed } from "lucide-react";
import { useLang } from "~/i18n";
import { Button } from "./Button";
import { cn } from "./cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-xl bg-char-900/[0.07]", className)} />;
}

export function EmptyState({ title, action, icon }: { title: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-[var(--radius-card)] border border-dashed border-char-900/15 px-6 py-14 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-cream-200 text-ember-600">
        {icon ?? <UtensilsCrossed className="size-6" aria-hidden />}
      </span>
      <p className="max-w-sm text-char-700">{title}</p>
      {action}
    </div>
  );
}

export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  const { t } = useLang();
  return (
    <div role="alert" className="flex flex-col items-center gap-4 rounded-[var(--radius-card)] bg-ember-50 px-6 py-10 text-center text-ember-800">
      <AlertTriangle className="size-7" aria-hidden />
      <p>{message ?? t("common.error")}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      )}
    </div>
  );
}

export function BackendNotice() {
  const { t } = useLang();
  return (
    <div role="status" className="flex items-start gap-3 rounded-2xl border border-flame-400/50 bg-flame-300/15 p-4 text-sm text-char-800">
      <PlugZap className="mt-0.5 size-5 shrink-0 text-flame-500" aria-hidden />
      <p>{t("common.backendMissing")}</p>
    </div>
  );
}

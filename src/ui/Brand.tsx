import { Flame } from "lucide-react";
import { useLang } from "~/i18n";
import { cn } from "./cn";

/** Official logo (owner-supplied, 150 px raster) on its cream badge, with the LAHAB SHAWARMA lockup. */
export function Logo({ className }: { className?: string }) {
  return <img src="/brand/lahab-logo.webp" alt="" width={150} height={150} className={cn("rounded-full", className)} decoding="async" />;
}

export function Wordmark({ className, tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  return (
    <span className={cn("inline-flex items-center gap-2 leading-none", className)}>
      <Logo className="size-[1.6em] shrink-0" />
      <span className="flex flex-col font-display" dir="ltr">
        <span className={cn("text-[0.7em] font-black tracking-[0.06em]", tone === "dark" ? "text-ember-700" : "text-cream-50")}>LAHAB</span>
        <span className={cn("text-[0.32em] font-bold tracking-[0.3em]", tone === "dark" ? "text-char-800" : "text-flame-400")}>SHAWARMA</span>
      </span>
      <span className="sr-only">لهب</span>
    </span>
  );
}

/** Branded placeholder for food imagery until licensed photos are uploaded. */
export function FoodPlaceholder({ className, label = true }: { className?: string; label?: boolean }) {
  const { t } = useLang();
  return (
    <div
      className={cn(
        "relative grid place-items-center overflow-hidden bg-[radial-gradient(120%_90%_at_50%_110%,var(--color-ember-500)_0%,var(--color-ember-800)_45%,var(--color-char-950)_100%)]",
        className,
      )}
    >
      <Flame className="size-1/4 max-h-20 max-w-20 text-flame-400/80" strokeWidth={1.5} aria-hidden />
      {label && (
        <span className="absolute bottom-2 start-2 rounded-full bg-char-950/50 px-2 py-0.5 text-[0.65rem] text-cream-100/80 backdrop-blur">
          {t("common.photoPending")}
        </span>
      )}
    </div>
  );
}

/** Lucide no longer ships brand marks; a minimal outline glyph for the Instagram link. */
export function InstagramIcon({ className }: { className?: string; "aria-hidden"?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
    </svg>
  );
}

import { CarFront, Loader2 } from "lucide-react";
import { cn } from "~/ui/cn";

/**
 * The "digital horn": a large, thumb-friendly button. Visual feedback is a ripple/glow;
 * sound and vibration are handled by the caller after the tap. Motion respects
 * prefers-reduced-motion via the global CSS rule.
 */
export function HornButton({
  label,
  sublabel,
  onPress,
  sending,
  disabled,
  pulse,
}: {
  label: string;
  sublabel: string;
  onPress: () => void;
  sending: boolean;
  disabled: boolean;
  /** Show the expanding rings (after a successful notification). */
  pulse: boolean;
}) {
  return (
    <div className="relative mx-auto grid size-64 place-items-center sm:size-72">
      {pulse && (
        <>
          <span aria-hidden className="absolute inset-0 rounded-full bg-ember-500/30 motion-safe:animate-ping" />
          <span aria-hidden className="absolute inset-6 rounded-full bg-flame-400/25 motion-safe:animate-ping [animation-delay:300ms]" />
        </>
      )}
      <button
        type="button"
        onClick={onPress}
        disabled={disabled || sending}
        aria-busy={sending || undefined}
        className={cn(
          "relative grid size-full place-items-center rounded-full text-white outline-offset-8 transition-[transform,box-shadow,filter] duration-200",
          "bg-[radial-gradient(circle_at_50%_35%,var(--color-flame-400),var(--color-ember-500)_55%,var(--color-ember-700))]",
          "shadow-[0_0_0_10px_rgb(246_134_26/0.15),0_20px_60px_-10px_rgb(224_64_31/0.8)]",
          "enabled:hover:scale-[1.02] enabled:active:scale-95 disabled:cursor-not-allowed disabled:saturate-50 disabled:opacity-70",
        )}
      >
        <span className="flex flex-col items-center gap-2">
          {sending ? <Loader2 className="size-14 animate-spin" aria-hidden /> : <CarFront className="size-16" strokeWidth={1.75} aria-hidden />}
          <span className="font-display text-4xl font-black leading-none">{label}</span>
          <span className="text-base font-semibold text-white/90">{sublabel}</span>
        </span>
      </button>
    </div>
  );
}

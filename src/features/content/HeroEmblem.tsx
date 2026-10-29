import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useLang } from "~/i18n";
import { Logo } from "~/ui/Brand";

const EMBERS = 12;

/**
 * The flame badge in the home hero. It tilts toward the pointer and flares with a burst of
 * embers when tapped. Purely playful: it doesn't navigate anywhere. Motion is skipped for
 * people who ask the system to reduce it.
 */
export function HeroEmblem() {
  const { t } = useLang();
  const tilt = useRef<HTMLDivElement>(null);
  const [burst, setBurst] = useState(0);

  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const el = tilt.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${(-y * 18).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(x * 18).toFixed(2)}deg`);
    el.style.setProperty("--px", `${(x * 18).toFixed(1)}px`);
    el.style.setProperty("--py", `${(y * 18).toFixed(1)}px`);
  };
  const reset = () => {
    for (const p of ["--rx", "--ry", "--px", "--py"]) tilt.current?.style.removeProperty(p);
  };

  return (
    <button
      type="button"
      aria-label={t("home.emblem")}
      onPointerMove={move}
      onPointerLeave={reset}
      onPointerCancel={reset}
      onClick={() => setBurst((n) => n + 1)}
      className="group relative mx-auto block aspect-square w-[min(100%,40svh)] max-w-[11rem] cursor-pointer touch-pan-y select-none rounded-full [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-flame-400 sm:max-w-[14rem] md:max-w-[16rem] lg:w-[min(100%,55svh)] lg:max-w-md"
    >
      <div
        ref={tilt}
        className="absolute inset-0 transition-transform duration-300 ease-out [transform:perspective(900px)_rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))] [transform-style:preserve-3d]"
      >
        <div aria-hidden className="absolute inset-0 rounded-full border border-flame-400/20 motion-safe:animate-ring-pulse" />
        <div aria-hidden className="absolute inset-[7%] rounded-full border-2 border-dashed border-flame-400/30 motion-safe:animate-spin-slow" />
        <div
          key={burst}
          className={`absolute inset-[14%] grid place-items-center rounded-full bg-cream-200 shadow-[var(--shadow-glow)] transition-shadow duration-300 group-hover:shadow-[0_0_0_1px_rgb(246_134_26/0.4),0_0_70px_-6px_rgb(246_134_26/0.8)] ${burst ? "motion-safe:animate-flare" : ""}`}
        >
          <Logo className="size-4/5 transition-transform duration-300 ease-out [transform:translate(var(--px,0),var(--py,0))]" />
        </div>
        {burst > 0 && (
          <div key={`e${burst}`} aria-hidden className="pointer-events-none absolute inset-0 [container-type:inline-size] motion-reduce:hidden">
            {Array.from({ length: EMBERS }, (_, i) => (
              <span
                key={i}
                className="absolute left-1/2 top-1/2 size-3 rounded-full bg-flame-400 shadow-[0_0_12px_var(--color-flame-400)] odd:bg-ember-500 animate-ember-burst"
                style={{ "--a": `${(360 / EMBERS) * i + (burst % 2) * 15}deg`, "--d": 0.62 + (i % 3) * 0.1 } as CSSProperties}
              />
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

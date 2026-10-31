import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Img, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, body, display } from "./theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Living fire behind everything: drifting glows, rising smoke, grain and a vignette. */
export const FireBackdrop = ({ calm = false, warm = 1 }: { calm?: boolean; warm?: number }) => {
  const f = useCurrentFrame();
  const blobs = [
    { c: C.red, x: 25, y: 108, r: 75, sp: 38 },
    { c: "#F07A1E", x: 78, y: 112, r: 62, sp: 52 },
    { c: C.yellow, x: 52, y: 122, r: 42, sp: 29 },
    { c: "#7A1A12", x: 8, y: 30, r: 55, sp: 71 },
    { c: "#9A2A14", x: 95, y: 55, r: 40, sp: 63 },
  ];
  return (
    <AbsoluteFill style={{ background: "#110504", overflow: "hidden" }}>
      {blobs.map((b, i) => {
        const x = b.x + Math.sin(f / b.sp + i) * 10;
        const y = b.y + Math.cos(f / (b.sp * 1.3) + i) * 5 + (calm ? 0 : Math.sin(f / 7 + i * 2) * 1.5);
        return (
          <div
            key={i}
            style={{
              position: "absolute", left: `${x}%`, top: `${y}%`, width: `${b.r * 2}%`, aspectRatio: "1", transform: "translate(-50%, -50%)",
              borderRadius: "50%", background: `radial-gradient(closest-side, ${b.c}, transparent)`, opacity: (calm ? 0.35 : 0.62) * warm, filter: "blur(30px)",
            }}
          />
        );
      })}
      <svg width="100%" height="200%" style={{ position: "absolute", top: 0, left: 0, transform: `translateY(${-((f * 2.2) % 1920)}px)`, opacity: calm ? 0.18 : 0.3, mixBlendMode: "screen" }}>
        <filter id="smoke">
          <feTurbulence type="fractalNoise" baseFrequency="0.004 0.009" numOctaves="3" seed="4" />
          <feColorMatrix values="0 0 0 0 0.95  0 0 0 0 0.55  0 0 0 0 0.35  0 0 0 1.6 -0.75" />
        </filter>
        <rect width="100%" height="100%" filter="url(#smoke)" />
      </svg>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.07, mixBlendMode: "overlay" }}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={f % 12} />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 85% 70% at 50% 45%, transparent 55%, rgba(0,0,0,0.75) 100%)" }} />
    </AbsoluteFill>
  );
};

/** Sparks flying up, denser and faster than the old embers. */
export const Sparks = ({ count = 34, opacity = 1, speed = 1 }: { count?: number; opacity?: number; speed?: number }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
      {Array.from({ length: count }, (_, i) => {
        const v = (3 + random(`v${i}`) * 7) * speed;
        const size = 3 + random(`s${i}`) * 9;
        const y = height + 30 - ((f * v + random(`y${i}`) * height) % (height + 60));
        const x = random(`x${i}`) * width + Math.sin((f + i * 17) / 11) * 26;
        const col = i % 4 === 0 ? C.red : i % 3 ? C.yellow : "#FFE7A3";
        return <div key={i} style={{ position: "absolute", left: x, top: y, width: size, height: size * 1.6, borderRadius: "50%", background: col, boxShadow: `0 0 ${size * 2}px ${col}`, opacity: 0.35 + random(`o${i}`) * 0.6 }} />;
      })}
    </AbsoluteFill>
  );
};

/** Screen shake that decays after `at`. */
export const useShake = (hits: number[], power = 18) => {
  const f = useCurrentFrame();
  let x = 0;
  let y = 0;
  for (const at of hits) {
    const t = f - at;
    if (t < 0 || t > 14) continue;
    const k = Math.exp(-t / 4) * power;
    x += Math.sin(t * 2.7 + at) * k;
    y += Math.cos(t * 3.1 + at) * k;
  }
  return `translate(${x}px, ${y}px)`;
};

/** A full-screen flash, for impacts. */
export const Flash = ({ at, color = "#FFF4D6", strength = 0.8 }: { at: number; color?: string; strength?: number }) => {
  const f = useCurrentFrame();
  const o = interpolate(f - at, [0, 2, 12], [0, strength, 0], clamp);
  return o > 0 ? <AbsoluteFill style={{ background: color, opacity: o, mixBlendMode: "screen", pointerEvents: "none" }} /> : null;
};

/** Expanding ring, for impacts and taps. */
export const Shockwave = ({ at, x, y, size = 600, color = C.yellow }: { at: number; x: number; y: number; size?: number; color?: string }) => {
  const f = useCurrentFrame();
  const t = interpolate(f - at, [0, 18], [0, 1], clamp);
  if (f < at || t >= 1) return null;
  return (
    <div style={{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: "50%", border: `${10 * (1 - t) + 2}px solid ${color}`, opacity: 1 - t, transform: `scale(${0.2 + t})`, pointerEvents: "none" }} />
  );
};

export type Word = { t: string; s: number };

/**
 * Words that land one by one as they are spoken. `at(word)` gives the local frame a word is
 * said; the word being said glows yellow, keywords stay red after.
 */
export const KineticWords = ({
  words, at, size = 92, color = C.paper, keywords = [], style, slam = false, lineBreakAfter = [],
}: {
  words: Word[]; at: (w: Word) => number; size?: number; color?: string; keywords?: string[]; style?: CSSProperties; slam?: boolean; lineBreakAfter?: number[];
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "baseline", columnGap: size * 0.28, rowGap: size * 0.05, direction: "rtl", ...style }}>
      {words.map((w, i) => {
        const a = at(w) - 2;
        const next = words[i + 1] ? at(words[i + 1]!) - 2 : a + 40;
        const p = spring({ frame: f - a, fps, config: slam ? { damping: 11, stiffness: 220, mass: 0.6 } : { damping: 14, stiffness: 180 } });
        const active = f >= a && f < next + 4;
        const key = keywords.some((k) => w.t.includes(k));
        const clean = w.t;
        return (
          <span key={i} style={{ display: "contents" }}>
            <span
              style={{
                fontFamily: display, fontWeight: 900, fontSize: size, lineHeight: 1.15, display: "inline-block",
                color: active ? C.yellow : key ? "#FF6A4D" : color,
                opacity: f < a ? 0 : Math.min(1, p * 1.4),
                transform: `translateY(${(1 - p) * (slam ? -60 : 40)}px) scale(${slam ? 1 + (1 - p) * 1.3 : 0.8 + p * 0.2})`,
                textShadow: active ? `0 0 34px rgba(250,186,16,0.65), 0 6px 0 rgba(0,0,0,0.35)` : "0 6px 0 rgba(0,0,0,0.35), 0 0 22px rgba(0,0,0,0.6)",
              }}
            >
              {clean}
            </span>
            {lineBreakAfter.includes(i) && <span style={{ flexBasis: "100%", height: 0 }} />}
          </span>
        );
      })}
    </div>
  );
};

/** Laptop with a 2160×1350 screenshot; zoom into `focus` (screenshot pixels). */
export const Laptop = ({ children, top = 520, width = 1000, enter = 0 }: { children: ReactNode; top?: number; width?: number; enter?: number }) => {
  const f = useCurrentFrame();
  const { fps, width: W } = useVideoConfig();
  const p = spring({ frame: f - enter, fps, config: { damping: 15 } });
  const h = width * 0.625;
  return (
    <div style={{ position: "absolute", top, left: (W - width) / 2, width, transform: `perspective(1800px) rotateX(${(1 - p) * 35}deg) translateY(${(1 - p) * 500}px)`, transformOrigin: "50% 100%" }}>
      <div style={{ background: "#141010", borderRadius: "26px 26px 8px 8px", padding: 16, boxShadow: "0 40px 100px rgba(0,0,0,0.6), inset 0 0 0 2px #3a2c2a" }}>
        <div style={{ position: "relative", width: width - 32, height: h - 32, overflow: "hidden", borderRadius: 8, background: C.paper }}>{children}</div>
      </div>
      <div style={{ height: 26, margin: "0 -60px", background: "linear-gradient(#5b4b48, #2a2120)", borderRadius: "0 0 30px 30px", boxShadow: "0 30px 60px rgba(0,0,0,0.5)" }} />
    </div>
  );
};

export const DeskShot = ({ src, width, zoom = 1, fx = 1080, fy = 675, style }: { src: string; width: number; zoom?: number; fx?: number; fy?: number; style?: CSSProperties }) => {
  const s = (width - 32) / 2160;
  return (
    <Img
      src={staticFile(`screens/${src}`)}
      style={{ position: "absolute", top: 0, left: 0, width: width - 32, transformOrigin: `${fx * s}px ${fy * s}px`, transform: `scale(${zoom})`, ...style }}
    />
  );
};

/** A Bahrain-style number plate that types itself. */
export const Plate = ({ text, at, style }: { text: string; at: number; style?: CSSProperties }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - at, fps, config: { damping: 12 } });
  const shown = Math.max(0, Math.min(text.length, Math.floor((f - at) / 3)));
  return (
    <div style={{ display: "flex", direction: "ltr", borderRadius: 18, overflow: "hidden", border: "6px solid #1d1d1d", background: "white", boxShadow: "0 30px 60px rgba(0,0,0,0.5)", transform: `scale(${p}) rotate(${(1 - p) * -8}deg)`, ...style }}>
      <div style={{ background: C.red, color: "white", fontFamily: body, fontWeight: 700, fontSize: 30, padding: "18px 16px", writingMode: "vertical-rl", transform: "rotate(180deg)", letterSpacing: 4 }}>BAHRAIN</div>
      <div style={{ fontFamily: display, fontWeight: 900, fontSize: 150, color: "#111", padding: "6px 46px", letterSpacing: 10, minWidth: 520, textAlign: "center" }}>
        {text.slice(0, shown)}
        <span style={{ opacity: Math.floor(f / 8) % 2 ? 0 : 1, color: C.red }}>{shown < text.length ? "|" : ""}</span>
      </div>
    </div>
  );
};

/** Simple front-view car, in the brand's red. */
export const Car = ({ size = 420, color = C.red, style }: { size?: number; color?: string; style?: CSSProperties }) => (
  <svg viewBox="0 0 200 140" width={size} height={size * 0.7} style={style}>
    <path d="M40 60 L58 22 Q62 14 72 14 L128 14 Q138 14 142 22 L160 60 Z" fill="#2b1a18" stroke="#000" strokeWidth="3" />
    <path d="M50 58 L64 26 Q66 22 72 22 L128 22 Q134 22 136 26 L150 58 Z" fill="#9fd3ff" opacity="0.55" />
    <rect x="18" y="56" width="164" height="54" rx="16" fill={color} stroke="#000" strokeWidth="3" />
    <circle cx="46" cy="80" r="11" fill="#FFF4C4" />
    <circle cx="154" cy="80" r="11" fill="#FFF4C4" />
    <rect x="72" y="88" width="56" height="16" rx="3" fill="white" stroke="#000" strokeWidth="2" />
    <rect x="28" y="108" width="24" height="22" rx="5" fill="#111" />
    <rect x="148" y="108" width="24" height="22" rx="5" fill="#111" />
  </svg>
);

/** A Lahab takeaway bag. */
export const Bag = ({ size = 200, style }: { size?: number; style?: CSSProperties }) => (
  <div style={{ position: "relative", width: size, height: size * 1.15, ...style }}>
    <div style={{ position: "absolute", top: 0, left: size * 0.3, width: size * 0.4, height: size * 0.32, border: `${size * 0.05}px solid #7a4a2a`, borderBottom: "none", borderRadius: `${size}px ${size}px 0 0` }} />
    <div style={{ position: "absolute", top: size * 0.22, width: size, height: size * 0.93, background: "#C99A62", borderRadius: size * 0.06, boxShadow: "0 20px 40px rgba(0,0,0,0.5)", display: "grid", placeItems: "center" }}>
      <Img src={staticFile("lahab-logo.png")} style={{ width: size * 0.55, height: size * 0.55, borderRadius: "50%" }} />
    </div>
  </div>
);

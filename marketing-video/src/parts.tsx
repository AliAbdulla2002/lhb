import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Img, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, SCALE, SCREEN_H, SCREEN_W, body, display } from "./theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const Backdrop = ({ dark = false }: { dark?: boolean }) => (
  <AbsoluteFill
    style={{
      background: dark
        ? `radial-gradient(120% 70% at 50% 100%, #8A2A1E 0%, ${C.night} 60%)`
        : `radial-gradient(110% 60% at 50% 0%, #FFF8E6 0%, ${C.cream} 70%, #E9D79A 100%)`,
    }}
  />
);

/** Embers drifting upward. */
export const Embers = ({ count = 26, opacity = 1 }: { count?: number; opacity?: number }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ opacity }}>
      {Array.from({ length: count }, (_, i) => {
        const speed = 2 + random(`s${i}`) * 4;
        const size = 6 + random(`z${i}`) * 16;
        const x = random(`x${i}`) * width + Math.sin((frame + i * 20) / 18) * 20;
        const y = height + 40 - ((frame * speed + random(`y${i}`) * height) % (height + 80));
        return (
          <div
            key={i}
            style={{
              position: "absolute", left: x, top: y, width: size, height: size, borderRadius: "50%",
              background: i % 3 ? C.yellow : C.red, opacity: 0.25 + random(`o${i}`) * 0.5, filter: "blur(1px)",
              boxShadow: `0 0 ${size}px ${i % 3 ? C.yellow : C.red}`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Arabic headline with an English subtitle, sliding in at `delay`. */
export const Caption = ({ ar, en, delay = 0, top = 120, dark = false }: { ar: string; en: string; delay?: number; top?: number; dark?: boolean }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 14 } });
  return (
    <div style={{ position: "absolute", top, left: 60, right: 60, textAlign: "center", direction: "rtl", opacity: p, transform: `translateY(${(1 - p) * 40}px)` }}>
      <div style={{ fontFamily: display, fontWeight: 800, fontSize: 84, lineHeight: 1.15, color: dark ? C.paper : C.maroon }}>{ar}</div>
      <div style={{ fontFamily: body, fontWeight: 500, fontSize: 36, marginTop: 14, color: dark ? C.yellow : C.red, direction: "ltr" }}>{en}</div>
    </div>
  );
};

/** A phone with a screenshot inside. `scrollY` is in screenshot pixels. */
export const Phone = ({ children, top = 440, enter = 0 }: { children: ReactNode; top?: number; enter?: number }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const p = spring({ frame: frame - enter, fps, config: { damping: 15, mass: 0.8 } });
  const bezel = 20;
  return (
    <div
      style={{
        position: "absolute", top, left: (width - SCREEN_W) / 2 - bezel, width: SCREEN_W + bezel * 2, height: SCREEN_H + bezel * 2,
        borderRadius: 78, background: "#151010", padding: bezel, boxSizing: "border-box",
        boxShadow: "0 50px 90px rgba(60,15,10,0.45), inset 0 0 0 3px #3a2a28",
        transform: `translateY(${(1 - p) * 500}px) rotate(${(1 - p) * -6}deg)`,
      }}
    >
      <div style={{ position: "relative", width: SCREEN_W, height: SCREEN_H, borderRadius: 58, overflow: "hidden", background: C.paper }}>{children}</div>
    </div>
  );
};

export const Shot = ({ src, scrollY = 0, style }: { src: string; scrollY?: number; style?: CSSProperties }) => (
  <Img
    src={staticFile(`screens/${src}`)}
    style={{ position: "absolute", top: 0, left: 0, width: SCREEN_W, transform: `translateY(${-scrollY * SCALE}px)`, ...style }}
  />
);

/** A finger tap at (x, y) in screenshot pixels. */
export const Tap = ({ x, y, at }: { x: number; y: number; at: number }) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < -8 || t > 22) return null;
  const press = interpolate(t, [-8, 0, 6], [0, 1, 0.85], clamp);
  const ring = interpolate(t, [0, 20], [0, 1], clamp);
  return (
    <>
      <div style={{ position: "absolute", left: x * SCALE - 45, top: y * SCALE - 45, width: 90, height: 90, borderRadius: "50%", background: "rgba(255,255,255,0.75)", border: `4px solid ${C.red}`, opacity: press * (1 - ring * 0.8), transform: `scale(${press})` }} />
      <div style={{ position: "absolute", left: x * SCALE - 45, top: y * SCALE - 45, width: 90, height: 90, borderRadius: "50%", border: `6px solid ${C.yellow}`, opacity: 1 - ring, transform: `scale(${1 + ring * 2.2})` }} />
    </>
  );
};

/** Flame-coloured sweep that covers each cut (right to left, like Arabic reading). */
export const FlameWipe = ({ at }: { at: number }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const t = interpolate(frame, [at - 9, at + 9], [0, 1], clamp);
  if (t <= 0 || t >= 1) return null;
  const x = interpolate(t, [0, 1], [width * 1.1, -width * 2.1]);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg width={width * 2} height={1920} viewBox="0 0 2160 1920" style={{ position: "absolute", left: x, top: 0 }}>
        <defs>
          <linearGradient id="fw" x1="0" x2="1">
            <stop offset="0" stopColor={C.yellow} />
            <stop offset="0.18" stopColor={C.red} />
            <stop offset="0.82" stopColor={C.red} />
            <stop offset="1" stopColor={C.yellow} />
          </linearGradient>
        </defs>
        <path
          d="M180 0 C120 160 260 260 160 420 C80 560 240 640 150 820 C70 980 230 1080 140 1260 C70 1400 220 1520 150 1700 L120 1920 L2040 1920 C2100 1760 1960 1640 2050 1480 C2120 1340 1980 1220 2060 1060 C2130 900 1990 800 2070 620 C2130 480 2000 360 2060 200 L2020 0 Z"
          fill="url(#fw)"
        />
      </svg>
    </AbsoluteFill>
  );
};

export const Logo = ({ size, style }: { size: number; style?: CSSProperties }) => (
  // The artwork sits on a cream square; show it as the round badge the website uses.
  <Img src={staticFile("lahab-logo.png")} style={{ width: size, height: size, objectFit: "cover", borderRadius: "50%", boxShadow: "0 0 0 8px rgba(250,186,16,0.35), 0 20px 60px rgba(0,0,0,0.4)", ...style }} />
);

import type React from "react";
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FlameWipe, Phone, Shot, Tap } from "./parts";
import { Bag, Car, DeskShot, Flash, FireBackdrop, KineticWords, Laptop, Plate, Shockwave, Sparks, useShake, type Word } from "./fx";
import { C, SCREEN_W, body, display } from "./theme";
import captions from "./captions.json";
import timeline from "./timeline.json";

// Everything is timed from the owner's recording: captions.json holds each word's start
// (seconds into public/vo/voice.wav), and the voice starts VOICE_AT frames into the video.
const FPS = timeline.fps;
const VOICE_AT = timeline.voiceAt;
export const TOTAL = timeline.total;
const CUTS = timeline.cuts; // scene starts, in frames
const abs = (s: number) => Math.round(VOICE_AT + s * FPS);
const L = captions as { text: string; start: number; end: number; words: Word[] }[];
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.45, 0, 0.2, 1);
const food = (slug: string) => staticFile(`food/${slug}.webp`);

/** Shrinks a phone so the captions below have room. */
const Small = ({ children }: { children: React.ReactNode }) => (
  <AbsoluteFill style={{ transform: "scale(0.82)", transformOrigin: "50% 8%" }}>{children}</AbsoluteFill>
);

/** Local frame (inside scene `i`) at which a word is spoken. */
const atIn = (i: number) => (w: Word) => abs(w.s) - CUTS[i]!;
const wordAt = (line: number, idx: number, scene: number) => abs(L[line]!.words[idx]!.s) - CUTS[scene]!;

// ---- 1. "لا تنزل من سيارتك." ---------------------------------------------------------
const Hook = () => {
  const f = useCurrentFrame();
  const at = atIn(0);
  const hits = L[0]!.words.map((w) => at(w));
  const shake = useShake(hits, 22);
  const lights = interpolate(f, [0, 6, 20], [0, 1, 0.55], clamp);
  return (
    <AbsoluteFill>
      <FireBackdrop warm={0.6} />
      {/* Headlights in the dark */}
      {[-1, 1].map((s) => (
        <div key={s} style={{ position: "absolute", top: 1180, left: 540 + s * 260 - 260, width: 520, height: 520, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(255,244,200,0.95), rgba(255,200,90,0.25) 45%, transparent)", opacity: lights * (0.85 + 0.15 * Math.sin(f / 3 + s)) }} />
      ))}
      <AbsoluteFill style={{ transform: shake, justifyContent: "center", alignItems: "center" }}>
        <KineticWords words={L[0]!.words} at={at} size={210} slam keywords={["تنزل"]} lineBreakAfter={[1]} style={{ marginTop: -260, width: 1000 }} />
      </AbsoluteFill>
      {hits.map((h) => <Flash key={h} at={h} strength={0.25} />)}
    </AbsoluteFill>
  );
};

// ---- 2. "شاورما لهب، صارت أونلاين." ------------------------------------------------------
const Launch = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logoAt = wordAt(1, 1, 1);
  const logo = spring({ frame: f - logoAt + 6, fps, config: { damping: 9, stiffness: 140 } });
  const phoneAt = wordAt(1, 2, 1);
  const shake = useShake([logoAt], 26);
  return (
    <AbsoluteFill>
      <FireBackdrop />
      <Sparks count={40} />
      <AbsoluteFill style={{ transform: shake }}>
        <div style={{ position: "absolute", top: 230, left: 540 - 230, width: 460, height: 460, transform: `scale(${logo}) rotate(${(1 - logo) * -90}deg)`, opacity: interpolate(f - phoneAt, [6, 16], [1, 0], clamp) }}>
          <Img src={staticFile("lahab-logo.png")} style={{ width: "100%", height: "100%", borderRadius: "50%", boxShadow: `0 0 0 14px rgba(250,186,16,0.35), 0 0 120px ${C.red}` }} />
        </div>
        <Shockwave at={logoAt} x={540} y={460} size={900} />
        <Sequence from={phoneAt} layout="none">
          <Small>
            <Phone top={150} enter={0}>
              <Shot src="home.jpg" />
            </Phone>
          </Small>
        </Sequence>
      </AbsoluteFill>
      <Flash at={logoAt} strength={0.6} />
    </AbsoluteFill>
  );
};

// ---- 3. "صحن، بوكس، برجر، والسوس على كيفك." ------------------------------------------------
const DISHES = [
  { slug: "chicken-shawarma-plate", name: "صحن شاورما", price: "3.000" },
  { slug: "arabic-chicken-shawarma-box", name: "بكس عربي", price: "2.800" },
  { slug: "chicken-shawarma-burger", name: "برجر شاورما", price: "1.700" },
  { slug: "lahab-signature-sauce", name: "7 سوسات", price: "0.300" },
];
const Dishes = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ats = [0, 1, 2, 3].map((i) => wordAt(2, i, 2));
  const shake = useShake(ats, 16);
  return (
    <AbsoluteFill>
      <FireBackdrop />
      <Sparks count={24} opacity={0.7} />
      <AbsoluteFill style={{ transform: shake }}>
        {DISHES.map((d, i) => {
          const a = ats[i]! - 3;
          const next = ats[i + 1] !== undefined ? ats[i + 1]! - 3 : 10_000;
          const p = spring({ frame: f - a, fps, config: { damping: 12, stiffness: 170 } });
          const out = spring({ frame: f - next, fps, config: { damping: 18 } });
          if (f < a - 1) return null;
          // Earlier dishes shrink into a row along the top.
          const big = 760;
          const small = 190;
          const size = big - (big - small) * out;
          const x = interpolate(out, [0, 1], [540, 170 + i * 245]) - size / 2;
          const y = interpolate(out, [0, 1], [380, 150]);
          return (
            <div key={d.slug} style={{ position: "absolute", left: x, top: y, width: size, transform: `scale(${p}) rotate(${(1 - p) * (i % 2 ? 25 : -25)}deg)`, zIndex: 10 - i }}>
              <Img src={food(d.slug)} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: `${10 - out * 5}px solid ${C.cream}`, boxShadow: `0 40px 90px rgba(0,0,0,0.6), 0 0 ${80 * (1 - out)}px rgba(229,65,53,0.6)` }} />
              <div style={{ position: "absolute", left: "50%", bottom: -30, transform: `translateX(-50%) scale(${1 - out * 0.55})`, display: "flex", gap: 14, alignItems: "center", direction: "rtl", whiteSpace: "nowrap", opacity: 1 - out }}>
                <span style={{ fontFamily: display, fontWeight: 900, fontSize: 64, color: C.paper, textShadow: "0 6px 20px rgba(0,0,0,0.8)" }}>{d.name}</span>
                <span style={{ fontFamily: display, fontWeight: 800, fontSize: 44, background: C.yellow, color: C.night, padding: "4px 22px", borderRadius: 999 }}>{d.price} د.ب.</span>
              </div>
            </div>
          );
        })}
      </AbsoluteFill>
      {ats.map((a) => <Shockwave key={a} at={a} x={540} y={760} size={800} color={C.red} />)}
    </AbsoluteFill>
  );
};

// ---- 4. "حدد وقتك، واكتب رقم سيارتك." ------------------------------------------------------
const Checkout = () => {
  const f = useCurrentFrame();
  const plateAt = wordAt(3, 2, 3);
  const swap = interpolate(f, [plateAt - 4, plateAt + 8], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill>
      <FireBackdrop calm />
      <Small>
        <Phone top={150} enter={0}>
          <Shot src="checkout-time.jpg" style={{ left: swap * SCREEN_W }} />
          <Shot src="checkout-car.jpg" style={{ left: (swap - 1) * SCREEN_W }} />
        </Phone>
      </Small>
      <Plate text="56789" at={plateAt + 4} style={{ position: "absolute", top: 1150, left: 180 }} />
    </AbsoluteFill>
  );
};

// ---- 5. "وصلت؟ دوس وصلت، ونطلع لك الطلب لين سيارتك." ------------------------------------------
const Arrive = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tapAt = wordAt(4, 1, 4) + 4;
  const after = interpolate(f, [tapAt + 4, tapAt + 10], [0, 1], clamp);
  const outAt = wordAt(4, 3, 4);
  const pull = spring({ frame: f - outAt, fps, config: { damping: 16 } });
  const carAt = wordAt(4, 6, 4);
  const car = spring({ frame: f - outAt - 6, fps, config: { damping: 14 } });
  const bagT = interpolate(f, [outAt + 10, carAt + 10], [0, 1], { ...clamp, easing: ease });
  const shake = useShake([tapAt], 20);
  return (
    <AbsoluteFill>
      <FireBackdrop warm={0.9} />
      <AbsoluteFill style={{ transform: shake }}>
        <div style={{ position: "absolute", inset: 0, transform: `translateX(${pull * 230}px) scale(${0.82 - pull * 0.34})`, transformOrigin: "50% 8%" }}>
          <Phone top={150} enter={0}>
            <Shot src="pickup-before.jpg" />
            <Shot src="pickup-after.jpg" style={{ opacity: after }} />
            <div style={{ position: "absolute", inset: 0 }}>
              <Tap x={585} y={1600} at={tapAt} />
            </div>
          </Phone>
        </div>
        <div style={{ position: "absolute", top: 930, left: 90, transform: `translateX(${(1 - car) * -800}px)` }}>
          <Car size={460} />
          <div style={{ position: "absolute", top: 200, left: 168, fontFamily: display, fontWeight: 900, fontSize: 30, color: "#111", width: 126, textAlign: "center" }}>56789</div>
        </div>
        {f > outAt + 8 && (
          <Bag size={150} style={{ position: "absolute", left: interpolate(bagT, [0, 1], [700, 220]), top: interpolate(bagT, [0, 0.5, 1], [600, 460, 860]), transform: `rotate(${Math.sin(f / 4) * 8}deg) scale(${interpolate(bagT, [0, 1], [0.6, 1])})`, opacity: interpolate(bagT, [0.92, 1], [1, 0], clamp) }} />
        )}
        <Shockwave at={carAt + 10} x={320} y={1090} size={700} />
      </AbsoluteFill>
      <Flash at={tapAt} color={C.yellow} strength={0.35} />
    </AbsoluteFill>
  );
};

// ---- 6. "لا طوابير، لا انتظار، ولا تنزل." ---------------------------------------------------
const NoQueues = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rows = [
    { words: L[5]!.words.slice(0, 2), strike: true },
    { words: L[5]!.words.slice(2, 4), strike: true },
    { words: L[5]!.words.slice(4), strike: false },
  ];
  const at = atIn(5);
  const hits = rows.map((r) => at(r.words[0]!));
  const shake = useShake(hits, 24);
  return (
    <AbsoluteFill>
      <FireBackdrop />
      <Sparks count={30} speed={1.4} />
      <AbsoluteFill style={{ transform: shake, justifyContent: "center", alignItems: "center", gap: 30 }}>
        {rows.map((r, i) => {
          const strikeP = spring({ frame: f - at(r.words[1]!) - 6, fps, config: { damping: 14 } });
          return (
            <div key={i} style={{ position: "relative" }}>
              <KineticWords words={r.words} at={at} size={i === 2 ? 190 : 150} slam keywords={i === 2 ? ["تنزل"] : []} color={i === 2 ? C.yellow : C.paper} />
              {r.strike && (
                <div style={{ position: "absolute", left: -30, right: -30, top: "52%", height: 22, background: C.red, borderRadius: 11, transform: `rotate(-6deg) scaleX(${strikeP})`, transformOrigin: "100% 50%", boxShadow: "0 0 30px rgba(229,65,53,0.8)" }} />
              )}
            </div>
          );
        })}
      </AbsoluteFill>
      {hits.map((h) => <Flash key={h} at={h} strength={0.2} />)}
    </AbsoluteFill>
  );
};

// ---- 7. "وللمطعم؟ كل طلب يوصل لوحة التحكم على طول." -----------------------------------------
const DemoTag = () => (
  <div style={{ position: "absolute", top: 120, width: "100%", textAlign: "center" }}>
    <span style={{ fontFamily: body, fontWeight: 600, fontSize: 30, color: C.cream, background: "rgba(0,0,0,0.45)", border: "1px solid rgba(240,228,178,0.3)", padding: "10px 26px", borderRadius: 999 }}>
      شاشات حقيقية من النظام · أرقام توضيحية
    </span>
  </div>
);
const Owner = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lapAt = wordAt(6, 1, 6) - 4;
  const titleOut = interpolate(f, [lapAt + 2, lapAt + 12], [1, 0], clamp);
  const toastAt = wordAt(6, 3, 6);
  const toast = spring({ frame: f - toastAt, fps, config: { damping: 13 } });
  const zoom = interpolate(f, [wordAt(6, 4, 6), wordAt(6, 4, 6) + 40], [1, 1.35], { ...clamp, easing: ease });
  return (
    <AbsoluteFill>
      <FireBackdrop calm warm={0.8} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: titleOut }}>
        <KineticWords words={L[6]!.words.slice(0, 1)} at={atIn(6)} size={190} slam color={C.yellow} />
      </AbsoluteFill>
      <Sequence from={lapAt} layout="none">
        <DemoTag />
        <Laptop top={430}>
          <DeskShot src="desk-orders.jpg" width={1000} zoom={zoom} fx={1500} fy={420} />
          <div style={{ position: "absolute", top: 18, left: 18, transform: `translateY(${(1 - toast) * -120}px)`, opacity: toast, background: C.night, color: C.paper, borderRadius: 14, padding: "12px 20px", fontFamily: display, fontWeight: 800, fontSize: 24, direction: "rtl", boxShadow: "0 12px 30px rgba(0,0,0,0.4)", display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ width: 14, height: 14, borderRadius: "50%", background: C.yellow, boxShadow: `0 0 14px ${C.yellow}` }} />
            طلب جديد · LH-0019
          </div>
        </Laptop>
      </Sequence>
    </AbsoluteFill>
  );
};

// ---- 8. "تعرف منو وصل، رقم سيارته ولونها، قبل لا يتصل." -------------------------------------
const WhoArrived = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zoom = interpolate(f, [4, 50], [1, 2.25], { ...clamp, easing: ease });
  const chips = [
    { label: "منو وصل", value: "Sara", at: wordAt(7, 1, 7), x: 70, y: 1140 },
    { label: "رقم السيارة", value: "56789", at: wordAt(7, 3, 7), x: 560, y: 1140 },
    { label: "اللون", value: "أحمر", at: wordAt(7, 5, 7), x: 315, y: 1290 },
  ];
  const pulse = 0.5 + 0.5 * Math.sin(f / 4);
  return (
    <AbsoluteFill>
      <FireBackdrop calm warm={0.8} />
      <DemoTag />
      <Laptop top={430} enter={-30}>
        <DeskShot src="desk-pickup.jpg" width={1000} zoom={zoom} fx={1460} fy={553} />
        <div style={{ position: "absolute", inset: 0, boxShadow: `inset 0 0 ${40 + pulse * 50}px rgba(229,65,53,${0.35 * Math.min(1, zoom - 1)})` }} />
      </Laptop>
      {chips.map((c) => {
        const p = spring({ frame: f - c.at, fps, config: { damping: 12 } });
        return (
          <div key={c.label} style={{ position: "absolute", left: c.x, top: c.y, width: 450, transform: `scale(${p})`, opacity: p, direction: "rtl", background: C.paper, borderRadius: 26, padding: "18px 28px", boxShadow: "0 24px 50px rgba(0,0,0,0.5)", borderInlineStart: `10px solid ${C.red}` }}>
            <div style={{ fontFamily: body, fontWeight: 600, fontSize: 30, color: "#7a5a50" }}>{c.label}</div>
            <div style={{ fontFamily: display, fontWeight: 900, fontSize: 64, color: C.night, direction: c.value === "أحمر" ? "rtl" : "ltr", textAlign: "right" }}>{c.value}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ---- 9. "تقارير المبيعات، العروض والكوبونات، والمنيو تعدله بنفسك." ----------------------------
const Tools = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a2 = wordAt(8, 2, 8) - 4;
  const a3 = wordAt(8, 4, 8) - 4;
  const which = f < a2 ? 0 : f < a3 ? 1 : 2;
  const shots = ["desk-reports.jpg", "desk-dashboard.jpg", "desk-products.jpg"];
  const focus = [
    { fx: 1500, fy: 700, z: 1.5 },
    { fx: 1080, fy: 500, z: 1.25 },
    { fx: 1200, fy: 650, z: 1.3 },
  ];
  const local = f - [0, a2, a3][which]!;
  const zoom = interpolate(local, [0, 60], [1, focus[which]!.z], { ...clamp, easing: ease });
  const whip = which === 0 ? 0 : interpolate(local, [0, 6], [1, 0], clamp);
  const chips = [
    { t: "٪ عروض", at: wordAt(8, 2, 8), x: 90 },
    { t: "كوبونات", at: wordAt(8, 3, 8), x: 580 },
  ];
  return (
    <AbsoluteFill>
      <FireBackdrop calm warm={0.8} />
      <DemoTag />
      <Laptop top={430} enter={-30}>
        <div style={{ position: "absolute", inset: 0, filter: `blur(${whip * 14}px)`, transform: `translateX(${whip * -160}px)` }}>
          <DeskShot src={shots[which]!} width={1000} zoom={zoom} fx={focus[which]!.fx} fy={focus[which]!.fy} />
        </div>
      </Laptop>
      {chips.map((c) => {
        const p = spring({ frame: f - c.at, fps, config: { damping: 11 } });
        const gone = interpolate(f, [a3, a3 + 8], [1, 0], clamp);
        return (
          <div key={c.t} style={{ position: "absolute", top: 1160, left: c.x, transform: `scale(${p}) rotate(${(1 - p) * 20}deg)`, opacity: p * gone, fontFamily: display, fontWeight: 900, fontSize: 70, color: C.night, background: C.yellow, padding: "14px 40px", borderRadius: 30, boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
            {c.t}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ---- 10. "لهب. اطلب الحين، واستلم من سيارتك." -----------------------------------------------
const Finale = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const at = atIn(9);
  const logoAt = at(L[9]!.words[0]!) - 4;
  const logo = spring({ frame: f - logoAt, fps, config: { damping: 9, stiffness: 150 } });
  const info = spring({ frame: f - (at(L[9]!.words[5]!) + 12), fps, config: { damping: 14 } });
  const shake = useShake([logoAt + 4], 26);
  const ring = ["chicken-shawarma-plate", "chicken-shawarma-burger", "cheesy-fries", "arabic-chicken-shawarma-box", "lahab-salad", "mozzarella-sticks"];
  return (
    <AbsoluteFill>
      <FireBackdrop />
      <Sparks count={46} speed={1.2} />
      <AbsoluteFill style={{ transform: shake }}>
        {ring.map((slug, i) => {
          const ang = (i / ring.length) * Math.PI * 2 + f / 70;
          const p = spring({ frame: f - logoAt - 4 - i * 2, fps, config: { damping: 13 } });
          return (
            <Img key={slug} src={food(slug)} style={{ position: "absolute", width: 170, height: 170, borderRadius: "50%", objectFit: "cover", border: `5px solid ${C.cream}`, left: 540 - 85 + Math.cos(ang) * 360 * p, top: 520 - 85 + Math.sin(ang) * 360 * p, opacity: p, boxShadow: "0 16px 30px rgba(0,0,0,0.5)" }} />
          );
        })}
        <div style={{ position: "absolute", top: 300, left: 540 - 220, width: 440, height: 440, transform: `scale(${logo})` }}>
          <Img src={staticFile("lahab-logo.png")} style={{ width: "100%", height: "100%", borderRadius: "50%", boxShadow: `0 0 0 14px rgba(250,186,16,0.4), 0 0 140px ${C.red}` }} />
        </div>
        <Shockwave at={logoAt + 4} x={540} y={520} size={1000} />
        <KineticWords words={L[9]!.words.slice(1)} at={at} size={108} slam keywords={["سيارتك"]} lineBreakAfter={[1]} style={{ position: "absolute", top: 990, left: 40, right: 40 }} />
        <div style={{ position: "absolute", top: 1470, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 26, opacity: info, transform: `translateY(${(1 - info) * 60}px)` }}>
          <div style={{ fontFamily: body, fontWeight: 700, fontSize: 60, color: "white", background: `linear-gradient(90deg, ${C.red}, #F07A1E)`, padding: "22px 64px", borderRadius: 999, direction: "ltr", boxShadow: "0 20px 60px rgba(229,65,53,0.6)" }}>@lahab.bh</div>
          <div style={{ fontFamily: body, fontWeight: 500, fontSize: 42, color: C.cream, direction: "ltr" }}>WhatsApp 33447433 · عالي، البحرين</div>
        </div>
      </AbsoluteFill>
      <Flash at={logoAt + 4} strength={0.7} />
    </AbsoluteFill>
  );
};

// ---- Captions: the spoken line, word by word, under the visuals -------------------------
const HERO_LINES = new Set([0, 5, 9]); // these scenes show their own words full screen
const CaptionBar = ({ line, from }: { line: number; from: number }) => {
  const f = useCurrentFrame();
  const fadeIn = interpolate(f, [0, 5], [0, 1], clamp);
  // Line 7 opens with "وللمطعم؟" full screen, so its caption leaves that word out.
  const words = line === 6 ? L[line]!.words.slice(1) : L[line]!.words;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 150, opacity: fadeIn }}>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 560, background: "linear-gradient(transparent, rgba(10,3,2,0.92) 55%)" }} />
      <KineticWords words={words} at={(w) => abs(w.s) - from} size={78} style={{ width: 980, position: "relative" }} />
    </AbsoluteFill>
  );
};

export const LahabReel = () => {
  const scenes = [Hook, Launch, Dishes, Checkout, Arrive, NoQueues, Owner, WhoArrived, Tools, Finale];
  return (
    <AbsoluteFill style={{ background: "#110504" }}>
      {scenes.map((Scene, i) => (
        <Sequence key={i} from={CUTS[i]!} durationInFrames={(CUTS[i + 1] ?? TOTAL) - CUTS[i]!}>
          <Scene />
        </Sequence>
      ))}
      {L.map((l, i) => {
        if (HERO_LINES.has(i)) return null;
        const from = abs(i === 6 ? l.words[1]!.s : l.start) - 3;
        return (
          <Sequence key={`c${i}`} from={from} durationInFrames={(CUTS[i + 1] ?? TOTAL) - from}>
            <CaptionBar line={i} from={from} />
          </Sequence>
        );
      })}
      {CUTS.slice(1).map((c) => (
        <FlameWipe key={c} at={c} />
      ))}
      <Audio src={staticFile("music.wav")} volume={(fr) => (L.some((l) => fr >= abs(l.start) - 4 && fr <= abs(l.end) + 4) ? 0.25 : 0.7)} />
      <Sequence from={VOICE_AT} layout="none">
        <Audio src={staticFile("vo/voice.wav")} />
      </Sequence>
    </AbsoluteFill>
  );
};

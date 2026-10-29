import type { CSSProperties } from "react";
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop, Caption, Embers, FlameWipe, Logo, Phone, Shot, Tap } from "./parts";
import { C, SCREEN_W, SHOT_H, body, display } from "./theme";
import timeline from "./timeline.json";

// Scene lengths are set so each voice-over line (public/vo/N.mp3) fits its scene.
const SCENES = timeline.scenes;
const STARTS = SCENES.map((_, i) => SCENES.slice(0, i).reduce((a, b) => a + b, 0));
export const TOTAL = SCENES.reduce((a, b) => a + b, 0);
const VO_DELAY = timeline.voDelay;
const HORN_FRAME = timeline.hornAt[1];

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.45, 0, 0.2, 1);
const food = (slug: string) => staticFile(`food/${slug}.webp`);

/** A round photo of a dish (the photos are square, with the brand's red brush circle). */
const Dish = ({ slug, size, style }: { slug: string; size: number; style?: CSSProperties }) => (
  <Img
    src={food(slug)}
    style={{ position: "absolute", width: size, height: size, borderRadius: "50%", objectFit: "cover", boxShadow: "0 24px 50px rgba(0,0,0,0.45)", border: `6px solid ${C.cream}`, ...style }}
  />
);

const ORBIT = [
  { slug: "chicken-shawarma-burger", x: 120, y: 330, s: 230, d: 10 },
  { slug: "cheesy-fries", x: 760, y: 280, s: 250, d: 16 },
  { slug: "signature-chicken-shawarma", x: 40, y: 1350, s: 270, d: 22 },
  { slug: "mozzarella-sticks", x: 780, y: 1420, s: 220, d: 28 },
  { slug: "lahab-salad", x: 640, y: 1640, s: 190, d: 34 },
  { slug: "chicken-shawarma-samosa", x: 250, y: 1660, s: 180, d: 40 },
];

const Hook = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - 8, fps, config: { damping: 9, stiffness: 160 } });
  const sub = spring({ frame: frame - 42, fps, config: { damping: 14 } });
  const wobble = Math.sin(frame / 3) * interpolate(frame, [8, 34], [3, 0], clamp);
  return (
    <AbsoluteFill style={{ direction: "rtl", alignItems: "center", justifyContent: "center" }}>
      <Backdrop dark />
      <Embers />
      {ORBIT.map((o, i) => {
        const p = spring({ frame: frame - o.d, fps, config: { damping: 12 } });
        const drift = Math.sin((frame + i * 30) / 22) * 14;
        return <Dish key={o.slug} slug={o.slug} size={o.s} style={{ left: o.x, top: o.y + drift, transform: `scale(${p}) rotate(${(1 - p) * 40 + drift / 4}deg)`, opacity: p }} />;
      })}
      <div style={{ fontFamily: display, fontWeight: 900, fontSize: 250, color: C.paper, transform: `scale(${pop}) rotate(${wobble}deg)`, textShadow: `0 0 60px ${C.red}`, marginTop: -60 }}>
        جوعان؟
      </div>
      <div style={{ position: "absolute", top: 1110, textAlign: "center", opacity: sub, transform: `translateY(${(1 - sub) * 50}px)` }}>
        <div style={{ fontFamily: display, fontWeight: 700, fontSize: 76, color: C.yellow }}>شاورما لهب… صارت أونلاين</div>
        <div style={{ fontFamily: body, fontSize: 38, color: C.cream, marginTop: 16, direction: "ltr" }}>Lahab shawarma, now online</div>
      </div>
    </AbsoluteFill>
  );
};

// Timed to the second voice-over line, one dish per name.
const DISHES = [
  { slug: "chicken-shawarma-plate", ar: "صحن شاورما دجاج", price: "3.000", at: 6 },
  { slug: "arabic-chicken-shawarma-box", ar: "بكس شاورما عربي", price: "2.800", at: 44 },
  { slug: "chicken-shawarma-burger", ar: "برجر شاورما دجاج", price: "1.700", at: 82 },
  { slug: "cheesy-fries", ar: "بطاطس تشيزي", price: "1.800", at: 112 },
];

const Food = () => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  return (
    <AbsoluteFill style={{ direction: "rtl" }}>
      <Backdrop dark />
      <Embers count={16} opacity={0.6} />
      <div style={{ position: "absolute", top: 150, width: "100%", textAlign: "center", fontFamily: display, fontWeight: 800, fontSize: 70, color: C.paper }}>
        من مطبخ لهب
        <div style={{ fontFamily: body, fontWeight: 500, fontSize: 36, color: C.yellow, direction: "ltr", marginTop: 10 }}>Fresh from the Lahab kitchen</div>
      </div>
      {DISHES.map((d, i) => {
        const next = DISHES[i + 1]?.at ?? 10_000;
        const inP = spring({ frame: frame - d.at, fps, config: { damping: 13, mass: 0.9 } });
        const outP = spring({ frame: frame - next, fps, config: { damping: 16 } });
        if (frame < d.at - 2 || outP > 0.99) return null;
        const x = (1 - inP) * width * 1.1 - outP * width * 1.2;
        const size = 780;
        return (
          <div key={d.slug} style={{ position: "absolute", top: 420, left: (width - size) / 2, width: size, transform: `translateX(${x}px) rotate(${(1 - inP) * 12 - outP * 10}deg)` }}>
            <Img src={food(d.slug)} style={{ width: size, height: size, borderRadius: 56, boxShadow: "0 40px 90px rgba(0,0,0,0.55)", transform: `scale(${1 + Math.max(0, frame - d.at) * 0.0012})` }} />
            <div style={{ marginTop: 50, textAlign: "center" }}>
              <div style={{ fontFamily: display, fontWeight: 800, fontSize: 72, color: C.paper }}>{d.ar}</div>
              <div style={{ display: "inline-block", marginTop: 18, padding: "10px 34px", borderRadius: 999, background: C.yellow, color: C.night, fontFamily: display, fontWeight: 800, fontSize: 48, direction: "rtl" }}>
                {d.price} د.ب.
              </div>
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const Menu = () => {
  const frame = useCurrentFrame();
  const scroll = interpolate(frame, [20, 128], [0, 9000 - SHOT_H], { ...clamp, easing: ease });
  return (
    <AbsoluteFill>
      <Backdrop />
      <Caption ar="المنيو كله قدامك" en="The full menu, real prices" delay={4} />
      <Phone enter={0}>
        <Shot src="menu-scroll.jpg" scrollY={scroll} />
      </Phone>
    </AbsoluteFill>
  );
};

const Sauce = () => {
  const frame = useCurrentFrame();
  const end = 4200 - SHOT_H;
  const scroll = interpolate(frame, [12, 62], [0, end], { ...clamp, easing: ease });
  return (
    <AbsoluteFill>
      <Backdrop />
      <Caption ar="اختار سوسك" en="Pick your sauce, add to cart" delay={4} />
      <Phone enter={0}>
        <Shot src="product-scroll.jpg" scrollY={scroll} />
        <div style={{ position: "absolute", inset: 0 }}>
          <Tap x={1000} y={2919 - end} at={78} />
        </div>
      </Phone>
    </AbsoluteFill>
  );
};

const Checkout = () => {
  const frame = useCurrentFrame();
  const shots = ["checkout-time.jpg", "checkout-car.jpg", "checkout-summary.jpg"];
  // Slide right-to-left between the three parts of the checkout page.
  const pos = interpolate(frame, [0, 55, 70, 115, 130, 186], [0, 0, 1, 1, 2, 2], { ...clamp, easing: ease });
  return (
    <AbsoluteFill>
      <Backdrop />
      <Sequence from={0} durationInFrames={62} layout="none">
        <Caption ar="حدد وقت الاستلام" en="Choose a pickup time" delay={4} />
      </Sequence>
      <Sequence from={62} durationInFrames={60} layout="none">
        <Caption ar="ورقم سيارتك" en="Add your car plate" />
      </Sequence>
      <Sequence from={122} layout="none">
        <Caption ar="والدفع عند الاستلام" en="Pay when you collect" />
      </Sequence>
      <Phone enter={0}>
        {shots.map((s, i) => (
          <Shot key={s} src={s} style={{ left: (pos - i) * SCREEN_W }} />
        ))}
      </Phone>
    </AbsoluteFill>
  );
};

const Pickup = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tapAt = HORN_FRAME - 2;
  const after = interpolate(frame, [tapAt + 6, tapAt + 14], [0, 1], clamp);
  const afterScroll = interpolate(frame, [tapAt + 22, tapAt + 55], [0, 2500 - SHOT_H], { ...clamp, easing: ease });
  const staffAt = 110;
  const staff = spring({ frame: frame - staffAt, fps, config: { damping: 16 } });
  const glow = 0.5 + 0.5 * Math.sin((frame - staffAt) / 4);
  return (
    <AbsoluteFill>
      <Backdrop dark={frame < staffAt} />
      <Sequence from={0} durationInFrames={staffAt} layout="none">
        <Caption ar="وصلت؟ اضغط «وصلت»" en="Here? Tap “I’m here”" delay={4} dark />
      </Sequence>
      <Sequence from={staffAt} layout="none">
        <Caption ar="وفريقنا يشوف سيارتك فوراً" en="Our team sees your car instantly" delay={6} />
      </Sequence>
      <Phone enter={0}>
        <Shot src="pickup-before.jpg" />
        <Shot src="pickup-after.jpg" scrollY={afterScroll} style={{ opacity: after }} />
        <div style={{ position: "absolute", inset: 0 }}>
          <Tap x={585} y={1600} at={tapAt} />
        </div>
        <div style={{ position: "absolute", inset: 0, transform: `translateX(${(1 - staff) * -SCREEN_W}px)` }}>
          <Shot src="staff-queue.jpg" />
          <div
            style={{
              position: "absolute", left: 48 * (2 / 3), top: 852 * (2 / 3), width: 1074 * (2 / 3), height: 684 * (2 / 3), borderRadius: 48,
              boxShadow: `0 0 ${20 + glow * 40}px ${C.red}`, opacity: staff,
            }}
          />
        </div>
      </Phone>
    </AbsoluteFill>
  );
};

const Cta = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame: frame - 4, fps, config: { damping: 10 } });
  const head = spring({ frame: frame - 18, fps, config: { damping: 13 } });
  const pill = spring({ frame: frame - 34, fps, config: { damping: 13 } });
  const info = spring({ frame: frame - 50, fps, config: { damping: 14 } });
  const pulse = 1 + 0.03 * Math.sin(frame / 5) * interpolate(frame, [50, 60], [0, 1], clamp);
  const row = ["chicken-shawarma-plate", "chicken-shawarma-burger", "cheesy-fries"];
  return (
    <AbsoluteFill style={{ direction: "rtl", alignItems: "center" }}>
      <Backdrop dark />
      <Embers opacity={0.7} />
      <Logo size={380} style={{ marginTop: 200, transform: `scale(${logo})` }} />
      <div style={{ marginTop: 60, textAlign: "center", opacity: head, transform: `translateY(${(1 - head) * 40}px)` }}>
        <div style={{ fontFamily: display, fontWeight: 900, fontSize: 150, color: C.paper, lineHeight: 1.1 }}>اطلب الحين</div>
        <div style={{ fontFamily: display, fontWeight: 700, fontSize: 56, color: C.yellow, marginTop: 10 }}>واستلم من سيارتك</div>
      </div>
      <div
        style={{
          marginTop: 70, padding: "34px 70px", borderRadius: 999, background: `linear-gradient(90deg, ${C.red}, #F07A1E)`,
          fontFamily: body, fontWeight: 600, fontSize: 56, color: "white", direction: "ltr",
          boxShadow: `0 20px 60px rgba(229,65,53,0.55)`, transform: `scale(${pill * pulse})`,
        }}
      >
        lahab-bh.netlify.app
      </div>
      <div style={{ marginTop: 60, display: "flex", gap: 34, fontFamily: body, fontWeight: 500, fontSize: 40, color: C.cream, opacity: info, direction: "ltr" }}>
        <span>Instagram @lahab.bh</span>
        <span style={{ color: C.yellow }}>•</span>
        <span>WhatsApp 33447433</span>
      </div>
      <div style={{ position: "absolute", bottom: 150, left: 180, width: 720, height: 200 }}>
        {row.map((slug, i) => {
          const p = spring({ frame: frame - 60 - i * 6, fps, config: { damping: 12 } });
          return <Dish key={slug} slug={slug} size={190} style={{ left: i * 265, top: Math.sin((frame + i * 20) / 14) * 8, transform: `scale(${p})` }} />;
        })}
      </div>
      <div style={{ position: "absolute", bottom: 70, fontFamily: body, fontSize: 36, color: C.cream, opacity: info * 0.8 }}>عالي، البحرين</div>
    </AbsoluteFill>
  );
};

/** Music sits lower while someone is speaking. */
const musicVolume = (f: number) => {
  const speaking = timeline.voDur.some((d, i) => f >= STARTS[i] + VO_DELAY - 4 && f <= STARTS[i] + VO_DELAY + d * timeline.fps);
  return speaking ? 0.4 : 0.85;
};

export const LahabReel = () => {
  const parts = [Hook, Food, Menu, Sauce, Checkout, Pickup, Cta];
  return (
    <AbsoluteFill style={{ background: C.night }}>
      {parts.map((Part, i) => (
        <Sequence key={i} from={STARTS[i]} durationInFrames={SCENES[i]}>
          <Part />
        </Sequence>
      ))}
      {STARTS.slice(1).map((at) => (
        <FlameWipe key={at} at={at} />
      ))}
      <Audio src={staticFile("music.wav")} volume={musicVolume} />
      {STARTS.map((s, i) => (
        <Sequence key={`vo${i}`} from={s + VO_DELAY} layout="none">
          <Audio src={staticFile(`vo/${i + 1}.mp3`)} volume={1} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};


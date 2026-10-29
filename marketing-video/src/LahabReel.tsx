import { AbsoluteFill, Easing, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop, Caption, Embers, FlameWipe, Logo, Phone, Shot, Tap } from "./parts";
import { C, SCREEN_W, SHOT_H, body, display } from "./theme";

// Scene lengths follow the script: 3 s hook, 5 s menu, 5 s sauce, 5 s checkout, 6 s pickup, 6 s CTA.
const SCENES = [90, 150, 150, 150, 180, 180];
const STARTS = SCENES.map((_, i) => SCENES.slice(0, i).reduce((a, b) => a + b, 0));
export const TOTAL = SCENES.reduce((a, b) => a + b, 0);

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.45, 0, 0.2, 1);

const Hook = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - 6, fps, config: { damping: 9, stiffness: 160 } });
  const sub = spring({ frame: frame - 34, fps, config: { damping: 14 } });
  const logo = spring({ frame, fps, config: { damping: 14 } });
  const wobble = Math.sin(frame / 3) * interpolate(frame, [6, 30], [3, 0], clamp);
  return (
    <AbsoluteFill style={{ direction: "rtl", alignItems: "center", justifyContent: "center" }}>
      <Backdrop dark />
      <Embers />
      <Logo size={190} style={{ position: "absolute", top: 200, opacity: logo, transform: `scale(${logo})` }} />
      <div style={{ fontFamily: display, fontWeight: 900, fontSize: 250, color: C.paper, transform: `scale(${pop}) rotate(${wobble}deg)`, textShadow: `0 0 60px ${C.red}` }}>
        جوعان؟
      </div>
      <div style={{ position: "absolute", top: 1240, textAlign: "center", opacity: sub, transform: `translateY(${(1 - sub) * 50}px)` }}>
        <div style={{ fontFamily: display, fontWeight: 700, fontSize: 70, color: C.yellow }}>شاورما لهب… بكم ضغطة</div>
        <div style={{ fontFamily: body, fontSize: 38, color: C.cream, marginTop: 16, direction: "ltr" }}>Hungry? Lahab is a few taps away</div>
      </div>
    </AbsoluteFill>
  );
};

const Menu = () => {
  const frame = useCurrentFrame();
  const scroll = interpolate(frame, [25, 140], [0, 9000 - SHOT_H], { ...clamp, easing: ease });
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
  const scroll = interpolate(frame, [15, 75], [0, end], { ...clamp, easing: ease });
  return (
    <AbsoluteFill>
      <Backdrop />
      <Caption ar="اختار سوسك" en="Pick your sauce, add to cart" delay={4} />
      <Phone enter={0}>
        <Shot src="product-scroll.jpg" scrollY={scroll} />
        <div style={{ position: "absolute", inset: 0 }}>
          <Tap x={1000} y={2919 - end} at={92} />
        </div>
      </Phone>
    </AbsoluteFill>
  );
};

const Checkout = () => {
  const frame = useCurrentFrame();
  const shots = ["checkout-time.jpg", "checkout-car.jpg", "checkout-summary.jpg"];
  // Slide right-to-left between the three parts of the checkout page.
  const pos = interpolate(frame, [0, 45, 60, 95, 110, 150], [0, 0, 1, 1, 2, 2], { ...clamp, easing: ease });
  const captions = [
    { ar: "حدد وقت الاستلام", en: "Choose a pickup time" },
    { ar: "ورقم سيارتك", en: "Add your car plate" },
    { ar: "وأرسل الطلب", en: "Send the order — pay on pickup" },
  ];
  return (
    <AbsoluteFill>
      <Backdrop />
      <Sequence from={0} durationInFrames={52} layout="none">
        <Caption {...captions[0]} delay={4} />
      </Sequence>
      <Sequence from={52} durationInFrames={50} layout="none">
        <Caption {...captions[1]} />
      </Sequence>
      <Sequence from={102} layout="none">
        <Caption {...captions[2]} />
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
  const after = interpolate(frame, [48, 56], [0, 1], clamp);
  const afterScroll = interpolate(frame, [62, 95], [0, 2500 - SHOT_H], { ...clamp, easing: ease });
  const staff = spring({ frame: frame - 100, fps, config: { damping: 16 } });
  const glow = 0.5 + 0.5 * Math.sin((frame - 100) / 4);
  return (
    <AbsoluteFill>
      <Backdrop dark={frame < 100} />
      <Sequence from={0} durationInFrames={100} layout="none">
        <Caption ar="وصلت؟ اضغط «وصلت»" en="Here? Tap “I’m here”" delay={4} dark />
      </Sequence>
      <Sequence from={100} layout="none">
        <Caption ar="وفريقنا يشوف سيارتك فوراً" en="Our team sees your car instantly" delay={6} />
      </Sequence>
      <Phone enter={0}>
        <Shot src="pickup-before.jpg" />
        <Shot src="pickup-after.jpg" scrollY={afterScroll} style={{ opacity: after }} />
        <div style={{ position: "absolute", inset: 0 }}>
          <Tap x={585} y={1600} at={42} />
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
  return (
    <AbsoluteFill style={{ direction: "rtl", alignItems: "center" }}>
      <Backdrop dark />
      <Embers opacity={0.7} />
      <Logo size={420} style={{ marginTop: 250, transform: `scale(${logo})` }} />
      <div style={{ marginTop: 70, textAlign: "center", opacity: head, transform: `translateY(${(1 - head) * 40}px)` }}>
        <div style={{ fontFamily: display, fontWeight: 900, fontSize: 150, color: C.paper, lineHeight: 1.1 }}>اطلب الحين</div>
        <div style={{ fontFamily: display, fontWeight: 700, fontSize: 56, color: C.yellow, marginTop: 10 }}>واستلم من سيارتك</div>
      </div>
      <div
        style={{
          marginTop: 90, padding: "34px 70px", borderRadius: 999, background: `linear-gradient(90deg, ${C.red}, #F07A1E)`,
          fontFamily: body, fontWeight: 600, fontSize: 56, color: "white", direction: "ltr",
          boxShadow: `0 20px 60px rgba(229,65,53,0.55)`, transform: `scale(${pill * pulse})`,
        }}
      >
        lahab-bh.netlify.app
      </div>
      <div style={{ marginTop: 70, display: "flex", gap: 34, fontFamily: body, fontWeight: 500, fontSize: 40, color: C.cream, opacity: info, direction: "ltr" }}>
        <span>Instagram @lahab.bh</span>
        <span style={{ color: C.yellow }}>•</span>
        <span>WhatsApp 33447433</span>
      </div>
      <div style={{ position: "absolute", bottom: 110, fontFamily: body, fontSize: 38, color: C.cream, opacity: info * 0.8 }}>عالي، البحرين</div>
    </AbsoluteFill>
  );
};

export const LahabReel = () => {
  const parts = [Hook, Menu, Sauce, Checkout, Pickup, Cta];
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
    </AbsoluteFill>
  );
};

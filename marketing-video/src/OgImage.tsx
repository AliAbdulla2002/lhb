import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, body, display } from "./theme";

// The link-preview image for the website (WhatsApp, Instagram, X, Google): 1200×630.
// Rendered with `npm run og` into ../public/og-image.jpg.
const SIDES = ["chicken-shawarma-burger", "cheesy-fries", "arabic-chicken-shawarma-box"];

export const OgImage = () => (
  <AbsoluteFill style={{ direction: "rtl", background: `radial-gradient(80% 110% at 20% 50%, #8A2A1E 0%, ${C.night} 72%)`, fontFamily: body }}>
    {/* Text column (right) */}
    <div style={{ position: "absolute", top: 64, right: 64, width: 620 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
        <Img src={staticFile("lahab-logo.png")} style={{ width: 132, height: 132, borderRadius: "50%", objectFit: "cover", boxShadow: "0 0 0 5px rgba(250,186,16,0.35)" }} />
        <div>
          <div style={{ fontFamily: display, fontWeight: 900, fontSize: 80, color: C.paper, lineHeight: 1.05, whiteSpace: "nowrap" }}>شاورما لهب</div>
          <div style={{ fontFamily: display, fontWeight: 700, fontSize: 30, letterSpacing: 2, color: C.yellow, marginTop: 8, direction: "ltr", textAlign: "right" }}>LAHAB SHAWARMA</div>
        </div>
      </div>
      <div style={{ marginTop: 40, fontFamily: display, fontWeight: 700, fontSize: 37, color: C.cream, lineHeight: 1.3, whiteSpace: "nowrap" }}>اطلب أونلاين واستلم من سيارتك</div>
      <div style={{ marginTop: 10, fontSize: 30, color: C.cream, opacity: 0.8 }}>عالي، البحرين</div>
      <div style={{ marginTop: 6, fontSize: 23, color: C.cream, opacity: 0.65, direction: "ltr", textAlign: "right" }}>Order online · Collect from your car · A'ali, Bahrain</div>
      <div style={{ marginTop: 30, display: "flex", gap: 18 }}>
        {SIDES.map((d) => (
          <Img key={d} src={staticFile(`food/${d}.webp`)} style={{ width: 104, height: 104, borderRadius: "50%", objectFit: "cover", border: `4px solid ${C.cream}`, boxShadow: "0 12px 26px rgba(0,0,0,0.45)" }} />
        ))}
      </div>
    </div>
    {/* Hero dish (left) */}
    <div style={{ position: "absolute", left: 48, top: 105, width: 420, height: 420, borderRadius: "50%", overflow: "hidden", boxShadow: "0 30px 70px rgba(0,0,0,0.55)", border: `8px solid ${C.cream}` }}>
      <Img src={staticFile("food/chicken-shawarma-plate.webp")} style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scale(1.2)" }} />
    </div>
  </AbsoluteFill>
);

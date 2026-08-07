import React from "react";
import {
  AbsoluteFill,
  Img,
  Series,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/NotoSerifHebrew";
import { loadFont as loadBody } from "@remotion/google-fonts/Heebo";

const { fontFamily: display } = loadFont("normal", { weights: ["700"], subsets: ["hebrew"] });
const { fontFamily: body } = loadBody("normal", { weights: ["400", "700"], subsets: ["hebrew"] });

const CREAM = "#f8ede4";
const FOREST = "#2d3d2b";
const BLUSH = "#f5d5cf";
const SAGE = "#a8c4a2";
const INK = "#3c4f39";

const Bg: React.FC<{ tint?: string }> = ({ tint = BLUSH }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${CREAM} 0%, #fdf7f1 55%, ${tint}55 100%)` }}>
      <div
        style={{
          position: "absolute",
          top: -220 + Math.sin(frame / 40) * 30,
          right: -180,
          width: 720,
          height: 720,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${tint} 0%, transparent 70%)`,
          opacity: 0.6,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -260,
          left: -200 + Math.cos(frame / 46) * 26,
          width: 760,
          height: 760,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${SAGE} 0%, transparent 70%)`,
          opacity: 0.35,
        }}
      />
      <Img
        src={staticFile("images/logo.png")}
        style={{ position: "absolute", bottom: 44, left: 60, width: 210, opacity: 0.75 }}
      />
    </AbsoluteFill>
  );
};

const useRise = (delay: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 140 } });
  return { opacity: s, transform: `translateY(${interpolate(s, [0, 1], [34, 0])}px)` };
};

const Drift: React.FC<{ src: string; style?: React.CSSProperties; speed?: number }> = ({ src, style, speed = 1 }) => {
  const frame = useCurrentFrame();
  const s = spring({ frame, fps: 30, config: { damping: 200 } });
  const scale = interpolate(s, [0, 1], [1.08, 1]) + Math.sin(frame / (90 / speed)) * 0.012;
  return (
    <div
      style={{
        overflow: "hidden",
        borderRadius: 32,
        boxShadow: "0 26px 60px rgba(45,61,43,0.18)",
        opacity: s,
        ...style,
      }}
    >
      <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }} />
    </div>
  );
};

const Kicker: React.FC<{ children: React.ReactNode; delay?: number }> = ({ children, delay = 0 }) => {
  const st = useRise(delay);
  return (
    <div style={{ ...st, fontFamily: body, letterSpacing: 8, fontSize: 24, color: "#6b8a63", fontWeight: 700 }}>
      {children}
    </div>
  );
};

const Heading: React.FC<{ children: React.ReactNode; delay?: number; size?: number }> = ({ children, delay = 6, size = 82 }) => {
  const st = useRise(delay);
  return <div style={{ ...st, fontFamily: display, fontSize: size, color: FOREST, lineHeight: 1.1 }}>{children}</div>;
};

const Bullets: React.FC<{ lines: string[]; startDelay?: number; width?: number; fontSize?: number }> = ({
  lines,
  startDelay = 18,
  width = 900,
  fontSize = 34,
}) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 34 }}>
    {lines.map((l, i) => (
      <Bullet key={l} text={l} n={i + 1} delay={startDelay + i * 10} width={width} fontSize={fontSize} />
    ))}
  </div>
);

const Bullet: React.FC<{ text: string; n: number; delay: number; width: number; fontSize: number }> = ({
  text,
  n,
  delay,
  width,
  fontSize,
}) => {
  const st = useRise(delay);
  return (
    <div
      style={{
        ...st,
        display: "flex",
        alignItems: "center",
        gap: 20,
        background: "#ffffffd9",
        borderRadius: 24,
        padding: "18px 26px",
        maxWidth: width,
      }}
    >
      <div
        style={{
          minWidth: 46,
          height: 46,
          borderRadius: 999,
          background: BLUSH,
          color: FOREST,
          fontFamily: display,
          fontSize: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {n}
      </div>
      <div style={{ fontFamily: body, fontSize, color: INK, lineHeight: 1.35 }}>{text}</div>
    </div>
  );
};

const Frame: React.FC<{ tint?: string; children: React.ReactNode }> = ({ tint = BLUSH, children }) => (
  <AbsoluteFill style={{ direction: "rtl", padding: "88px 120px", justifyContent: "center" }}>
    <Bg tint={tint} />
    {children}
  </AbsoluteFill>
);

/* ---------------- scenes ---------------- */

const Title: React.FC = () => {
  const a = useRise(10);
  const c = useRise(26);
  return (
    <AbsoluteFill style={{ direction: "rtl", alignItems: "center", justifyContent: "center", padding: 100 }}>
      <Bg />
      <Kicker>SWEETBABY STUDIO</Kicker>
      <div style={{ ...a, fontFamily: display, fontSize: 118, color: FOREST, marginTop: 20, textAlign: "center" }}>
        הדרכה סטודיו סוויט בייבי
      </div>
      <div style={{ ...c, fontFamily: body, fontSize: 40, color: INK, marginTop: 22, textAlign: "center" }}>
        מדריך להיכרות קלה עם הסטודיו — לצילום חוויתי ומהנה!
      </div>
      <div style={{ ...c, fontFamily: body, fontSize: 26, color: "#6b8a63", marginTop: 18 }}>
        תלמוד ירושלמי 24, בית שמש
      </div>
    </AbsoluteFill>
  );
};

const Roadmap: React.FC = () => {
  const steps = [
    { n: "1", t: "משדר ופלאש", d: "חיבור המשדר למצלמה והפעלת הפלאש" },
    { n: "2", t: "בדיקת חשיפה", d: "צילום בדיקה וכיוון עוצמת האור" },
    { n: "3", t: "בחירת רקע", d: "צבעים, נייר ועץ — מה מותר ומה לא" },
    { n: "4", t: "יוצאים לצלם", d: "כיוון מצלמה, השראות וטיפים" },
  ];
  return (
    <Frame tint={SAGE}>
      <Kicker>Roadmap</Kicker>
      <Heading size={78}>מסלול ההדרכה</Heading>
      <div style={{ ...useRise(14), fontFamily: body, fontSize: 32, color: INK, marginTop: 12 }}>
        ארבעה שלבים קצרים, ואתם מוכנים לצלם
      </div>
      <div style={{ display: "flex", gap: 22, marginTop: 46 }}>
        {steps.map((s, i) => (
          <Card key={s.n} step={s} delay={24 + i * 12} />
        ))}
      </div>
    </Frame>
  );
};

const Card: React.FC<{ step: { n: string; t: string; d: string }; delay: number }> = ({ step, delay }) => {
  const st = useRise(delay);
  return (
    <div
      style={{
        ...st,
        flex: 1,
        background: "#ffffffe0",
        borderRadius: 30,
        padding: "30px 26px",
        border: `2px solid ${BLUSH}`,
      }}
    >
      <div
        style={{
          width: 66,
          height: 66,
          borderRadius: 999,
          background: FOREST,
          color: CREAM,
          fontFamily: display,
          fontSize: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {step.n}
      </div>
      <div style={{ fontFamily: display, fontSize: 38, color: FOREST, marginTop: 18 }}>{step.t}</div>
      <div style={{ fontFamily: body, fontSize: 25, color: INK, marginTop: 10, lineHeight: 1.4 }}>{step.d}</div>
    </div>
  );
};

const StepTransmitter: React.FC = () => (
  <Frame tint={BLUSH}>
    <div style={{ display: "flex", gap: 60, alignItems: "center" }}>
      <div style={{ flex: 1 }}>
        <Kicker>שלב 1</Kicker>
        <Heading>המשדר</Heading>
        <div style={{ ...useRise(12), fontFamily: body, fontSize: 30, color: "#6b8a63", marginTop: 8 }}>
          בואו נדליק את האור!
        </div>
        <Bullets
          width={980}
          fontSize={31}
          lines={[
            "יש מאחורי הדלת בכניסה קופסה עם משדר",
            "תחילה מחברים את המשדר למצלמה — עד הסוף ממש",
            "מפעילים את המשדר: 2 לחצנים בצד, להזיז ימינה למעלה",
            "לא נדלק? נסו שוב. עדיין לא? החליפו סוללה — בקופסת הציוד מעל עמדת הרקע הוורוד",
          ]}
        />
      </div>
      <div style={{ width: 420, display: "flex", flexDirection: "column", gap: 22 }}>
        <Drift src="images/transmitter.png" style={{ height: 300, background: "#fff" }} />
        <Drift src="images/box.jpg" style={{ height: 380 }} speed={1.4} />
      </div>
    </div>
  </Frame>
);

const StepFlash: React.FC = () => (
  <Frame tint={SAGE}>
    <div style={{ display: "flex", gap: 60, alignItems: "center" }}>
      <div style={{ flex: 1 }}>
        <Kicker>שלב 2</Kicker>
        <Heading>הפלאש ובדיקת חשיפה</Heading>
        <Bullets
          width={980}
          fontSize={30}
          lines={[
            "לחיצה ארוכה על הכפתור עם סימן המבזק — ומיד מסובבים את הגלגלת",
            "בודקים שהמסך דלוק",
            "עושים צילום בדיקה קצר — הפלאש אמור להבזיק",
            "בודקים את התמונה: לא שרופה מדי ולא חשוכה מדי",
            "לתיקון: סובבו את הגלגלת — מספר נמוך יותר = אור חזק יותר",
          ]}
        />
      </div>
      <Drift src="images/flash.jpg" style={{ width: 560, height: 620 }} />
    </div>
  </Frame>
);

const CameraScene: React.FC = () => (
  <Frame tint={BLUSH}>
    <Kicker>Camera</Kicker>
    <Heading>המצלמה ופתרון תקלות</Heading>
    <div style={{ display: "flex", gap: 34, marginTop: 44 }}>
      <Panel
        delay={18}
        title="📷 המצלמה"
        bg="#ffffffdd"
        lines={[
          "לא צלמים מקצועיים? כוונו את המצלמה על אוטומט",
          "חובה לצלם דרך העינית ולא דרך המסך",
          "ברוב המצלמות במצב זה המסך לא יעבוד",
        ]}
      />
      <Panel
        delay={30}
        title="🔧 הפלאש לא הבזיק?"
        bg={`${SAGE}44`}
        lines={["בדקו שהמשדר מחובר עד הסוף", "שהמשדר מופעל כמו שצריך", "שהפלאש עצמו דלוק ומחובר"]}
      />
    </div>
  </Frame>
);

const Panel: React.FC<{ title: string; lines: string[]; delay: number; bg: string }> = ({ title, lines, delay, bg }) => {
  const st = useRise(delay);
  return (
    <div style={{ ...st, flex: 1, background: bg, borderRadius: 32, padding: "34px 36px" }}>
      <div style={{ fontFamily: display, fontSize: 42, color: FOREST }}>{title}</div>
      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        {lines.map((l) => (
          <div key={l} style={{ fontFamily: body, fontSize: 29, color: INK, lineHeight: 1.4 }}>
            • {l}
          </div>
        ))}
      </div>
    </div>
  );
};

const StepBackground: React.FC = () => (
  <Frame tint={SAGE}>
    <Kicker>שלב 3</Kicker>
    <Heading>בחירת רקע</Heading>
    <div style={{ ...useRise(12), fontFamily: body, fontSize: 30, color: "#6b8a63", marginTop: 8 }}>
      בואו נבחר את הבמה המושלמת
    </div>
    <div style={{ display: "flex", gap: 34, marginTop: 38 }}>
      <Panel
        delay={20}
        title="🎨 רקעי צבע"
        bg="#ffffffdd"
        lines={[
          "חום בהיר · צהוב · כחול",
          "אפשר לדרוך בזהירות — רק המצולמים",
          "ילדים עם נעליים כן, הורים וצלמים בלי נעליים",
        ]}
      />
      <Panel
        delay={34}
        title="📄 רקעי נייר (לבן / ירוק)"
        bg={`${BLUSH}bb`}
        lines={[
          "אסור לדרוך כלל על רקע הנייר!",
          "על הרצפה מניחים פורמייקה לבנה או קרשי עץ",
          "הנייר יורד עד תחילת הקרשים בלבד — אחרת נקרע",
          "פותחים וסוגרים את הגליל בעדינות",
        ]}
      />
    </div>
  </Frame>
);

const Corners: React.FC = () => {
  const items = [
    { src: "images/rolls.png", t: "קיר עץ + רולי רקעים", d: "כאן מאוחסנים גלילי הנייר — כחול, ירוק ולבן" },
    { src: "images/chair.png", t: "קיר עץ + כיסא צהוב", d: "פינה כפרית וחמימה, מתאימה לגיל שנה" },
    { src: "images/sofa.jpg", t: "וילון + ספה בהירה", d: "אפשר גם וילון בלבד — פינה נקייה ורכה" },
  ];
  return (
    <Frame tint={BLUSH}>
      <Kicker>Backdrops</Kicker>
      <Heading size={70}>עוד פינות רקע בסטודיו</Heading>
      <div style={{ display: "flex", gap: 28, marginTop: 40 }}>
        {items.map((it, i) => (
          <CornerCard key={it.t} item={it} delay={16 + i * 14} />
        ))}
      </div>
      <div style={{ ...useRise(60), fontFamily: body, fontSize: 26, color: INK, marginTop: 26 }}>
        להשראה — תמונות אמיתיות מהסטודיו נמצאות בטאבלט, בדף השכרת האביזרים
      </div>
    </Frame>
  );
};

const CornerCard: React.FC<{ item: { src: string; t: string; d: string }; delay: number }> = ({ item, delay }) => {
  const st = useRise(delay);
  return (
    <div style={{ ...st, flex: 1, background: "#ffffffdd", borderRadius: 30, overflow: "hidden", paddingBottom: 22 }}>
      <Drift src={item.src} style={{ height: 400, borderRadius: 0, boxShadow: "none" }} />
      <div style={{ padding: "18px 24px 0" }}>
        <div style={{ fontFamily: display, fontSize: 32, color: FOREST }}>{item.t}</div>
        <div style={{ fontFamily: body, fontSize: 24, color: INK, marginTop: 8, lineHeight: 1.4 }}>{item.d}</div>
      </div>
    </div>
  );
};

const WoodScene: React.FC = () => (
  <Frame tint={SAGE}>
    <Kicker>Final</Kicker>
    <Heading size={72}>רצפות עץ ותזכורות אחרונות</Heading>
    <div style={{ display: "flex", gap: 34, marginTop: 40 }}>
      <Panel
        delay={18}
        title="🪵 רקע עץ"
        bg="#ffffffdd"
        lines={[
          "צד לבן וצד אגוז חום — הופכים ומקבלים מראה חדש",
          "⚠️ יש ברזל לכל קרש — להפוך בזהירות רבה",
          "לנקות היטב לפני הצילומים",
        ]}
      />
      <Panel
        delay={32}
        title="✨ מוכנים לצאת לדרך"
        bg={`${BLUSH}bb`}
        lines={[
          "בוחרים צבע רקע ואבזור ומתאימים בגדים",
          "בטאבלט בסטודיו יש המון השראות",
          "📞 לכל שאלה: 054-8529277",
        ]}
      />
    </div>
  </Frame>
);

const Outro: React.FC = () => {
  const a = useRise(0);
  const b = useRise(16);
  return (
    <AbsoluteFill style={{ direction: "rtl", alignItems: "center", justifyContent: "center" }}>
      <Bg tint={SAGE} />
      <div style={{ ...a, fontFamily: display, fontSize: 100, color: FOREST, textAlign: "center" }}>
        בהצלחה ותהנו מהצילומים! 📸
      </div>
      <div style={{ ...b, fontFamily: body, fontSize: 36, color: INK, marginTop: 26, textAlign: "center" }}>
        Sweetbaby Studio · תלמוד ירושלמי 24, בית שמש · 054-8529277
      </div>
    </AbsoluteFill>
  );
};

export const MainVideo: React.FC = () => (
  <AbsoluteFill style={{ background: CREAM }}>
    <Series>
      <Series.Sequence durationInFrames={130}><Title /></Series.Sequence>
      <Series.Sequence durationInFrames={190}><Roadmap /></Series.Sequence>
      <Series.Sequence durationInFrames={380}><StepTransmitter /></Series.Sequence>
      <Series.Sequence durationInFrames={380}><StepFlash /></Series.Sequence>
      <Series.Sequence durationInFrames={280}><CameraScene /></Series.Sequence>
      <Series.Sequence durationInFrames={340}><StepBackground /></Series.Sequence>
      <Series.Sequence durationInFrames={330}><Corners /></Series.Sequence>
      <Series.Sequence durationInFrames={320}><WoodScene /></Series.Sequence>
      <Series.Sequence durationInFrames={160}><Outro /></Series.Sequence>
    </Series>
  </AbsoluteFill>
);

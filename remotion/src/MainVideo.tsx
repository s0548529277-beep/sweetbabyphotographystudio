import React from "react";
import {
  AbsoluteFill,
  Series,
  interpolate,
  spring,
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
    </AbsoluteFill>
  );
};

const useRise = (delay: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 140 } });
  return { opacity: s, transform: `translateY(${interpolate(s, [0, 1], [34, 0])}px)` };
};

const Title: React.FC = () => {
  const a = useRise(0);
  const b = useRise(12);
  const c = useRise(24);
  return (
    <AbsoluteFill style={{ direction: "rtl", alignItems: "center", justifyContent: "center", padding: 100 }}>
      <Bg />
      <div style={{ ...b, fontFamily: body, letterSpacing: 10, fontSize: 26, color: "#6b8a63" }}>
        SWEETBABY STUDIO
      </div>
      <div style={{ ...a, fontFamily: display, fontSize: 116, color: FOREST, marginTop: 18, textAlign: "center" }}>
        הדרכה מהירה לסטודיו
      </div>
      <div style={{ ...c, fontFamily: body, fontSize: 40, color: "#4a5d43", marginTop: 24 }}>
        ארבעה שלבים קצרים — ואתם מצלמים
      </div>
    </AbsoluteFill>
  );
};

const Step: React.FC<{ n: string; title: string; lines: string[]; tint: string }> = ({ n, title, lines, tint }) => {
  const head = useRise(0);
  return (
    <AbsoluteFill style={{ direction: "rtl", padding: "110px 130px", justifyContent: "center" }}>
      <Bg tint={tint} />
      <div style={{ ...head, display: "flex", alignItems: "center", gap: 28 }}>
        <div
          style={{
            width: 108,
            height: 108,
            borderRadius: 999,
            background: FOREST,
            color: CREAM,
            fontFamily: display,
            fontSize: 54,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {n}
        </div>
        <div style={{ fontFamily: display, fontSize: 82, color: FOREST }}>{title}</div>
      </div>
      <div style={{ marginTop: 46, display: "flex", flexDirection: "column", gap: 26 }}>
        {lines.map((l, i) => {
          const st = useRise(14 + i * 9);
          return (
            <div
              key={l}
              style={{
                ...st,
                fontFamily: body,
                fontSize: 44,
                color: "#3c4f39",
                background: "#ffffffcc",
                borderRadius: 26,
                padding: "22px 34px",
                maxWidth: 1360,
              }}
            >
              {l}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC = () => {
  const a = useRise(0);
  const b = useRise(14);
  return (
    <AbsoluteFill style={{ direction: "rtl", alignItems: "center", justifyContent: "center" }}>
      <Bg tint={SAGE} />
      <div style={{ ...a, fontFamily: display, fontSize: 104, color: FOREST, textAlign: "center" }}>
        בהצלחה! תהנו מהצילומים
      </div>
      <div style={{ ...b, fontFamily: body, fontSize: 40, color: "#4a5d43", marginTop: 26, textAlign: "center" }}>
        תלמוד ירושלמי 24, בית שמש · 054-8529277
      </div>
    </AbsoluteFill>
  );
};

export const MainVideo: React.FC = () => (
  <AbsoluteFill style={{ background: CREAM }}>
    <Series>
      <Series.Sequence durationInFrames={110}>
        <Title />
      </Series.Sequence>
      <Series.Sequence durationInFrames={135}>
        <Step
          n="1"
          title="משדר ופלאש"
          tint={BLUSH}
          lines={[
            "המשדר נמצא בקופסה מאחורי הדלת בכניסה",
            "מחברים למצלמה עד הסוף ומזיזים 2 לחצנים ימינה",
            "פלאש: לחיצה ארוכה על כפתור המבזק",
          ]}
        />
      </Series.Sequence>
      <Series.Sequence durationInFrames={130}>
        <Step
          n="2"
          title="בדיקת חשיפה"
          tint={SAGE}
          lines={[
            "צילום בדיקה קצר — הפלאש אמור להבזיק",
            "לא שרוף ולא חשוך? מעולה",
            "מספר נמוך יותר בגלגלת = אור חזק יותר",
          ]}
        />
      </Series.Sequence>
      <Series.Sequence durationInFrames={135}>
        <Step
          n="3"
          title="בחירת רקע"
          tint={BLUSH}
          lines={[
            "רקעי צבע — רק המצולמים, בלי נעליים להורים",
            "רקע נייר לבן וירוק — אסור לדרוך כלל",
            "על הרצפה מניחים פורמייקה או קרשי עץ",
          ]}
        />
      </Series.Sequence>
      <Series.Sequence durationInFrames={130}>
        <Step
          n="4"
          title="יוצאים לצלם"
          tint={SAGE}
          lines={[
            "מצלמה על אוטומט — ומצלמים דרך העינית",
            "מנקים את קרשי העץ לפני הצילום",
            "בטאבלט בסטודיו יש המון השראות",
          ]}
        />
      </Series.Sequence>
      <Series.Sequence durationInFrames={100}>
        <Outro />
      </Series.Sequence>
    </Series>
  </AbsoluteFill>
);

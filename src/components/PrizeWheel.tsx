// The visual "prize wheel" (גלגל המתנות) — pastel pink / hot pink segments,
// spins to a server-picked prize (never picked client-side, see
// wheel.functions.ts). Drawn as plain SVG (precise pie slices + radial
// labels) rather than a canvas/library, to keep this dependency-free.
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Gift, PartyPopper } from "lucide-react";
import { spinWheel } from "@/lib/wheel.functions";
import { WHEEL_PRIZES, findWheelPrize, type WheelPrize } from "@/lib/wheel-prizes";
import { heError } from "@/lib/he-errors";

const SIZE = 340;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 6;
const LABEL_RADIUS = RADIUS * 0.62;
const SEGMENT_ANGLE = 360 / WHEEL_PRIZES.length;

// Exactly the two requested colors, alternating — pastel pink / strong pink.
const PASTEL = "#ffd6ea";
const HOT = "#ec4899";

function polar(angleDeg: number, r: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CENTER + r * Math.sin(rad), y: CENTER - r * Math.cos(rad) };
}

function segmentPath(startDeg: number, endDeg: number): string {
  const p0 = polar(startDeg, RADIUS);
  const p1 = polar(endDeg, RADIUS);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${CENTER},${CENTER} L ${p0.x},${p0.y} A ${RADIUS},${RADIUS} 0 ${largeArc} 1 ${p1.x},${p1.y} Z`;
}

/** Total rotation (degrees) so the wheel lands with segment `index`'s midpoint at the top pointer, plus a few full spins and a small random offset so it doesn't land dead-center every time. */
function rotationForIndex(index: number): number {
  const mid = index * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
  const spins = 6 * 360;
  const jitter = (Math.random() - 0.5) * (SEGMENT_ANGLE * 0.5); // stays well inside the segment
  return spins + (360 - mid) + jitter;
}

export function PrizeWheel({ bookingId, initialPrizeId }: { bookingId: string; initialPrizeId?: string | null }) {
  const runSpin = useServerFn(spinWheel);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ prize: WheelPrize; couponCode: string | null } | null>(() => {
    const existing = findWheelPrize(initialPrizeId);
    return existing ? { prize: existing, couponCode: null } : null;
  });

  const segments = useMemo(
    () =>
      WHEEL_PRIZES.map((prize, i) => {
        const start = i * SEGMENT_ANGLE;
        const end = start + SEGMENT_ANGLE;
        const mid = start + SEGMENT_ANGLE / 2;
        const labelPos = polar(mid, LABEL_RADIUS);
        const textRotate = mid > 90 && mid < 270 ? mid + 180 : mid;
        const dark = i % 2 === 0;
        return { prize, path: segmentPath(start, end), fill: dark ? PASTEL : HOT, textFill: dark ? "#9d174d" : "#fff", labelPos, textRotate };
      }),
    [],
  );

  const spin = async () => {
    if (spinning || result) return;
    setSpinning(true);
    try {
      const res = await runSpin({ data: { id: bookingId } });
      const index = WHEEL_PRIZES.findIndex((p) => p.id === res.prizeId);
      const prize = findWheelPrize(res.prizeId);
      if (index < 0 || !prize) throw new Error("פרס לא מוכר");
      setRotation(rotationForIndex(index));
      // Reveal only once the CSS spin transition (below) actually finishes.
      window.setTimeout(() => {
        setResult({ prize, couponCode: res.couponCode });
        setSpinning(false);
      }, 4300);
    } catch (e) {
      setSpinning(false);
      toast.error(heError(e, "הסיבוב נכשל, נסי שוב"));
    }
  };

  return (
    <div className="glass-card rounded-3xl p-6 md:p-8 text-center overflow-hidden" style={{ background: "linear-gradient(180deg,#fff5fa,#ffe8f3)" }}>
      <h2 className="font-display text-2xl md:text-3xl mb-1 flex items-center justify-center gap-2" style={{ color: HOT }}>
        <Gift className="h-6 w-6" /> גלגל המתנות שלך
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        {result ? "איזה כיף — הנה מה שיצא לך 🎉" : "מגיע לך פרס על ההזמנה הזו — סובבי ותראי מה קיבלת!"}
      </p>

      <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
        {/* Pointer, fixed at 12 o'clock — doesn't rotate with the wheel. */}
        <div
          className="absolute left-1/2 -translate-x-1/2 z-10"
          style={{ top: -6, width: 0, height: 0, borderLeft: "14px solid transparent", borderRight: "14px solid transparent", borderTop: `22px solid ${HOT}` }}
        />
        <div
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? "transform 4.2s cubic-bezier(0.1,0.75,0.15,1)" : undefined,
          }}
        >
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            <circle cx={CENTER} cy={CENTER} r={RADIUS + 3} fill="#fff" />
            {segments.map(({ prize, path, fill }) => (
              <path key={prize.id} d={path} fill={fill} stroke="#fff" strokeWidth={2} />
            ))}
            {segments.map(({ prize, labelPos, textRotate, textFill }) => (
              <text
                key={prize.id}
                x={labelPos.x}
                y={labelPos.y}
                fill={textFill}
                fontSize={15}
                fontWeight={700}
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${textRotate} ${labelPos.x} ${labelPos.y})`}
              >
                {prize.label}
              </text>
            ))}
            <circle cx={CENTER} cy={CENTER} r={28} fill={HOT} stroke="#fff" strokeWidth={4} />
          </svg>
        </div>
      </div>

      {result ? (
        <div className="mt-6 max-w-sm mx-auto rounded-2xl p-5" style={{ background: "#fff", border: `1px solid ${PASTEL}` }}>
          <div className="flex items-center justify-center gap-2 mb-2" style={{ color: HOT }}>
            <PartyPopper className="h-5 w-5" />
            <span className="font-display text-xl">{result.prize.label}</span>
          </div>
          <p className="text-sm text-muted-foreground mb-2">{result.prize.detail}</p>
          {result.couponCode ? (
            <div className="mt-3 rounded-xl px-4 py-3" style={{ background: "#fdf2f8" }}>
              <div className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground mb-1">קוד ההנחה שלך</div>
              <div className="font-display text-lg" dir="ltr" style={{ color: HOT }}>{result.couponCode}</div>
              <div className="text-[11px] text-muted-foreground mt-1">להזין בעמוד התשלום בהזמנה הבאה</div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">הפרס נרשם אצלנו — נדאג לו בסשן/בהזמנה שלך, אין צורך לעשות כלום 💗</p>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={spin}
          disabled={spinning}
          className="mt-6 h-12 px-8 rounded-full font-semibold text-white shadow-lg disabled:opacity-70 transition-transform active:scale-95"
          style={{ background: `linear-gradient(90deg, ${HOT}, #f472b6)` }}
        >
          {spinning ? "מסתובב… 🎡" : "🎡 סובבי את הגלגל"}
        </button>
      )}
    </div>
  );
}

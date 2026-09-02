// The newsletter-signup wheel — 10 segments, pastel/hot pink (same palette
// as PrizeWheel.tsx for brand consistency), with one extra trick over that
// simpler wheel: a "spin again" segment chains into a second animated spin
// automatically, since the server already resolved the whole sequence in
// one call (see spinNewsletterWheel) — the client just animates through it.
import { useState } from "react";
import { Gift, PartyPopper } from "lucide-react";
import { NEWSLETTER_WHEEL_PRIZES, findNewsletterWheelPrize, type NewsletterWheelPrize } from "@/lib/newsletter-wheel-prizes";

const SIZE = 300;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 5;
const LABEL_RADIUS = RADIUS * 0.63;
const SEGMENT_ANGLE = 360 / NEWSLETTER_WHEEL_PRIZES.length;

const PASTEL = "#ffd6ea";
const HOT = "#ec4899";
const SPIN_MS = 2600; // shorter than the booking wheel's — this one can chain multiple spins in a row

function polar(angleDeg: number, r: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CENTER + r * Math.sin(rad), y: CENTER - r * Math.cos(rad) };
}

function segmentPath(startDeg: number, endDeg: number): string {
  const p0 = polar(startDeg, RADIUS);
  const p1 = polar(endDeg, RADIUS);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${CENTER},${CENTER} L ${p0.x},${p0.y} A ${RADIUS},${RADIUS} 0 ${largeArc} 1 ${p1.x},${p1.y} Z`;
}

function rotationDeltaForIndex(index: number): number {
  const mid = index * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
  const spins = 4 * 360;
  const jitter = (Math.random() - 0.5) * (SEGMENT_ANGLE * 0.5);
  return spins + (360 - mid) + jitter;
}

export function NewsletterWheel({
  onSpin,
  initialSequenceIds,
}: {
  onSpin: () => Promise<{ sequenceIds: string[]; couponCode: string | null }>;
  initialSequenceIds?: string[] | null;
}) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [result, setResult] = useState<{ prize: NewsletterWheelPrize; couponCode: string | null } | null>(() => {
    if (!initialSequenceIds?.length) return null;
    const prize = findNewsletterWheelPrize(initialSequenceIds[initialSequenceIds.length - 1]);
    return prize ? { prize, couponCode: null } : null;
  });

  const segments = NEWSLETTER_WHEEL_PRIZES.map((prize, i) => {
    const start = i * SEGMENT_ANGLE;
    const end = start + SEGMENT_ANGLE;
    const mid = start + SEGMENT_ANGLE / 2;
    const labelPos = polar(mid, LABEL_RADIUS);
    const textRotate = mid > 90 && mid < 270 ? mid + 180 : mid;
    const dark = i % 2 === 0;
    return { prize, path: segmentPath(start, end), fill: dark ? PASTEL : HOT, textFill: dark ? "#9d174d" : "#fff", labelPos, textRotate };
  });

  const animateSequence = (ids: string[], couponCode: string | null) =>
    new Promise<void>((resolve) => {
      let i = 0;
      let cumulative = 0;
      const step = () => {
        const id = ids[i];
        const index = NEWSLETTER_WHEEL_PRIZES.findIndex((p) => p.id === id);
        if (index < 0) {
          resolve();
          return;
        }
        cumulative += rotationDeltaForIndex(index);
        setRotation(cumulative);
        const isLast = i === ids.length - 1;
        setStatusText(isLast ? null : "סיבוב חוזר! מסתובב שוב…");
        window.setTimeout(() => {
          if (isLast) {
            const prize = findNewsletterWheelPrize(id);
            if (prize) setResult({ prize, couponCode });
            setSpinning(false);
            resolve();
            return;
          }
          i += 1;
          step();
        }, SPIN_MS);
      };
      step();
    });

  const spin = async () => {
    if (spinning || result) return;
    setSpinning(true);
    setStatusText("מסתובב…");
    try {
      const res = await onSpin();
      await animateSequence(res.sequenceIds, res.couponCode);
    } catch (e) {
      setSpinning(false);
      setStatusText(null);
    }
  };

  return (
    <div className="text-center">
      <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
        <div
          className="absolute left-1/2 -translate-x-1/2 z-10"
          style={{ top: -5, width: 0, height: 0, borderLeft: "11px solid transparent", borderRight: "11px solid transparent", borderTop: `18px solid ${HOT}` }}
        />
        <div style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? `transform ${SPIN_MS - 100}ms cubic-bezier(0.15,0.7,0.2,1)` : undefined }}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            <circle cx={CENTER} cy={CENTER} r={RADIUS + 2} fill="#fff" />
            {segments.map(({ prize, path, fill }) => (
              <path key={prize.id} d={path} fill={fill} stroke="#fff" strokeWidth={1.5} />
            ))}
            {segments.map(({ prize, labelPos, textRotate, textFill }) => (
              <text
                key={prize.id}
                x={labelPos.x}
                y={labelPos.y}
                fill={textFill}
                fontSize={12}
                fontWeight={700}
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${textRotate} ${labelPos.x} ${labelPos.y})`}
              >
                {prize.label}
              </text>
            ))}
            <circle cx={CENTER} cy={CENTER} r={22} fill={HOT} stroke="#fff" strokeWidth={3} />
          </svg>
        </div>
      </div>

      {result ? (
        <div className="mt-4 max-w-xs mx-auto rounded-2xl p-4" style={{ background: "#fff", border: `1px solid ${PASTEL}` }}>
          <div className="flex items-center justify-center gap-2 mb-1" style={{ color: HOT }}>
            <PartyPopper className="h-4 w-4" />
            <span className="font-display text-lg">{result.prize.label}</span>
          </div>
          {result.couponCode ? (
            <div className="mt-2 rounded-xl px-3 py-2" style={{ background: "#fdf2f8" }}>
              <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-1">קוד ההנחה שלך</div>
              <div className="font-display text-base" dir="ltr" style={{ color: HOT }}>{result.couponCode}</div>
            </div>
          ) : result.prize.kind === "credit" ? (
            <p className="text-xs text-muted-foreground">₪{result.prize.kind === "credit" ? result.prize.amount : ""} נוספו לך כקרדיט בחשבון — זמין כבר להזמנה הבאה 💗</p>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={spin}
          disabled={spinning}
          className="mt-4 h-11 px-6 rounded-full font-semibold text-white shadow-md disabled:opacity-70 transition-transform active:scale-95 inline-flex items-center gap-2"
          style={{ background: `linear-gradient(90deg, ${HOT}, #f472b6)` }}
        >
          <Gift className="h-4 w-4" /> {statusText ?? "🎡 סובבו את הגלגל"}
        </button>
      )}
    </div>
  );
}

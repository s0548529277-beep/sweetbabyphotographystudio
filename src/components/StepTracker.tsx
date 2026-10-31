// Progress tracker — numbered circles on ONE continuous line that fills up
// to the current step. "pink" is the client's own journey, "gold" is the
// photographer's internal production pipeline (admin-only).
// Used on the admin booking/order detail pages (both tracks, clickable)
// and on the client's own gallery pages (pink only, read-only).
//
// Owner request 2026-10-31: the old version felt crowded — labels squeezed
// under small circles. Now: roomier spacing, a filled progress line, a ✓ on
// completed steps, a ring on the current one, a "שלב X מתוך Y" header, and
// (client view) an optional hint line saying what to do now.
import { Check } from "lucide-react";

const THEMES = {
  pink: {
    fill: "bg-[#e8a9a0]",
    done: "bg-[#e8a9a0] border-[#e8a9a0] text-white",
    active: "bg-white border-[#e8a9a0] text-[#8a4a40] ring-4 ring-[#f5d5cf]",
    label: "text-[#8a4a40]",
    chip: "bg-[#f5d5cf]/60 text-[#8a4a40]",
  },
  gold: {
    fill: "bg-[#c9a66b]",
    done: "bg-[#c9a66b] border-[#c9a66b] text-white",
    active: "bg-white border-[#c9a66b] text-[#6b4a1f] ring-4 ring-[#ecdcc0]",
    label: "text-[#6b4a1f]",
    chip: "bg-[#ecdcc0]/70 text-[#6b4a1f]",
  },
} as const;

export function StepTracker({
  theme,
  steps,
  current,
  onStepClick,
  hint,
}: {
  theme: "pink" | "gold";
  steps: string[];
  current: number;
  /** Omit for a read-only tracker (e.g. the client's own view). */
  onStepClick?: (step: number) => void;
  /** Short "what happens now" line under the tracker (client view). */
  hint?: string;
}) {
  const t = THEMES[theme];
  const total = steps.length;
  const cur = Math.min(Math.max(current, 1), total);
  // Line runs between the centres of the first and last circles.
  const pct = total > 1 ? ((cur - 1) / (total - 1)) * 100 : 0;
  const inset = `${50 / total}%`;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3 mb-5">
        <span className={`text-xs font-medium rounded-full px-3 py-1 ${t.chip}`}>
          שלב {cur} מתוך {total}
        </span>
        <span className={`text-sm font-semibold ${t.label} truncate`}>{steps[cur - 1]}</span>
      </div>

      <div className="relative">
        {/* track + fill */}
        <div className="absolute top-5 h-1 rounded-full bg-[#4a3221]/10" style={{ left: inset, right: inset }} />
        <div
          className={`absolute top-5 h-1 rounded-full ${t.fill} transition-all duration-500`}
          style={{ right: inset, width: `calc((100% - 2 * ${inset}) * ${pct / 100})` }}
        />

        <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
          {steps.map((label, i) => {
            const n = i + 1;
            const done = n < cur;
            const active = n === cur;
            return (
              <li key={label} className="flex flex-col items-center text-center px-1.5">
                <button
                  type="button"
                  disabled={!onStepClick}
                  onClick={() => onStepClick?.(n)}
                  aria-current={active ? "step" : undefined}
                  className={`h-10 w-10 rounded-full border-2 flex items-center justify-center text-sm font-semibold transition-all ${
                    done ? t.done : active ? t.active : "bg-white border-[#4a3221]/15 text-[#4a3221]/40"
                  } ${onStepClick ? "cursor-pointer hover:scale-105" : "cursor-default"}`}
                >
                  {done ? <Check className="h-5 w-5" strokeWidth={3} /> : n}
                </button>
                <span
                  className={`mt-3 text-xs sm:text-[13px] leading-snug max-w-[11rem] ${
                    active ? `font-semibold ${t.label}` : done ? "text-[#4a3221]/70" : "text-[#4a3221]/45"
                  }`}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {hint && (
        <p className="mt-5 pt-4 border-t border-[#4a3221]/10 text-sm text-center text-[#4a3221]/75">{hint}</p>
      )}
    </div>
  );
}

import { Check } from "lucide-react";

/**
 * Compact progress indicator for the CUSTOMER order flows (owner request 2026-11-15: a progress indicator in both the
 * studio booking and the props order, and no "jump" between the questionnaire and the next pages).
 * Both flows have the same 3 steps, matching the "3 שלבים" text on /studio-rental:
 *   studio: שאלון והסכם -> בחירת מועד -> סיכום ותשלום   (/studio-rental -> /booking -> /summary + /deposit)
 *   props:  עגלה ותאריכים -> סיכום ותשלום              (/cart [quick order] or /checkout -> /deposit)
 * (The admin / gallery trackers use the bigger `StepTracker` — this one is for the order pages only.)
 */
export const STUDIO_FLOW_STEPS = ["שאלון והסכם", "בחירת מועד", "סיכום ותשלום"] as const;
export const PROPS_FLOW_STEPS = ["עגלה ותאריכים", "סיכום ותשלום"] as const;

export function flowStepsFor(kind: "studio" | "props"): readonly string[] {
  return kind === "studio" ? STUDIO_FLOW_STEPS : PROPS_FLOW_STEPS;
}

export function FlowProgress({
  steps,
  current,
  allDone = false,
  className = "",
  onStepClick,
  canGo,
}: {
  steps: readonly string[];
  /** 1-based current step. */
  current: number;
  /** Everything finished (e.g. the order was approved) — every step shows a check mark. */
  allDone?: boolean;
  className?: string;
  /** Makes steps clickable. By default only COMPLETED steps are (back); `canGo` can also allow forward steps that are already filled. */
  onStepClick?: (step: number) => void;
  canGo?: (step: number) => boolean;
}) {
  const total = steps.length;
  const cur = Math.min(Math.max(current, 1), total);
  return (
    <nav aria-label="התקדמות בהזמנה" className={`w-full ${className}`} dir="rtl">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-[#2d3d2b]/70">
        <span className="rounded-full bg-[#2d3d2b]/8 px-3 py-1 font-medium text-[#2d3d2b]">
          {allDone ? "הושלם" : `שלב ${cur} מתוך ${total}`}
        </span>
        {!allDone && <span className="truncate font-semibold text-[#2d3d2b]">{steps[cur - 1]}</span>}
      </div>
      <ol className="grid" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
        {steps.map((label, i) => {
          const n = i + 1;
          const done = allDone || n < cur;
          const active = !allDone && n === cur;
          return (
            <li key={label} className="relative flex flex-col items-center px-1 text-center">
              {/* connector to the next step (RTL: the next step is on the left) */}
              {i < total - 1 && (
                <span
                  aria-hidden
                  className={`absolute top-4 h-0.5 rounded-full ${done ? "bg-[#6b8a63]" : "bg-[#2d3d2b]/15"}`}
                  style={{ right: "calc(50% + 18px)", left: "calc(-50% + 18px)" }}
                />
              )}
              {(() => {
                const clickable = !!onStepClick && !allDone && n !== cur && (canGo ? canGo(n) : n < cur);
                const body = (
                  <>
              <span
                aria-current={active ? "step" : undefined}
                className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors ${
                  done
                    ? "border-[#6b8a63] bg-[#6b8a63] text-white"
                    : active
                      ? "border-[#6b8a63] bg-white text-[#2d3d2b] ring-4 ring-[#6b8a63]/20"
                      : "border-[#2d3d2b]/20 bg-white text-[#2d3d2b]/40"
                }`}
              >
                {done ? <Check className="h-4 w-4" strokeWidth={3} /> : n}
              </span>
              <span
                className={`mt-1.5 text-[11px] leading-snug sm:text-xs ${
                  active ? "font-semibold text-[#2d3d2b]" : done ? "text-[#2d3d2b]/70" : "text-[#2d3d2b]/45"
                }`}
              >
                {label}
              </span>
                  </>
                );
                return clickable ? (
                  <button
                    type="button"
                    onClick={() => onStepClick!(n)}
                    aria-label={`${n < cur ? "חזרה" : "מעבר"} לשלב: ${label}`}
                    className="flex flex-col items-center rounded-lg px-1 py-0.5 outline-none transition-opacity hover:opacity-75 focus-visible:ring-2 focus-visible:ring-[#6b8a63]"
                  >
                    {body}
                  </button>
                ) : (
                  body
                );
              })()}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

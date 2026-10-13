// A breadcrumb-style progress tracker — numbered circles connected by a
// line, one theme color per track. "pink" is the client's own journey,
// "gold" is the photographer's internal production pipeline (admin-only).
// Used on the admin booking/order detail pages (both tracks, clickable)
// and on the client's own gallery pages (pink only, read-only).
const THEMES = {
  pink: { active: "bg-[#f5d5cf] text-[#5a3a33] border-[#f5d5cf]", line: "bg-[#f5d5cf]", done: "bg-[#f5d5cf]/60" },
  gold: { active: "bg-[#d9b98a] text-[#4a3221] border-[#d9b98a]", line: "bg-[#d9b98a]", done: "bg-[#d9b98a]/60" },
} as const;

export function StepTracker({
  theme,
  steps,
  current,
  onStepClick,
}: {
  theme: "pink" | "gold";
  steps: string[];
  current: number;
  /** Omit for a read-only tracker (e.g. the client's own view). */
  onStepClick?: (step: number) => void;
}) {
  const t = THEMES[theme];
  return (
    <div className="flex items-start">
      {steps.map((label, i) => {
        const stepNum = i + 1;
        const done = stepNum < current;
        const active = stepNum === current;
        return (
          <div key={label} className="flex items-start flex-1 last:flex-initial">
            <div className="flex flex-col items-center gap-1.5" style={{ width: 90 }}>
              <button
                type="button"
                disabled={!onStepClick}
                onClick={() => onStepClick?.(stepNum)}
                className={`h-8 w-8 rounded-full border-2 flex items-center justify-center text-xs font-semibold shrink-0 transition-colors ${
                  active || done ? t.active : "bg-card border-border text-muted-foreground"
                } ${onStepClick ? "cursor-pointer" : "cursor-default"}`}
              >
                {stepNum}
              </button>
              <span className={`text-[10px] text-center leading-tight ${active ? "font-semibold" : "text-muted-foreground"}`}>
                {label}
              </span>
            </div>
            {stepNum < steps.length && (
              <div className={`h-0.5 flex-1 mt-4 ${stepNum < current ? t.line : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

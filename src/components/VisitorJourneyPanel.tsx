import { formatSeconds, type VisitorJourney } from "@/lib/visitor-journey";

// Collapsible "היסטוריית גלישה" for one person in the admin lists (leads, abandoned bookings). Shows nothing when
// there is no history: the person did not accept the cookie banner, or visited before tracking by visitor existed.

const SOURCE: Record<string, string> = {
  google: "Google",
  meta: "פייסבוק / אינסטגרם",
  whatsapp: "וואטסאפ",
  bing: "Bing",
  internal: "ניווט פנימי",
  direct: "כניסה ישירה",
  other: "אתר אחר",
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export function VisitorJourneyPanel({ journey }: { journey?: VisitorJourney | null }) {
  if (!journey || journey.visits === 0) return null;
  return (
    <details className="mt-1 text-xs group">
      <summary className="cursor-pointer select-none flex flex-wrap items-center gap-x-2 gap-y-1 text-forest/80">
        <span>👣 היסטוריית גלישה · {journey.visits} {journey.visits === 1 ? "ביקור" : "ביקורים"}</span>
        {journey.totalSeconds > 0 && <span className="text-forest/60">· {formatSeconds(journey.totalSeconds)} פעילות</span>}
        {journey.hot && (
          <span className="rounded-full bg-orange-100 text-orange-800 px-2 py-0.5 font-medium" title={journey.hotReasons.join(" · ")}>
            ליד חם 🔥
          </span>
        )}
      </summary>
      <div className="mt-2 rounded-xl bg-cream/50 border border-primary/10 p-3 space-y-2 min-w-[220px]">
        {journey.hot && <div className="text-orange-800">{journey.hotReasons.join(" · ")}</div>}
        <div className="text-forest/70">
          ביקור ראשון: {fmtDate(journey.firstSeen)} · אחרון: {fmtDate(journey.lastSeen)}
          {journey.source ? ` · הגיעה מ: ${SOURCE[journey.source] ?? journey.source}` : ""}
        </div>
        <ul className="space-y-0.5">
          {journey.pages.slice(0, 8).map((p) => (
            <li key={p.path} className="flex justify-between gap-3">
              <span>{p.label}</span>
              <span className="text-forest/60 whitespace-nowrap">
                {p.views} {p.views === 1 ? "צפייה" : "צפיות"}
                {p.seconds > 0 ? ` · ${formatSeconds(p.seconds)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

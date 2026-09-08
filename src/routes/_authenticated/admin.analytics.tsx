// In-house site analytics — traffic source, session duration, per-page
// click counts, and a gallery of visitor-made collages. Built as a
// Supabase-backed alternative to a real Google Analytics 4 integration
// (which would need the owner to create her own GA4 property and grant a
// service account API access) — see analytics.functions.ts's own doc
// comment and the migration that created these tables for why.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getAnalyticsSummary, type TrafficSourceRow, type TopPageRow } from "@/lib/analytics.functions";
import { Users, Eye, MousePointerClick, Clock, ImageIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  component: AnalyticsAdmin,
});

const RANGE_OPTIONS = [
  { days: 7, label: "7 ימים" },
  { days: 30, label: "30 ימים" },
  { days: 90, label: "90 ימים" },
];

const SOURCE_LABELS: Record<string, string> = {
  google: "Google",
  meta: "פייסבוק / אינסטגרם",
  whatsapp: "וואטסאפ",
  bing: "Bing",
  internal: "ניווט פנימי באתר",
  direct: "כניסה ישירה (הקלדת כתובת)",
  other: "אתרים אחרים",
};

// Only the pages worth a friendly name — everything else falls back to the
// raw path, which is still perfectly readable (e.g. "/items/abc123").
const PAGE_LABELS: Record<string, string> = {
  "/": "עמוד הבית",
  "/rental-catalog": "קטלוג השכרת אביזרים",
  "/studio-rental": "השכרת סטודיו",
  "/studio-photography": "צילומים בסטודיו",
  "/collage-maker": "יצירת קולאז'",
  "/about": "אודות",
  "/contact": "צור קשר",
  "/booking": "הזמנת תור",
  "/cart": "עגלה",
  "/checkout": "תשלום",
  "/blog": "בלוג",
};

function friendlyPage(path: string): string {
  return PAGE_LABELS[path] ?? path;
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds} שנ׳`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} דק׳ ${seconds ? `${seconds} שנ׳` : ""}`.trim();
}

function StatTile({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string | number }) {
  return (
    <div className="bg-card rounded-2xl p-6 border border-primary/5">
      <div className="flex items-center justify-between">
        <div className="h-10 w-10 rounded-full bg-peach text-primary flex items-center justify-center">
          <Icon className="h-4 w-4" />
        </div>
        <div className="text-xs tracking-widest uppercase text-muted-foreground">{label}</div>
      </div>
      <div className="font-display text-3xl text-primary mt-4">{value}</div>
    </div>
  );
}

/** Horizontal bar list — one consistent hue since every row is the same measure (count), not a set of identities that need telling apart by color. */
function BarList({ rows, labelOf, valueOf }: { rows: any[]; labelOf: (r: any) => string; valueOf: (r: any) => number }) {
  const max = Math.max(1, ...rows.map(valueOf));
  return (
    <div className="space-y-3">
      {rows.map((r, i) => {
        const value = valueOf(r);
        const pct = Math.max(4, Math.round((value / max) * 100));
        return (
          <div key={i}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-foreground">{labelOf(r)}</span>
              <span className="text-muted-foreground tabular-nums">{value}</span>
            </div>
            <div className="h-2.5 rounded-full bg-cream overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AnalyticsAdmin() {
  const [days, setDays] = useState(30);
  const fetchSummary = useServerFn(getAnalyticsSummary);
  const q = useQuery({
    queryKey: ["admin-analytics", days],
    queryFn: () => fetchSummary({ data: { days } }),
    refetchInterval: 60_000,
  });

  const data = q.data;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-primary mb-1">אנליטיקס — נתוני שימוש באתר</h2>
          <p className="text-sm text-muted-foreground">מאיפה נכנסים, כמה זמן נשארים, מה הכי מקליקים, ואילו קולאז'ים יצרו — נאסף ונשמר אצלנו, בלי חשבון גוגל.</p>
        </div>
        <div className="flex gap-2">
          {RANGE_OPTIONS.map((o) => (
            <button
              key={o.days}
              type="button"
              onClick={() => setDays(o.days)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                days === o.days ? "bg-primary text-primary-foreground" : "bg-cream/60 text-muted-foreground hover:bg-cream"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {q.isLoading ? (
        <div className="text-muted-foreground text-sm py-10 text-center">טוען נתונים…</div>
      ) : !data ? (
        // Shows the real error message, not just a generic "failed" —
        // learned the hard way: this page shipped once already with a bare
        // "שגיאה בטעינת הנתונים" that gave no way to tell "the tables
        // don't exist yet" from "no admin role" from anything else short
        // of digging through server logs. If she reports this again, the
        // text itself now names the actual problem.
        <div className="text-sm py-10 text-center text-destructive">
          שגיאה בטעינת הנתונים{q.error instanceof Error ? `: ${q.error.message}` : ""}
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatTile icon={Users} label="כניסות (sessions)" value={data.totalSessions} />
            <StatTile icon={Eye} label="צפיות בעמודים" value={data.totalPageviews} />
            <StatTile icon={MousePointerClick} label="הקלקות" value={data.totalClicks} />
            <StatTile icon={Clock} label="משך שהייה ממוצע" value={data.avgSessionSeconds > 0 ? formatDuration(data.avgSessionSeconds) : "—"} />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-2xl p-6 border border-primary/5">
              <h3 className="font-display text-xl text-primary mb-4">מאיפה נכנסו אלי</h3>
              {data.trafficSources.length === 0 ? (
                <div className="text-muted-foreground text-sm py-6 text-center">עדיין אין מספיק נתונים.</div>
              ) : (
                <BarList
                  rows={data.trafficSources as TrafficSourceRow[]}
                  labelOf={(r) => SOURCE_LABELS[r.source] ?? r.source}
                  valueOf={(r) => r.sessions}
                />
              )}
            </div>

            <div className="bg-card rounded-2xl p-6 border border-primary/5">
              <h3 className="font-display text-xl text-primary mb-4">הקלקות בכל עמוד</h3>
              {data.topPages.length === 0 ? (
                <div className="text-muted-foreground text-sm py-6 text-center">עדיין אין מספיק נתונים.</div>
              ) : (
                <BarList
                  rows={(data.topPages as TopPageRow[]).slice(0, 10)}
                  labelOf={(r) => friendlyPage(r.path)}
                  valueOf={(r) => r.clicks}
                />
              )}
            </div>
          </div>

          <div className="bg-card rounded-2xl p-6 border border-primary/5">
            <div className="flex items-center gap-2 mb-4">
              <ImageIcon className="h-5 w-5 text-primary" />
              <h3 className="font-display text-xl text-primary">קולאז'ים שאנשים יצרו</h3>
            </div>
            {data.collages.length === 0 ? (
              <div className="text-muted-foreground text-sm py-6 text-center">עדיין לא נוצרו קולאז'ים בטווח הזה.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4">
                {data.collages.map((c) => (
                  <a
                    key={c.id}
                    href={c.imageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="group block rounded-xl overflow-hidden border border-primary/5 bg-cream/40 hover:shadow-[var(--shadow-card)] transition-shadow"
                  >
                    <div className="aspect-[3/4] bg-cream overflow-hidden">
                      <img src={c.imageUrl} alt={c.caption ?? "קולאז'"} className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                    </div>
                    <div className="p-2 text-xs text-muted-foreground truncate">
                      {c.caption || "ללא כיתוב"} · {new Date(c.createdAt).toLocaleDateString("he-IL")}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

import { createFileRoute, notFound } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { openFunnel, useFunnelOverrides, useFunnelSettings } from "@/components/FunnelDialog";
import { FUNNEL_THEMES } from "@/lib/funnel-theme";
import { applyFunnelTheme } from "@/lib/funnel-overrides";
import type { FunnelId } from "@/lib/funnels";

// Landing page per funnel (/go/studio, /go/photography, /go/newborn, /go/entry): one headline, a few points and a big button
// that opens the funnel. Texts and photo are editable in /admin/funnel-editor.
const IDS = ["studio", "photography", "newborn", "entry"] as const;

export const LANDING_DEFAULTS: Record<FunnelId, { headline: string; text: string; bullets: string[]; cta: string }> = {
  studio: {
    headline: "כמה יעלה לך הסטודיו?",
    text: "סטודיו מאובזר להשכרה בבית שמש. שלוש שאלות קצרות ותקבלי חישוב מדויק, כולל כרטיסייה משתלמת וצבירת קרדיט.",
    bullets: ["חישוב מיידי לפי השימוש שלך", "כרטיסיות משתלמות", "צלמות חוזרות מקבלות הנחה"],
    cta: "לחישוב המחיר",
  },
  photography: {
    headline: "איזה סשן צילום מתאים לך?",
    text: "סשן עם מיכל סיבוני, בסטודיו או בחוץ. כמה שאלות קצרות ותקבלי המלצה אישית.",
    bullets: ["בסטודיו או בטבע", "ניו בורן, משפחה, ילדים ואירועים", "מיכל חוזרת אלייך במייל"],
    cta: "להמלצה אישית",
  },
  newborn: {
    headline: "איזו חבילת ניו בורן מתאימה לך?",
    text: "חבילות צילומי ניו בורן בסטודיו, עם או בלי סל הלידה. שלוש שאלות והמלצה אישית.",
    bullets: ["חבילות לכל תקציב", "אפשר לממש דרך סל הלידה", "אלבום ותמונות ערוכות"],
    cta: "למציאת החבילה",
  },
  entry: {
    headline: "בואי נמצא מה מתאים לך",
    text: "צלמת שמחפשת סטודיו, או לקוחה שמחפשת צילומים? כמה שאלות קצרות ונכוון אותך.",
    bullets: ["שכירת סטודיו", "צילומי ניו בורן", "משפחה, ילדים וחוץ"],
    cta: "בואי נתחיל",
  },
};

export const Route = createFileRoute("/go/$funnel")({
  beforeLoad: ({ params }) => {
    if (!(IDS as readonly string[]).includes(params.funnel)) throw notFound();
  },
  head: ({ params }) => {
    const d = LANDING_DEFAULTS[params.funnel as FunnelId];
    return {
      meta: [
        { title: `${d?.headline ?? "Sweetbaby"} | Sweetbaby` },
        { name: "description", content: d?.text ?? "" },
      ],
    };
  },
  component: Landing,
});

function Landing() {
  const { funnel } = Route.useParams();
  const id = funnel as FunnelId;
  const ov = useFunnelOverrides();
  const settings = useFunnelSettings();
  const d = LANDING_DEFAULTS[id];
  const l = ov[id]?.landing;
  const t = applyFunnelTheme(FUNNEL_THEMES[id], id, ov);
  const on = settings[id];
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header />
      <main className="mx-auto max-w-5xl px-5 py-12 md:py-20">
        <div className={`grid items-center gap-8 ${l?.image ? "md:grid-cols-2" : ""}`}>
          <div className="text-center md:text-right">
            <p className="text-3xl" aria-hidden>
              {t.emoji}
            </p>
            <h1 className="mt-2 text-3xl leading-snug md:text-4xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
              {l?.headline || d.headline}
            </h1>
            <p className="mt-4 text-lg leading-relaxed opacity-80">{l?.text || d.text}</p>
            <ul className="mx-auto mt-5 max-w-sm space-y-2 text-right">
              {(l?.bullets?.length ? l.bullets : d.bullets).map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <Check className="mt-1 h-4 w-4 shrink-0" style={{ color: t.solid }} aria-hidden="true" />
                  {b}
                </li>
              ))}
            </ul>
            <div className="mt-8">
              {on ? (
                <button
                  type="button"
                  onClick={() => openFunnel(id)}
                  className="rounded-full px-8 py-4 text-lg text-white shadow-lg transition active:scale-[0.98]"
                  style={{ background: t.gradient }}
                >
                  {d.cta}
                </button>
              ) : (
                <p className="text-sm opacity-70">השאלון אינו פעיל כרגע.</p>
              )}
              <p className="mt-2 text-xs opacity-60">דקה אחת · בלי התחייבות</p>
            </div>
          </div>
          {l?.image && <img src={l.image} alt="" className="mx-auto max-h-[460px] w-full rounded-3xl object-cover shadow-lg" />}
        </div>
      </main>
      <Footer />
    </div>
  );
}

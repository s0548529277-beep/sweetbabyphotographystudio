import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, Sparkles, CalendarDays, ArrowLeft } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import heroImg from "@/assets/hero-scene.jpg";
import logoPeach from "@/assets/logo-peach.png";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="container-page grid lg:grid-cols-2 gap-12 items-center py-16 md:py-24">
          <div className="order-2 lg:order-1 space-y-7">
            <div className="inline-flex items-center gap-2 text-forest text-xs tracking-[0.25em] uppercase">
              <span className="h-px w-8 bg-forest/50" /> Studio Sweetbaby
            </div>
            <h1 className="font-display text-5xl md:text-7xl leading-[1.05] text-primary">
              התמונה
              <br />
              <span className="italic text-peach-deep">הראשונה</span> שלי.
            </h1>
            <p className="text-lg text-muted-foreground max-w-lg leading-relaxed">
              מבחר אביזרים מעוצבים לצילומי ניוברן, גיל שנה, חלאקה ומשפחה — לוקיישן משלכם, אווירה משלנו.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link to="/catalog">
                <Button size="lg" className="rounded-full gap-2 px-7 h-12 text-base">
                  לקטלוג המלא <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/about">
                <Button size="lg" variant="outline" className="rounded-full px-7 h-12 text-base border-primary/30">
                  איך זה עובד
                </Button>
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-6 pt-8 max-w-md">
              {[
                { n: "300+", l: "אביזרים" },
                { n: "24ש׳", l: "השכרה" },
                { n: "50₪", l: "מינימום" },
              ].map((s) => (
                <div key={s.l}>
                  <div className="font-display text-3xl text-primary">{s.n}</div>
                  <div className="text-xs text-muted-foreground tracking-widest uppercase mt-1">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="order-1 lg:order-2 relative">
            <div className="absolute -inset-4 bg-peach/30 blur-3xl rounded-full -z-10" />
            <div className="relative aspect-[4/5] rounded-[2rem] overflow-hidden bg-cream shadow-[var(--shadow-soft)]">
              <img src={heroImg} alt="סטודיו סוויט בייבי" className="w-full h-full object-cover" width={1600} height={1200} />
              {/* film corner marks */}
              <div className="absolute inset-4 border border-cream/40 rounded-[1.6rem] pointer-events-none" />
              <span className="absolute top-6 left-6 text-cream/80 text-[10px] tracking-[0.3em]">SB · 01</span>
              <span className="absolute bottom-6 right-6 text-cream/80 text-[10px] tracking-[0.3em]">2026 · ISO 200</span>
            </div>
            {/* Floating badge */}
            <div className="absolute -bottom-6 -left-4 md:-left-10 bg-primary text-primary-foreground rounded-full px-6 py-4 shadow-[var(--shadow-soft)] flex items-center gap-3">
              <Camera className="h-5 w-5 text-peach" />
              <div className="text-xs leading-tight">
                <div className="font-display text-lg text-peach">Newborn</div>
                <div className="opacity-70">Photography Props</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature strip */}
      <section className="border-y border-primary/10 bg-cream/70">
        <div className="container-page grid grid-cols-1 md:grid-cols-3 divide-x divide-x-reverse divide-primary/10">
          {[
            { icon: Sparkles, t: "אביזרים מעוצבים", d: "וינטג׳, מקרמה, סרוגים, עץ ורטאן — נבחרו ידנית." },
            { icon: CalendarDays, t: "איסוף גמיש", d: "השכרת 24 שעות בבית שמש, קרוב אליכם." },
            { icon: Camera, t: "לכל סגנון", d: "ניו בורן, גיל שנה, חלאקה, משפחה ולוקיישן." },
          ].map((f) => (
            <div key={f.t} className="p-8 flex gap-4 items-start">
              <div className="h-10 w-10 rounded-full bg-primary text-peach flex items-center justify-center shrink-0">
                <f.icon className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-display text-xl text-primary">{f.t}</h3>
                <p className="text-sm text-muted-foreground mt-1">{f.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Categories teaser */}
      <section className="container-page py-20">
        <div className="flex items-end justify-between mb-10">
          <div>
            <div className="text-xs tracking-[0.3em] uppercase text-forest/70 mb-3">Collections</div>
            <h2 className="font-display text-4xl md:text-5xl text-primary">קולקציות נבחרות</h2>
          </div>
          <Link to="/catalog" className="text-sm text-primary hover:text-peach-deep flex items-center gap-1">
            כל הקטלוג <ArrowLeft className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { t: "Newborn", he: "ניו בורן", d: "עריסות, סלים, כריות פוזינג ועיטופים." },
            { t: "Vintage", he: "וינטג׳", d: "מצלמות מינולטה, ספרים, טלפון וכובעים." },
            { t: "Lifestyle", he: "לייף סטייל", d: "מקרמה, סלסלות, כדים ופרטים חמים." },
          ].map((c, i) => (
            <Link
              key={c.t}
              to="/catalog"
              className="group relative aspect-[4/5] rounded-3xl overflow-hidden bg-primary/95 flex items-end p-7 shadow-[var(--shadow-card)]"
            >
              <div
                className="absolute inset-0 opacity-40 group-hover:opacity-55 transition-opacity"
                style={{
                  background:
                    i === 0
                      ? "radial-gradient(circle at 30% 20%, oklch(0.87 0.055 55 / 0.7), transparent 60%)"
                      : i === 1
                      ? "radial-gradient(circle at 70% 80%, oklch(0.78 0.09 45 / 0.7), transparent 60%)"
                      : "radial-gradient(circle at 50% 40%, oklch(0.9 0.045 60 / 0.7), transparent 60%)",
                }}
              />
              <div className="absolute top-6 right-6 text-peach/70 text-[10px] tracking-[0.3em]">0{i + 1}</div>
              <div className="relative text-primary-foreground">
                <div className="text-peach text-xs tracking-[0.3em] uppercase mb-2">{c.t}</div>
                <h3 className="font-display text-3xl mb-2">{c.he}</h3>
                <p className="text-sm text-primary-foreground/70 max-w-[24ch]">{c.d}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Rules card */}
      <section className="container-page pb-20">
        <div className="rounded-[2rem] bg-primary text-primary-foreground p-10 md:p-16 relative overflow-hidden">
          <img src={logoPeach} alt="" className="absolute -top-10 -left-10 opacity-10 w-96 h-auto pointer-events-none" />
          <div className="grid md:grid-cols-2 gap-10 items-start relative">
            <div>
              <div className="text-peach text-xs tracking-[0.3em] uppercase mb-3">Rental Rules</div>
              <h2 className="font-display text-4xl md:text-5xl">כללי ההשכרה</h2>
              <p className="text-primary-foreground/70 mt-4 max-w-md">
                הזמנת אביזרים נחשבת להסכמה לתנאים. שמרו עליהם — ותנו לתמונות לדבר.
              </p>
            </div>
            <ul className="space-y-4 text-sm">
              {[
                "מינימום להזמנה 50 ש״ח, התשלום לפני לקיחת האביזרים.",
                "איסוף והחזרה תוך 24 שעות; כל יום נוסף — חיוב השכרה מלא.",
                "איחור מעל 3 שעות — חיוב חצי מסכום ההשכרה.",
                "אחריות מלאה על האביזרים — נזק יחויב במחירם המלא.",
              ].map((r, i) => (
                <li key={i} className="flex gap-4">
                  <span className="text-peach font-display text-lg leading-none pt-0.5">0{i + 1}</span>
                  <span className="text-primary-foreground/90">{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

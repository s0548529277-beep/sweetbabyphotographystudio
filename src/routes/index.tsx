import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Camera, MoveUpRight } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import heroImg from "@/assets/hero-scene.jpg";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "Sweetbaby — סטודיו והשכרת אביזרי צילום בבית שמש" },
      { name: "description", content: "השכרת אביזרים מעוצבים ושכירת סטודיו לצילומי ניוברן, גיל שנה, חלאקה ומשפחה. בבית שמש." },
      { property: "og:title", content: "Sweetbaby — סטודיו והשכרת אביזרי צילום" },
      { property: "og:description", content: "אביזרים מעוצבים וסטודיו מוכן לצילומי ניוברן, גיל שנה ומשפחה." },
      { property: "og:url", content: "https://sweetbabyphotographystudio.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://sweetbabyphotographystudio.lovable.app/" }],
  }),
});

const marqueeWords = [
  "Newborn",
  "Sitter",
  "Cake Smash",
  "Family",
  "Vintage",
  "Macramé",
  "Lifestyle",
  "Studio",
];

function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />

      {/* HERO — editorial split */}
      <section className="relative border-b border-border/70">
        <div className="container-page pt-10 md:pt-16 pb-20 md:pb-28">
          {/* top meta bar */}
          <div className="flex items-center justify-between text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-14">
            <span>Est. 2020 — Beit Shemesh</span>
            <span className="hidden md:inline">Catalogue №26 · 2026 Edition</span>
            <span dir="ltr">SB / 001</span>
          </div>

          <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-end">
            {/* headline */}
            <div className="lg:col-span-7">
              <h1 className="font-display leading-[0.92] text-foreground tracking-tight text-[clamp(3.5rem,10vw,9rem)]">
                התמונה
                <br />
                <span className="italic font-normal">הראשונה</span>
                <span className="text-sand-deep">.</span>
              </h1>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link to="/start">
                  <Button size="lg" className="rounded-none h-12 px-8 text-sm tracking-widest uppercase gap-3 bg-foreground text-background hover:bg-foreground/90">
                    להתחלת הזמנה <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/catalog" className="text-sm tracking-widest uppercase inline-flex items-center gap-2 border-b border-foreground/40 pb-1 hover:border-foreground transition-colors">
                  לצפייה בקטלוג <MoveUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>

            {/* image */}
            <div className="lg:col-span-5 relative">
              <div className="relative aspect-[4/5] overflow-hidden bg-bone">
                <img
                  src={heroImg}
                  alt="סטודיו Sweetbaby"
                  className="w-full h-full object-cover"
                  width={1200}
                  height={1500}
                />
                <div className="absolute inset-0 pointer-events-none ring-1 ring-inset ring-foreground/10" />
              </div>
              <div className="absolute -bottom-4 -right-4 md:-right-8 bg-background border border-border px-5 py-3 text-xs tracking-[0.28em] uppercase flex items-center gap-3">
                <Camera className="h-4 w-4" />
                Studio · Beit Shemesh
              </div>
            </div>
          </div>

          {/* lede + stats */}
          <div className="mt-20 grid lg:grid-cols-12 gap-10 border-t border-border pt-10">
            <p className="lg:col-span-6 lg:col-start-1 text-lg md:text-xl leading-relaxed max-w-2xl text-foreground/85">
              סטודיו אינטימי בבית שמש ומאגר של מעל <span className="italic font-display text-2xl">400</span>אביזרים מעוצבים — 
              וינטג׳, מקרמה, סרוגים, עץ ורטאן — לצילומי ניוברן, גיל שנה, חלאקה ומשפחה. אתם בוחרים סגנון, אנחנו מכינים את הסט.
            </p>
            <dl className="lg:col-span-5 lg:col-start-8 grid grid-cols-3 gap-6 border-t border-border pt-8 lg:border-t-0 lg:pt-0">
              {[
                { n: "400+", l: "פריטים" },
                { n: "24h", l: "השכרה" },
                { n: "₪50", l: "מינימום" },
              ].map((s) => (
                <div key={s.l}>
                  <dt className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">{s.l}</dt>
                  <dd className="font-display text-4xl md:text-5xl">{s.n}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* MARQUEE */}
      <section className="overflow-hidden border-b border-border py-6 bg-foreground text-background">
        <div className="marquee-track font-display text-4xl md:text-5xl italic">
          {[...marqueeWords, ...marqueeWords].map((w, i) => (
            <span key={i} className="inline-flex items-center gap-12">
              {w}
              <span className="text-sand text-2xl">✦</span>
            </span>
          ))}
        </div>
      </section>

      {/* PILLARS */}
      <section className="container-page py-24 md:py-32">
        <div className="grid lg:grid-cols-12 gap-10">
          <div className="lg:col-span-4">
            <div className="eyebrow mb-4">The Studio</div>
            <h2 className="font-display text-5xl md:text-6xl leading-[1] tracking-tight">
              עיצוב <span className="italic">שקט</span>,
              <br />תמונה שנשארת.
            </h2>
          </div>
          <div className="lg:col-span-8 grid sm:grid-cols-3 gap-px bg-border">
            {[
              { n: "01", t: "אביזרים מעוצבים", d: "וינטג׳, מקרמה, סרוגים, עץ ורטאן — נבחרו ידנית." },
              { n: "02", t: "השכרה גמישה", d: "24 שעות מלאות בבית שמש, איסוף עצמי." },
              { n: "03", t: "לכל סגנון", d: "ניו בורן, גיל שנה, חלאקה, משפחה ולוקיישן." },
            ].map((f) => (
              <div key={f.n} className="bg-background p-8 flex flex-col justify-between min-h-52">
                <span className="font-display text-2xl text-sand-deep">{f.n}</span>
                <div>
                  <h3 className="font-display text-2xl mb-2">{f.t}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COLLECTIONS — hero-grid */}
      <section className="container-page pb-24 md:pb-32">
        <div className="flex items-end justify-between mb-10 border-b border-border pb-6">
          <div>
            <div className="eyebrow mb-3">Collections</div>
            <h2 className="font-display text-5xl md:text-6xl tracking-tight">קולקציות נבחרות</h2>
          </div>
          <Link to="/catalog" className="text-sm tracking-widest uppercase inline-flex items-center gap-2 border-b border-foreground/50 pb-1">
            לכל הקטלוג <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid lg:grid-cols-12 gap-6 md:gap-8">
          {/* feature */}
          <Link to="/catalog" className="lg:col-span-7 group block relative overflow-hidden bg-bone aspect-[4/3]">
            <img src={heroImg} alt="קולקציית אביזרי צילום ניובורן" className="absolute inset-0 w-full h-full object-cover transition-transform duration-[900ms] group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-8 md:p-10 text-background">
              <div className="text-[11px] tracking-[0.35em] uppercase text-sand mb-3">Featured · 01</div>
              <h3 className="font-display text-5xl md:text-6xl italic">ניו בורן</h3>
              <p className="mt-3 text-sm text-background/80 max-w-md">עריסות, סלים, כריות פוזינג, עיטופים ורכות שנשארת לדורות.</p>
            </div>
          </Link>

          <div className="lg:col-span-5 grid sm:grid-cols-2 lg:grid-cols-1 gap-6 md:gap-8">
            {[
              { t: "Vintage", he: "וינטג׳", d: "מצלמות מינולטה, ספרים, טלפון וכובעים." },
              { t: "Lifestyle", he: "לייף סטייל", d: "מקרמה, סלסלות, כדים ופרטים חמים." },
            ].map((c, i) => (
              <Link
                key={c.t}
                to="/catalog"
                className="group relative overflow-hidden aspect-[4/3] lg:aspect-auto lg:h-full border border-border bg-bone flex items-end p-7"
              >
                <div className="absolute top-6 right-6 text-[10px] tracking-[0.35em] uppercase text-muted-foreground">0{i + 2}</div>
                <div className="relative">
                  <div className="eyebrow mb-2">{c.t}</div>
                  <h3 className="font-display text-4xl italic">{c.he}</h3>
                  <p className="text-sm text-muted-foreground mt-2 max-w-[26ch]">{c.d}</p>
                </div>
                <MoveUpRight className="absolute bottom-7 left-7 h-5 w-5 text-foreground/60 group-hover:text-foreground transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* RULES */}
      <section className="container-page pb-24 md:pb-32">
        <div className="grid lg:grid-cols-12 gap-10 border-t border-border pt-12">
          <div className="lg:col-span-4">
            <div className="eyebrow mb-4">Rental Rules</div>
            <h2 className="font-display text-4xl md:text-5xl leading-[1.05]">
              כללי <span className="italic">ההשכרה</span>
            </h2>
            <p className="text-muted-foreground mt-4 max-w-md text-sm leading-relaxed">
              הזמנת אביזרים נחשבת להסכמה לתנאים. שמרו עליהם — ותעזרו לנו לתת לכם שירות טוב יותר
            </p>
          </div>
          <ol className="lg:col-span-8 divide-y divide-border border-y border-border">
            {[
              "מינימום להזמנה 50 ש״ח, התשלום לפני לקיחת האביזרים.",
              "איסוף והחזרה תוך 24 שעות; כל יום נוסף — חיוב השכרה מלא.",
              "איחור מעל 3 שעות — חיוב חצי מסכום ההשכרה.",
              "אחריות מלאה על האביזרים — נזק יחויב במחירם המלא.",
            ].map((r, i) => (
              <li key={i} className="py-6 grid grid-cols-[auto_1fr] gap-6 items-baseline">
                <span className="font-display text-3xl text-sand-deep">0{i + 1}</span>
                <span className="text-base md:text-lg text-foreground/90">{r}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <Footer />
    </div>
  );
}

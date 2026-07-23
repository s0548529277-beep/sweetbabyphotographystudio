import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { Camera, Home as HomeIcon, Sparkles, ArrowLeft, MapPin, Star, Heart, Clock } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CountUp } from "@/components/CountUp";
import heroImg from "@/assets/hero-studio.jpg.asset.json";
import hero0 from "@/assets/home-hero-0.png.asset.json";
import hero1 from "@/assets/home-hero-1.png.asset.json";
import hero2 from "@/assets/home-hero-2.png.asset.json";
import hero3 from "@/assets/home-hero-3.jpg.asset.json";
import hero4 from "@/assets/home-hero-4.jpg.asset.json";
import hero5 from "@/assets/home-hero-5.jpg.asset.json";
import hero7 from "@/assets/home-hero-7.png.asset.json";
import studioInterior from "@/assets/studio-interior.jpg";
import studioPropsCorner from "@/assets/studio-props-corner.jpg";
import heroScene from "@/assets/hero-scene.jpg";

const GALLERY_IMAGES: { src: string; caption: string }[] = [
  { src: hero0.url,             caption: "פינת ניו-בורן ורודה" },
  { src: studioInterior,        caption: "הסטודיו — אור טבעי" },
  { src: hero3.url,             caption: "סט וינטג׳ בבז׳" },
  { src: studioPropsCorner,     caption: "פינת אביזרים סרוגים" },
  { src: hero1.url,             caption: "רכות ופסטל" },
  { src: heroScene,             caption: "סצנת צילום מוכנה" },
  { src: hero4.url,             caption: "משפחה בסטודיו" },
  { src: hero2.url,             caption: "טקסטורות ומקרמה" },
  { src: hero5.url,             caption: "דרמה בשחור" },
  { src: hero7.url,             caption: "פרחים ואור בוקר" },
];

const HERO_SLIDES: string[] = [
  hero0.url,
  hero1.url,
  hero2.url,
  hero3.url,
  hero4.url,
  hero5.url,
  hero7.url,
];


const OG_IMAGE = `https://sweetbabyphoto.shop${hero0.url}`;

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "Sweetbaby — 400+ אביזרים לצילומי ניוברן, סטודיו בוטיק בבית שמש" },
      { name: "description", content: "סטודיו Sweetbaby בבית שמש — 400+ אביזרים לצילומי ניוברן, השכרת סטודיו וסשן צילום עם מיכל סיבוני." },
      { property: "og:title", content: "Sweetbaby — 400+ אביזרים לצילומי ניוברן, סטודיו בוטיק בבית שמש" },
      { property: "og:description", content: "סטודיו Sweetbaby בבית שמש — 400+ אביזרים לצילומי ניוברן, השכרת סטודיו וסשן צילום עם מיכל סיבוני." },
      { property: "og:url", content: "https://sweetbabyphoto.shop/" },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:image:alt", content: "סטודיו Sweetbaby — פינת צילום ורודה עם אביזרים מעוצבים" },
      { name: "twitter:title", content: "Sweetbaby — 400+ אביזרים לצילומי ניוברן, סטודיו בוטיק בבית שמש" },
      { name: "twitter:description", content: "סטודיו Sweetbaby בבית שמש — 400+ אביזרים לצילומי ניוברן, השכרת סטודיו וסשן צילום עם מיכל סיבוני." },
      { name: "twitter:image", content: OG_IMAGE },
      { name: "twitter:image:alt", content: "סטודיו Sweetbaby — פינת צילום ורודה עם אביזרים מעוצבים" },
    ],
    links: [{ rel: "canonical", href: "https://sweetbabyphoto.shop/" }],
  }),
});

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.7, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] as const } }),
};

function Home() {
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % HERO_SLIDES.length), 3800);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#f8ede4] text-[#2d3d2b] overflow-hidden" style={{ fontFamily: "'Fira Sans', sans-serif" }}>
      <Header />

      {/* HERO */}
      <section className="relative">
        {/* Decorative floating shapes */}
        <motion.div
          aria-hidden
          className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-[#f5d5cf] blur-3xl opacity-70"
          animate={{ y: [0, 30, 0], x: [0, 20, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="absolute top-40 -right-32 h-[28rem] w-[28rem] rounded-full bg-[#a8c4a2] blur-3xl opacity-40"
          animate={{ y: [0, -25, 0], x: [0, -15, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="relative container-page pt-14 md:pt-20 pb-10" dir="rtl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <motion.div
              initial="hidden" animate="show" variants={fadeUp}
              className="lg:col-span-7 relative z-10"
            >
              <div className="inline-flex items-center gap-2 rounded-full bg-white/70 backdrop-blur px-4 py-1.5 border border-[#2d3d2b]/10">
                <Star className="h-3.5 w-3.5 fill-[#a8c4a2] text-[#a8c4a2]" />
                <span className="text-[11px] tracking-[0.28em] uppercase text-[#2d3d2b]/70 font-medium">
                  סטודיו בוטיק · בית שמש · מאז 2023
                </span>
              </div>

              <h1
                className="mt-6 text-[3.2rem] leading-[1.02] md:text-[5.2rem] md:leading-[0.98] text-[#2d3d2b]"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                כאן נולדת <em className="not-italic text-[#6b8a63]">התמונה</em>
                <br />
                <span className="relative inline-block">
                  שתישאר איתך
                  <motion.svg
                    viewBox="0 0 400 20" className="absolute -bottom-3 right-0 w-full h-4 text-[#f5d5cf]"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, delay: 0.5 }}
                  >
                    <motion.path
                      d="M5 12 Q 100 2, 200 10 T 395 8" stroke="currentColor" strokeWidth="6"
                      strokeLinecap="round" fill="none"
                      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, delay: 0.5 }}
                    />
                  </motion.svg>
                </span>{" "}
                לתמיד.
              </h1>

              <p className="mt-8 text-lg md:text-xl text-[#2d3d2b]/75 max-w-xl leading-relaxed">
                סטודיו בוטיק בבית שמש המשלב אמנות, רגש ועיצוב מוקפד — לצילומי ניוברן, חלאקה, גיל שנה ומשפחה. שלוש דרכים ליצור רגע שלא נשכח.
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Link
                  to="/studio-rental"
                  className="group inline-flex items-center gap-3 rounded-full bg-[#2d3d2b] text-[#f8ede4] px-7 py-4 text-base font-medium hover:bg-[#1f2b1e] transition-all hover:gap-4"
                >
                  <span>השכרת הסטודיו</span>
                  <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                </Link>
                <Link
                  to="/rental-catalog"
                  className="inline-flex items-center gap-2 text-[#2d3d2b] font-medium underline decoration-[#f5d5cf] decoration-4 underline-offset-8 hover:decoration-[#a8c4a2] transition-colors"
                >
                  <Sparkles className="h-4 w-4" /> לקטלוג האביזרים
                </Link>
              </div>

              {/* Animated stats */}
              <div className="mt-14 grid grid-cols-3 gap-4 md:gap-8 max-w-lg">
                {[
                  { end: 400, suffix: "+", label: "אביזרים", icon: Sparkles },
                  { end: 3, suffix: "+ שנים", label: "מ-2023", icon: Clock },
                  { end: 1200, suffix: "+", label: "משפחות", icon: Heart },
                ].map((s, i) => (
                  <motion.div
                    key={s.label} custom={i} initial="hidden" animate="show" variants={fadeUp}
                    className="flex flex-col"
                  >
                    <s.icon className="h-4 w-4 text-[#6b8a63] mb-2" />
                    <div className="text-3xl md:text-4xl text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>
                      <CountUp end={s.end} suffix={s.suffix} />
                    </div>
                    <div className="text-xs text-[#2d3d2b]/60 tracking-wider uppercase mt-1">{s.label}</div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Hero image collage */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
              className="lg:col-span-5 relative"
            >
              <div className="relative aspect-[4/5] rounded-[2rem] overflow-hidden shadow-2xl bg-[#f5d5cf]">
                <AnimatePresence mode="wait">
                  <motion.img
                    key={slide}
                    src={HERO_SLIDES[slide]}
                    alt="רגעים מהסטודיו"
                    initial={{ opacity: 0, scale: 1.06 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.02 }}
                    transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                </AnimatePresence>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                  {HERO_SLIDES.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setSlide(i)}
                      aria-label={`תמונה ${i + 1}`}
                      className={`h-1.5 rounded-full transition-all ${i === slide ? "w-6 bg-white" : "w-1.5 bg-white/60"}`}
                    />
                  ))}
                </div>
              </div>
              <motion.div
                animate={{ y: [0, -10, 0], rotate: [-3, -6, -3] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -top-6 -left-6 md:-left-10 bg-[#f5d5cf] rounded-3xl px-5 py-4 shadow-xl border border-white/50"
              >
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-1">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-7 w-7 rounded-full bg-[#a8c4a2] border-2 border-[#f5d5cf]" />
                    ))}
                  </div>
                  <div>
                    <div className="text-xs text-[#2d3d2b]/60">משפחות מרוצות</div>
                    <div className="text-lg text-[#2d3d2b] font-medium" style={{ fontFamily: "'DM Serif Display', serif" }}>★ 5.0</div>
                  </div>
                </div>
              </motion.div>
              <motion.div
                animate={{ y: [0, 12, 0], rotate: [4, 8, 4] }}
                transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -bottom-6 -right-6 md:-right-10 bg-white rounded-3xl px-5 py-4 shadow-xl border border-[#2d3d2b]/5"
              >
                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-[#6b8a63]" />
                  <div>
                    <div className="text-xs text-[#2d3d2b]/60 uppercase tracking-wider">מיקום</div>
                    <div className="text-sm text-[#2d3d2b] font-semibold">תלמוד ירושלמי 24, בית שמש</div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>

        {/* Marquee */}
        <div className="mt-6 py-5 bg-[#2d3d2b] text-[#f8ede4] overflow-hidden border-y border-[#6b8a63]/30">
          <div className="marquee-track text-2xl md:text-3xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
            {Array.from({ length: 2 }).map((_, k) => (
              <div key={k} className="flex items-center gap-12 pl-12">
                {["ניוברן", "גיל שנה", "חלאקה", "משפחה", "הריון", "סמאש קייק"].flatMap((w, i) => [
                  <span key={`w-${k}-${i}`} className="whitespace-nowrap">{w}</span>,
                  <Sparkles key={`s-${k}-${i}`} className="h-5 w-5 text-[#a8c4a2] shrink-0" />,
                ])}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* THREE OFFERINGS */}
      <section className="container-page py-16 md:py-24" dir="rtl">
        <div className="flex items-end justify-between flex-wrap gap-6 mb-12">
          <div>
            <div className="text-xs tracking-[0.3em] uppercase text-[#6b8a63] font-medium mb-3">
              שלוש דרכים לצייר את הזיכרון
            </div>
            <h2 className="text-4xl md:text-6xl text-[#2d3d2b] max-w-2xl leading-tight" style={{ fontFamily: "'DM Serif Display', serif" }}>
              איך תרצי לצלם השבוע?
            </h2>
          </div>
          <div className="text-sm text-[#2d3d2b]/70 max-w-xs leading-relaxed">
            סטודיו מאובזר, צלמת אישית או קטלוג אביזרים — בחרי את השילוב שלך.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {/* Photography */}
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} custom={0} variants={fadeUp}>
            <Link to="/studio-photography" className="group block bg-white rounded-[2rem] overflow-hidden border border-[#2d3d2b]/5 h-full flex flex-col hover:shadow-2xl transition-all hover:-translate-y-1">
              <div className="h-64 relative overflow-hidden bg-[#f5d5cf]">
                <img src={hero3.url} alt="צילום של מיכל סיבוני" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
                <img src={hero4.url} alt="צילום נוסף של מיכל סיבוני" className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-500" loading="lazy" />
                <div className="absolute top-4 right-4 h-12 w-12 rounded-full bg-white/90 backdrop-blur flex items-center justify-center">
                  <Camera className="h-5 w-5 text-[#2d3d2b]" />
                </div>
              </div>
              <div className="p-7 flex flex-col flex-grow">
                <div className="text-[11px] tracking-[0.28em] uppercase text-[#6b8a63] mb-2">01 · Photography</div>
                <h3 className="text-2xl text-[#2d3d2b] mb-3" style={{ fontFamily: "'DM Serif Display', serif" }}>
                  צילומים עם מיכל סיבוני
                </h3>
                <p className="text-sm text-[#2d3d2b]/70 leading-relaxed flex-grow">
                  סשן אישי, רגוע ומקצועי בסטודיו המאובזר — כולל אפשרות לחצי שעה ובניית סטים בהתאמה.
                </p>
                <div className="mt-6 flex items-end justify-between pt-6 border-t border-[#2d3d2b]/10">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[#2d3d2b]/50">החל מ-</div>
                    <div className="text-2xl text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>₪300 <span className="text-xs text-[#2d3d2b]/60">/ שעה</span></div>
                  </div>
                  <div className="h-10 w-10 rounded-full border border-[#2d3d2b]/20 flex items-center justify-center group-hover:bg-[#2d3d2b] group-hover:text-[#f8ede4] transition-colors">
                    <ArrowLeft className="h-4 w-4" />
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>

          {/* Studio Rental — actual studio space photos */}
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} custom={1} variants={fadeUp}>
            <Link to="/studio-rental" className="group block bg-[#a8c4a2]/20 rounded-[2rem] overflow-hidden border border-[#a8c4a2]/40 h-full flex flex-col hover:shadow-2xl transition-all hover:-translate-y-1">
              <div className="h-64 relative overflow-hidden">
                <img src={heroImg.url} alt="חלל הסטודיו" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
                <img src={hero0.url} alt="פינת רקעים בסטודיו" className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-500" loading="lazy" />
                <div className="absolute top-4 right-4 h-12 w-12 rounded-full bg-white/90 backdrop-blur flex items-center justify-center">
                  <HomeIcon className="h-5 w-5 text-[#2d3d2b]" />
                </div>
              </div>
              <div className="p-7 flex flex-col flex-grow">
                <div className="text-[11px] tracking-[0.28em] uppercase text-[#6b8a63] mb-2">02 · Space</div>
                <h3 className="text-2xl text-[#2d3d2b] mb-3" style={{ fontFamily: "'DM Serif Display', serif" }}>
                  השכרת הסטודיו
                </h3>
                <p className="text-sm text-[#2d3d2b]/70 leading-relaxed flex-grow">
                  חלל בוטיק לצלמים — תאורה טבעית, אווירה שקטה ומגוון רקעים. חבילת בוקר ניוברן: 240₪ ל-3 שעות.
                </p>
                <div className="mt-6 flex items-end justify-between pt-6 border-t border-[#2d3d2b]/10">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[#2d3d2b]/50">החל מ-</div>
                    <div className="text-2xl text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>₪120 <span className="text-xs text-[#2d3d2b]/60">/ שעה</span></div>
                  </div>
                  <div className="h-10 w-10 rounded-full border border-[#2d3d2b]/20 flex items-center justify-center group-hover:bg-[#2d3d2b] group-hover:text-[#f8ede4] transition-colors">
                    <ArrowLeft className="h-4 w-4" />
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>

          {/* Catalog */}
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} custom={2} variants={fadeUp}>
            <Link to="/rental-catalog" className="group block bg-[#2d3d2b] text-[#f8ede4] rounded-[2rem] overflow-hidden h-full flex flex-col hover:shadow-2xl transition-all hover:-translate-y-1 relative">
              <div className="absolute inset-0 opacity-20">
                <div className="absolute top-10 right-10 h-32 w-32 rounded-full bg-[#a8c4a2] blur-2xl" />
                <div className="absolute bottom-10 left-10 h-40 w-40 rounded-full bg-[#f5d5cf] blur-2xl" />
              </div>
              <div className="p-7 flex flex-col flex-grow relative">
                <div className="flex justify-between items-start">
                  <div className="text-[11px] tracking-[0.28em] uppercase text-[#a8c4a2] mb-2">03 · Collection</div>
                  <div className="h-12 w-12 rounded-full bg-white/10 backdrop-blur flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-[#a8c4a2]" />
                  </div>
                </div>
                <h3 className="text-3xl mt-3" style={{ fontFamily: "'DM Serif Display', serif" }}>
                  קטלוג האביזרים
                </h3>
                <p className="text-sm text-[#f8ede4]/70 mt-3 leading-relaxed">
                  מעל <CountUp end={400} suffix="" className="text-[#a8c4a2] font-semibold" /> פריטים ייחודיים לצילומי ניוברן, ילדים והריון — וינטג׳, מקרמה, סרוגים ועבודות יד.
                </p>

                <div className="mt-8 grid grid-cols-3 gap-2 text-center">
                  {["וינטג׳", "מקרמה", "סרוגים"].map((t) => (
                    <div key={t} className="rounded-full border border-white/15 py-2 text-[11px] tracking-wider">{t}</div>
                  ))}
                </div>

                <div className="mt-auto pt-8 flex items-end justify-between border-t border-white/10">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[#a8c4a2]/70">החל מ-</div>
                    <div className="text-2xl" style={{ fontFamily: "'DM Serif Display', serif" }}>₪50</div>
                  </div>
                  <span className="inline-flex items-center gap-2 bg-[#f5d5cf] text-[#2d3d2b] px-5 py-2.5 rounded-full text-sm font-semibold group-hover:bg-[#f8ede4] transition-colors">
                    לצפייה בקטלוג <ArrowLeft className="h-3.5 w-3.5" />
                  </span>
                </div>
              </div>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* TRUST STRIP */}
      <section className="container-page pb-16 md:pb-24" dir="rtl">
        <div className="rounded-[2rem] bg-[#f5d5cf] p-8 md:p-12 relative overflow-hidden">
          <motion.div
            aria-hidden
            animate={{ rotate: 360 }} transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
            className="absolute -top-16 -left-16 h-64 w-64 rounded-full border-2 border-dashed border-[#2d3d2b]/15"
          />
          <div className="grid md:grid-cols-4 gap-8 items-center relative">
            {[
              { icon: Heart, title: "רגעים אמיתיים", desc: "אווירה רגועה שמאפשרת לילד להיות עצמו" },
              { icon: Sparkles, title: "עיצוב מוקפד", desc: "אביזרים בעבודת יד וטקסטורות ייחודיות" },
              { icon: Camera, title: "אמנות ולא רק צילום", desc: "כל תמונה נבנית כמו יצירה" },
              { icon: MapPin, title: "בלב בית שמש", desc: "חנייה נוחה, כניסה נגישה, חלל אינטימי" },
            ].map((f, i) => (
              <motion.div
                key={f.title} custom={i} initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp}
                className="text-[#2d3d2b]"
              >
                <div className="h-12 w-12 rounded-2xl bg-white/60 backdrop-blur flex items-center justify-center mb-4">
                  <f.icon className="h-5 w-5" />
                </div>
                <div className="text-lg font-semibold" style={{ fontFamily: "'DM Serif Display', serif" }}>{f.title}</div>
                <div className="text-sm text-[#2d3d2b]/70 mt-1 leading-relaxed">{f.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { Camera, Home as HomeIcon, Sparkles, ArrowLeft, MapPin, Star, Heart, Clock, LayoutGrid } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CountUp } from "@/components/CountUp";
import logo from "@/assets/logo-green.png";

import heroImg from "@/assets/hero-studio.jpg.asset.json";
import { PAGE_IMAGE_KEYS, usePageGalleryWithAspect } from "@/lib/page-images";
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
      { title: "סטודיו לצילום להשכרה - סוויט בייבי - צלמת מיכל סיבוני" },
      { name: "description", content: "סטודיו לצילום להשכרה סוויט בייבי — התמונה הראשונה שלי. סטודיו בוטיק להשכרה בבית שמש השכרת אביזרים לצילום ניוברן חלאקה סמאש קיק ועוד, סשן צילום -הצלמת מיכל סיבוני" },
      { property: "og:title", content: "סטודיו לצילום להשכרה - סוויט בייבי - צלמת מיכל סיבוני" },
      { property: "og:description", content: "סטודיו לצילום להשכרה סוויט בייבי — התמונה הראשונה שלי. סטודיו בוטיק להשכרה בבית שמש השכרת אביזרים לצילום ניוברן חלאקה סמאש קיק ועוד, סשן צילום -הצלמת מיכל סיבוני" },
      { property: "og:url", content: "https://sweetbabyphoto.shop/" },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:image:alt", content: "סטודיו Sweetbaby — פינת צילום ורודה עם אביזרים מעוצבים" },
      { name: "twitter:title", content: "סטודיו לצילום להשכרה - סוויט בייבי - צלמת מיכל סיבוני" },
      { name: "twitter:description", content: "סטודיו לצילום להשכרה סוויט בייבי — התמונה הראשונה שלי. סטודיו בוטיק להשכרה בבית שמש השכרת אביזרים לצילום ניוברן חלאקה סמאש קיק ועוד, סשן צילום -הצלמת מיכל סיבוני" },
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
  // Hero slides are managed from /admin/gallery (add / remove / reorder,
  // and portrait vs landscape); the bundled list is the fallback.
  const heroGallery = usePageGalleryWithAspect(PAGE_IMAGE_KEYS.homeHero);
  const slides = heroGallery.images.length > 0 ? heroGallery.images : HERO_SLIDES;
  const heroAspect = heroGallery.aspect === "landscape" ? "aspect-[16/9]" : "aspect-[4/5]";
  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % slides.length), 3800);
    return () => clearInterval(id);
  }, [slides.length]);

  // Arriving from another page via the header's "המלצות" link lands here
  // with #testimonials in the URL — scroll to it once mounted.
  useEffect(() => {
    if (window.location.hash === "#testimonials") {
      const t = setTimeout(() => {
        document.getElementById("testimonials")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
      return () => clearTimeout(t);
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#f8ede4] text-[#2d3d2b] overflow-hidden" style={{ fontFamily: "'Fira Sans', sans-serif" }}>
      <Header />

      {/* HERO */}
      <section className="relative overflow-hidden">
        {/* Flat pink-cream wash — no blurred color blobs, keeps the section
            calm and lets the hairline borders/real photo do the work. */}
        <div aria-hidden className="absolute inset-0 -z-10" style={{ background: "var(--gradient-hero)" }} />

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
                className="mt-6 text-[2.9rem] leading-[1.05] md:text-[4.8rem] md:leading-[1.02] text-[#2d3d2b]"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                <span className="block mb-3">
                  <img src={logo} alt="Sweetbaby" className="h-28 md:h-40 w-auto" />
                </span>
                <span className="relative inline-block">
                  כאן נולדת התמונה
                  <motion.svg
                    viewBox="0 0 420 22" className="absolute -bottom-2 right-0 w-full h-5 text-[#f5d5cf]"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, delay: 0.5 }}
                  >
                    <motion.path
                      d="M8 14 Q 120 2, 220 12 T 412 8" stroke="currentColor" strokeWidth="7"
                      strokeLinecap="round" fill="none"
                      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, delay: 0.5 }}
                    />
                  </motion.svg>
                </span>
                <span className="block">שתשאר איתך תמיד.</span>
              </h1>

              <p className="mt-8 text-lg md:text-xl text-[#2d3d2b]/75 max-w-xl leading-relaxed">
            סטודיו לצילום עצמי להשכרה והשכרת אביזרים לצילום , סטודיו בוטיק בבית שמש המשלב אמנות, רגש ועיצוב מוקפד — לצילומי ניוברן, חלאקה, גיל שנה ומשפחה. כאן כל תמונה היא זיכרון לנצח.
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
              {/* One clean arch — fully rounded top corners, modest rounded
                  bottom — the single decorative touch borrowed from the
                  reference, kept plain (no organic/blob shape). */}
              <div
                className={`relative ${heroAspect} overflow-hidden border border-[#2d3d2b]/10 bg-[#f5d5cf]`}
                style={{ borderRadius: "999px 999px 1.5rem 1.5rem" }}
              >
                <AnimatePresence mode="wait">
                  <motion.img
                    key={slide}
                    src={slides[slide % slides.length]}
                    alt="רגעים מהסטודיו"
                    // The first slide is the page's LCP element (it's SSR'd
                    // and visible above the fold before any interaction) —
                    // fetch it eagerly and with high priority; later slides
                    // swap in after load, so they don't need the hint.
                    fetchPriority={slide === 0 ? "high" : "auto"}
                    loading="eager"
                    decoding="async"
                    initial={{ opacity: 0, scale: 1.06 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.02 }}
                    transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                </AnimatePresence>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                  {slides.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setSlide(i)}
                      aria-label={`תמונה ${i + 1}`}
                      className={`h-1.5 rounded-full transition-all ${i === slide ? "w-6 bg-white" : "w-1.5 bg-white/60"}`}
                    />
                  ))}
                </div>
              </div>
              {/* Static caption row under the photo — same information as
                  before, just no longer floating/overlapping/rotating on
                  top of the image, so the layout reads clearly at a glance. */}
              <button
                type="button"
                onClick={() => document.getElementById("testimonials")?.scrollIntoView({ behavior: "smooth" })}
                className="mt-4 w-full flex items-center justify-between gap-4 rounded-2xl border border-[#2d3d2b]/10 bg-white/70 px-5 py-3.5 text-right hover:bg-white transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 fill-[#a8c4a2] text-[#a8c4a2]" />
                  <span className="text-sm text-[#2d3d2b]">
                    <strong className="font-medium">5.0</strong> · משפחות מרוצות
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-[#2d3d2b]/70">
                  <MapPin className="h-4 w-4 text-[#6b8a63]" />
                  תלמוד ירושלמי 24, בית שמש
                </div>
              </button>
            </motion.div>
          </div>
        </div>

        {/* Marquee */}
        <div className="mt-6 py-5 bg-[#f5d5cf]/30 text-[#2d3d2b] overflow-hidden border-y border-[#2d3d2b]/10">
          <div className="marquee-track text-2xl md:text-3xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
            {Array.from({ length: 2 }).map((_, k) => (
              <div key={k} className="flex items-center gap-12 pl-12">
                {["ניוברן", "גיל שנה", "חלאקה", "משפחה", "הריון", "סמאש קייק"].flatMap((w, i) => [
                  <span key={`w-${k}-${i}`} className="whitespace-nowrap">{w}</span>,
                  <Sparkles key={`s-${k}-${i}`} className="h-5 w-5 text-[#6b8a63] shrink-0" />,
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

          {/* Catalog — same real-photo-topped card shape as the other two,
              instead of a solid dark-green block, so all three "offerings"
              read as one consistent family. */}
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} custom={2} variants={fadeUp}>
            <Link to="/rental-catalog" className="group block bg-white rounded-[2rem] overflow-hidden border border-[#2d3d2b]/5 h-full flex flex-col hover:shadow-2xl transition-all hover:-translate-y-1">
              <div className="h-64 relative overflow-hidden bg-[#f5d5cf]">
                <img src={studioPropsCorner} alt="פינת אביזרים לצילום" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
                <img src={hero2.url} alt="אביזרים נוספים" className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-500" loading="lazy" />
                <div className="absolute top-4 right-4 h-12 w-12 rounded-full bg-white/90 backdrop-blur flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-[#2d3d2b]" />
                </div>
              </div>
              <div className="p-7 flex flex-col flex-grow">
                <div className="text-[11px] tracking-[0.28em] uppercase text-[#6b8a63] mb-2">03 · Collection</div>
                <h3 className="text-2xl text-[#2d3d2b] mb-3" style={{ fontFamily: "'DM Serif Display', serif" }}>
                  קטלוג האביזרים
                </h3>
                <p className="text-sm text-[#2d3d2b]/70 leading-relaxed flex-grow">
                  מעל <CountUp end={400} suffix="" className="font-semibold" /> פריטים ייחודיים לצילומי ניוברן, ילדים והריון — וינטג׳, מקרמה, סרוגים ועבודות יד.
                </p>
                <div className="mt-6 flex items-end justify-between pt-6 border-t border-[#2d3d2b]/10">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[#2d3d2b]/50">החל מ-</div>
                    <div className="text-2xl text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>₪50</div>
                  </div>
                  <div className="h-10 w-10 rounded-full border border-[#2d3d2b]/20 flex items-center justify-center group-hover:bg-[#2d3d2b] group-hover:text-[#f8ede4] transition-colors">
                    <ArrowLeft className="h-4 w-4" />
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* GALLERY — a real, asymmetric photo grid (the editorial-portfolio
          side of the two references), using the studio's own bundled
          photos. Real captions, real photos, no icon badges or filled
          color blocks — just the pictures themselves. */}
      <section className="container-page pb-16 md:pb-24" dir="rtl">
        <div className="mb-10">
          <div className="text-xs tracking-[0.3em] uppercase text-[#6b8a63] font-medium mb-3">
            רגעים מהסטודיו
          </div>
          <h2 className="text-4xl md:text-5xl text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>
            קצת מהאווירה שלנו
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 auto-rows-[9rem] md:auto-rows-[11rem]">
          {GALLERY_IMAGES.map((g, i) => (
            <motion.div
              key={g.src}
              initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} custom={i % 5} variants={fadeUp}
              className={`group relative overflow-hidden rounded-2xl border border-[#2d3d2b]/10 ${
                i === 0 ? "col-span-2 row-span-2" : i === 5 ? "md:col-span-2" : ""
              }`}
            >
              <img
                src={g.src}
                alt={g.caption}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 to-transparent px-3 py-2.5">
                <span className="text-[12px] text-white/90">{g.caption}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* COLLAGE STUDIO — new "קולאזים" category. Links to the FREE tool
          (/collage-maker), not the pro Studio directly — the Studio is
          reached from inside that page's own promo banner, per explicit
          request that it live under this one "קולאז'ים" entry point rather
          than being a separate parallel destination. */}
      <section className="container-page pb-16 md:pb-24" dir="rtl">
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} custom={0} variants={fadeUp}>
          <Link
            to="/collage-maker"
            className="group block rounded-[2rem] overflow-hidden border border-[#2d3d2b]/5 bg-white hover:shadow-2xl transition-all hover:-translate-y-1"
          >
            <div className="grid md:grid-cols-[1.1fr_1fr] items-center">
              <div className="p-8 md:p-12">
                <div className="text-[11px] tracking-[0.28em] uppercase text-[#6b8a63] mb-3">04 · Collages</div>
                <h2 className="text-3xl md:text-4xl text-[#2d3d2b] mb-3" style={{ fontFamily: "'DM Serif Display', serif" }}>
                  קולאז'ים
                </h2>
                <p className="text-sm text-[#2d3d2b]/70 leading-relaxed max-w-md mb-6">
                  עיצוב קולאז' חינם בכמה קליקים, ובשביל מי שרוצה עוד יותר שליטה — סטודיו קולאז'ים מקצועי עם תבניות, עריכת טקסטים וצבעים, והורדה מוכנה להדפסה.
                </p>
                <span className="inline-flex items-center gap-2 bg-[#2d3d2b] text-[#f8ede4] px-6 py-3 rounded-full text-sm font-semibold group-hover:bg-[#2d3d2b]/90 transition-colors">
                  לעיצוב קולאז' <ArrowLeft className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="h-56 md:h-full min-h-56 relative overflow-hidden bg-[#f5d5cf] flex items-center justify-center">
                <div className="grid grid-cols-3 gap-2 p-6 w-full max-w-xs">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className={`rounded-lg bg-white/70 border border-white ${i === 0 ? "col-span-2 row-span-2 aspect-square" : "aspect-square"}`} />
                  ))}
                </div>
                <div className="absolute top-4 left-4 h-11 w-11 rounded-full bg-white/90 backdrop-blur flex items-center justify-center">
                  <LayoutGrid className="h-5 w-5 text-[#2d3d2b]" />
                </div>
              </div>
            </div>
          </Link>
        </motion.div>
      </section>

      {/* TRUST STRIP */}
      <section className="container-page pb-16 md:pb-24" dir="rtl">
        <div className="rounded-[2rem] bg-[#f5d5cf]/40 border border-[#2d3d2b]/10 p-8 md:p-12">
          <div className="grid md:grid-cols-4 gap-8 items-center">
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
                <div className="h-12 w-12 rounded-2xl bg-white border border-[#2d3d2b]/10 flex items-center justify-center mb-4">
                  <f.icon className="h-5 w-5" />
                </div>
                <div className="text-lg font-semibold" style={{ fontFamily: "'DM Serif Display', serif" }}>{f.title}</div>
                <div className="text-sm text-[#2d3d2b]/70 mt-1 leading-relaxed">{f.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section id="testimonials" className="container-page pb-16 md:pb-24 scroll-mt-28" dir="rtl">
        <div className="text-center mb-12">
          <div className="text-xs tracking-[0.3em] uppercase text-[#6b8a63] font-medium mb-3">
            מה אומרות המשפחות
          </div>
          <h2 className="text-4xl md:text-5xl text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>
            חוויות מהסטודיו
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {[
            {
              name: "מיכל אזולאי",
              initial: "א",
              text: "הגענו לצילומי ניוברן כשהיינו מותשים אחרי הלידה, ומיכל ידעה בדיוק איך להרגיע את כולנו. התמונות יצאו מעבר לציפיות — ממש יצירות אמנות.",
            },
            {
              name: "חני גוטליב",
              initial: "ג",
              text: "שכרנו את הסטודיו לחלאקה של הבן שלנו והאווירה הייתה חמה ומושקעת. כל פינה מעוצבת עד הפרט האחרון, וקיבלנו תמונות שנשארות איתנו לתמיד.",
            },
            {
              name: "שירה כהן",
              initial: "כ",
              text: "השכרתי אביזרים לצילומי גיל שנה בבית והתהליך היה קל ומהיר — בחירה אונליין, איסוף נוח, והכל הגיע נקי ומטופל. ממליצה בחום!",
            },
          ].map((t, i) => (
            <motion.div
              key={t.name}
              initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} custom={i} variants={fadeUp}
              className="bg-white rounded-[2rem] p-8 border border-[#2d3d2b]/5 flex flex-col"
            >
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: 5 }).map((_, s) => (
                  <Star key={s} className="h-4 w-4 fill-[#f5d5cf] text-[#f5d5cf]" />
                ))}
              </div>
              <p className="text-sm text-[#2d3d2b]/80 leading-relaxed flex-grow">&ldquo;{t.text}&rdquo;</p>
              <div className="mt-6 pt-6 border-t border-[#2d3d2b]/10 flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-full bg-[#a8c4a2] text-[#2d3d2b] flex items-center justify-center shrink-0"
                  style={{ fontFamily: "'DM Serif Display', serif" }}
                >
                  {t.initial}
                </div>
                <div className="text-sm font-medium text-[#2d3d2b]">{t.name}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { Camera, Home as HomeIcon, Sparkles, ArrowLeft, MapPin, Star, Heart, Clock, LayoutGrid } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CountUp } from "@/components/CountUp";
// A tightly-cropped copy of the header's logo (that file has a lot of
// transparent padding baked in) — trimmed so its visible right edge lines
// up with the text right below it in this right-aligned RTL heading;
// the header keeps using the original, padded file.
import logo from "@/assets/logo-green-hero.png";

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
  // heroAspect removed — the new hero uses a fixed-height wide crop.
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

      {/* HERO — Lifestyle 2027: wide panoramic image with overlaid content */}
      <section className="relative overflow-hidden" dir="rtl">
        {/* Full-bleed rotating wide image */}
        <div className="relative w-full h-[68vh] min-h-[460px] max-h-[760px] overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.img
              key={slide}
              src={slides[slide % slides.length]}
              alt="רגעים מהסטודיו"
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

          {/* Gradient overlays for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#2d3d2b]/85 via-[#2d3d2b]/25 to-[#2d3d2b]/10" />
          <div className="absolute inset-0 bg-gradient-to-l from-transparent to-[#2d3d2b]/30" />

          {/* Slide indicators */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlide(i)}
                aria-label={`תמונה ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === slide ? "w-6 bg-[#f5d5cf]" : "w-1.5 bg-[#f8ede4]/50"}`}
              />
            ))}
          </div>

          {/* Location badge */}
          <div className="absolute top-6 right-6 z-20 hidden md:inline-flex items-center gap-2 rounded-full bg-[#2d3d2b]/40 backdrop-blur-md px-4 py-2 border border-[#f8ede4]/20">
            <MapPin className="h-3.5 w-3.5 text-[#a8c4a2]" />
            <span className="text-xs text-[#f8ede4]/90 font-medium">בית שמש · מאז 2023</span>
          </div>

          {/* Content overlay */}
          <div className="absolute inset-0 flex flex-col justify-end">
            <div className="container-page pb-10 md:pb-14">
              <motion.div initial="hidden" animate="show" variants={fadeUp} className="max-w-2xl">
                {/* Service tags */}
                <div className="flex flex-wrap gap-2 mb-5">
                  {[
                    { label: "צילומים", to: "/studio-photography" },
                    { label: "השכרת סטודיו", to: "/studio-rental" },
                    { label: "אביזרים", to: "/rental-catalog" },
                  ].map((tag, i) => (
                    <Link
                      key={tag.label}
                      to={tag.to}
                      className={`px-4 py-1.5 rounded-full text-xs font-medium backdrop-blur-md border transition-colors ${
                        i === 0
                          ? "bg-[#f5d5cf]/25 text-[#f8ede4] border-[#f5d5cf]/40 hover:bg-[#f5d5cf]/40"
                          : i === 1
                          ? "bg-[#a8c4a2]/25 text-[#f8ede4] border-[#a8c4a2]/40 hover:bg-[#a8c4a2]/40"
                          : "bg-[#f8ede4]/15 text-[#f8ede4] border-[#f8ede4]/25 hover:bg-[#f8ede4]/25"
                      }`}
                    >
                      {tag.label}
                    </Link>
                  ))}
                </div>

                {/* Logo */}
                <img src={logo} alt="Sweetbaby" className="h-14 md:h-20 w-auto mb-3" />

                {/* Headline */}
                <h1
                  className="text-4xl md:text-6xl lg:text-7xl leading-[1.05] text-[#f8ede4]"
                  style={{ fontFamily: "'DM Serif Display', serif" }}
                >
                  כאן נולדת התמונה
                  <br />
                  <span className="text-[#f5d5cf]">שתשאר איתך תמיד.</span>
                </h1>

                {/* Paragraph */}
                <p className="mt-5 text-base md:text-lg max-w-xl leading-relaxed text-[#f8ede4]/85">
                  סטודיו לצילום עצמי להשכרה והשכרת אביזרים לצילום — בוטיק בבית שמש המשלב אמנות, רגש ועיצוב מוקפד.
                </p>

                {/* CTAs */}
                <div className="mt-7 flex flex-wrap items-center gap-4">
                  <Link
                    to="/studio-rental"
                    className="group inline-flex items-center gap-3 rounded-full bg-[#f5d5cf] text-[#2d3d2b] px-7 py-4 text-base font-medium hover:bg-[#f8ede4] transition-all hover:gap-4"
                  >
                    <span>השכרת הסטודיו</span>
                    <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                  </Link>
                  <Link
                    to="/rental-catalog"
                    className="inline-flex items-center gap-2 rounded-full border-2 border-[#f8ede4]/40 text-[#f8ede4] px-7 py-4 text-base font-medium backdrop-blur-md hover:bg-[#f8ede4]/10 transition-all"
                  >
                    <Sparkles className="h-4 w-4" /> לקטלוג האביזרים
                  </Link>
                </div>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="bg-[#2d3d2b]">
          <div className="container-page py-6">
            <div className="grid grid-cols-3 gap-4 md:gap-8">
              {[
                { end: 400, suffix: "+", label: "אביזרים", icon: Sparkles },
                { end: 3, suffix: "+ שנים", label: "מ-2023", icon: Clock },
                { end: 1200, suffix: "+", label: "משפחות", icon: Heart },
              ].map((s, i) => (
                <motion.div
                  key={s.label} custom={i} initial="hidden" animate="show" variants={fadeUp}
                  className="flex flex-col items-center text-center md:flex-row md:items-center md:gap-4 md:text-right"
                >
                  <s.icon className="h-5 w-5 mb-2 md:mb-0 text-[#a8c4a2]" />
                  <div>
                    <div className="text-2xl md:text-3xl text-[#f8ede4]" style={{ fontFamily: "'DM Serif Display', serif" }}>
                      <CountUp end={s.end} suffix={s.suffix} />
                    </div>
                    <div className="text-xs tracking-wider uppercase mt-1 text-[#f8ede4]/60">{s.label}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Marquee */}
        <div className="py-5 bg-[#f5d5cf]/30 text-[#2d3d2b] overflow-hidden border-y border-[#2d3d2b]/10">
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

      {/* COLLAGE STUDIO — new "קולאזים" category. Links straight to the full
          Studio gallery (/collage-studio), not the older/simpler
          /collage-maker — per explicit follow-up request: the powerful
          editor should be the direct destination, no "want more control?"
          detour needed first. */}
      <section className="container-page pb-16 md:pb-24" dir="rtl">
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} custom={0} variants={fadeUp}>
          <Link
            to="/collage-studio"
            className="group block rounded-[2rem] overflow-hidden border border-[#2d3d2b]/5 bg-white hover:shadow-2xl transition-all hover:-translate-y-1"
          >
            <div className="grid md:grid-cols-[1.1fr_1fr] items-center">
              <div className="p-8 md:p-12">
                <div className="text-[11px] tracking-[0.28em] uppercase text-[#6b8a63] mb-3">04 · Collages</div>
                <h2 className="text-3xl md:text-4xl text-[#2d3d2b] mb-3" style={{ fontFamily: "'DM Serif Display', serif" }}>
                  קולאז'ים
                </h2>
                <p className="text-sm text-[#2d3d2b]/70 leading-relaxed max-w-md mb-6">
                  סטודיו קולאז'ים חינמי ומקצועי — תבניות מעוצבות ומוכנות, גרירה חופשית של כמה תמונות ביחד, מדבקות וצבעים, והורדה מוכנה להדפסה. בלי הרשמה.
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

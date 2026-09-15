// Two selectable homepage hero designs — per explicit request, switchable
// from /admin/gallery without a developer (see useHeroVariant/saveHeroVariant
// in @/lib/page-images). Both take the same slide-rotation state as props
// (owned by the Home route) so switching variants doesn't reset the
// slideshow, and both render the exact content/copy — only the layout,
// background treatment and sizing differ.
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowLeft, MapPin, Star, Clock } from "lucide-react";
import { CountUp } from "@/components/CountUp";
// The owner's own gradient-heart artwork (created directly in Drive), not a
// hand-built recreation — swap this file in @/assets to change it.
import heartGradient from "@/assets/heart-gradient.png";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.7, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] as const } }),
};

/** Drop-in replacement for lucide's <Heart> in the hero stats row — same
 * {className} prop shape as a lucide icon component. The owner's own
 * pink-to-green gradient heart artwork (from Drive), not a recreation. */
function GradientHeartIcon({ className }: { className?: string }) {
  return <img src={heartGradient} alt="" className={className} />;
}

type HeroProps = {
  slide: number;
  setSlide: (i: number) => void;
  slides: string[];
  logo: string;
};

/** "Full-bleed" — the design actually live on the site: a wide rotating
 * photo fills the whole hero, gradient-darkened for readability, with the
 * logo/heading/CTAs overlaid near the bottom-right and a full-width dark
 * stats bar below the photo. */
export function HeroFullBleed({ slide, setSlide, slides, logo }: HeroProps) {
  return (
    <section className="relative overflow-hidden" dir="rtl">
      {/* Generous min-height (not just a vh-based height) — the bigger
          heading/paragraph/buttons/pills below need real room; a plain
          fixed/short height here let that content overflow upward past
          the header on some viewports. */}
      <div className="relative w-full h-[78vh] min-h-[820px] max-h-[920px] overflow-hidden">
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
            // object-top (not centered) so a portrait-ish source photo
            // keeps its subject's face/top in frame instead of being
            // cropped out by the wide, short hero frame.
            className="absolute inset-0 w-full h-full object-cover object-top"
          />
        </AnimatePresence>

        <div className="absolute inset-0 bg-gradient-to-t from-[#2d3d2b]/85 via-[#2d3d2b]/25 to-[#2d3d2b]/10" />
        <div className="absolute inset-0 bg-gradient-to-l from-transparent to-[#2d3d2b]/30" />

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

        <div className="absolute top-6 right-6 z-20 hidden md:inline-flex items-center gap-2 rounded-full bg-[#2d3d2b]/40 backdrop-blur-md px-4 py-2 border border-[#f8ede4]/20">
          <MapPin className="h-3.5 w-3.5 text-[#a8c4a2]" />
          <span className="text-xs text-[#f8ede4]/90 font-medium">בית שמש · מאז 2023</span>
        </div>

        {/* max-w-xl (not max-w-2xl) so the block sits further right
            instead of stretching in toward the photo's center. */}
        <div className="absolute inset-0 flex flex-col justify-end">
          <div className="container-page pb-10 md:pb-14">
            <motion.div initial="hidden" animate="show" variants={fadeUp} className="max-w-xl mr-0">
              <div className="flex flex-wrap gap-2 mb-5">
                {[
                  { label: "צילומים", to: "/studio-photography" },
                  { label: "השכרת סטודיו", to: "/studio-rental" },
                  { label: "אביזרים", to: "/rental-catalog" },
                ].map((tag, i) => (
                  <Link
                    key={tag.label}
                    to={tag.to}
                    className={`px-5 py-2 rounded-full text-sm font-medium backdrop-blur-md border transition-colors ${
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

              <img src={logo} alt="Sweetbaby" className="h-14 md:h-20 w-auto mb-3" />

              <h1 className="text-5xl md:text-7xl lg:text-8xl leading-[1.05] text-[#f8ede4]" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
                כאן נולדת התמונה
                <br />
                <span className="text-[#f5d5cf]">שתשאר איתך תמיד.</span>
              </h1>

              <p className="mt-5 text-lg md:text-xl max-w-xl leading-relaxed text-[#f8ede4]/85">
                סטודיו לצילום עצמי להשכרה והשכרת אביזרים לצילום — בוטיק בבית שמש המשלב אמנות, רגש ועיצוב מוקפד.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-4">
                <Link
                  to="/studio-rental"
                  className="group inline-flex items-center gap-3 rounded-full bg-[#f5d5cf] text-[#2d3d2b] px-8 py-5 text-lg font-medium hover:bg-[#f8ede4] transition-all hover:gap-4"
                >
                  <span>השכרת הסטודיו</span>
                  <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
                </Link>
                <Link
                  to="/rental-catalog"
                  className="inline-flex items-center gap-2 rounded-full border-2 border-[#f8ede4]/40 text-[#f8ede4] px-8 py-5 text-lg font-medium backdrop-blur-md hover:bg-[#f8ede4]/10 transition-all"
                >
                  <Sparkles className="h-5 w-5" /> לקטלוג האביזרים
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="bg-[#2d3d2b]">
        <div className="container-page py-6">
          <div className="grid grid-cols-3 gap-4 md:gap-8">
            {[
              { end: 400, suffix: "+", label: "אביזרים", icon: Sparkles },
              { end: 3, suffix: "+ שנים", label: "מ-2023", icon: Clock },
              { end: 1200, suffix: "+", label: "משפחות", icon: GradientHeartIcon },
            ].map((s, i) => (
              <motion.div
                key={s.label} custom={i} initial="hidden" animate="show" variants={fadeUp}
                className="flex flex-col items-center text-center md:flex-row md:items-center md:gap-4 md:text-right"
              >
                <s.icon className="h-5 w-5 mb-2 md:mb-0 text-[#a8c4a2]" />
                <div>
                  <div className="text-2xl md:text-3xl text-[#f8ede4]" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
                    <CountUp end={s.end} suffix={s.suffix} />
                  </div>
                  <div className="text-xs tracking-wider uppercase mt-1 text-[#f8ede4]/60">{s.label}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      <div className="py-5 bg-[#f5d5cf]/30 text-[#2d3d2b] overflow-hidden border-y border-[#2d3d2b]/10">
        <div className="marquee-track text-2xl md:text-3xl" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
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
  );
}

/** "Light-arch" — the site's previous design: a light pink-cream background,
 * heading/copy/CTAs/stats in a right-hand column, and the rotating photo in
 * an arch-shaped frame on the left. */
export function HeroLightArch({ slide, setSlide, slides, logo, aspect }: HeroProps & { aspect: "portrait" | "landscape" }) {
  const heroAspect = aspect === "landscape" ? "aspect-[16/9]" : "aspect-[4/5]";
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 -z-10" style={{ background: "var(--gradient-hero)" }} />

      <div className="relative container-page pt-14 md:pt-20 pb-10" dir="rtl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <motion.div initial="hidden" animate="show" variants={fadeUp} className="lg:col-span-7 relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/70 backdrop-blur px-4 py-1.5 border border-[#2d3d2b]/10">
              <Star className="h-3.5 w-3.5 fill-[#a8c4a2] text-[#a8c4a2]" />
              <span className="text-[11px] tracking-[0.28em] uppercase text-[#2d3d2b]/70 font-medium">
                סטודיו בוטיק · בית שמש · מאז 2023
              </span>
            </div>

            <h1 className="mt-6 text-[2.9rem] leading-[1.05] md:text-[4.8rem] md:leading-[1.02] text-[#2d3d2b]" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
              <span className="block mb-3 text-right">
                <img src={logo} alt="Sweetbaby" className="inline-block h-16 md:h-24 w-auto" />
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

            <div className="mt-14 grid grid-cols-3 gap-4 md:gap-8 max-w-lg">
              {[
                { end: 400, suffix: "+", label: "אביזרים", icon: Sparkles },
                { end: 3, suffix: "+ שנים", label: "מ-2023", icon: Clock },
                { end: 1200, suffix: "+", label: "משפחות", icon: GradientHeartIcon },
              ].map((s, i) => (
                <motion.div key={s.label} custom={i} initial="hidden" animate="show" variants={fadeUp} className="flex flex-col">
                  <s.icon className="h-4 w-4 text-[#6b8a63] mb-2" />
                  <div className="text-3xl md:text-4xl text-[#2d3d2b]" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
                    <CountUp end={s.end} suffix={s.suffix} />
                  </div>
                  <div className="text-xs text-[#2d3d2b]/60 tracking-wider uppercase mt-1">{s.label}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
            className="lg:col-span-5 relative"
          >
            <div
              className={`relative ${heroAspect} overflow-hidden border border-[#2d3d2b]/10 bg-[#f5d5cf]`}
              style={{ borderRadius: "999px 999px 1.5rem 1.5rem" }}
            >
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

      <div className="mt-6 py-5 bg-[#f5d5cf]/30 text-[#2d3d2b] overflow-hidden border-y border-[#2d3d2b]/10">
        <div className="marquee-track text-2xl md:text-3xl" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
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
  );
}

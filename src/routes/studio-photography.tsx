import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/Header";
import {
  usePageGallery,
  PAGE_IMAGE_KEYS,
  BUILTIN_PHOTOGRAPHY_STUDIO,
  BUILTIN_PHOTOGRAPHY_OUTDOOR,
} from "@/lib/page-images";

import { Camera, Sun, Trees, Sparkles, Clock, Phone, Mail, ExternalLink, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/studio-photography")({
  head: () => ({
    meta: [
      { title: "צילומים עם מיכל סיבוני – סטודיו וחוץ | Sweetbaby" },
      {
        name: "description",
        content:
          "סשן צילום בסטודיו או בטבע עם הצלמת מיכל סיבוני. חבילות ניו-בורן, משפחה ואירועים. 300 ₪ לשעה בסטודיו, וצילומי חוץ בטבע בתאום מראש.",
      },
      { property: "og:title", content: "צילומים עם מיכל סיבוני – סטודיו וחוץ" },
      {
        property: "og:description",
        content: "חבילות צילום בסטודיו ובטבע – ניו בורן, משפחה, ילדים ואירועים.",
      },
      { property: "og:image", content: "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc04166_optimized-1-scaled.jpg" },
      {
        property: "og:url",
        content: "https://sweetbabyphoto.shop/studio-photography",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://sweetbabyphoto.shop/studio-photography",
      },
    ],
  }),
  component: StudioPhotographyPage,
});

const PHONE = "0548529277";
const EMAIL = "s0548529277@gmail.com";
const MICHAL_SITE = "https://michalsiboni.co.il/";

const STUDIO_PHOTOS = [
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc04166_optimized-1-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc04088_optimized-1-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc03989_optimized-1-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc04141_optimized-1-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc04290_optimized-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc04418_optimized-1-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc07818_optimized-1-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc08152_optimized-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/08/dsc04298_optimized-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/08/dsc04579_optimized-scaled.jpg",
];

const OUTDOOR_PHOTOS = [
  "https://michalsiboni.co.il/wp-content/uploads/2025/05/777-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/05/DSC01673-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/05/DSC04181-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/05/DSC08770-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc01210_optimized-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc01367_optimized-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc01467_optimized-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc01597_optimized-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc01673_optimized-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc02946_optimized-scaled.jpg",
];

function StudioPhotographyPage() {
  const [tab, setTab] = useState<"studio" | "outdoor">("studio");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const extraStudio = usePageImages(PAGE_IMAGE_KEYS.photographyStudio);
  const extraOutdoor = usePageImages(PAGE_IMAGE_KEYS.photographyOutdoor);
  const extra = ((tab === "studio" ? extraStudio.data : extraOutdoor.data) ?? []).map((i: PageImage) => i.url);
  // Built-in page photos are also seeded into the gallery table, so de-dupe by URL.
  const photos = Array.from(new Set([...(tab === "studio" ? STUDIO_PHOTOS : OUTDOOR_PHOTOS), ...extra]));


  const sessionMsg = tab === "studio"
    ? "היי מיכל, אשמח לתאם סשן צילומים בסטודיו 🌿"
    : "היי מיכל, אשמח לתאם סשן צילומי חוץ בטבע 🌸";
  const gmailLink =
    `https://mail.google.com/mail/?view=cm&fs=1&to=${EMAIL}` +
    `&su=${encodeURIComponent("תיאום סשן צילום")}&body=${encodeURIComponent(sessionMsg)}`;
  const telLink = `tel:${PHONE}`;

  return (
    <div dir="rtl" className="min-h-screen bg-[#f8ede4] text-[#2d3b2a]" style={{ fontFamily: "'Fira Sans', sans-serif" }}>
      <Header />

      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <motion.div
          className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full opacity-40"
          style={{ background: "radial-gradient(circle, #f5d5cf 0%, transparent 70%)" }}
          animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
          transition={{ duration: 14, repeat: Infinity }}
        />
        <motion.div
          className="absolute bottom-0 -left-32 w-[600px] h-[600px] rounded-full opacity-30"
          style={{ background: "radial-gradient(circle, #a8bfa1 0%, transparent 70%)" }}
          animate={{ x: [0, -30, 0], y: [0, -40, 0] }}
          transition={{ duration: 16, repeat: Infinity }}
        />
      </div>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <div className="inline-flex items-center gap-2 bg-white/70 backdrop-blur px-4 py-1.5 rounded-full text-sm text-[#4a5d43] mb-6 border border-[#a8bfa1]/40">
            <Camera size={14} /> צילום מקצועי · מיכל סיבוני
          </div>
          <h1 className="text-5xl md:text-7xl mb-4 leading-tight" style={{ fontFamily: "'DM Serif Display', serif" }}>
            רגעים שנשארים.
            <br />
            <span className="text-[#5b7a52]">בסטודיו או בטבע.</span>
          </h1>
          <p className="text-lg md:text-xl text-[#4a5d43]/80 max-w-2xl mx-auto mb-8">
            סשנים אישיים עם הצלמת מיכל סיבוני – ניו-בורן, משפחה, ילדים ואירועים.
            תבחרי את האווירה שמדברת אלייך: אור רך של סטודיו או קסם טבעי בטבע.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <a
              href={gmailLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#2d4a2b] text-white px-7 py-3.5 rounded-full hover:bg-[#3d5a3b] transition shadow-lg"
            >
              <Mail size={18} /> לתאום סשן במייל
            </a>
            <a
              href={MICHAL_SITE}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-white/80 backdrop-blur border border-[#a8bfa1]/50 px-7 py-3.5 rounded-full hover:bg-white transition"
            >
              <ExternalLink size={18} /> לאתר של מיכל סיבוני
            </a>
          </div>
        </motion.div>
      </section>

      {/* Tabs */}
      <section className="max-w-6xl mx-auto px-6 pb-6">
        <div className="flex justify-center">
          <div className="inline-flex bg-white/70 backdrop-blur p-1.5 rounded-full border border-[#a8bfa1]/30 shadow-sm">
            {[
              { id: "studio" as const, label: "צילומים בסטודיו", icon: Sun },
              { id: "outdoor" as const, label: "צילומי חוץ בטבע", icon: Trees },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-full transition text-sm md:text-base ${
                  tab === id
                    ? "bg-[#2d4a2b] text-white shadow"
                    : "text-[#4a5d43] hover:bg-white/50"
                }`}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Info cards per tab */}
      <section className="max-w-6xl mx-auto px-6 pb-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35 }}
            className="grid md:grid-cols-3 gap-4"
          >
            {(tab === "studio"
              ? [
                  { icon: Clock, title: "300 ₪ / שעה", desc: "אפשרות לחצי שעה · בניית סטים +100 ₪" },
                  { icon: Sparkles, title: "מעל 400 אביזרים", desc: "גישה מלאה לקטלוג הסטודיו לצילום" },
                  { icon: Sun, title: "אור טבעי + תאורת סטודיו", desc: "חלל מעוצב, נעים ומקצועי" },
                ]
              : [
                  { icon: Trees, title: "לוקיישן בהתאמה אישית", desc: "בטבע, בפארק, בחוף – איפה שמתאים לכם" },
                  { icon: Sparkles, title: "אביזרים ניידים", desc: "אפשרות לשלב אביזרים מהסטודיו בצילומי חוץ" },
                  { icon: Sun, title: "שעות זהב", desc: "צילום בזריחה או בשקיעה לתוצאה קסומה" },
                ]
            ).map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="bg-white/80 backdrop-blur rounded-3xl p-6 border border-[#a8bfa1]/25 shadow-sm hover:shadow-md transition"
              >
                <div className="w-11 h-11 rounded-full bg-[#f5d5cf] flex items-center justify-center mb-3 text-[#2d4a2b]">
                  <Icon size={20} />
                </div>
                <div className="text-xl mb-1" style={{ fontFamily: "'DM Serif Display', serif" }}>
                  {title}
                </div>
                <div className="text-sm text-[#4a5d43]/80">{desc}</div>
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </section>

      {/* Gallery */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-3xl md:text-4xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
              {tab === "studio" ? "מהסטודיו" : "מהטבע"}
            </h2>
            <p className="text-sm text-[#4a5d43]/70 mt-1">
              תמונות נבחרות מתוך התיק של מיכל סיבוני
            </p>
          </div>
          <a
            href={MICHAL_SITE}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:inline-flex items-center gap-1 text-sm text-[#5b7a52] hover:text-[#2d4a2b]"
          >
            כל הגלריה <ArrowLeft size={14} />
          </a>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4"
          >
            {photos.map((src, i) => (
              <motion.button
                key={src}
                onClick={() => setLightbox(src)}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                whileHover={{ scale: 1.02 }}
                className={`relative overflow-hidden rounded-2xl bg-[#e8dcd0] group ${
                  i % 5 === 0 ? "md:col-span-2 md:row-span-2 aspect-square" : "aspect-square"
                }`}
              >
                <img
                  src={src}
                  alt={`${tab === "studio" ? "צילום בסטודיו" : "צילומי חוץ"} ${i + 1}`}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition" />
              </motion.button>
            ))}
          </motion.div>
        </AnimatePresence>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <div className="bg-[#2d4a2b] text-[#f8ede4] rounded-3xl p-10 md:p-14 text-center shadow-xl relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-56 h-56 rounded-full bg-[#f5d5cf]/20" />
          <div className="absolute -bottom-16 -left-10 w-64 h-64 rounded-full bg-[#a8bfa1]/20" />
          <div className="relative">
            <h3 className="text-3xl md:text-4xl mb-3" style={{ fontFamily: "'DM Serif Display', serif" }}>
              מוכנים לרגע שלכם?
            </h3>
            <p className="text-[#f8ede4]/85 mb-7 max-w-xl mx-auto">
              נשמח לתאם איתכם סשן צילום שיתאים בדיוק לסיפור שלכם – בסטודיו או בחוץ.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <a
                href={telLink}
                className="inline-flex items-center gap-2 bg-[#f5d5cf] text-[#2d4a2b] px-7 py-3.5 rounded-full hover:bg-white transition"
              >
                <Phone size={18} /> חיוג 054-8529277
              </a>
              <a
                href={gmailLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-white/10 border border-white/30 text-[#f8ede4] px-7 py-3.5 rounded-full hover:bg-white/20 transition"
              >
                <Mail size={18} /> מייל
              </a>
              <a
                href={MICHAL_SITE}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-white/10 border border-white/30 text-[#f8ede4] px-7 py-3.5 rounded-full hover:bg-white/20 transition"
              >
                <ExternalLink size={18} /> האתר של מיכל
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 cursor-zoom-out"
            onClick={() => setLightbox(null)}
          >
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              src={lightbox}
              alt=""
              className="max-w-full max-h-full rounded-2xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { FunnelCta } from "@/components/FunnelDialog";
import { heError } from "@/lib/he-errors";
import { useEffect, useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/Header";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useProfilePrefill } from "@/hooks/use-profile";
import { EmailDatalist } from "@/components/EmailDatalist";
import { sendMichalInquiry } from "@/lib/photography.functions";
import { usePageGallery, PAGE_IMAGE_KEYS } from "@/lib/page-images";

import {
  Camera,
  Sun,
  Trees,
  Sparkles,
  Clock,
  Phone,
  Mail,
  ExternalLink,
  ArrowLeft,
  Heart,
  Download,
  Baby,
  Cake,
  Scissors,
  Users,
  Crown,
  Album,
} from "lucide-react";
import { downloadImage } from "@/lib/download-image";
import michalLogoWordmark from "@/assets/michal-logo-wordmark.png";

export const Route = createFileRoute("/studio-photography")({
  head: () => ({
    meta: [
      { title: "צילומים עם מיכל סיבוני – סטודיו וחוץ | Sweetbaby" },
      {
        name: "description",
        content:
          "סשן צילום בסטודיו או בטבע עם הצלמת מיכל סיבוני. צילומי ניו-בורן, משפחה, ילדים ואירועים, בהתאמה אישית.",
      },
      { property: "og:title", content: "צילומים עם מיכל סיבוני – סטודיו וחוץ" },
      {
        property: "og:description",
        content: "חבילות צילום בסטודיו ובטבע – ניו בורן, משפחה, ילדים ואירועים.",
      },
      {
        property: "og:image",
        content:
          "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc04166_optimized-1-scaled.jpg",
      },
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

// The portfolio gallery below (6 topic tabs) is a separate, independent
// section from the studio/outdoor booking tab above it — "tab" picks WHERE
// a session happens (for pricing/info/booking), while the gallery topics
// are WHAT KIND of session it is, cutting across both locations. Per
// explicit request, replacing the old studio-vs-outdoor-only gallery.
const GALLERY_CATEGORIES = [
  {
    id: "newborn" as const,
    label: "ניו-בורן",
    icon: Baby,
    pageKey: PAGE_IMAGE_KEYS.portfolioNewborn,
  },
  {
    id: "cakeSmash" as const,
    label: "גיל שנה",
    icon: Cake,
    pageKey: PAGE_IMAGE_KEYS.portfolioCakeSmash,
  },
  {
    id: "upsherin" as const,
    label: "חלאקה",
    icon: Scissors,
    pageKey: PAGE_IMAGE_KEYS.portfolioUpsherin,
  },
  {
    id: "family" as const,
    label: "משפחה",
    icon: Users,
    pageKey: PAGE_IMAGE_KEYS.portfolioFamily,
  },
  {
    id: "studioOutdoor" as const,
    label: "סטודיו וחוץ",
    icon: Camera,
    pageKey: PAGE_IMAGE_KEYS.portfolioStudioOutdoor,
  },
  {
    id: "batMitzvah" as const,
    label: "בת מצווה",
    icon: Crown,
    pageKey: PAGE_IMAGE_KEYS.portfolioBatMitzvah,
  },
  {
    id: "albums" as const,
    label: "אלבומים",
    icon: Album,
    pageKey: PAGE_IMAGE_KEYS.portfolioAlbums,
  },
];
type GalleryCategoryId = (typeof GALLERY_CATEGORIES)[number]["id"];

function StudioPhotographyPage() {
  const [tab, setTab] = useState<"studio" | "outdoor">("studio");
  const [lightbox, setLightbox] = useState<string | null>(null);

  const [galleryCategory, setGalleryCategory] = useState<GalleryCategoryId>("studioOutdoor");
  // One usePageGallery call per topic — each is a cheap cached query (same
  // pattern this page already used for the studio/outdoor split above), so
  // switching tabs is instant with no extra network round trip.
  const newbornGallery = usePageGallery(PAGE_IMAGE_KEYS.portfolioNewborn);
  const cakeSmashGallery = usePageGallery(PAGE_IMAGE_KEYS.portfolioCakeSmash);
  const upsherinGallery = usePageGallery(PAGE_IMAGE_KEYS.portfolioUpsherin);
  const familyGallery = usePageGallery(PAGE_IMAGE_KEYS.portfolioFamily);
  const studioOutdoorGallery = usePageGallery(PAGE_IMAGE_KEYS.portfolioStudioOutdoor);
  const batMitzvahGallery = usePageGallery(PAGE_IMAGE_KEYS.portfolioBatMitzvah);
  const albumsGallery = usePageGallery(PAGE_IMAGE_KEYS.portfolioAlbums);
  // The old "צילומים – בסטודיו / בטבע" admin tabs (photography-studio / photography-outdoor) are
  // still where she uploads, hides and deletes these photos. Until she curates the new
  // "Portfolio – Studio & Outdoor" bucket (no database rows yet), show those two galleries
  // instead — so uploads/deletions made in the old tabs keep showing here.
  const oldStudioGallery = usePageGallery(PAGE_IMAGE_KEYS.photographyStudio);
  const oldOutdoorGallery = usePageGallery(PAGE_IMAGE_KEYS.photographyOutdoor);
  const portfolioStudioOutdoorCurated = (studioOutdoorGallery.data ?? []).some((r) => r.source !== "config");
  const studioOutdoorImages = portfolioStudioOutdoorCurated
    ? studioOutdoorGallery.images
    : [...oldStudioGallery.images, ...oldOutdoorGallery.images];
  const galleryByCategory: Record<GalleryCategoryId, string[]> = {
    newborn: newbornGallery.images,
    cakeSmash: cakeSmashGallery.images,
    upsherin: upsherinGallery.images,
    family: familyGallery.images,
    studioOutdoor: studioOutdoorImages,
    batMitzvah: batMitzvahGallery.images,
    albums: albumsGallery.images,
  };
  const photos = galleryByCategory[galleryCategory];
  const activeCategory = GALLERY_CATEGORIES.find((c) => c.id === galleryCategory)!;

  // --- Inquiry form: no prices anywhere, answered by e-mail only ---
  const profile = useProfilePrefill();
  const sendInquiry = useServerFn(sendMichalInquiry);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [inq, setInq] = useState({
    name: "",
    email: "",
    phone: "",
    where: "בסטודיו",
    what: "משפחה",
    when: "",
    notes: "",
    website: "",
  });
  useEffect(() => {
    if (!profile.loaded) return;
    setInq((b) => ({
      ...b,
      name: b.name || profile.fullName,
      phone: b.phone || profile.phone,
      email: b.email || profile.email,
    }));
  }, [profile.loaded, profile.fullName, profile.phone, profile.email]);

  const submitInquiry = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    if (!inq.name.trim() || !inq.email.trim()) {
      toast.error("נא למלא שם ומייל.");
      return;
    }
    setSending(true);
    try {
      await sendInquiry({ data: { ...inq, name: inq.name.trim(), email: inq.email.trim() } });
      setSent(true);
    } catch (err) {
      toast.error(heError(err, "השליחה נכשלה"));
    } finally {
      setSending(false);
    }
  };

  const sessionMsg =
    tab === "studio"
      ? "היי מיכל, אשמח לתאם סשן צילומים בסטודיו 🌿"
      : "היי מיכל, אשמח לתאם סשן צילומי חוץ בטבע 🌸";
  const gmailLink =
    `https://mail.google.com/mail/?view=cm&fs=1&to=${EMAIL}` +
    `&su=${encodeURIComponent("תיאום סשן צילום")}&body=${encodeURIComponent(sessionMsg)}`;
  const telLink = `tel:${PHONE}`;
  const bookInputCls =
    "w-full rounded-xl bg-white border border-[#2d3d2b]/15 px-3.5 py-2.5 text-sm outline-none focus:border-[#6b8a63] transition-colors";

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[#f8ede4] text-[#2d3d2b]"
      style={{ fontFamily: "'Fira Sans', sans-serif" }}
    >
      <Header />

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-14 pb-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="relative text-center rounded-[2.5rem] px-6 md:px-16 py-14 md:py-20 border border-[#2d3d2b]/10"
          style={{ background: "var(--gradient-hero)" }}
        >
          <div className="relative">
            <div className="inline-flex items-center gap-2 bg-white/80 backdrop-blur px-5 py-2 rounded-full text-sm text-[#2d3d2b] mb-7 border border-[#2d3d2b]/10 shadow-sm">
              <Camera size={14} /> צילום מקצועי · מיכל סיבוני
            </div>
            <h1
              className="text-4xl sm:text-5xl md:text-7xl mb-5 leading-[1.15] text-[#2d3d2b]"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              רגעים שנשארים.
              <br />
              <span className="text-[#6b8a63]">בסטודיו או בטבע.</span>
            </h1>
            <p className="text-lg md:text-xl text-[#2d3d2b]/90 max-w-2xl mx-auto mb-10 leading-relaxed">
              סשנים אישיים עם הצלמת מיכל סיבוני – ניו-בורן, משפחה, ילדים ואירועים. תבחרי את האווירה
              שמדברת אלייך: אור רך של סטודיו או קסם טבעי בטבע.
            </p>
            <div className="mb-8 flex justify-center">
              <FunnelCta funnel="photography" label="איזה סשן מתאים לי?" sub="4 שאלות קצרות והמלצה אישית" />
            </div>
            <div className="flex flex-wrap items-stretch justify-center gap-3">
              <a
                href="#book-michal"
                className="inline-flex items-center gap-2 bg-[#2d3d2b] text-white px-7 py-3.5 rounded-full hover:bg-[#2d3d2b]/90 transition font-semibold"
              >
                <Mail size={18} /> השאירי פרטים
              </a>
              <a
                href={gmailLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-white/90 backdrop-blur border border-[#2d3d2b]/15 text-[#2d3d2b] px-7 py-3.5 rounded-full hover:bg-white transition font-semibold"
              >
                <Mail size={18} /> לתאום סשן במייל
              </a>
              <a
                href={MICHAL_SITE}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-white/90 backdrop-blur border-2 border-[#f5d5cf]/50 text-[#2d3d2b] px-7 py-3.5 rounded-full hover:bg-white hover:border-[#f5d5cf] transition font-semibold"
              >
                <ExternalLink size={18} /> לאתר של מיכל סיבוני
              </a>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Tabs */}
      <section className="max-w-6xl mx-auto px-6 pb-6">
        <div className="flex justify-center">
          <div className="inline-flex bg-white/70 backdrop-blur p-1.5 rounded-full border border-[#a8c4a2]/30 shadow-sm">
            {[
              { id: "studio" as const, label: "צילומים בסטודיו", icon: Sun },
              { id: "outdoor" as const, label: "צילומי חוץ בטבע", icon: Trees },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-full transition text-sm md:text-base ${
                  tab === id ? "bg-[#2d3d2b] text-white shadow" : "text-[#2d3d2b] hover:bg-white/50"
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
                  {
                    icon: Clock,
                    title: "סשן בהתאמה אישית",
                    desc: "משך הסשן והסטים לפי מה שחשוב לך · הצעה אישית במייל",
                  },
                  {
                    icon: Sparkles,
                    title: "מעל 400 אביזרים",
                    desc: "גישה מלאה לקטלוג הסטודיו לצילום",
                  },
                  { icon: Sun, title: "אור טבעי + תאורת סטודיו", desc: "חלל מעוצב, נעים ומקצועי" },
                ]
              : [
                  {
                    icon: Trees,
                    title: "לוקיישן בהתאמה אישית",
                    desc: "בטבע, בפארק, בחוף – איפה שמתאים לכם",
                  },
                  {
                    icon: Sparkles,
                    title: "אביזרים ניידים",
                    desc: "אפשרות לשלב אביזרים מהסטודיו בצילומי חוץ",
                  },
                  { icon: Sun, title: "שעות זהב", desc: "צילום בזריחה או בשקיעה לתוצאה קסומה" },
                ]
            ).map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="bg-white/80 backdrop-blur rounded-3xl p-6 border border-[#a8c4a2]/25 shadow-sm hover:shadow-md transition"
              >
                <div className="w-11 h-11 rounded-full bg-[#f5d5cf] flex items-center justify-center mb-3 text-[#2d3d2b]">
                  <Icon size={20} />
                </div>
                <div className="text-xl mb-1" style={{ fontFamily: "'DM Serif Display', serif" }}>
                  {title}
                </div>
                <div className="text-sm text-[#2d3d2b]/80">{desc}</div>
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </section>

      {/* Newborn hand-off — newborn sessions have their own dedicated
          packages/pricing/process, on a fully separate page with her own
          photography branding (not the studio's), per explicit request:
          this card deliberately looks like nothing else on this page — her
          own logo, her own colors — so it reads as a handoff to another
          site rather than just another option in this page's own flow. */}
      <section className="max-w-4xl mx-auto px-6 pb-10">
        <Link
          to="/newborn"
          className="group flex flex-col sm:flex-row items-center gap-6 rounded-3xl border border-[#d9b98a]/40 p-7 md:p-9 text-center sm:text-right transition hover:shadow-xl"
          style={{ background: "linear-gradient(135deg, #fdf3ec 0%, #f3d3dd 55%, #ecd3ac 100%)" }}
        >
          <img src={michalLogoWordmark} alt="michal" className="h-14 w-auto shrink-0" />
          <div className="flex-1">
            <div className="inline-flex items-center gap-1.5 text-[#c23b6d] text-xs font-semibold mb-1.5">
              <Heart size={12} className="fill-current" /> צילומי ניו-בורן
            </div>
            <h3
              className="text-xl md:text-2xl text-[#4a3221] mb-1"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              מחפשת דווקא צילומי ניו-בורן?
            </h3>
            <p className="text-sm text-[#4a3221]/75">
              לניו-בורן יש עמוד חבילות משלו — מחירים קבועים, תהליך מלא וגלריית תמונות אישית.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 shrink-0 bg-[#4a3221] text-white px-6 py-3 rounded-full text-sm font-semibold group-hover:bg-[#4a3221]/90 transition">
            למעבר לעמוד הניו-בורן <ArrowLeft size={16} />
          </span>
        </Link>
      </section>

      {/* Inquiry form — no prices on this page; Michal answers every inquiry by e-mail. */}
      <section id="book-michal" className="max-w-3xl mx-auto px-6 pb-14 scroll-mt-24">
        <div className="bg-[#f5d5cf]/40 rounded-3xl border border-[#2d3d2b]/10 p-6 md:p-8">
          <div className="text-center mb-5">
            <div className="flex items-center justify-center gap-2 text-[#6b8a63] text-xs tracking-[0.28em] uppercase mb-2">
              <Mail size={14} /> Inquiry
            </div>
            <h2 className="text-2xl md:text-3xl mb-2" style={{ fontFamily: "'DM Serif Display', serif" }}>
              צילומים עם מיכל
            </h2>
            <p className="text-sm text-[#2d3d2b]/85 leading-relaxed">
              משאירות פרטים, ומיכל חוזרת אלייך במייל עם הצעה אישית.
            </p>
          </div>

          {sent ? (
            <div className="rounded-2xl bg-white border border-[#a8c4a2]/30 p-8 text-center">
              <div className="text-3xl mb-2" aria-hidden>🤍</div>
              <div className="text-xl mb-1" style={{ fontFamily: "'DM Serif Display', serif" }}>תודה, הפנייה התקבלה</div>
              <p className="text-sm text-[#2d3d2b]/80">מיכל תחזור אלייך במייל בהקדם.</p>
            </div>
          ) : (
            <form onSubmit={submitInquiry} className="grid sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-[#2d3d2b]/80">שם מלא *</span>
                <input required className={bookInputCls} value={inq.name} onChange={(e) => setInq({ ...inq, name: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-[#2d3d2b]/80">מייל *</span>
                <input
                  required
                  className={bookInputCls}
                  dir="ltr"
                  type="email"
                  list="email-suggest-studio-photography"
                  value={inq.email}
                  onChange={(e) => setInq({ ...inq, email: e.target.value })}
                  placeholder="you@example.com"
                />
                <EmailDatalist id="email-suggest-studio-photography" value={inq.email} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-[#2d3d2b]/80">טלפון</span>
                <input className={bookInputCls} dir="ltr" type="tel" value={inq.phone} onChange={(e) => setInq({ ...inq, phone: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-[#2d3d2b]/80">איפה תרצי לצלם</span>
                <select className={bookInputCls} value={inq.where} onChange={(e) => setInq({ ...inq, where: e.target.value })}>
                  {["בסטודיו", "בחוץ, בטבע", "עוד לא יודעת"].map((w) => (
                    <option key={w}>{w}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-[#2d3d2b]/80">מה לצלם</span>
                <select className={bookInputCls} value={inq.what} onChange={(e) => setInq({ ...inq, what: e.target.value })}>
                  {["משפחה", "ילדים", "סמאש קייק / יום הולדת", "חלאקה", "בת מצווה", "אחר"].map((w) => (
                    <option key={w}>{w}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-[#2d3d2b]/80">מתי בערך</span>
                <input className={bookInputCls} value={inq.when} onChange={(e) => setInq({ ...inq, when: e.target.value })} placeholder="למשל: בחודש הקרוב" />
              </label>
              <label className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-xs font-semibold text-[#2d3d2b]/80">הערות</span>
                <textarea className={bookInputCls} rows={3} value={inq.notes} onChange={(e) => setInq({ ...inq, notes: e.target.value })} />
              </label>
              <input tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={inq.website} onChange={(e) => setInq({ ...inq, website: e.target.value })} />
              <div className="sm:col-span-2 flex justify-center pt-1">
                <button
                  type="submit"
                  disabled={sending}
                  className="inline-flex items-center gap-2 h-12 px-10 rounded-full bg-[#2d3d2b] text-white text-sm font-semibold hover:bg-[#2d3d2b]/90 disabled:opacity-50"
                >
                  <Mail size={18} /> {sending ? "שולחת…" : "שליחת פנייה"}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* Gallery — divided by topic (ניו-בורן / גיל שנה / חלאקה / משפחה /
          סטודיו וחוץ / בת מצווה), per explicit request. Independent of the
          studio/outdoor booking tab above — a topic like "בת מצווה" can
          happen in either location. */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
          <div>
            <h2
              className="text-3xl md:text-4xl"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              גלריה לפי נושא
            </h2>
            <p className="text-sm text-[#2d3d2b]/70 mt-1">תמונות נבחרות מתוך התיק של מיכל סיבוני</p>
          </div>
          <a
            href={MICHAL_SITE}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:inline-flex items-center gap-1 text-sm text-[#6b8a63] hover:text-[#2d3d2b]"
          >
            כל הגלריה <ArrowLeft size={14} />
          </a>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {GALLERY_CATEGORIES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setGalleryCategory(id)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition ${
                galleryCategory === id
                  ? "bg-[#2d3d2b] text-white shadow"
                  : "bg-white/70 text-[#2d3d2b] border border-[#a8c4a2]/30 hover:bg-white"
              }`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={galleryCategory}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            {photos.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#a8c4a2]/50 bg-white/50 p-10 text-center text-sm text-[#2d3d2b]/70">
                תמונות בנושא "{activeCategory.label}" בקרוב.
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                {photos.map((src, i) => (
                  <motion.button
                    key={src}
                    onClick={() => setLightbox(src)}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    whileHover={{ scale: 1.02 }}
                    className={`relative overflow-hidden rounded-2xl bg-[#f5d5cf] group ${
                      i % 5 === 0 ? "md:col-span-2 md:row-span-2 aspect-square" : "aspect-square"
                    }`}
                  >
                    <img
                      src={src}
                      alt={`${activeCategory.label} ${i + 1}`}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition" />
                  </motion.button>
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <div className="bg-white text-[#2d3d2b] rounded-3xl border border-[#2d3d2b]/10 p-10 md:p-14 text-center">
          <div>
            <h3
              className="text-3xl md:text-4xl mb-3"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              מוכנים לרגע שלכם?
            </h3>
            <p className="text-[#2d3d2b]/75 mb-7 max-w-xl mx-auto">
              נשמח לתאם איתכם סשן צילום שיתאים בדיוק לסיפור שלכם – בסטודיו או בחוץ.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <a
                href={telLink}
                className="inline-flex items-center gap-2 bg-[#2d3d2b] text-white px-7 py-3.5 rounded-full hover:bg-[#2d3d2b]/90 transition"
              >
                <Phone size={18} /> חיוג 054-8529277
              </a>
              <a
                href={gmailLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 border border-[#2d3d2b]/15 text-[#2d3d2b] px-7 py-3.5 rounded-full hover:bg-[#f8ede4] transition"
              >
                <Mail size={18} /> מייל
              </a>
              <a
                href={MICHAL_SITE}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 border border-[#2d3d2b]/15 text-[#2d3d2b] px-7 py-3.5 rounded-full hover:bg-[#f8ede4] transition"
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
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <motion.img
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                src={lightbox}
                alt=""
                className="block max-w-[90vw] max-h-[90vh] w-auto h-auto rounded-2xl shadow-2xl"
              />
              <button
                type="button"
                onClick={() => downloadImage(lightbox, "sweetbaby.jpg")}
                aria-label="הורדת התמונה"
                title="הורדת התמונה"
                className="absolute top-2 left-2 h-7 w-7 rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-black/75 transition"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

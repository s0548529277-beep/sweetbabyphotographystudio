import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Sparkles, Heart, Eye, MessageCircle, Search, Clock, CheckCircle2, Star,
  Gift, Phone, Mail, MapPin, ArrowLeft,
} from "lucide-react";
import { SleepConsultantMark } from "@/components/SleepConsultantMark";
import homeHero0 from "@/assets/home-hero-0.png.asset.json";
import homeHero1 from "@/assets/home-hero-1.png.asset.json";
import homeHero3 from "@/assets/home-hero-3.jpg.asset.json";
import studioInterior from "@/assets/studio-interior.jpg";
import studioPropsCorner from "@/assets/studio-props-corner.jpg";
import heroScene from "@/assets/hero-scene.jpg";

const INK = "#3a2a1e";
const INK_SOFT = "#7a6a5c";
const ACCENT = "#b9714f";
const ACCENT_DARK = "#a5623f";
const CREAM = "#fbf4ec";
const CARD = "#f6ece0";
const BAR = "#3e2c20";

const PHONE_DISPLAY = "052-712-6888";
const PHONE_TEL = "0527126888";
const PHONE_INTL = "972527126888";
const EMAIL = "sb0527126888@gmail.com";
const WHATSAPP_TEXT = encodeURIComponent("שלום שולמית, ראיתי את העמוד ואשמח לשמוע פרטים על ייעוץ השינה 🙂");

const OG_IMAGE = `https://sweetbabyphoto.shop${homeHero0.url}`;

export const Route = createFileRoute("/sleep-consultant")({
  component: SleepConsultant,
  head: () => ({
    meta: [
      { title: "שולמית בן נעים — יעוץ שינה לתינוקות | מתנה לרגל הלידה" },
      {
        name: "description",
        content:
          "ייעוץ שינה פרונטלי לתינוקות וילדים עם שולמית בן נעים — מגיעה אליכם הביתה, כ־שעתיים וחצי. אפשרות להחזר מקופת החולים (לאומית, מכבי, כללית) ומתנה של חצי מהסכום שמוחזר.",
      },
      { name: "keywords", content: "יעוץ שינה לתינוקות, יועצת שינה, שולמית בן נעים, הרגלי שינה תינוק, גמילה ממוצץ, סל לידה קופת חולים" },
      { property: "og:title", content: "שולמית בן נעים — יעוץ שינה לתינוקות" },
      { property: "og:description", content: "ייעוץ שינה פרונטלי בבית שלכם, עם אפשרות להחזר מקופת החולים ומתנה על הייעוץ." },
      { property: "og:type", content: "website" },
      { property: "og:image", content: OG_IMAGE },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: "https://sweetbabyphoto.shop/sleep-consultant" },
    ],
    links: [{ rel: "canonical", href: "https://sweetbabyphoto.shop/sleep-consultant" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Service",
          serviceType: "ייעוץ שינה לתינוקות וילדים",
          provider: {
            "@type": "Person",
            name: "שולמית בן נעים",
            telephone: "+972-52-712-6888",
            email: EMAIL,
          },
          areaServed: "IL",
          description: "ייעוץ שינה פרונטלי בבית הלקוחות, כ־שעתיים וחצי, עם אפשרות להחזר מקופות החולים בישראל.",
        }),
      },
    ],
  }),
});

const MEETING_ITEMS = [
  { icon: Sparkles, t: "איך מכניסים לאווירה של שינה" },
  { icon: Heart, t: "ייעוץ שינה לתינוקות" },
  { icon: Eye, t: "זיהוי סימנים למניעת בכי מיותר" },
  { icon: MessageCircle, t: "מעגל תקשורת עם התינוק" },
  { icon: Search, t: "תצפית" },
  { icon: Clock, t: "איך עושים לוגים כהכנה לתהליך" },
  { icon: CheckCircle2, t: "גמילה מטיטול, מוצץ, בקבוק" },
  { icon: Star, t: "פתרונות לילדים שלא נרדמים / מתעוררים" },
];

const KUPOT = [
  { name: "קופת חולים לאומית", basket: 2350, receipts: 3150, pay: 3150, refund: 2350, diff: 800 },
  { name: "קופת חולים מכבי", basket: 2350, receipts: 3150, pay: 3150, refund: 2350, diff: 800 },
  { name: "קופת חולים כללית", basket: 2340, receipts: 3125, pay: 3125, refund: 2340, diff: 785 },
];

const GALLERY = [
  { src: homeHero1.url, caption: "רכות ופסטל" },
  { src: studioInterior, caption: "הסטודיו — אור טבעי" },
  { src: homeHero3.url, caption: "סט וינטג׳ בבז׳" },
  { src: studioPropsCorner, caption: "פינת אביזרים סרוגים" },
  { src: heroScene, caption: "סצנת צילום מוכנה" },
];

function money(n: number) {
  return `₪${n.toLocaleString("he-IL")}`;
}

function SleepConsultant() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: CREAM, color: INK }}>
      {/* mini nav */}
      <header className="sticky top-0 z-40 backdrop-blur-xl border-b" style={{ background: `${CREAM}cc`, borderColor: "#e7d9c8" }}>
        <div className="container-page flex items-center justify-between h-20 gap-4">
          <div className="flex items-center gap-2" style={{ color: ACCENT }}>
            <SleepConsultantMark className="h-11 w-auto" />
            <div className="leading-tight">
              <div className="font-display text-lg" style={{ color: INK }}>שולמית בן נעים</div>
              <div className="text-[11px] tracking-wide" style={{ color: INK_SOFT }}>יעוץ שינה לתינוק</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href={`tel:${PHONE_TEL}`} className="hidden sm:flex items-center gap-2 text-sm rounded-full px-4 h-10 border" style={{ borderColor: "#e7d9c8", color: INK }}>
              <Phone className="h-4 w-4" style={{ color: ACCENT }} /> <span dir="ltr">{PHONE_DISPLAY}</span>
            </a>
            <a
              href={`https://wa.me/${PHONE_INTL}?text=${WHATSAPP_TEXT}`}
              target="_blank" rel="noreferrer"
              className="rounded-full px-5 h-10 flex items-center text-sm font-medium text-white shadow-sm transition-colors"
              style={{ background: ACCENT }}
              onMouseEnter={(e) => (e.currentTarget.style.background = ACCENT_DARK)}
              onMouseLeave={(e) => (e.currentTarget.style.background = ACCENT)}
            >
              הצטרפות
            </a>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="container-page pt-12 md:pt-16">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div className="order-2 md:order-1 rounded-[2rem] overflow-hidden shadow-[0_30px_60px_-30px_rgba(58,42,30,0.35)]">
            <img src={homeHero0.url} alt="תינוק ישן בעטיפה רכה" className="w-full h-full object-cover aspect-[4/5]" />
          </div>
          <div className="order-1 md:order-2">
            <div className="text-xs tracking-[0.3em] uppercase" style={{ color: ACCENT }}>Welcome to the World</div>
            <h1 className="font-display text-5xl md:text-6xl mt-3 leading-tight">מזל טוב לרגל הלידה!</h1>
            <p className="text-lg mt-4" style={{ color: INK_SOFT }}>בשעה טובה ומוצלחת ✿ מגיע לך להתפנק...</p>

            <div className="mt-8 rounded-2xl p-5" style={{ background: CARD }}>
              <div className="flex items-center gap-3" style={{ color: ACCENT }}>
                <SleepConsultantMark className="h-10 w-auto shrink-0" />
                <div>
                  <div className="font-display text-2xl" style={{ color: INK }}>שולמית בן נעים</div>
                  <div className="text-sm" style={{ color: INK_SOFT }}>יועצת שינה לתינוקות וילדים</div>
                </div>
              </div>
              <div className="mt-4 inline-flex items-center gap-2 text-xs rounded-full px-3.5 py-2" style={{ background: `${ACCENT}1a`, color: ACCENT_DARK }}>
                <MapPin className="h-3.5 w-3.5" />
                ייעוץ פרונטלי באזור המגורים · כ־שעתיים וחצי
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* GIFT + MEETING GRID */}
      <section className="container-page py-16 md:py-24">
        <div className="grid md:grid-cols-2 gap-6 items-start">
          <div className="rounded-3xl p-8" style={{ background: CARD }}>
            <Gift className="h-7 w-7 mb-4" style={{ color: ACCENT }} />
            <p className="leading-relaxed" style={{ color: INK }}>
              קופת חולים נותנת בסל הלידה אפשרות לקבל החזר על ייעוץ שינה — ומי שעושה אצלי את הייעוץ,
              מקבלת ממני מתנה: <strong>זיכוי של חצי מהסכום שניצלה מהסל!</strong>
            </p>
            <a
              href={`https://wa.me/${PHONE_INTL}?text=${WHATSAPP_TEXT}`}
              target="_blank" rel="noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-full px-6 h-12 text-white font-medium shadow-sm"
              style={{ background: ACCENT }}
            >
              מתנה: חצי מהסכום שניצלת חוזר אלייך
            </a>
          </div>

          <div className="rounded-3xl p-8" style={{ background: "#ffffff", border: `1px solid ${ACCENT}22` }}>
            <div className="flex items-center gap-2 mb-5">
              <div className="h-2 w-2 rounded-full" style={{ background: ACCENT }} />
              <h2 className="font-display text-2xl">מה במפגש?</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {MEETING_ITEMS.map((item) => (
                <div key={item.t} className="rounded-2xl p-4 text-center" style={{ background: CARD }}>
                  <item.icon className="h-5 w-5 mx-auto mb-2" style={{ color: ACCENT }} />
                  <div className="text-xs leading-snug" style={{ color: INK }}>{item.t}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* KUPOT CHOLIM */}
      <section className="py-16 md:py-24" style={{ background: CARD }}>
        <div className="container-page">
          <div className="text-xs tracking-[0.3em] uppercase" style={{ color: ACCENT }}>סל הלידה</div>
          <h2 className="font-display text-3xl md:text-4xl mt-3">כמה זה עולה לכם בפועל?</h2>
          <p className="mt-3 max-w-2xl" style={{ color: INK_SOFT }}>
            את ההפרש שנשאר אחרי ההחזר מהקופה — מקבלת בחזרה בהעברה, וכך מכוסה מלוא ההוצאה.
            בנוסף, מקבלת זיכוי של חצי מהסכום שניצלת מהסל.
          </p>

          <div className="mt-10 grid md:grid-cols-3 gap-6">
            {KUPOT.map((k) => (
              <div key={k.name} className="rounded-3xl overflow-hidden shadow-sm" style={{ background: "#ffffff" }}>
                <div className="py-4 text-center text-white font-display text-lg" style={{ background: BAR }}>
                  בס״ד — {k.name}
                </div>
                <div className="p-6 space-y-3 text-sm">
                  <Row label="גובה הסל" value={money(k.basket)} />
                  <Row label="כדי לממש, צריך קבלות על סך" value={money(k.receipts)} />
                  <Row label="את משלמת לפי הקבלה" value={money(k.pay)} />
                  <Row label="מקבלת החזר מהקופה" value={money(k.refund)} />
                  <Row label="הפרש שנשאר" value={money(k.diff)} strong />
                  <p className="pt-2 text-xs leading-relaxed" style={{ color: INK_SOFT }}>
                    את ה־{money(k.diff)} ההפרש מקבלת בחזרה בהעברה — וכך מכוסה מלוא ההוצאה. ובנוסף — גם את
                    ה<strong style={{ color: ACCENT_DARK }}>ייעוץ עצמו</strong> קיבלת!
                  </p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-8 text-sm max-w-3xl" style={{ color: INK_SOFT }}>
            גם אם ניצלת רק חלק מהסל למשהו אחר — אפשר לעשות דרכי. אני עובדת גם על סל חלקי, אך לא פחות
            מ־{money(1000)} בסל. הזיכוי תמיד חצי מהסכום שניצלת. הגעת דרך חנות? זיכוי בחנות. הגעת דרך המלצה
            פרטית? אפשרויות זיכוי שונות.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="container-page py-16 md:py-20">
        <div className="rounded-3xl p-8 md:p-12 grid md:grid-cols-2 gap-8 items-center" style={{ background: BAR, color: "#f6ece0" }}>
          <div>
            <h2 className="font-display text-3xl">רוצה להצטרף?</h2>
            <p className="mt-3 text-sm" style={{ color: "#d9c9ba" }}>
              בדיקת זכאות מול קופת החולים שלך — מכבי | לאומית | כללית. כל שאלה ובקשה, אני כאן!
            </p>
          </div>
          <div className="flex flex-wrap gap-3 md:justify-end">
            <a
              href={`https://wa.me/${PHONE_INTL}?text=${WHATSAPP_TEXT}`}
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full px-7 h-12 font-medium shadow-sm"
              style={{ background: ACCENT, color: "#fff" }}
            >
              הרשמה בוואטסאפ
            </a>
            <a
              href={`mailto:${EMAIL}?subject=${encodeURIComponent("בקשה להצטרפות — ייעוץ שינה")}`}
              className="inline-flex items-center gap-2 rounded-full px-7 h-12 font-medium border"
              style={{ borderColor: "#f6ece055", color: "#f6ece0" }}
            >
              <Mail className="h-4 w-4" /> באימייל
            </a>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section className="container-page py-16 md:py-20">
        <div className="text-xs tracking-[0.3em] uppercase" style={{ color: ACCENT }}>Get In Touch</div>
        <h2 className="font-display text-3xl md:text-4xl mt-3">לכל שאלה ובקשה — אני כאן!</h2>
        <div className="grid sm:grid-cols-2 gap-5 mt-8 max-w-xl">
          <a href={`mailto:${EMAIL}`} className="rounded-2xl p-6 block" style={{ background: CARD }}>
            <Mail className="h-5 w-5 mb-3" style={{ color: ACCENT }} />
            <div className="text-xs uppercase tracking-widest" style={{ color: INK_SOFT }}>אימייל</div>
            <div className="mt-1 text-sm" dir="ltr">{EMAIL}</div>
          </a>
          <a href={`tel:${PHONE_TEL}`} className="rounded-2xl p-6 block" style={{ background: CARD }}>
            <Phone className="h-5 w-5 mb-3" style={{ color: ACCENT }} />
            <div className="text-xs uppercase tracking-widest" style={{ color: INK_SOFT }}>טלפון</div>
            <div className="mt-1 text-sm" dir="ltr">{PHONE_DISPLAY}</div>
          </a>
        </div>
      </section>

      {/* CROSS-PROMO GALLERY */}
      <section className="py-16 md:py-20" style={{ background: CARD }}>
        <div className="container-page text-center">
          <h2 className="font-display text-2xl md:text-3xl">רגעים מתוקים</h2>
          <p className="mt-2 text-sm" style={{ color: INK_SOFT }}>✿ מבחר תמונות מהתינוקות המתפנקים ✿ — צילומי ניוברן מאת מיכל סיבוני</p>
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-5 gap-3">
            {GALLERY.map((g) => (
              <div key={g.caption} className="rounded-xl overflow-hidden aspect-square">
                <img src={g.src} alt={g.caption} className="w-full h-full object-cover" loading="lazy" />
              </div>
            ))}
          </div>
          <Link
            to="/"
            className="mt-8 inline-flex items-center gap-2 rounded-full px-6 h-11 text-sm font-medium text-white"
            style={{ background: ACCENT }}
          >
            <ArrowLeft className="h-4 w-4" />
            לצפייה בעוד תמונות באתר של מיכל סיבוני
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="mt-auto py-10" style={{ background: BAR, color: "#d9c9ba" }}>
        <div className="container-page flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
          <span>שולמית בן נעים · יעוץ שינה לתינוק</span>
          <span>מתנה במסגרת שיתוף פעולה עם מיכל סיבוני — צלמת ניוברן · 053-418-1051</span>
          <Link to="/" className="hover:text-white transition-colors">חזרה לאתר Sweetbaby</Link>
        </div>
      </footer>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: "#eee0d2" }}>
      <span style={{ color: INK_SOFT }}>{label}</span>
      <span dir="ltr" style={{ color: strong ? ACCENT_DARK : INK, fontWeight: strong ? 700 : 500 }}>{value}</span>
    </div>
  );
}

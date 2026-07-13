import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import heroImg from "@/assets/hero-studio.jpg.asset.json";
import heroAnimation from "@/assets/hero-animation.gif.asset.json";
import logo from "@/assets/logo-green.png";


export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "Sweetbaby — סטודיו בוטיק, צילומים והשכרת אביזרים בבית שמש" },
      { name: "description", content: "סטודיו בוטיק בבית שמש: השכרת חלל צילום, סשן צילום עם מיכל סיבוני וקטלוג של 400+ אביזרים מעוצבים לניוברן, גיל שנה, חלאקה ומשפחה." },
      { property: "og:title", content: "Sweetbaby — סטודיו, צילומים והשכרת אביזרים" },
      { property: "og:description", content: "שלוש דרכים ליצור תמונה בלתי נשכחת: השכרת סטודיו, סשן צילום או השכרת אביזרים." },
      { property: "og:url", content: "https://sweetbabyphotographystudio.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://sweetbabyphotographystudio.lovable.app/" }],
  }),
});

function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-[#f8ede4] text-[#2d3d2b]" style={{ fontFamily: "'Fira Sans', sans-serif" }}>
      <Header />

      <main className="flex-1 w-full flex items-start justify-center px-4 md:px-8 py-8 md:py-12">
        <div className="max-w-6xl w-full grid grid-cols-1 md:grid-cols-12 gap-5" dir="rtl">

          {/* Brand / Identity tile */}
          <div className="md:col-span-5 bg-[#f5d5cf] p-8 md:p-10 rounded-[2.5rem] flex flex-col justify-between border border-[#2d3d2b]/5 shadow-sm min-h-[420px]">
            <div className="space-y-6">
              <h1 className="text-5xl md:text-6xl leading-none text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>
                Sweetbaby
              </h1>
              <p className="text-lg md:text-xl text-[#2d3d2b]/80 leading-relaxed max-w-sm">
                סטודיו בוטיק לצילום ואביזרים, המשלב אמנות, רגש ועיצוב מוקפד — בבית שמש.
              </p>
            </div>
            <div className="mt-10 flex items-end justify-between">
              <div className="space-y-1">
                <div className="text-xs tracking-[0.28em] text-[#2d3d2b]/60 font-medium uppercase">Est. 2020</div>
                <div className="text-sm text-[#2d3d2b] font-medium italic">Beit Shemesh, IL</div>
              </div>
              <Link to="/about" aria-label="קראו עלינו" className="h-12 w-12 rounded-full border border-[#2d3d2b]/25 flex items-center justify-center text-[#2d3d2b] hover:bg-[#2d3d2b] hover:text-[#f5d5cf] transition-colors">
                <span className="text-xl">↓</span>
              </Link>
            </div>
          </div>

          {/* Hero image tile */}
          <div className="md:col-span-7 h-[360px] md:h-[520px] rounded-[2.5rem] overflow-hidden relative">
            <img
              src={heroImg.url}
              alt="ניוברן על סגנון בוטיק — סטודיו Sweetbaby"
              className="w-full h-full object-cover"
              loading="eager"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#2d3d2b]/40 to-transparent" />
            <div className="absolute bottom-6 right-6 md:bottom-8 md:right-8">
              <div className="bg-[#f8ede4]/90 backdrop-blur-md px-5 py-2.5 md:px-6 md:py-3 rounded-full border border-white/30">
                <span className="text-[#2d3d2b] text-lg md:text-xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
                  רגעים של פעם בחיים
                </span>
              </div>
            </div>
          </div>

          {/* Offering 1 — Photography Sessions */}
          <Link
            to="/studio-photography"
            className="group md:col-span-4 bg-white rounded-[2.5rem] overflow-hidden border border-[#2d3d2b]/5 flex flex-col transition-all duration-500 hover:shadow-2xl hover:-translate-y-1"
          >
            <div className="h-56 md:h-64 relative overflow-hidden bg-[#f5d5cf]">
              <img
                src={heroAnimation.url}
                alt="סשן צילום עם מיכל סיבוני"
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute top-4 left-4 bg-[#a8c4a2] text-white px-4 py-1 rounded-full text-sm font-medium">
                ₪300 / שעה
              </div>
            </div>
            <div className="p-7 md:p-8 flex flex-col flex-grow">
              <h3 className="text-2xl text-[#2d3d2b] mb-3" style={{ fontFamily: "'DM Serif Display', serif" }}>
                צילומים עם מיכל סיבוני
              </h3>
              <p className="text-[#2d3d2b]/70 text-sm mb-6 flex-grow leading-relaxed">
                סשן צילום אישי, מקצועי ומלא ברוך בסטודיו המאובזר שלנו — אפשרות לחצי שעה ולבניית סטים בהתאמה.
              </p>
              <span className="text-sm font-semibold text-[#2d3d2b] underline underline-offset-4 decoration-[#a8c4a2] decoration-2">
                להזמנת סשן →
              </span>
            </div>
          </Link>

          {/* Offering 2 — Studio Rental */}
          <Link
            to="/studio-rental"
            className="group md:col-span-4 bg-[#a8c4a2]/20 rounded-[2.5rem] overflow-hidden border border-[#a8c4a2]/40 flex flex-col transition-all duration-500 hover:shadow-2xl hover:-translate-y-1"
          >
            <div className="h-56 md:h-64 relative overflow-hidden bg-[#a8c4a2]/30">
              <img
                src={heroImg.url}
                alt="חלל סטודיו מעוצב להשכרה"
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute top-4 left-4 bg-[#2d3d2b] text-[#f8ede4] px-4 py-1 rounded-full text-sm font-medium">
                ₪120 / שעה
              </div>
            </div>
            <div className="p-7 md:p-8 flex flex-col flex-grow">
              <h3 className="text-2xl text-[#2d3d2b] mb-3" style={{ fontFamily: "'DM Serif Display', serif" }}>
                השכרת הסטודיו
              </h3>
              <p className="text-[#2d3d2b]/70 text-sm mb-6 flex-grow leading-relaxed">
                חלל מעוצב לצלמים המחפשים תאורה טבעית, אווירה שקטה וציוד משלים — חבילת ניוברן בקר: 240₪ ל-3 שעות.
              </p>
              <span className="text-sm font-semibold text-[#2d3d2b] underline underline-offset-4 decoration-[#f5d5cf] decoration-2">
                בדיקת זמינות →
              </span>
            </div>
          </Link>

          {/* Offering 3 — Prop Catalog */}
          <Link
            to="/rental-catalog"
            className="group md:col-span-4 bg-[#2d3d2b] rounded-[2.5rem] p-7 md:p-8 flex flex-col justify-between transition-all duration-500 hover:shadow-2xl hover:bg-[#1f2b1e] border border-white/5 min-h-[380px]"
          >
            <div className="space-y-4">
              <div className="flex justify-between items-start gap-3">
                <h3 className="text-3xl text-[#f8ede4]" style={{ fontFamily: "'DM Serif Display', serif" }}>
                  קטלוג אביזרים
                </h3>
                <div className="text-[#a8c4a2] text-xs font-bold tracking-widest uppercase pt-2">
                  Catalog
                </div>
              </div>
              <p className="text-[#f8ede4]/75 leading-relaxed text-sm">
                מבחר של מעל 400 אביזרים לצילומי ניוברן, ילדים והריון. וינטג׳, מקרמה, סרוגים, עץ ורטאן — טקסטורות ייחודיות ופריטים בעבודת יד.
              </p>
            </div>

            <div className="mt-10 flex items-center justify-between border-t border-white/10 pt-6">
              <div>
                <div className="text-[10px] text-[#a8c4a2] uppercase tracking-widest mb-1">החל מ-</div>
                <div className="text-2xl text-[#f8ede4]" style={{ fontFamily: "'DM Serif Display', serif" }}>
                  ₪50
                </div>
              </div>
              <span className="bg-[#f5d5cf] text-[#2d3d2b] px-5 py-2 rounded-full text-sm font-bold group-hover:bg-[#f8ede4] transition-colors">
                לצפייה בקטלוג
              </span>
            </div>
          </Link>

          {/* Footer strip */}
          <div className="md:col-span-12 flex flex-col md:flex-row items-center justify-between gap-4 px-2 md:px-4 py-6 mt-2 text-[#2d3d2b]/70 text-xs border-t border-[#2d3d2b]/10">
            <div className="flex flex-wrap justify-center md:justify-start gap-4 md:gap-6">
              <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 bg-[#a8c4a2] rounded-full" /> מעל 400 אביזרים</span>
              <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 bg-[#a8c4a2] rounded-full" /> סטודיו בבית שמש</span>
              <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 bg-[#a8c4a2] rounded-full" /> מאז 2020</span>
            </div>
            <div className="flex gap-6 md:gap-8 font-medium">
              <a href="https://wa.me/972548529277" target="_blank" rel="noopener noreferrer" className="hover:text-[#2d3d2b] transition-colors">ווטסאפ</a>
              <a href="mailto:s0548529277@gmail.com" className="hover:text-[#2d3d2b] transition-colors">מייל</a>
              <Link to="/contact" className="hover:text-[#2d3d2b] transition-colors">צרו קשר</Link>
            </div>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
}

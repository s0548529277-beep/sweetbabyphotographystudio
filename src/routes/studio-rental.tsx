import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { Clock, CreditCard, CalendarDays, Sparkles, ArrowLeft, X, MapPin, Star, AlertTriangle, Mail } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/studio-rental")({
  head: () => ({
    meta: [
      { title: "השכרת סטודיו | Sweetbaby" },
      { name: "description", content: "השכרת סטודיו בוטיק בבית שמש לצילומי ניו-בורן, משפחה והיריון. מחירון שקוף וקביעת תור אונליין." },
      { property: "og:title", content: "השכרת סטודיו | Sweetbaby" },
      { property: "og:description", content: "חלל בוטיק מאובזר, תאורה מקצועית ואווירה שקטה — לצלמות שמחפשות סטודיו איכותי בבית שמש." },
      { property: "og:url", content: "https://sweetbabyphotographystudio.lovable.app/studio-rental" },
    ],
    links: [{ rel: "canonical", href: "https://sweetbabyphotographystudio.lovable.app/studio-rental" }],
  }),
  component: StudioRentalPage,
});

const EMAIL_TO = "s0548529277@gmail.com";

type IntakeForm = {
  clientName: string; phone: string; email: string;
  sessionType: string; sessionDate: string; peopleCount: string; babyAge: string;
  cameraBrand: string; flashExperience: string; needProps: string; specialRequests: string;
  agreed: boolean;
};
const emptyForm: IntakeForm = {
  clientName: "", phone: "", email: "", sessionType: "", sessionDate: "",
  peopleCount: "", babyAge: "", cameraBrand: "", flashExperience: "",
  needProps: "", specialRequests: "", agreed: false,
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] as const } }),
};

// Full studio rules — shown inside the intake modal, matching the printed
// coordination agreement so signing the checkbox = agreeing to everything.
const rulesBlocks: { title: string; items: string[] }[] = [
  { title: "🕒 שעות פעילות", items: [
    "ימים א׳–ה׳: 8:00–23:00",
    "יום ו׳ / ערב חג: 8:00 עד שעתיים לפני כניסת השבת/חג",
    "מוצ״ש / חג: משעה אחרי צאת השבת/חג",
  ]},
  { title: "💳 מחירון וחישוב שעות", items: [
    "שעת השכרה ראשונה: 120 ₪",
    "כל שעה נוספת: 90 ₪",
    "חצי שעה = חצי מהתעריף המתאים",
    "מבצע 8:00–13:00 (ניו-בורן): 3 שעות ב-240 ₪",
    "מינימום הזמנה: שעה (2 חצאי שעות)",
    "עיכוב של 15 דק׳ ומעלה — יחויב כחצי שעה נוספת",
    "עיכוב של 45 דק׳ ומעלה — יחויב כשעה מלאה נוספת",
    "ספירת הזמן כוללת התארגנות וניקיון בסיום",
  ]},
  { title: "📅 תשלום ומדיניות ביטולים", items: [
    "שריון מועד: מקדמה 90 ₪ (לא מוחזרת)",
    "העברה בנקאית: בנק 12, סניף 533, חשבון 648912 (מיכל סיבוני)",
    "יש לשלוח צילום אישור העברה למייל לאישור השריון",
    "הזמנה ליום ההגעה: תשלום מלא מראש",
    "יתרה: פייבוקס / העברה / מזומן בסיום",
    "ביטול/שינוי עד ליום האירוע — המקדמה לא מוחזרת",
    "ביטול ביום האירוע — חיוב מלא (100%)",
  ]},
  { title: "✨ ציוד ותאורה", items: [
    "פלאש Godox AD200 PRO (סוללה נטענת)",
    "משדרים ל-Canon ול-Sony",
    "סופטבוקס בקוטר 1.65 מטר",
    "מיזוג + מפזר חום ייעודי לניו-בורן",
    "שידת החתלה חדשה עם עיטופים ובדים",
    "קופסת ציוד: משדר, סוללה, שוֶשר, דבקים, אטבים",
    "* השימוש בפלאש דורש ידע מוקדם",
  ]},
  { title: "🎨 רקעים ורצפות", items: [
    "רקעים: ירוק, לבן (2.7), כחול, חום בהיר, חום כהה, צהוב (1.5)",
    "רקעי נייר — לקירות בלבד",
    "שימוש ברקע נייר גם כרצפה: +50 ₪ (יש לתאם מראש)",
    "רקע שהתלכלך/נהרס: 100 ₪ למטר",
    "רצפות ללא תוספת: פורמייקה, עץ, פרקט, קורות עץ",
  ]},
  { title: "🧹 סדר וניקיון", items: [
    "הסטודיו נמסר נקי ומסודר — יש להחזירו למצבו המקורי",
    "בלגן/לכלוך משמעותי — חיוב 150 ₪ דמי ניקיון",
    "שירותים בקומה 5, דירה 18",
  ]},
  { title: "🛡️ אחריות ונזקים", items: [
    "נזק לרכוש: עלות תיקון/רכישה + 20% דמי טיפול",
    "הבטיחות באחריות השוכר/ת בלבד",
    "השארת אור/מזגן דולק — 7 ₪ לשעה עד 8:00 בבוקר למחרת",
    "חפצים שיישכחו מעל 30 יום — יעברו למאגר הסטודיו",
  ]},
];

const quickFacts = [
  { icon: Clock, label: "א׳–ה׳ 8:00–23:00" },
  { icon: CreditCard, label: "מ-120 ₪ לשעה" },
  { icon: CalendarDays, label: "מקדמה 90 ₪ לשריון" },
  { icon: Sparkles, label: "Godox AD200 PRO" },
];

function StudioRentalPage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<IntakeForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const nav = useNavigate();
  const { user } = useAuth();
  const upd = <K extends keyof IntakeForm>(k: K, v: IntakeForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const sendIntake = async () => {
    if (!form.clientName.trim() || !form.phone.trim() || !form.email.trim()) {
      toast.error("נא למלא שם, טלפון ואימייל.");
      return;
    }
    if (!form.agreed) {
      toast.error("יש לאשר את הסכם תיאום הציפיות לפני השליחה.");
      return;
    }

    // Build the mailto URL BEFORE any await so the popup opens in the same
    // user gesture — Chrome/Safari block window.open called after await.
    const lines = [
      `שם מלא: ${form.clientName}`,
      `טלפון: ${form.phone}`,
      `אימייל: ${form.email}`,
      `סוג הצילום: ${form.sessionType}`,
      `תאריך/שעה מבוקשים: ${form.sessionDate}`,
      `מספר משתתפים: ${form.peopleCount}`,
      `גיל התינוק (אם רלוונטי): ${form.babyAge}`,
      `מותג מצלמה: ${form.cameraBrand}`,
      `ניסיון פלאש/סטודיו: ${form.flashExperience}`,
      `אביזרים בהשכרה: ${form.needProps}`,
      `בקשות מיוחדות: ${form.specialRequests}`,
      ``,
      `אישרתי שקראתי והסכמתי להסכם תיאום הציפיות ולכללי הסטודיו.`,
    ].join("\n");
    const subject = `הסכם תיאום ציפיות - ${form.clientName}`;
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(EMAIL_TO)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines)}`;
    // Opened synchronously → not blocked by popup blockers.
    const popup = window.open(gmailUrl, "_blank", "noopener,noreferrer");
    // Fallback for iOS/embedded browsers that still refuse popups.
    if (!popup) window.location.href = `mailto:${EMAIL_TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines)}`;

    setSubmitting(true);
    try {
      if (user) {
        await supabase.from("studio_intake_forms").insert({
          user_id: user.id,
          payload: JSON.parse(JSON.stringify(form)),
        });
      }
      toast.success("ההסכם נשלח. ממשיכות לבחירת שעה ביומן.");
      setShowForm(false);
      nav({ to: "/booking" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שליחה נכשלה");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f8ede4] text-[#2d3d2b]" style={{ fontFamily: "'Fira Sans', sans-serif" }}>
      <Header />

      {/* HERO */}
      <section className="relative overflow-hidden" dir="rtl">
        <motion.div
          aria-hidden
          className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-[#f5d5cf] blur-3xl opacity-70"
          animate={{ y: [0, 25, 0], x: [0, -15, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="absolute top-32 -left-24 h-80 w-80 rounded-full bg-[#a8c4a2] blur-3xl opacity-40"
          animate={{ y: [0, -20, 0], x: [0, 15, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="relative container-page pt-10 pb-8">
          <motion.div initial="hidden" animate="show" variants={fadeUp} className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/70 backdrop-blur px-4 py-1.5 border border-[#2d3d2b]/10">
              <Star className="h-3.5 w-3.5 fill-[#a8c4a2] text-[#a8c4a2]" />
              <span className="text-[11px] tracking-[0.28em] uppercase text-[#2d3d2b]/70 font-medium">Studio Rental · בית שמש</span>
            </div>
            <h1 className="mt-4 text-[2.4rem] leading-[1.05] md:text-[3.6rem] md:leading-[1] text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>
              השכרת <em className="not-italic text-[#6b8a63]">הסטודיו</em>
            </h1>
            <p className="mt-3 text-base text-[#2d3d2b]/75 max-w-2xl leading-relaxed">
              חלל בוטיק שקט ומאובזר לצלמות — תאורה מקצועית, רקעים ואווירה שמזמינה יצירה. מחירון שקוף, יומן פתוח.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              {quickFacts.map(({ icon: Icon, label }) => (
                <div key={label} className="inline-flex items-center gap-2 bg-white/80 backdrop-blur px-3.5 py-1.5 rounded-full border border-[#2d3d2b]/10 text-xs text-[#2d3d2b]/75">
                  <Icon className="h-3.5 w-3.5 text-[#6b8a63]" />
                  <span>{label}</span>
                </div>
              ))}
              <div className="inline-flex items-center gap-2 bg-white/80 backdrop-blur px-3.5 py-1.5 rounded-full border border-[#2d3d2b]/10 text-xs text-[#2d3d2b]/75">
                <MapPin className="h-3.5 w-3.5 text-[#6b8a63]" />
                <span>תלמוד ירושלמי 24</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* PRICING */}
      <section className="container-page pb-6" dir="rtl">
        <div className="grid md:grid-cols-2 gap-4 md:gap-5 max-w-3xl mx-auto">
          <motion.div
            initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} custom={0} variants={fadeUp}
            className="bg-white rounded-2xl border border-[#2d3d2b]/5 p-5 relative overflow-hidden"
          >
            <div className="absolute -top-10 -left-10 h-24 w-24 rounded-full bg-[#f5d5cf]/60 blur-2xl" />
            <div className="relative">
              <div className="text-[10px] tracking-[0.24em] uppercase text-[#6b8a63] mb-1">01 · Flexible</div>
              <h3 className="text-lg text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>שעתי גמיש</h3>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>₪120</span>
                <span className="text-xs text-[#2d3d2b]/60">/ שעה ראשונה</span>
              </div>
              <p className="mt-2 text-[12px] text-[#2d3d2b]/75">כל שעה נוספת 90 ₪ · חצאי שעות בחישוב יחסי · מינימום שעה</p>
            </div>
          </motion.div>

          <motion.div
            initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} custom={1} variants={fadeUp}
            className="bg-[#f5d5cf] text-[#2d3d2b] rounded-2xl p-5 relative overflow-hidden"
          >
            <div className="absolute top-6 -left-10 h-24 w-24 rounded-full bg-white/40 blur-2xl" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <div className="text-[10px] tracking-[0.24em] uppercase text-[#6b8a63] mb-1">02 · Morning</div>
                <span className="text-[9px] tracking-[0.2em] uppercase bg-[#2d3d2b] text-[#f8ede4] px-2 py-0.5 rounded-full font-semibold">ניוברן</span>
              </div>
              <h3 className="text-lg" style={{ fontFamily: "'DM Serif Display', serif" }}>מבצע בוקר ניו-בורן</h3>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl" style={{ fontFamily: "'DM Serif Display', serif" }}>₪240</span>
                <span className="text-xs text-[#2d3d2b]/70">/ 3 שעות (8:00–13:00)</span>
              </div>
              <p className="mt-2 text-[12px] text-[#2d3d2b]/80">3 שעות רצופות · חיסכון משמעותי מול תעריף שעתי</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* GUIDANCE ADD-ONS */}
      <section className="container-page pb-6" dir="rtl">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-5">
            <div className="text-[11px] tracking-[0.3em] uppercase text-[#6b8a63] mb-2">Add-ons</div>
            <h3 className="text-2xl md:text-3xl text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>
              חבילות הדרכה וליווי
            </h3>
          </div>
          <div className="grid md:grid-cols-3 gap-3 md:gap-4">
            {[
              { tag: "Basic", price: 50, title: "הדרכה טכנית קצרה", desc: "סידור מהיר של פלאש ומצלמה, מוכנות ליציאה לצילום.", bg: "bg-white", accent: "border-[#2d3d2b]/10" },
              { tag: "Plus", price: 100, title: "ליווי מקצועי ראשוני", desc: "התאמת 2 סטים לצילום כולל הכוונה יצירתית.", bg: "bg-[#a8c4a2]/25", accent: "border-[#a8c4a2]/50", featured: true },
              { tag: "Premium", price: 150, title: "מעטפת מלאה", desc: "הכנת חלל מאפס + זמינות במהלך כל השהות.", bg: "bg-[#f5d5cf]", accent: "border-[#f5d5cf]" },
            ].map((p, i) => (
              <motion.div
                key={p.title} custom={i} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} variants={fadeUp}
                className={`${p.bg} rounded-2xl p-5 border ${p.accent} relative`}
              >
                {p.featured && (
                  <span className="absolute top-3 left-3 text-[9px] tracking-[0.22em] uppercase bg-[#2d3d2b] text-[#f8ede4] px-2.5 py-0.5 rounded-full font-semibold">
                    פופולרי
                  </span>
                )}
                <div className="text-[10px] tracking-[0.28em] uppercase text-[#6b8a63] mb-1">{p.tag}</div>
                <h4 className="text-lg text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>{p.title}</h4>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>₪{p.price}</span>
                  <span className="text-xs text-[#2d3d2b]/60">תוספת חד-פעמית</span>
                </div>
                <p className="mt-2 text-[13px] text-[#2d3d2b]/75 leading-relaxed">{p.desc}</p>
              </motion.div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-[#2d3d2b]/60 text-center">
            יש לציין את החבילה הרצויה בטופס תיאום הציפיות.
          </p>
        </div>
      </section>

      {/* BOOKING CTA */}
      <section className="container-page pb-14" dir="rtl">
        <motion.div
          initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={fadeUp}
          className="max-w-3xl mx-auto bg-white rounded-[2rem] border border-[#2d3d2b]/5 overflow-hidden shadow-[0_20px_60px_-30px_rgba(45,61,43,0.35)]"
        >
          <div className="p-6 md:p-8">
            <div className="text-[11px] tracking-[0.28em] uppercase text-[#6b8a63] mb-2">Booking</div>
            <h2 className="text-2xl md:text-3xl text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>
              קביעת תור בסטודיו
            </h2>

            <div className="mt-4 flex gap-3 items-start bg-[#f5d5cf]/50 border border-[#f5d5cf] rounded-2xl p-4">
              <AlertTriangle className="h-5 w-5 text-[#8b3a2a] mt-0.5 shrink-0" />
              <div className="text-sm text-[#2d3d2b]/85 leading-relaxed">
                לא ניתן לקבוע תור לפני שליחת <strong>הסכם תיאום ציפיות</strong>. כל כללי הסטודיו וההסכם מופיעים בטופס — אישור הטופס = הסכמה מלאה לתנאים.
              </div>
            </div>

            <div className="mt-5 grid sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#2d3d2b] text-[#f8ede4] px-6 py-3.5 text-sm font-medium hover:bg-[#1f2b1e] transition-all group"
              >
                <Mail className="h-4 w-4" />
                <span>מילוי הסכם תיאום ציפיות</span>
              </button>
              <Link
                to="/booking"
                className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-[#2d3d2b] text-[#2d3d2b] px-6 py-3.5 text-sm font-medium hover:bg-[#2d3d2b] hover:text-[#f8ede4] transition-all"
              >
                <CalendarDays className="h-4 w-4" />
                <span>לבחירת תאריך ושעה</span>
              </Link>
            </div>

            <p className="mt-4 text-xs text-[#2d3d2b]/60 text-center">
              לשאלות: <a href={`mailto:${EMAIL_TO}`} className="font-semibold text-[#2d3d2b] underline decoration-[#f5d5cf] decoration-2 underline-offset-4">{EMAIL_TO}</a>
            </p>
          </div>
        </motion.div>

        <div className="mt-6 max-w-3xl mx-auto bg-[#2d3d2b] text-[#f8ede4] rounded-[2rem] p-5 relative overflow-hidden">
          <div className="absolute -top-10 -left-10 h-32 w-32 rounded-full bg-[#a8c4a2]/30 blur-2xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex-1 min-w-[240px]">
              <div className="text-[11px] tracking-[0.28em] uppercase text-[#a8c4a2] mb-1">Add-on · חינם</div>
              <h4 className="text-xl" style={{ fontFamily: "'DM Serif Display', serif" }}>צריכה גם אביזרים?</h4>
              <p className="text-sm text-[#f8ede4]/85 mt-1 leading-relaxed">
                <strong className="text-[#f5d5cf]">עד 20 אביזרים חינם</strong> לשעות ההשכרה בסטודיו — ללא תוספת תשלום.
                אנו מתחייבים שכ-80% מהקטלוג יהיה בהישג יד בזמן הצילום (בכפוף לזמינות).
              </p>
              <p className="text-[11px] text-[#f8ede4]/60 mt-2">
                רוצה לשריין אביזרים ספציפיים? ציין/י אותם בהערות בטופס תיאום הציפיות.
              </p>
            </div>
            <Link
              to="/rental-catalog"
              className="inline-flex items-center gap-2 bg-[#f5d5cf] text-[#2d3d2b] px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-[#f8ede4] transition-colors group whitespace-nowrap"
            >
              לצפייה בקטלוג
              <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            </Link>
          </div>
        </div>

      </section>

      <Footer />

      {/* INTAKE MODAL — includes the full studio rules */}
      {showForm && (
        <div
          className="fixed inset-0 bg-[#2d3d2b]/60 backdrop-blur-sm z-[100] flex items-center justify-center p-3 md:p-6"
          onClick={() => setShowForm(false)}
          dir="rtl"
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="bg-[#f8ede4] rounded-[1.75rem] p-5 md:p-8 max-w-3xl w-full max-h-[94vh] overflow-y-auto relative shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            style={{ fontFamily: "'Fira Sans', sans-serif" }}
          >
            <button
              onClick={() => setShowForm(false)}
              aria-label="סגירה"
              className="absolute top-3 left-3 h-10 w-10 rounded-full bg-white/80 hover:bg-white flex items-center justify-center text-[#2d3d2b]"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-[11px] tracking-[0.28em] uppercase text-[#6b8a63] mb-2">Coordination</div>
            <h2 className="text-2xl md:text-3xl text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>
              הסכם תיאום ציפיות
            </h2>
            <p className="mt-2 text-sm text-[#2d3d2b]/75 leading-relaxed">
              נא למלא את הטופס למטה. <strong>שליחת ההסכם היא תנאי לקביעת התור.</strong>
            </p>

            {/* RULES — full agreement text */}
            <div className="mt-5 bg-white rounded-2xl border border-[#2d3d2b]/10 p-4 md:p-5 max-h-72 overflow-y-auto">
              <h3 className="text-lg text-[#2d3d2b] mb-3" style={{ fontFamily: "'DM Serif Display', serif" }}>
                כללי הסטודיו — לקריאה לפני האישור
              </h3>
              <div className="grid gap-4">
                {rulesBlocks.map((block) => (
                  <div key={block.title}>
                    <div className="text-sm font-semibold text-[#2d3d2b] mb-1.5">{block.title}</div>
                    <ul className="space-y-1 text-[13px] text-[#2d3d2b]/80">
                      {block.items.map((it) => (
                        <li key={it} className="flex items-start gap-1.5">
                          <span className="mt-1.5 h-1 w-1 rounded-full bg-[#a8c4a2] shrink-0" />
                          <span className="leading-relaxed">{it}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* FORM */}
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="שם מלא *">
                <input className={inputCls} value={form.clientName} onChange={(e) => upd("clientName", e.target.value)} />
              </Field>
              <Field label="טלפון *">
                <input className={inputCls} dir="ltr" type="tel" value={form.phone} onChange={(e) => upd("phone", e.target.value)} />
              </Field>
              <Field label="אימייל *">
                <input className={inputCls} dir="ltr" type="email" value={form.email} onChange={(e) => upd("email", e.target.value)} />
              </Field>
              <Field label="סוג הצילום">
                <select className={inputCls} value={form.sessionType} onChange={(e) => upd("sessionType", e.target.value)}>
                  <option value="">בחרי…</option>
                  <option>ניו-בורן</option>
                  <option>משפחה</option>
                  <option>הריון</option>
                  <option>סמאש קייק / יום הולדת</option>
                  <option>אישי / בוק תדמית</option>
                  <option>אחר</option>
                </select>
              </Field>
              <Field label="תאריך ושעה מבוקשים">
                <input className={inputCls} value={form.sessionDate} onChange={(e) => upd("sessionDate", e.target.value)} placeholder="למשל: 12.8 בשעה 09:00" />
              </Field>
              <Field label="מספר משתתפים">
                <input className={inputCls} value={form.peopleCount} onChange={(e) => upd("peopleCount", e.target.value)} />
              </Field>
              <Field label="גיל התינוק (אם רלוונטי)">
                <input className={inputCls} value={form.babyAge} onChange={(e) => upd("babyAge", e.target.value)} />
              </Field>
              <Field label="מותג / דגם מצלמה">
                <input className={inputCls} value={form.cameraBrand} onChange={(e) => upd("cameraBrand", e.target.value)} />
              </Field>
              <Field label="ניסיון עם פלאש / סטודיו" full>
                <select className={inputCls} value={form.flashExperience} onChange={(e) => upd("flashExperience", e.target.value)}>
                  <option value="">בחרי…</option>
                  <option>יש לי ניסיון עצמאי</option>
                  <option>יש לי ניסיון בסיסי</option>
                  <option>אין ניסיון — אשמח להדרכה</option>
                </select>
              </Field>
              <Field label="זקוקה לאביזרים בהשכרה?" full>
                <input className={inputCls} value={form.needProps} onChange={(e) => upd("needProps", e.target.value)} placeholder="פרטי בקצרה + מק״טים אם רלוונטי" />
              </Field>
              <Field label="בקשות מיוחדות / הערות" full>
                <textarea className={inputCls} rows={3} value={form.specialRequests} onChange={(e) => upd("specialRequests", e.target.value)} />
              </Field>
            </div>

            <label className="mt-4 flex items-start gap-2.5 text-xs text-[#2d3d2b]/85 cursor-pointer leading-relaxed bg-[#a8c4a2]/20 border border-[#a8c4a2]/40 rounded-xl p-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[#6b8a63]"
                checked={form.agreed}
                onChange={(e) => upd("agreed", e.target.checked)}
              />
              <span><strong>קראתי והסכמתי</strong> להסכם תיאום הציפיות ולכל כללי הסטודיו המפורטים מעלה (שעות פעילות, מחירון, ביטולים, ניקיון, אחריות ונזקים).</span>
            </label>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={sendIntake}
                disabled={submitting}
                className="rounded-full bg-[#2d3d2b] hover:bg-[#1f2b1e] text-[#f8ede4] px-7 py-3.5 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {submitting ? "שולח…" : "שליחה והמשך לקביעת שעה"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-full border border-[#2d3d2b]/25 text-[#2d3d2b] px-7 py-3.5 text-sm font-medium hover:bg-white/50 transition-colors"
              >
                ביטול
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl bg-white border border-[#2d3d2b]/15 px-3.5 py-2.5 text-sm text-[#2d3d2b] outline-none focus:border-[#6b8a63] focus:ring-2 focus:ring-[#a8c4a2]/30 transition-colors";

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1.5 ${full ? "md:col-span-2" : ""}`}>
      <span className="text-xs font-semibold text-[#2d3d2b]/70 tracking-wide">{label}</span>
      {children}
    </label>
  );
}

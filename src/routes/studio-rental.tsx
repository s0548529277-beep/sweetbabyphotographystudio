import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  Clock, CreditCard, CalendarDays, Sparkles, Lightbulb, Palette,
  Sparkle, ShieldCheck, ArrowLeft, X, ChevronDown, MapPin, Star,
  AlertTriangle, Mail,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/studio-rental")({
  head: () => ({
    meta: [
      { title: "השכרת סטודיו | Sweetbaby" },
      {
        name: "description",
        content:
          "השכרת סטודיו בוטיק בבית שמש לצילומי ניו-בורן, משפחה והיריון. מחירון שקוף, כללי הסטודיו וקביעת תור אונליין.",
      },
      { property: "og:title", content: "השכרת סטודיו | Sweetbaby" },
      { property: "og:description", content: "חלל בוטיק מאובזר, תאורה מקצועית ואווירה שקטה — לצלמות שמחפשות סטודיו איכותי בבית שמש." },
      { property: "og:url", content: "https://sweetbabyphotographystudio.lovable.app/studio-rental" },
    ],
    links: [{ rel: "canonical", href: "https://sweetbabyphotographystudio.lovable.app/studio-rental" }],
  }),
  component: StudioRentalPage,
});

const EMAIL_TO = "s0548529277@gmail.com";
const SCHEDULING_SRC =
  "https://calendar.google.com/calendar/appointments/schedules/AcZssZ2J4Zlqx74R4VNrX-c1vMtFEW3R6nu0gtk_pOxYuNiBTAaR47teUZfy1T59zzhkaPB2wB_9ukBE?gv=true";

type IntakeForm = {
  clientName: string;
  phone: string;
  email: string;
  sessionType: string;
  sessionDate: string;
  peopleCount: string;
  babyAge: string;
  cameraBrand: string;
  flashExperience: string;
  needProps: string;
  specialRequests: string;
  agreed: boolean;
};

const emptyForm: IntakeForm = {
  clientName: "", phone: "", email: "", sessionType: "", sessionDate: "",
  peopleCount: "", babyAge: "", cameraBrand: "", flashExperience: "",
  needProps: "", specialRequests: "", agreed: false,
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.7, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] as const } }),
};

const infoCards = [
  {
    icon: Clock,
    title: "שעות פעילות",
    items: [
      "ימים א׳–ה׳: 8:00–23:00",
      "יום ו׳ / ערב חג: 8:00 עד שעתיים לפני כניסת השבת",
      "מוצ״ש / חג: משעה אחרי צאת השבת/חג",
    ],
  },
  {
    icon: CreditCard,
    title: "מחירון וחישוב שעות",
    items: [
      "שעת השכרה ראשונה: 120 ₪",
      "כל שעה נוספת: 90 ₪",
      "מבצע 8:00–13:00 (ניו-בורן): 3 שעות ב-240 ₪",
      "מינימום: שעה (2 חצאי שעות)",
      "עיכוב 15+ דקות – חצי שעה נוספת",
      "עיכוב 45+ דקות – שעה מלאה נוספת",
    ],
  },
  {
    icon: CalendarDays,
    title: "תשלום וביטולים",
    items: [
      "שריון מועד: מקדמה 90 ₪ (לא מוחזרת)",
      "בנק 12, סניף 533, חשבון 648912 (מיכל סיבוני)",
      "יש לשלוח צילום אישור העברה למייל",
      "הזמנה ליום ההגעה: תשלום מלא מראש",
      "יתרה: פייבוקס / העברה / מזומן בסיום",
      "ביטול ביום האירוע – חיוב מלא",
    ],
  },
  {
    icon: Sparkles,
    title: "מה מחכה לך בסטודיו",
    items: [
      "מיזוג + מפזר חום ייעודי לניו-בורן",
      "שידת החתלה חדשה עם עיטופים ובדים",
      "קופסת ציוד: משדר, סוללה, שוֶשר, דבקים, אטבים",
      "שירותים בקומה 5, דירה 18",
    ],
  },
  {
    icon: Lightbulb,
    title: "תאורה וציוד מקצועי",
    items: [
      "פלאש Godox AD200 PRO (סוללה נטענת)",
      "משדרים ל-Canon ול-Sony",
      "סופטבוקס בקוטר 1.65 מטר",
      "* השימוש בפלאש דורש ידע מוקדם",
    ],
  },
  {
    icon: Palette,
    title: "רקעים ורצפות",
    items: [
      "רקעים: ירוק, לבן (2.7), כחול, חום בהיר, חום כהה, צהוב (1.5)",
      "רקעי נייר – לקירות בלבד",
      "שימוש ברקע נייר גם כרצפה: +50 ₪",
      "רקע שהתלכלך/נהרס: 100 ₪ למטר",
      "רצפות כלולות: פורמייקה, עץ, פרקט, קורות",
    ],
  },
  {
    icon: Sparkle,
    title: "סדר וניקיון",
    items: [
      "הסטודיו נמסר נקי ומסודר",
      "יש להחזירו למצבו המקורי",
      "בלגן/לכלוך – חיוב 150 ₪ דמי ניקיון",
    ],
  },
  {
    icon: ShieldCheck,
    title: "אחריות ונזקים",
    items: [
      "נזק לרכוש: עלות תיקון + 20% דמי טיפול",
      "הבטיחות באחריות השוכר בלבד",
      "השארת אור/מזגן דולק – 7 ₪ לשעה עד 8:00",
      "חפצים שיישכחו 30 יום – יעברו למאגר",
    ],
  },
];

function StudioRentalPage() {
  const [showForm, setShowForm] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [form, setForm] = useState<IntakeForm>(emptyForm);
  const upd = <K extends keyof IntakeForm>(k: K, v: IntakeForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const sendIntake = () => {
    if (!form.clientName.trim() || !form.phone.trim() || !form.email.trim()) {
      alert("נא למלא שם, טלפון ואימייל.");
      return;
    }
    if (!form.agreed) {
      alert("יש לאשר את הסכם תיאום הציפיות לפני השליחה.");
      return;
    }
    const lines = [
      `שם מלא: ${form.clientName}`,
      `טלפון: ${form.phone}`,
      `אימייל: ${form.email}`,
      `סוג הצילום: ${form.sessionType}`,
      `תאריך/שעה מבוקשים: ${form.sessionDate}`,
      `מספר משתתפים: ${form.peopleCount}`,
      `גיל התינוק (אם רלוונטי): ${form.babyAge}`,
      `מותג מצלמה: ${form.cameraBrand}`,
      `ניסיון בעבודה עם פלאש/סטודיו: ${form.flashExperience}`,
      `זקוקה לאביזרים בהשכרה: ${form.needProps}`,
      `בקשות מיוחדות: ${form.specialRequests}`,
      ``,
      `אישרתי שקראתי והסכמתי להסכם תיאום הציפיות ולכללי הסטודיו.`,
    ].join("\n");
    const subject = `הסכם תיאום ציפיות - ${form.clientName}`;
    window.location.href = `mailto:${EMAIL_TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines)}`;
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f8ede4] text-[#2d3d2b] overflow-hidden" style={{ fontFamily: "'Fira Sans', sans-serif" }}>
      <Header />

      {/* HERO */}
      <section className="relative" dir="rtl">
        <motion.div
          aria-hidden
          className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-[#f5d5cf] blur-3xl opacity-70"
          animate={{ y: [0, 30, 0], x: [0, -20, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="absolute top-40 -left-32 h-[28rem] w-[28rem] rounded-full bg-[#a8c4a2] blur-3xl opacity-40"
          animate={{ y: [0, -25, 0], x: [0, 15, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="relative container-page pt-14 md:pt-20 pb-10">
          <motion.div initial="hidden" animate="show" variants={fadeUp} className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/70 backdrop-blur px-4 py-1.5 border border-[#2d3d2b]/10">
              <Star className="h-3.5 w-3.5 fill-[#a8c4a2] text-[#a8c4a2]" />
              <span className="text-[11px] tracking-[0.28em] uppercase text-[#2d3d2b]/70 font-medium">
                Studio Rental · בית שמש
              </span>
            </div>
            <h1
              className="mt-6 text-[2.8rem] leading-[1.05] md:text-[4.8rem] md:leading-[1] text-[#2d3d2b]"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              השכרת <em className="not-italic text-[#6b8a63]">הסטודיו</em>
            </h1>
            <p className="mt-6 text-lg md:text-xl text-[#2d3d2b]/75 max-w-2xl leading-relaxed">
              חלל בוטיק שקט ומאובזר לצלמות — תאורה מקצועית, רקעים, פרופס בסיסי ואווירה שמזמינה יצירה. מחירון שקוף, יומן פתוח, וכל הפרטים החשובים לפני שמסמנים תאריך.
            </p>
            <div className="mt-8 flex flex-wrap gap-3 text-xs tracking-[0.22em] uppercase text-[#2d3d2b]/60">
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-[#6b8a63]" /> תלמוד ירושלמי 24</span>
              <span className="w-px bg-[#2d3d2b]/20" />
              <span>Godox AD200 PRO</span>
              <span className="w-px bg-[#2d3d2b]/20" />
              <span>6 רקעים · 4 רצפות</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* PRICING CARDS */}
      <section className="container-page pb-6" dir="rtl">
        <div className="grid md:grid-cols-2 gap-6 md:gap-8">
          <motion.div
            initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} custom={0} variants={fadeUp}
            className="bg-white rounded-[2rem] border border-[#2d3d2b]/5 p-8 md:p-10 relative overflow-hidden group"
          >
            <div className="absolute -top-16 -left-16 h-48 w-48 rounded-full bg-[#f5d5cf]/60 blur-2xl" />
            <div className="relative">
              <div className="text-[11px] tracking-[0.28em] uppercase text-[#6b8a63] mb-3">01 · Flexible</div>
              <h3 className="text-3xl md:text-4xl text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>
                שעתי גמיש
              </h3>
              <div className="mt-6 flex items-baseline gap-2">
                <span className="text-5xl text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>₪120</span>
                <span className="text-sm text-[#2d3d2b]/60">/ שעה ראשונה</span>
              </div>
              <ul className="mt-6 space-y-2.5 text-sm text-[#2d3d2b]/80">
                {["כל שעה נוספת: 90 ₪ בלבד", "חצאי שעות בחישוב יחסי", "מינימום: שעה (2 חצאי שעות)", "מתאים למשפחה, היריון וילדים"].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#a8c4a2] shrink-0" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>

          <motion.div
            initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} custom={1} variants={fadeUp}
            className="bg-[#2d3d2b] text-[#f8ede4] rounded-[2rem] p-8 md:p-10 relative overflow-hidden"
          >
            <div className="absolute top-10 -left-16 h-48 w-48 rounded-full bg-[#a8c4a2]/30 blur-2xl" />
            <div className="absolute bottom-0 right-0 h-40 w-40 rounded-full bg-[#f5d5cf]/20 blur-2xl" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <div className="text-[11px] tracking-[0.28em] uppercase text-[#a8c4a2] mb-3">02 · Morning Special</div>
                <span className="text-[10px] tracking-[0.22em] uppercase bg-[#f5d5cf] text-[#2d3d2b] px-3 py-1 rounded-full font-semibold">מומלץ לניוברן</span>
              </div>
              <h3 className="text-3xl md:text-4xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
                מבצע בוקר ניו-בורן
              </h3>
              <div className="mt-6 flex items-baseline gap-2">
                <span className="text-5xl" style={{ fontFamily: "'DM Serif Display', serif" }}>₪240</span>
                <span className="text-sm text-[#f8ede4]/70">/ 3 שעות</span>
              </div>
              <ul className="mt-6 space-y-2.5 text-sm text-[#f8ede4]/85">
                {["תקף בין 8:00 ל-13:00 בלבד", "הזמן השקט והמושלם לניוברן", "חיסכון משמעותי במחיר לשעה", "3 שעות רצופות של יצירה"].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#f5d5cf] shrink-0" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </div>
      </section>

      {/* BOOKING + INFO */}
      <section className="container-page py-12 md:py-16" dir="rtl">
        <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-8">
          {/* Booking box */}
          <motion.div
            initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={fadeUp}
            className="bg-white rounded-[2rem] border border-[#2d3d2b]/5 overflow-hidden shadow-[0_20px_60px_-30px_rgba(45,61,43,0.35)]"
          >
            <div className="p-8 md:p-10 border-b border-[#2d3d2b]/5">
              <div className="text-[11px] tracking-[0.28em] uppercase text-[#6b8a63] mb-3">Booking</div>
              <h2 className="text-3xl md:text-4xl text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>
                קביעת תור בסטודיו
              </h2>

              <div className="mt-6 flex gap-3 items-start bg-[#f5d5cf]/50 border border-[#f5d5cf] rounded-2xl p-4">
                <AlertTriangle className="h-5 w-5 text-[#8b3a2a] mt-0.5 shrink-0" />
                <div className="text-sm text-[#2d3d2b]/85 leading-relaxed">
                  לא ניתן לקבוע תור לפני שליחת <strong>הסכם תיאום ציפיות</strong> במייל. קביעת שעה ביומן מהווה הסכמה מלאה לכללי הסטודיו ולהסכם.
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="mt-5 w-full inline-flex items-center justify-center gap-3 rounded-full bg-[#2d3d2b] text-[#f8ede4] px-7 py-4 text-base font-medium hover:bg-[#1f2b1e] transition-all group"
              >
                <Mail className="h-4 w-4" />
                <span>מילוי ושליחת הסכם תיאום ציפיות</span>
                <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
              </button>

              <p className="mt-5 text-sm text-[#2d3d2b]/65">
                לאחר שליחת ההסכם — בוחרים שעה פנויה (מינימום 2 חצאי שעות) והתור נכנס אוטומטית ליומן.
              </p>
            </div>

            <div className="bg-[#f8ede4]/60">
              <iframe
                src={SCHEDULING_SRC}
                style={{ border: 0 }}
                width="100%"
                height={640}
                title="Google Calendar Appointment Scheduling"
              />
            </div>

            <div className="p-6 text-center text-sm text-[#2d3d2b]/70 border-t border-[#2d3d2b]/5">
              לשאלות לפני קביעת התור:{" "}
              <a href={`mailto:${EMAIL_TO}`} className="font-semibold text-[#2d3d2b] underline decoration-[#f5d5cf] decoration-2 underline-offset-4">
                {EMAIL_TO}
              </a>
            </div>
          </motion.div>

          {/* Info cards */}
          <div className="space-y-5">
            <motion.div
              initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} variants={fadeUp}
              className="bg-[#a8c4a2]/20 border border-[#a8c4a2]/40 rounded-[2rem] p-7"
            >
              <div className="text-[11px] tracking-[0.28em] uppercase text-[#6b8a63] mb-2">Welcome</div>
              <h3 className="text-2xl text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>
                ברוכות הבאות לסטודיו שלנו
              </h3>
              <p className="mt-3 text-sm text-[#2d3d2b]/75 leading-relaxed">
                איזה כיף שאת באה ליצור אצלנו. ריכזנו כאן את כל הפרטים שיעזרו לך להרגיש בבית — הציוד, הכללים, וכל מה שחשוב לדעת מראש.
              </p>
            </motion.div>

            {infoCards.map((c, i) => (
              <motion.div
                key={c.title} custom={i} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={fadeUp}
                className="bg-white rounded-[2rem] border border-[#2d3d2b]/5 p-7 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-full bg-[#f5d5cf]/60 flex items-center justify-center">
                    <c.icon className="h-5 w-5 text-[#6b8a63]" />
                  </div>
                  <h4 className="text-xl text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>
                    {c.title}
                  </h4>
                </div>
                <ul className="space-y-2 text-sm text-[#2d3d2b]/80">
                  {c.items.map((t) => (
                    <li key={t} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#a8c4a2] shrink-0" />
                      <span className="leading-relaxed">{t}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}

            <motion.div
              initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={fadeUp}
              className="bg-[#2d3d2b] text-[#f8ede4] rounded-[2rem] p-7 relative overflow-hidden"
            >
              <div className="absolute -top-10 -left-10 h-32 w-32 rounded-full bg-[#a8c4a2]/30 blur-2xl" />
              <div className="relative">
                <div className="text-[11px] tracking-[0.28em] uppercase text-[#a8c4a2] mb-2">Add-on</div>
                <h4 className="text-2xl mb-2" style={{ fontFamily: "'DM Serif Display', serif" }}>
                  צריכה גם אביזרים?
                </h4>
                <p className="text-sm text-[#f8ede4]/75 leading-relaxed">
                  קטלוג של 400+ פריטים — וינטג׳, מקרמה, סרוגים ועבודות יד. מוסיפים לסל וסוגרים ביחד עם הסטודיו.
                </p>
                <Link
                  to="/rental-catalog"
                  className="mt-5 inline-flex items-center gap-2 bg-[#f5d5cf] text-[#2d3d2b] px-5 py-3 rounded-full text-sm font-semibold hover:bg-[#f8ede4] transition-colors group"
                >
                  לקטלוג האביזרים
                  <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <Footer />

      {/* INTAKE MODAL */}
      {showForm && (
        <div
          className="fixed inset-0 bg-[#2d3d2b]/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 md:p-6"
          onClick={() => setShowForm(false)}
          dir="rtl"
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="bg-[#f8ede4] rounded-[2rem] p-6 md:p-9 max-w-3xl w-full max-h-[92vh] overflow-y-auto relative shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            style={{ fontFamily: "'Fira Sans', sans-serif" }}
          >
            <button
              onClick={() => setShowForm(false)}
              aria-label="סגירה"
              className="absolute top-4 left-4 h-10 w-10 rounded-full bg-white/80 hover:bg-white flex items-center justify-center text-[#2d3d2b]"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-[11px] tracking-[0.28em] uppercase text-[#6b8a63] mb-2">Coordination</div>
            <h2 className="text-3xl md:text-4xl text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>
              הסכם תיאום ציפיות
            </h2>
            <p className="mt-3 text-sm text-[#2d3d2b]/75 leading-relaxed">
              נא למלא את הפרטים ולשלוח במייל. <strong>שליחת ההסכם היא תנאי לקביעת התור.</strong> קביעת שעה ביומן מהווה הסכמה מלאה לכללי הסטודיו ולתנאים המפורטים בעמוד.
            </p>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="שם מלא *"><input value={form.clientName} onChange={(e) => upd("clientName", e.target.value)} className={inputCls} /></Field>
              <Field label="טלפון *"><input type="tel" value={form.phone} onChange={(e) => upd("phone", e.target.value)} className={inputCls} /></Field>
              <Field label="אימייל *" full><input type="email" value={form.email} onChange={(e) => upd("email", e.target.value)} className={inputCls} /></Field>

              <Field label="סוג הצילום">
                <select value={form.sessionType} onChange={(e) => upd("sessionType", e.target.value)} className={inputCls}>
                  <option value="">בחרי...</option>
                  <option>ניו-בורן</option>
                  <option>גיל שנה / חלאקה</option>
                  <option>היריון</option>
                  <option>משפחה</option>
                  <option>ילדים</option>
                  <option>אחר</option>
                </select>
              </Field>
              <Field label="תאריך ושעה מבוקשים">
                <input value={form.sessionDate} onChange={(e) => upd("sessionDate", e.target.value)} placeholder="לדוגמה: 15.7.26 ב-10:00" className={inputCls} />
              </Field>

              <Field label="מספר משתתפים"><input value={form.peopleCount} onChange={(e) => upd("peopleCount", e.target.value)} className={inputCls} /></Field>
              <Field label="גיל התינוק (אם רלוונטי)">
                <input value={form.babyAge} onChange={(e) => upd("babyAge", e.target.value)} placeholder="לדוגמה: 10 ימים" className={inputCls} />
              </Field>

              <Field label="מותג מצלמה">
                <select value={form.cameraBrand} onChange={(e) => upd("cameraBrand", e.target.value)} className={inputCls}>
                  <option value="">בחרי...</option>
                  <option>Canon</option>
                  <option>Sony</option>
                  <option>Nikon</option>
                  <option>אחר</option>
                </select>
              </Field>
              <Field label="ניסיון בפלאש/סטודיו">
                <select value={form.flashExperience} onChange={(e) => upd("flashExperience", e.target.value)} className={inputCls}>
                  <option value="">בחרי...</option>
                  <option>כן, מנוסה</option>
                  <option>מעט ניסיון</option>
                  <option>אין ניסיון – אשתמש באור טבעי</option>
                </select>
              </Field>

              <Field label="זקוקה גם לאביזרים בהשכרה?" full>
                <select value={form.needProps} onChange={(e) => upd("needProps", e.target.value)} className={inputCls}>
                  <option value="">בחרי...</option>
                  <option>כן — אעבור לקטלוג האביזרים</option>
                  <option>לא</option>
                </select>
              </Field>

              <Field label="בקשות מיוחדות / הערות" full>
                <textarea rows={3} value={form.specialRequests} onChange={(e) => upd("specialRequests", e.target.value)} className={inputCls} />
              </Field>

              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={() => setShowRules((v) => !v)}
                  aria-expanded={showRules}
                  className="w-full flex items-center justify-between gap-3 bg-[#f5d5cf]/60 border border-[#f5d5cf] rounded-2xl px-5 py-4 text-sm font-semibold text-[#2d3d2b] hover:bg-[#f5d5cf]/80 transition-colors"
                >
                  <span>{showRules ? "הסתרת כללי הסטודיו" : "לצפייה בכללי הסטודיו המלאים לפני האישור"}</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showRules ? "rotate-180" : ""}`} />
                </button>
                {showRules && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    className="mt-3 bg-white rounded-2xl border border-[#2d3d2b]/10 p-5 max-h-80 overflow-y-auto text-sm leading-relaxed"
                  >
                    {rulesBlocks.map((b) => (
                      <div key={b.title} className="mb-4 last:mb-0">
                        <h5 className="font-semibold text-[#2d3d2b] mb-1.5" style={{ fontFamily: "'DM Serif Display', serif", fontSize: "1.05rem" }}>
                          {b.title}
                        </h5>
                        <ul className="space-y-1 text-[#2d3d2b]/80">
                          {b.items.map((t) => (
                            <li key={t} className="flex items-start gap-2">
                              <span className="mt-1.5 h-1 w-1 rounded-full bg-[#a8c4a2] shrink-0" />
                              <span>{t}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </motion.div>
                )}
              </div>

              <label className="md:col-span-2 flex items-start gap-3 bg-[#a8c4a2]/20 border border-[#a8c4a2]/50 rounded-2xl p-4 text-sm text-[#2d3d2b]/85 leading-relaxed cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.agreed}
                  onChange={(e) => upd("agreed", e.target.checked)}
                  className="mt-1 h-4 w-4 accent-[#2d3d2b] shrink-0"
                />
                <span>
                  קראתי והבנתי את כללי הסטודיו, המחירון, מדיניות הביטולים, האחריות לנזקים וההנחיות לניקיון. ידוע לי שקביעת מועד ביומן מהווה הסכמה מלאה להסכם זה ולכל הכללים.
                </span>
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={sendIntake}
                className="inline-flex items-center gap-2 rounded-full bg-[#2d3d2b] text-[#f8ede4] px-7 py-3.5 text-sm font-medium hover:bg-[#1f2b1e] transition-colors"
              >
                <Mail className="h-4 w-4" />
                שליחת ההסכם במייל
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

const rulesBlocks = [
  { title: "🕒 שעות פעילות", items: [
    "ימים א׳–ה׳: 8:00–23:00",
    "יום ו׳ / ערב חג: 8:00 עד שעתיים לפני כניסת השבת/חג",
    "מוצ״ש / חג: משעה אחרי צאת השבת/חג",
  ]},
  { title: "💳 מחירון וחישוב שעות", items: [
    "שעת השכרה ראשונה: 120 ₪",
    "כל שעה נוספת: 90 ₪",
    "מבצע 8:00–13:00 (ניו-בורן): 3 שעות ב-240 ₪",
    "מינימום הזמנה: שעה (2 חצאי שעות)",
    "עיכוב 15+ דקות – חצי שעה נוספת",
    "עיכוב 45+ דקות – שעה מלאה נוספת",
    "ספירת הזמן כוללת התארגנות וניקיון בסיום",
  ]},
  { title: "📅 תשלום ומדיניות ביטולים", items: [
    "שריון מועד: מקדמה 90 ₪ (לא מוחזרת)",
    "העברה בנקאית: בנק 12, סניף 533, חשבון 648912 (מיכל סיבוני)",
    "יש לשלוח צילום אישור העברה למייל",
    "הזמנה ליום ההגעה: תשלום מלא מראש",
    "יתרה: פייבוקס / העברה / מזומן בסיום",
    "ביטול/שינוי עד ליום האירוע: המקדמה לא מוחזרת",
    "ביטול ביום האירוע: חיוב מלא (100%)",
  ]},
  { title: "✨ ציוד ותאורה", items: [
    "פלאש Godox AD200 PRO (סוללה נטענת)",
    "משדרים ל-Canon ול-Sony",
    "סופטבוקס בקוטר 1.65 מטר",
    "מיזוג + מפזר חום ייעודי לניו-בורן",
    "שידת החתלה חדשה עם עיטופים ובדים",
  ]},
  { title: "🎨 רקעים ורצפות", items: [
    "רקעים: ירוק, לבן (2.7), כחול, חום בהיר, חום כהה, צהוב (1.5)",
    "רקעי נייר – לקירות בלבד",
    "שימוש ברקע נייר גם כרצפה: +50 ₪",
    "רקע שהתלכלך/נהרס: 100 ₪ למטר",
    "רצפות ללא תוספת: פורמייקה, עץ, פרקט, קורות עץ",
  ]},
  { title: "🧹 סדר וניקיון", items: [
    "הסטודיו נמסר נקי ומסודר – יש להחזירו למצבו",
    "בלגן/לכלוך – חיוב 150 ₪ דמי ניקיון",
  ]},
  { title: "🛡️ אחריות ונזקים", items: [
    "נזק לרכוש: עלות תיקון/רכישה + 20% דמי טיפול",
    "הבטיחות באחריות השוכר בלבד",
    "השארת אור/מזגן דולק – 7 ₪ לשעה עד 8:00",
    "חפצים שיישכחו 30 יום – יעברו למאגר",
  ]},
];

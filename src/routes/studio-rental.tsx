import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  Clock, CreditCard, CalendarDays, Sparkles, Lightbulb, Palette,
  Sparkle, ShieldCheck, ArrowLeft, X, ChevronDown, MapPin, Star,
  AlertTriangle, Mail,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";


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
  const [submitting, setSubmitting] = useState(false);
  const nav = useNavigate();
  const { user } = useAuth();
  const upd = <K extends keyof IntakeForm>(k: K, v: IntakeForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const sendIntake = async () => {
    if (!form.clientName.trim() || !form.phone.trim() || !form.email.trim()) {
      toast.error("נא למלא שם, טלפון ואימייל.");
      return;
    }
    if (!form.agreed) {
      toast.error("יש לאשר את הסכם תיאום הציפיות לפני השליחה.");
      return;
    }
    setSubmitting(true);
    try {
      // Save to DB (best-effort — email fallback still runs).
      if (user) {
        await supabase.from("studio_intake_forms").insert({
          user_id: user.id,
          payload: JSON.parse(JSON.stringify(form)),
        });
      }

      // Also open a mailto so a copy reaches the studio owner immediately.
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
      window.open(
        `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(EMAIL_TO)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines)}`,
        "_blank",
        "noopener,noreferrer"
      );

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

        <div className="relative container-page pt-10 md:pt-14 pb-6">
          <motion.div initial="hidden" animate="show" variants={fadeUp} className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/70 backdrop-blur px-4 py-1.5 border border-[#2d3d2b]/10">
              <Star className="h-3.5 w-3.5 fill-[#a8c4a2] text-[#a8c4a2]" />
              <span className="text-[11px] tracking-[0.28em] uppercase text-[#2d3d2b]/70 font-medium">
                Studio Rental · בית שמש
              </span>
            </div>
            <h1
              className="mt-4 text-[2.6rem] leading-[1.05] md:text-[4rem] md:leading-[1] text-[#2d3d2b]"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              השכרת <em className="not-italic text-[#6b8a63]">הסטודיו</em>
            </h1>
            <p className="mt-4 text-base md:text-lg text-[#2d3d2b]/75 max-w-2xl leading-relaxed">
              חלל בוטיק שקט ומאובזר לצלמות — תאורה מקצועית, רקעים, פרופס בסיסי ואווירה שמזמינה יצירה. מחירון שקוף, יומן פתוח, וכל הפרטים החשובים לפני שמסמנים תאריך.
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-xs tracking-[0.22em] uppercase text-[#2d3d2b]/60">
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
      <section className="container-page pb-4" dir="rtl">
        <div className="grid md:grid-cols-2 gap-4 md:gap-5 items-stretch max-w-3xl mx-auto">
          <motion.div
            initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} custom={0} variants={fadeUp}
            className="bg-white rounded-2xl border border-[#2d3d2b]/5 p-4 md:p-5 relative overflow-hidden group h-full flex flex-col"
          >
            <div className="absolute -top-10 -left-10 h-28 w-28 rounded-full bg-[#f5d5cf]/60 blur-2xl" />
            <div className="relative">
              <div className="text-[10px] tracking-[0.24em] uppercase text-[#6b8a63] mb-1">01 · Flexible</div>
              <h3 className="text-lg md:text-xl text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>
                שעתי גמיש
              </h3>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>₪120</span>
                <span className="text-xs text-[#2d3d2b]/60">/ שעה ראשונה</span>
              </div>
              <ul className="mt-2 space-y-1 text-[12px] text-[#2d3d2b]/80">
                {["כל שעה נוספת: 90 ₪", "חצאי שעות בחישוב יחסי", "מתאים למשפחה, היריון וילדים"].map((t) => (
                  <li key={t} className="flex items-start gap-1.5">
                    <span className="mt-1.5 h-1 w-1 rounded-full bg-[#a8c4a2] shrink-0" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>

          <motion.div
            initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} custom={1} variants={fadeUp}
            className="bg-[#f5d5cf] text-[#2d3d2b] rounded-2xl p-4 md:p-5 relative overflow-hidden h-full flex flex-col"
          >
            <div className="absolute top-6 -left-10 h-28 w-28 rounded-full bg-white/40 blur-2xl" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <div className="text-[10px] tracking-[0.24em] uppercase text-[#6b8a63] mb-1">02 · Morning</div>
                <span className="text-[9px] tracking-[0.2em] uppercase bg-[#2d3d2b] text-[#f8ede4] px-2 py-0.5 rounded-full font-semibold">ניוברן</span>
              </div>
              <h3 className="text-lg md:text-xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
                מבצע בוקר ניו-בורן
              </h3>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl" style={{ fontFamily: "'DM Serif Display', serif" }}>₪240</span>
                <span className="text-xs text-[#2d3d2b]/70">/ 3 שעות</span>
              </div>
              <ul className="mt-2 space-y-1 text-[12px] text-[#2d3d2b]/85">
                {["בין 8:00 ל-13:00", "3 שעות רצופות", "חיסכון משמעותי"].map((t) => (
                  <li key={t} className="flex items-start gap-1.5">
                    <span className="mt-1.5 h-1 w-1 rounded-full bg-[#2d3d2b] shrink-0" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </div>

        {/* GUIDANCE ADD-ONS */}
        <div className="mt-10">
          <div className="flex items-end justify-between flex-wrap gap-4 mb-5">
            <div>
              <div className="text-[11px] tracking-[0.3em] uppercase text-[#6b8a63] mb-2">Add-ons · תוספות ליווי</div>
              <h3 className="text-2xl md:text-3xl text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>
                חבילות הדרכה וליווי בסטודיו
              </h3>
            </div>
            <p className="text-sm text-[#2d3d2b]/70 max-w-sm">
              בחרי את רמת הליווי שמתאימה לך — מהדרכה טכנית קצרה ועד מעטפת מלאה של הכנה וזמינות לאורך כל השהות.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4 md:gap-6">
            {[
              {
                tag: "Basic",
                price: 50,
                title: "הדרכה טכנית קצרה",
                desc: "סידור מהיר של הפלאש והמצלמה — יוצאים לצילום בביטחון.",
                bullets: ["הכוונה קצרה לפני התחלה", "סידור פלאש ומצלמה", "מענה על שאלות טכניות"],
                bg: "bg-white",
                accent: "border-[#2d3d2b]/10",
              },
              {
                tag: "Plus",
                price: 100,
                title: "ליווי מקצועי ראשוני",
                desc: "התאמת 2 סטים לצילום בדיוק לצרכים שלך, כולל הכוונה יצירתית.",
                bullets: ["בניית 2 סטים אישיים", "בחירת אביזרים ותאורה", "טיפים לצילום איכותי"],
                bg: "bg-[#a8c4a2]/25",
                accent: "border-[#a8c4a2]/50",
                featured: true,
              },
              {
                tag: "Premium",
                price: 150,
                title: "מעטפת מלאה",
                desc: "הכנת החלל מאפס, תמיכה והסבר טכני מפורט + זמינות במהלך השהות בסטודיו.",
                bullets: ["הכנת חלל מלאה מאפס", "הסבר טכני מפורט", "זמינות לאורך כל הסשן"],
                bg: "bg-[#f5d5cf]",
                accent: "border-[#f5d5cf]",
              },
            ].map((p, i) => (
              <motion.div
                key={p.title}
                initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} custom={i} variants={fadeUp}
                className={`${p.bg} rounded-[1.75rem] p-6 border ${p.accent} relative overflow-hidden`}
              >
                {p.featured && (
                  <span className="absolute top-4 left-4 text-[10px] tracking-[0.22em] uppercase bg-[#2d3d2b] text-[#f8ede4] px-3 py-1 rounded-full font-semibold">
                    הכי פופולרי
                  </span>
                )}
                <div className="text-[11px] tracking-[0.28em] uppercase text-[#6b8a63] mb-2">{p.tag}</div>
                <h4 className="text-xl md:text-2xl text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>
                  {p.title}
                </h4>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>₪{p.price}</span>
                  <span className="text-xs text-[#2d3d2b]/60">תוספת חד-פעמית</span>
                </div>
                <p className="mt-3 text-sm text-[#2d3d2b]/75 leading-relaxed">{p.desc}</p>
                <ul className="mt-4 space-y-2 text-sm text-[#2d3d2b]/85">
                  {p.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#6b8a63] shrink-0" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
          <p className="mt-4 text-xs text-[#2d3d2b]/60 text-center">
            החבילות הן תוספת אופציונלית להשכרת הסטודיו. יש לציין את החבילה הרצויה בטופס תיאום הציפיות.
          </p>
        </div>
      </section>

      {/* BOOKING + INFO */}
      <section className="container-page py-8 md:py-10" dir="rtl">
        <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-6">
          {/* Booking box */}
          <motion.div
            initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={fadeUp}
            className="bg-white rounded-[2rem] border border-[#2d3d2b]/5 overflow-hidden shadow-[0_20px_60px_-30px_rgba(45,61,43,0.35)]"
          >
            <div className="p-6 md:p-8 border-b border-[#2d3d2b]/5">
              <div className="text-[11px] tracking-[0.28em] uppercase text-[#6b8a63] mb-2">Booking</div>
              <h2 className="text-2xl md:text-3xl text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>
                קביעת תור בסטודיו
              </h2>

              <div className="mt-4 flex gap-3 items-start bg-[#f5d5cf]/50 border border-[#f5d5cf] rounded-2xl p-4">
                <AlertTriangle className="h-5 w-5 text-[#8b3a2a] mt-0.5 shrink-0" />
                <div className="text-sm text-[#2d3d2b]/85 leading-relaxed">
                  לא ניתן לקבוע תור לפני שליחת <strong>הסכם תיאום ציפיות</strong> במייל. קביעת שעה ביומן מהווה הסכמה מלאה לכללי הסטודיו ולהסכם.
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="mt-4 w-full inline-flex items-center justify-center gap-3 rounded-full bg-[#2d3d2b] text-[#f8ede4] px-7 py-3.5 text-sm font-medium hover:bg-[#1f2b1e] transition-all group"
              >
                <Mail className="h-4 w-4" />
                <span>מילוי ושליחת הסכם תיאום ציפיות</span>
                <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
              </button>

              <p className="mt-4 text-sm text-[#2d3d2b]/65">
                לאחר שליחת ההסכם — בוחרים שעה פנויה (מינימום 2 חצאי שעות) והתור נכנס אוטומטית ליומן.
              </p>
            </div>

            <div className="bg-[#f8ede4]/60 p-8 text-center">
              <p className="text-sm text-[#2d3d2b]/75 leading-relaxed mb-5 max-w-md mx-auto">
                בחרי תאריך ושעה בלוח השנה שלנו — השריון ייכנס אוטומטית ליומן, בדיוק כמו קודם.
              </p>
              <Link
                to="/booking"
                className="inline-flex items-center justify-center gap-3 rounded-full bg-[#2d3d2b] text-[#f8ede4] px-7 py-3.5 text-sm font-medium hover:bg-[#1f2b1e] transition-all"
              >
                לבחירת תאריך ושעה
              </Link>
            </div>

            <div className="p-5 text-center text-sm text-[#2d3d2b]/70 border-t border-[#2d3d2b]/5">
              לשאלות לפני קביעת התור:{" "}
              <a href={`mailto:${EMAIL_TO}`} className="font-semibold text-[#2d3d2b] underline decoration-[#f5d5cf] decoration-2 underline-offset-4">
                {EMAIL_TO}
              </a>
            </div>
          </motion.div>

          {/* Info cards */}
          <div className="space-y-4">
            <motion.div
              initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} variants={fadeUp}
              className="bg-[#a8c4a2]/20 border border-[#a8c4a2]/40 rounded-[2rem] p-5"
            >
              <div className="text-[11px] tracking-[0.28em] uppercase text-[#6b8a63] mb-1">Welcome</div>
              <h3 className="text-xl text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>
                ברוכות הבאות לסטודיו שלנו
              </h3>
              <p className="mt-2 text-sm text-[#2d3d2b]/75 leading-relaxed">
                איזה כיף שאת באה ליצור אצלנו. ריכזנו כאן את כל הפרטים שיעזרו לך להרגיש בבית — הציוד, הכללים, וכל מה שחשוב לדעת מראש.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
              {infoCards.map((c, i) => (
                <motion.div
                  key={c.title} custom={i} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={fadeUp}
                  className="bg-white rounded-[2rem] border border-[#2d3d2b]/5 p-5 hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-9 w-9 rounded-full bg-[#f5d5cf]/60 flex items-center justify-center">
                      <c.icon className="h-5 w-5 text-[#6b8a63]" />
                    </div>
                    <h4 className="text-lg text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>
                      {c.title}
                    </h4>
                  </div>
                  <ul className="space-y-1.5 text-sm text-[#2d3d2b]/80">
                    {c.items.map((t) => (
                      <li key={t} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#a8c4a2] shrink-0" />
                        <span className="leading-relaxed">{t}</span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </div>

            <motion.div
              initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={fadeUp}
              className="bg-[#2d3d2b] text-[#f8ede4] rounded-[2rem] p-5 relative overflow-hidden"
            >
              <div className="absolute -top-10 -left-10 h-32 w-32 rounded-full bg-[#a8c4a2]/30 blur-2xl" />
              <div className="relative">
                <div className="text-[11px] tracking-[0.28em] uppercase text-[#a8c4a2] mb-1">Add-on</div>
                <h4 className="text-xl mb-2" style={{ fontFamily: "'DM Serif Display', serif" }}>
                  צריכה גם אביזרים?
                </h4>
                <p className="text-sm text-[#f8ede4]/75 leading-relaxed">
                  קטלוג של 400+ פריטים — וינטג׳, מקרמה, סרוגים ועבודות יד. מוסיפים לסל וסוגרים ביחד עם הסטודיו.
                </p>
                <Link
                  to="/rental-catalog"
                  className="mt-4 inline-flex items-center gap-2 bg-[#f5d5cf] text-[#2d3d2b] px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-[#f8ede4] transition-colors group"
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
              נא למלא ולשלוח את הטופס למטה. <strong>שליחת ההסכם היא תנאי לקביעת התור.</strong> קביעת שעה ביומן מהווה הסכמה מלאה לכללי הסטודיו ולתנאים המפורטים בעמוד.
            </p>

            <div className="mt-6 rounded-2xl overflow-hidden bg-white border border-[#2d3d2b]/10">
              <iframe
                src="https://docs.google.com/forms/d/e/1FAIpQLSdVqfjJ53OzK55mXvEeExdHp0lEWFN7RJgwtG7OSqD94KjEhg/viewform?embedded=true"
                width="100%"
                height="900"
                frameBorder={0}
                marginHeight={0}
                marginWidth={0}
                title="הסכם תיאום ציפיות"
                className="w-full block"
              >
                בטעינה…
              </iframe>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-full border border-[#2d3d2b]/25 text-[#2d3d2b] px-7 py-3.5 text-sm font-medium hover:bg-white/50 transition-colors"
              >
                סגירה
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

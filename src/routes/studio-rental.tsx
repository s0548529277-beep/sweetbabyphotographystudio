import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Clock, CreditCard, CalendarDays, Sparkles, ArrowLeft, X, MapPin, Star, AlertTriangle } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/lib/auth";
import { useProfilePrefill } from "@/hooks/use-profile";
import { saveContactHandoff } from "@/lib/contact-handoff";
import { submitStudioIntake } from "@/lib/studio-intake.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { InspirationStrip } from "@/components/InspirationStrip";
import { usePageGallery, PAGE_IMAGE_KEYS } from "@/lib/page-images";
import { PayOnlineButton } from "@/components/PayOnlineButton";



export const Route = createFileRoute("/studio-rental")({
  head: () => ({
    meta: [
      { title: "השכרת סטודיו | Sweetbaby" },
      { name: "description", content: "השכרת סטודיו בוטיק בבית שמש לצילומי ניו-בורן, משפחה והיריון. מחירון שקוף וקביעת תור אונליין." },
      { property: "og:title", content: "השכרת סטודיו | Sweetbaby" },
      { property: "og:description", content: "חלל בוטיק מאובזר, תאורה מקצועית ואווירה שקטה — לצלמות שמחפשות סטודיו איכותי בבית שמש." },
      { property: "og:url", content: "https://sweetbabyphoto.shop/studio-rental" },
    ],
    links: [{ rel: "canonical", href: "https://sweetbabyphoto.shop/studio-rental" }],
  }),
  component: StudioRentalPage,
});

const EMAIL_TO = "s0548529277@gmail.com";

type IntakeForm = {
  clientName: string; phone: string; email: string;
  sessionType: string; sessionDate: string; peopleCount: string; babyAge: string;
  cameraBrand: string; flashExperience: string; needProps: string; specialRequests: string;
  guidance: string;
  agreed: boolean;
};
const emptyForm: IntakeForm = {
  clientName: "", phone: "", email: "", sessionType: "", sessionDate: "",
  peopleCount: "", babyAge: "", cameraBrand: "", flashExperience: "",
  needProps: "", specialRequests: "", guidance: "basic", agreed: false,
};

const guidanceOptions = [
  { key: "basic", price: 0, tag: "בסיסי", title: "הדרכה קצרה (חינם)", desc: "עד 5 דקות, בכפוף לזמינות או בטלפון." },
  { key: "mini", price: 50, tag: "MINI", title: "הדרכה טכנית קצרצרה", desc: "עד 20 דק׳ בסטודיו פנים אל פנים: הפעלת ציוד, הגדרות מצלמה בסיסיות והתאמת סט אחד." },
  { key: "plus", price: 100, tag: "PLUS", title: "ליווי מקצועי ראשוני", desc: "התאמת 2 סטים לצילום כולל כוונה יצירתית והדרכה טכנית.", featured: true },
  { key: "premium", price: 150, tag: "PREMIUM", title: "מעטפת מלאה", desc: "הכנת חלל מראש + זמינות במהלך כל השהות + סיוע בסידור אביזרים." },
] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] as const } }),
};

// Full studio rules — shown inside the intake modal, matching the printed
// coordination agreement so signing the checkbox = agreeing to everything.
const rulesBlocks: { title: string; items: string[] }[] = [
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
  const studioGallery = usePageGallery(PAGE_IMAGE_KEYS.studioRental);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState<IntakeForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const nav = useNavigate();
  const { user } = useAuth();
  const profile = useProfilePrefill();
  const submitIntake = useServerFn(submitStudioIntake);
  const upd = <K extends keyof IntakeForm>(k: K, v: IntakeForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Prefill from the customer's personal area.
  useEffect(() => {
    if (!profile.loaded) return;
    setForm((f) => ({
      ...f,
      clientName: f.clientName || profile.fullName,
      phone: f.phone || profile.phone,
      email: f.email || profile.email,
    }));
  }, [profile.loaded, profile.fullName, profile.phone, profile.email]);




  const sendIntake = async () => {
    if (!form.clientName.trim() || !form.phone.trim() || !form.email.trim()) {
      toast.error("נא למלא שם, טלפון ואימייל.");
      return;
    }
    if (!form.sessionType.trim()) {
      toast.error("נא לבחור את סוג הצילום.");
      return;
    }
    if (!form.agreed) {
      toast.error("יש לאשר את הסכם תיאום הציפיות לפני השליחה.");
      return;
    }
    if (!user) {
      toast.error("יש להתחבר לפני שליחת הטופס.");
      nav({ to: "/auth" });
      return;
    }

    const guidanceLabel = guidanceOptions.find((g) => g.key === form.guidance);
    setSubmitting(true);
    try {
      await submitIntake({
        data: {
          clientName: form.clientName,
          phone: form.phone,
          email: form.email,
          sessionType: form.sessionType,
          sessionDate: "",
          peopleCount: "",
          babyAge: "",
          cameraBrand: form.cameraBrand,
          flashExperience: form.flashExperience,
          needProps: guidanceLabel ? `${guidanceLabel.tag} · ${guidanceLabel.title}${guidanceLabel.price ? ` (+₪${guidanceLabel.price})` : ""}` : "",
          specialRequests: form.specialRequests,

          agreed: true,
        },
      });
      saveContactHandoff({
        fullName: form.clientName,
        phone: form.phone,
        email: form.email,
        sessionType: form.sessionType,
        guidance: form.guidance,
      });
      toast.success("ההסכם נשמר ✓ ממשיכות לשלב 2 — בחירת תאריך ושעה ביומן.");
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
              <button type="button" onClick={() => setShowForm(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#2d3d2b] text-[#f8ede4] px-4 py-2 text-xs font-semibold">
                בחירת חבילה זו <ArrowLeft className="h-3.5 w-3.5" />
              </button>
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
              <button type="button" onClick={() => { upd("sessionType", "ניו-בורן"); setShowForm(true); }} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#2d3d2b] text-[#f8ede4] px-4 py-2 text-xs font-semibold">
                בחירת חבילה זו <ArrowLeft className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ONLINE PAYMENT */}
      <section className="container-page pb-6" dir="rtl">
        <div className="max-w-3xl mx-auto rounded-2xl bg-white border border-[#2d3d2b]/10 p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>
              תשלום מקדמה / השכרה
            </h3>
            <p className="text-[12px] text-[#2d3d2b]/75 mt-1">
              מקדמה לשריון מועד ₪90 · היתרה בסיום. התשלום מהווה הסכמה ל
              <Link to="/terms" className="underline underline-offset-2">תקנון</Link>.
            </p>
          </div>
          <PayOnlineButton />
        </div>
      </section>



      {/* GUIDANCE ADD-ONS */}
      <section className="container-page pb-6" dir="rtl">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-5">
            <div className="text-[11px] tracking-[0.3em] uppercase text-[#6b8a63] mb-2">Add-ons</div>
            <h3 className="text-2xl md:text-3xl text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>
              חבילות הדרכה וליווי — בחרי חבילה והתחילי
            </h3>
            <p className="mt-2 text-sm text-[#2d3d2b]/70 max-w-xl mx-auto">
              החבילות הן תוספת חד-פעמית מעל מחיר השכרת החלל. לחיצה על חבילה פותחת את התהליך עם החבילה שנבחרה.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {[
              { key: "basic", tag: "בסיסי", price: 0, title: "ללא הדרכה", desc: "השכרת החלל בלבד — הסבר קצר של עד 5 דק׳ בכפוף לזמינות.", bg: "bg-white", accent: "border-[#2d3d2b]/10" },
              { key: "mini", tag: "Mini", price: 50, title: "הדרכה טכנית קצרצרה", desc: "עד 20 דק' בסטודיו: הפעלת פלאש, הגדרות מצלמה בסיסיות והתאמת סט אחד.", bg: "bg-white", accent: "border-[#2d3d2b]/10" },
              { key: "plus", tag: "Plus", price: 100, title: "ליווי מקצועי ראשוני", desc: "התאמת 2 סטים לצילום כולל הכוונה יצירתית והדרכה טכנית.", bg: "bg-[#a8c4a2]/25", accent: "border-[#a8c4a2]/50", featured: true },
              { key: "premium", tag: "Premium", price: 150, title: "מעטפת מלאה", desc: "הכנת חלל מאפס + זמינות במהלך כל השהות + סיוע בסידור אביזרים.", bg: "bg-[#f5d5cf]", accent: "border-[#f5d5cf]" },

            ].map((p, i) => (
              <motion.button
                type="button"
                key={p.title} custom={i} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} variants={fadeUp}
                whileHover={{ y: -4 }}
                onClick={() => { upd("guidance", p.key); setShowForm(true); }}
                className={`${p.bg} rounded-2xl p-5 border ${p.accent} relative text-right cursor-pointer hover:shadow-lg transition-shadow`}
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
                <span className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#2d3d2b]">
                  בחירה והתחלה <ArrowLeft className="h-3.5 w-3.5" />
                </span>
              </motion.button>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-[#2d3d2b]/60 text-center">
המחיר הסופי = השכרת החלל (₪120 שעה ראשונה / ₪90 לכל שעה נוספת, או מבצע בוקר ₪240) + חבילת ההדרכה שנבחרה.
          </p>
        </div>
      </section>

      {/* BOOKING PROCESS */}
      <section className="container-page pb-14" dir="rtl">
        <motion.div
          initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={fadeUp}
          className="max-w-4xl mx-auto bg-white rounded-[2rem] border border-[#2d3d2b]/5 overflow-hidden shadow-[0_20px_60px_-30px_rgba(45,61,43,0.35)]"
        >
          <div className="p-6 md:p-9">
            <div className="text-center">
              <div className="text-[11px] tracking-[0.28em] uppercase text-[#6b8a63] mb-2">Booking Process</div>
              <h2 className="text-2xl md:text-3xl text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>
                איך קובעים תור? 3 שלבים
              </h2>
              <p className="mt-2 text-sm text-[#2d3d2b]/70 max-w-xl mx-auto leading-relaxed">
                התהליך כולו מתבצע כאן באתר — בסיום תקבלי מייל אחד מסודר עם ההסכם, פרטי השריון והתשלום.
              </p>
            </div>

            <div className="mt-7 grid md:grid-cols-3 gap-3 md:gap-4">
              {[
                { n: "01", title: "שאלון והסכם", desc: "ממלאים את הסכם תיאום הציפיות — פרטים, סוג הצילום ואישור כללי הסטודיו.", tone: "bg-[#f5d5cf]/50 border-[#f5d5cf]" },
                { n: "02", title: "קביעת יומן", desc: "בוחרים תאריך ושעה פנויים ביומן החי, משך שהות ואביזרים לשריון (עד 20 חינם).", tone: "bg-[#a8c4a2]/20 border-[#a8c4a2]/50" },
                { n: "03", title: "תשלום מקדמה", desc: "מקדמה 90 ₪ לשריון המועד (ביום ההגעה — תשלום מלא). ואז הכל נסגר.", tone: "bg-[#f8ede4] border-[#2d3d2b]/10" },
              ].map((s) => (
                <div key={s.n} className={`rounded-2xl border p-5 ${s.tone}`}>
                  <div className="text-[10px] tracking-[0.28em] uppercase text-[#6b8a63] mb-1">Step {s.n}</div>
                  <h3 className="text-lg text-[#2d3d2b]" style={{ fontFamily: "'DM Serif Display', serif" }}>{s.title}</h3>
                  <p className="mt-1.5 text-[13px] text-[#2d3d2b]/75 leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex gap-3 items-start bg-[#f8ede4] border border-[#2d3d2b]/10 rounded-2xl p-4">
              <AlertTriangle className="h-5 w-5 text-[#8b3a2a] mt-0.5 shrink-0" />
              <div className="text-sm text-[#2d3d2b]/85 leading-relaxed">
                השאלון וההסכם הם השלב הראשון — מיד לאחר האישור נפתח היומן לבחירת שעה. אישור הטופס = הסכמה מלאה לכל תנאי הסטודיו.
              </div>
            </div>

            <div className="mt-6 flex flex-col items-center gap-3">
              <motion.button
                type="button"
                onClick={() => setShowForm(true)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                className="group relative inline-flex items-center justify-center gap-3 rounded-full bg-gradient-to-r from-[#f5d5cf] via-[#f8c4c0] to-[#f5d5cf] text-[#2d3d2b] px-12 py-5 text-[15px] font-bold shadow-[0_12px_40px_-12px_rgba(245,213,207,0.85)] hover:shadow-[0_18px_50px_-14px_rgba(245,213,207,1)] transition-all overflow-hidden"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/40 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/60 text-[#6b8a63]">
                  <CalendarDays className="h-5 w-5" />
                </span>
                <span className="relative">להתחיל את התהליך · שאלון וקביעת יומן</span>
                <Sparkles className="relative h-4 w-4 text-[#6b8a63] opacity-70 group-hover:opacity-100 transition-opacity" />
              </motion.button>
              <span className="text-[12px] text-[#2d3d2b]/55 font-medium">שלב 1 מתוך 3 · לוקח כדקה</span>
            </div>

            <p className="mt-5 text-xs text-[#2d3d2b]/60 text-center">
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
                <strong className="text-[#f5d5cf]">עד 20 אביזרים שריון חינם</strong> לשעות ההשכרה בסטודיו — ללא תוספת תשלום.
                אנו מתחייבים שכ-80% מהקטלוג יהיה בהישג יד בזמן הצילום (בכפוף לזמינות).
              </p>
              <p className="text-[11px] text-[#f8ede4]/60 mt-2">
                רוצה לשריין אביזרים ספציפיים? ציין/י אותם בהערות בטופס תיאום הציפיות.
              </p>
            </div>
            <div className="flex flex-col items-stretch gap-2">
              <Link
                to="/rental-catalog"
                className="inline-flex items-center justify-center gap-2 bg-[#f5d5cf] text-[#2d3d2b] px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-[#f8ede4] transition-colors group whitespace-nowrap"
              >
                לצפייה בקטלוג
                <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
              </Link>
              <a
                href="#studio-inspiration"
                className="inline-flex items-center justify-center gap-2 border border-[#f5d5cf]/60 text-[#f8ede4] px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-[#f8ede4]/10 transition-colors whitespace-nowrap"
              >
                <Sparkles className="h-3.5 w-3.5" />
                השראה מהסטודיו
              </a>
            </div>
          </div>
        </div>

      </section>

      <section id="studio-inspiration" className="container-page pb-12 scroll-mt-24">
        <InspirationStrip
          images={studioGallery.images}

          title="השראה מהסטודיו"
          subtitle="ככה החלל נראה בפועל — תוכלי לקבל את אותה אווירה בצילומים שלך."
        />
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
              שלב 1 מתוך 3. <strong>אישור ההסכם הוא תנאי לפתיחת היומן</strong> — מיד לאחר השליחה נעבור לבחירת תאריך ושעה.
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
              <Field label="סוג הצילום *">
                <select className={inputCls} value={form.sessionType} onChange={(e) => upd("sessionType", e.target.value)} required>
                  <option value="">בחרי…</option>
                  <option>ניו-בורן</option>
                  <option>משפחה</option>
                  <option>הריון</option>
                  <option>סמאש קייק / יום הולדת</option>
                  <option>אישי / בוק תדמית</option>
                  <option>אחר</option>
                </select>
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

              <Field label="הדרכה וליווי בסטודיו" full>
                <div className="grid gap-2 sm:grid-cols-2">
                  {guidanceOptions.map((g) => {
                    const active = form.guidance === g.key;
                    return (
                      <button
                        type="button"
                        key={g.key}
                        onClick={() => upd("guidance", g.key)}
                        className={`relative text-right rounded-2xl border p-3 transition ${
                          active
                            ? "border-[#6b8a63] bg-[#a8c4a2]/25 shadow-sm"
                            : "border-[#2d3d2b]/15 bg-white/70 hover:border-[#6b8a63]/50"
                        }`}
                      >
                        {"featured" in g && g.featured && (
                          <span className="absolute -top-2 left-3 rounded-full bg-[#e8b4bc] px-2 py-0.5 text-[10px] font-semibold text-[#2d3d2b]">
                            פופולרי
                          </span>
                        )}
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-xs font-bold tracking-wide">{g.tag}</span>
                          <span className="text-xs font-semibold text-[#6b8a63]">
                            {g.price === 0 ? "ללא עלות" : `+₪${g.price}`}
                          </span>
                        </div>
                        <div className="mt-1 text-sm font-medium">{g.title}</div>
                        <p className="mt-1 text-[11px] leading-relaxed text-[#2d3d2b]/70">{g.desc}</p>
                      </button>
                    );
                  })}
                </div>
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
              <span><strong>קראתי והסכמתי</strong> להסכם תיאום הציפיות ולכל כללי הסטודיו המפורטים מעלה (מחירון, ביטולים, ניקיון, אחריות ונזקים).</span>
            </label>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={sendIntake}
                disabled={submitting}
                className="rounded-full bg-[#2d3d2b] hover:bg-[#1f2b1e] text-[#f8ede4] px-7 py-3.5 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {submitting ? "שומר…" : "אישור והמשך ליומן →"}
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

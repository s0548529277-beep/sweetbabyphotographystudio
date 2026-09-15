import { createFileRoute, useNavigate, useRouterState, Link, Outlet } from "@tanstack/react-router";
import { heError } from "@/lib/he-errors";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useProfilePrefill } from "@/hooks/use-profile";
import { EmailDatalist } from "@/components/EmailDatalist";
import { requestPhotographySession } from "@/lib/photography.functions";
import { PAYMENT_LABELS } from "@/lib/photography-options";
import { NEWBORN_PACKAGES, NEWBORN_ADDONS, NEWBORN_TIMELINE_STEPS } from "@/lib/newborn-packages";
import { requestBirthBasketInterest } from "@/lib/newborn-orders.functions";
import { usePageGallery, PAGE_IMAGE_KEYS, useSiteIcon } from "@/lib/page-images";
import { Heart, Phone, Mail, CalendarDays, Check, ShieldCheck, Gift } from "lucide-react";
import michalLogoWordmark from "@/assets/michal-logo-wordmark.png";
import michalLogoFull from "@/assets/michal-logo.png";
import michalLogoAsset from "@/assets/michal-logo.jpg.asset.json";
import michalAnimatedLogoAsset from "@/assets/michal-logo-animated.gif.asset.json";

// Standalone header/footer for this page — deliberately NOT the site-wide
// <Header>/<Footer> (Sweetbaby studio-rental branding + nav). Per explicit
// request: this is her own personal newborn-photography brand ("michal"),
// a separate business from the studio-rental site (Sweetbaby), so it gets
// its own identity here — her real logo — instead of the shared site
// chrome. The phone number below (0534181051) is hers as it appears on
// the logo itself, distinct from the Sweetbaby studio number used
// elsewhere in the app.
const MICHAL_PHONE = "0534181051";

function MichalHeader() {
  return (
    <header dir="rtl" className="border-b border-[#8e693b]/10 bg-[#fdfbf9]/90 backdrop-blur-xl sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-5 h-20 flex items-center justify-between">
        <Link to="/" aria-label="חזרה לעמוד הבית" className="shrink-0">
          <img src={michalAnimatedLogoAsset.url} alt="מיכל סיבוני" className="h-14 w-auto max-w-40 object-contain" />
        </Link>
        <div className="flex items-center gap-3 sm:gap-5 text-sm text-[#5a493c]/80">
          <a href="#packages" className="hidden md:block hover:text-[#8e693b] transition-colors">חבילות</a>
          <a href="#gallery" className="hidden md:block hover:text-[#8e693b] transition-colors">גלריה</a>
          <a href={`tel:${MICHAL_PHONE}`} className="flex items-center gap-1.5 hover:text-[#8e693b] transition-colors" dir="ltr">
            <Phone size={14} /> {MICHAL_PHONE}
          </a>
          <a href="mailto:s0548529277@gmail.com" className="hidden sm:flex items-center gap-1.5 hover:text-[#8e693b] transition-colors">
            <Mail size={14} /> מייל
          </a>
        </div>
      </div>
    </header>
  );
}

function MichalFooter() {
  return (
    <footer dir="rtl" className="border-t border-[#8e693b]/10 bg-[#f8f2ed]">
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col items-center gap-3 text-center">
        <img src={michalLogoAsset.url} alt="מיכל סיבוני" className="h-24 w-auto max-w-full object-contain mix-blend-multiply" />
        <p className="text-sm text-[#5a493c]/70">צילומי ניו-בורן ומשפחה</p>
        <div className="flex items-center gap-4 text-sm text-[#4a3221]/70">
          <a href={`tel:${MICHAL_PHONE}`} className="flex items-center gap-1.5 hover:text-[#4a3221]" dir="ltr">
            <Phone size={14} /> {MICHAL_PHONE}
          </a>
          <a href="mailto:s0548529277@gmail.com" className="flex items-center gap-1.5 hover:text-[#4a3221]">
            <Mail size={14} /> s0548529277@gmail.com
          </a>
        </div>
        <p className="text-xs text-[#4a3221]/50 mt-2">© מיכל סיבוני — כל הזכויות שמורות</p>
      </div>
    </footer>
  );
}

// A dedicated, self-contained landing page for newborn clients — her own
// branding + newborn photos, every newborn-specific thing already built
// elsewhere in the app (packages/addons/process from newborn-packages.ts)
// gathered onto one page, plus a booking flow straight into the studio
// calendar (same requestPhotographySession the general photography page
// uses, with session_type fixed to "ניו-בורן" instead of a picker) — per
// explicit request.
export const Route = createFileRoute("/newborn")({
  head: () => ({
    meta: [
      { title: "צילומי ניו-בורן | מיכל סיבוני" },
      {
        name: "description",
        content: "צילומי ניו-בורן עם הצלמת מיכל סיבוני — חבילות מלאות, כולל עיבוד, קולאז' ואלבום. גם מימוש סל לידה.",
      },
      { property: "og:title", content: "צילומי ניו-בורן | מיכל סיבוני" },
      { property: "og:description", content: "חבילות ניו-בורן מלאות — סטודיו בוטיק, עיבוד מקצועי, קולאז' ואלבום." },
      { property: "og:image", content: "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc04166_optimized-1-scaled.jpg" },
      { property: "og:url", content: "https://sweetbabyphoto.shop/newborn" },
    ],
    links: [{ rel: "canonical", href: "https://sweetbabyphoto.shop/newborn" }],
  }),
  component: NewbornLandingPage,
});

const PHONE = MICHAL_PHONE;
const EMAIL = "s0548529277@gmail.com";
const REGULAR_PACKAGES = NEWBORN_PACKAGES.filter((p) => p.categories.includes("regular"));

function NewbornLandingPage() {
  // /newborn/gallery/$token (the client's own private proof gallery) is a
  // *child* route of this landing page in the router tree — TanStack
  // Router only mounts a child route's component into an <Outlet/> placed
  // by its parent (same fix already applied to /admin/photo-clients and
  // /admin/newborn-packages, see their matching comments).
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isGalleryChild = pathname !== "/newborn";

  const [lightbox, setLightbox] = useState<string | null>(null);
  const gallery = usePageGallery(PAGE_IMAGE_KEYS.newborn);
  const photos = gallery.images;

  const nav = useNavigate();
  const { user } = useAuth();
  const profile = useProfilePrefill();
  const bookSession = useServerFn(requestPhotographySession);
  const sendBirthBasketInterest = useServerFn(requestBirthBasketInterest);
  const [basketSending, setBasketSending] = useState(false);
  const [basketSent, setBasketSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [book, setBook] = useState({
    name: "",
    phone: "",
    date: "",
    time: "10:00",
    email: "",
    payment: "cash",
    packageId: "mini",
    notes: "",
  });
  useEffect(() => {
    if (!profile.loaded) return;
    setBook((b) => ({ ...b, name: b.name || profile.fullName, phone: b.phone || profile.phone, email: b.email || profile.email }));
  }, [profile.loaded, profile.fullName, profile.phone, profile.email]);

  if (isGalleryChild) {
    return <Outlet />;
  }

  const chosenPackage = REGULAR_PACKAGES.find((p) => p.id === book.packageId) ?? REGULAR_PACKAGES[0];

  const submitBooking = async () => {
    if (!book.name.trim() || !book.phone.trim() || !book.date) {
      toast.error("נא למלא שם, טלפון ותאריך.");
      return;
    }
    if (!user) {
      toast.error("יש להתחבר כדי לקבוע מועד ביומן.");
      nav({ to: "/auth" });
      return;
    }
    setSending(true);
    try {
      const res = await bookSession({
        data: {
          session_date: book.date,
          start_time: book.time,
          hours: 3,
          contact_name: book.name.trim(),
          contact_phone: book.phone.trim(),
          contact_email: book.email.trim() || null,
          payment_method: book.payment as "cash" | "transfer" | "bit" | "later",
          session_type: "ניו-בורן",
          location: "studio",
          notes: [chosenPackage ? `חבילה מבוקשת: ${chosenPackage.name} (₪${chosenPackage.price})` : null, book.notes || null].filter(Boolean).join(" · ") || null,
        },
      });
      toast.success("הבקשה נקלטה ביומן הסטודיו ✓");
      setBook((b) => ({ ...b, notes: "" }));
      setWizard(false);
      nav({ to: "/photo-thanks/$id", params: { id: res.id } });
    } catch (e) {
      toast.error(heError(e, "קביעת המועד נכשלה"));
    } finally {
      setSending(false);
    }
  };

  const gmailLink =
    `https://mail.google.com/mail/?view=cm&fs=1&to=${EMAIL}` +
    `&su=${encodeURIComponent("תיאום צילומי ניו-בורן")}&body=${encodeURIComponent("היי מיכל, אשמח לתאם צילומי ניו-בורן 🌿")}`;
  const telLink = `tel:${PHONE}`;
  const bookInputCls =
    "w-full rounded-xl bg-white border border-[#4a3221]/15 px-3.5 py-2.5 text-sm outline-none focus:border-[#8a6338] transition-colors";

  const openWizard = (packageId?: string) => {
    if (packageId) setBook((b) => ({ ...b, packageId }));
    setStep(1);
    setWizard(true);
  };

  const handleBirthBasketInterest = async () => {
    setBasketSending(true);
    try {
      await sendBirthBasketInterest({
        data: { name: book.name || profile.fullName, phone: book.phone || profile.phone, email: book.email || profile.email },
      });
      setBasketSent(true);
      toast.success("קיבלתי! אחזור אלייך בהקדם 💗");
    } catch {
      toast.error("משהו השתבש, נסי שוב או התקשרי");
    } finally {
      setBasketSending(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#fdfbf9] text-[#3e352f]" style={{ fontFamily: "'Fira Sans', sans-serif" }}>
      <MichalHeader />

      <section className="relative overflow-hidden px-5 py-10 md:py-16 lg:py-20">
        <div className="pointer-events-none absolute -right-40 top-12 h-96 w-96 rounded-full bg-[#d13d66]/5 blur-3xl" />
        <div className="pointer-events-none absolute -left-40 bottom-0 h-96 w-96 rounded-full bg-[#8e693b]/5 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:gap-20">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="order-2 text-center lg:order-1 lg:text-right"
          >
            <img src={michalLogoAsset.url} alt="מיכל סיבוני" className="mx-auto mb-7 h-28 w-auto max-w-full object-contain mix-blend-multiply lg:mx-0 lg:h-36" />
            <div className="mb-5 inline-flex items-center gap-2 text-xs font-semibold tracking-[0.22em] text-[#8e693b]">
              <Heart size={13} className="fill-[#d13d66] text-[#d13d66]" /> צילומי ניו־בורן באווירה רגועה
            </div>
            <h1 className="mb-6 text-5xl leading-[1.08] text-[#3e352f] md:text-7xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
              שומרים את הלחישות
              <br />
              <span className="italic text-[#8e693b]">של ההתחלה.</span>
            </h1>
            <p className="mx-auto mb-9 max-w-xl text-lg leading-relaxed text-[#5a493c]/80 lg:mx-0">
              סשן ניו־בורן עדין ומקצועי בסטודיו הבוטיק בבית שמש — עם זמן לנשום, עיבוד מוקפד, קולאז׳ מעוצב ואלבום שנשאר למשפחה.
            </p>
            <div className="flex flex-wrap items-stretch justify-center gap-3 lg:justify-start">
              <button
                type="button"
                onClick={() => openWizard()}
                className="inline-flex items-center gap-2 rounded-full bg-[#8e693b] px-8 py-4 font-semibold text-white shadow-xl shadow-[#8e693b]/15 transition hover:-translate-y-0.5 hover:bg-[#76552f]"
              >
                <CalendarDays size={18} /> קביעת מועד ביומן
              </button>
              <a
                href={gmailLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-[#8e693b]/25 bg-white/70 px-8 py-4 font-semibold text-[#8e693b] transition hover:bg-[#f8f2ed]"
              >
                <Mail size={18} /> לתאום במייל
              </a>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="relative order-1 mx-auto w-full max-w-[520px] lg:order-2"
          >
            <div className="absolute -inset-5 -translate-x-3 -translate-y-3 rounded-t-[15rem] border border-[#8e693b]/15" />
            <div className="relative aspect-[4/5] overflow-hidden rounded-t-[15rem] rounded-b-[2rem] bg-[#f3d3dd] ring-8 ring-white shadow-2xl shadow-[#8e693b]/10">
              {photos[0] ? (
                <img src={photos[0]} alt="תינוק בצילומי ניו־בורן של מיכל סיבוני" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center bg-[#f8f2ed] p-10">
                  <img src={michalLogoAsset.url} alt="מיכל סיבוני" className="w-full mix-blend-multiply" />
                </div>
              )}
            </div>
            {photos[1] && (
              <button type="button" onClick={() => setLightbox(photos[1])} className="absolute -bottom-5 -right-2 hidden h-40 w-40 overflow-hidden rounded-2xl bg-white ring-8 ring-white shadow-2xl sm:block">
                <img src={photos[1]} alt="פרט מצילומי ניו־בורן" className="h-full w-full object-cover transition duration-700 hover:scale-105" />
              </button>
            )}
            <div className="absolute -left-12 top-1/2 hidden -rotate-90 text-[10px] font-semibold tracking-[0.5em] text-[#8e693b]/35 xl:block">MICHAL SIBONI · NEWBORN</div>
          </motion.div>
        </div>
      </section>

      {/* Packages */}
      <section id="packages" className="max-w-6xl mx-auto px-6 py-16 md:py-20">
        <div className="text-center mb-8">
          <h2 className="text-3xl md:text-4xl mb-2" style={{ fontFamily: "'DM Serif Display', serif" }}>
            חבילות ניו-בורן
          </h2>
          <p className="text-sm text-[#4a3221]/70">בוחרים חבילה, וממשיכים ישר לקביעת מועד</p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {REGULAR_PACKAGES.map((pkg) => (
            <motion.div
              key={pkg.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              className={`relative bg-white rounded-3xl border p-7 flex flex-col ${
                pkg.id === "pampering" ? "border-[#d9b98a] shadow-lg md:scale-105" : "border-[#4a3221]/10"
              }`}
            >
              {pkg.id === "pampering" && (
                <span className="absolute -top-3 right-1/2 translate-x-1/2 bg-[#d9b98a] text-[#3d2a1a] text-xs font-semibold px-3 py-1 rounded-full">
                  הכי פופולרית
                </span>
              )}
              <div className="text-2xl mb-4" style={{ fontFamily: "'DM Serif Display', serif" }}>
                {pkg.name}
              </div>
              <ul className="space-y-2 mb-6 flex-1">
                {pkg.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[#4a3221]/85">
                    <Check size={16} className="text-[#8a6338] shrink-0 mt-0.5" /> {f}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => openWizard(pkg.id)}
                className="inline-flex items-center justify-center gap-2 bg-[#4a3221] text-white px-6 py-3 rounded-full hover:bg-[#4a3221]/90 transition font-semibold text-sm"
              >
                <CalendarDays size={16} /> קביעת מועד לחבילה זו
              </button>
            </motion.div>
          ))}
        </div>
        <div className="mt-6 rounded-2xl bg-white/70 border border-[#4a3221]/10 p-5 text-center text-sm text-[#4a3221]/80">
          תוספות אפשריות: {NEWBORN_ADDONS.map((a) => a.label.replace(/\s*\(אוכל\)/, "")).join(" · ")}.
        </div>

        {/* Birth-basket ("סל לידה") interest — a real one-click button that
            emails her directly, instead of a passive "write to us" note. */}
        <div
          className="mt-6 rounded-3xl border border-[#d9b98a]/40 p-6 md:p-7 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-right"
          style={{ background: "linear-gradient(135deg, #fdf3ec 0%, #f3d3dd 60%, #ecd3ac 100%)" }}
        >
          <div className="h-12 w-12 rounded-full bg-white/80 flex items-center justify-center shrink-0">
            <Gift size={22} className="text-[#c23b6d]" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-[#4a3221] mb-0.5">מימוש סל לידה מקופת החולים?</div>
            <div className="text-sm text-[#4a3221]/75">יש לי חבילות ייעודיות למימוש סל לידה — לחצי ואחזור אלייך עם כל הפרטים.</div>
          </div>
          <button
            type="button"
            onClick={handleBirthBasketInterest}
            disabled={basketSending || basketSent}
            className="inline-flex items-center gap-2 shrink-0 bg-[#4a3221] text-white px-6 py-3 rounded-full text-sm font-semibold hover:bg-[#4a3221]/90 transition disabled:opacity-60"
          >
            {basketSent ? <Check size={16} /> : <Gift size={16} />}
            {basketSent ? "הבקשה נשלחה ✓" : basketSending ? "שולח…" : "מעוניינת במימוש סל לידה"}
          </button>
        </div>
      </section>

      {/* Process timeline */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-[#8a6338] text-xs tracking-[0.28em] uppercase mb-2">
            <ShieldCheck size={14} /> איך זה עובד
          </div>
          <h2 className="text-3xl md:text-4xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
            התהליך שלנו, שלב אחר שלב
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {NEWBORN_TIMELINE_STEPS.map((s, i) => (
            <div key={s.key} className="bg-white/80 rounded-2xl border border-[#d9b98a]/25 p-4 text-center">
              <div className="mx-auto mb-2 h-8 w-8 rounded-full bg-[#f5d5cf] flex items-center justify-center text-sm font-semibold text-[#4a3221]">
                {i + 1}
              </div>
              <div className="text-xs text-[#4a3221]/85 leading-snug">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {wizard && (
        <div
          dir="rtl"
          className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setWizard(false)}
        >
          <div
            className="w-full max-w-xl max-h-[90vh] overflow-y-auto bg-[#fdf3ec] rounded-3xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-[#4a3221]">שלב {step} מתוך 3</div>
              <button type="button" aria-label="סגירה" onClick={() => setWizard(false)} className="h-9 w-9 rounded-full hover:bg-[#4a3221]/10 flex items-center justify-center">
                ✕
              </button>
            </div>
            <div className="h-1.5 rounded-full bg-[#4a3221]/10 mb-6 overflow-hidden">
              <div className="h-full bg-[#4a3221] transition-all" style={{ width: `${(step / 3) * 100}%` }} />
            </div>

            {step === 1 && (
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#4a3221]/80">תאריך *</span>
                  <input className={bookInputCls} type="date" value={book.date} onChange={(e) => setBook({ ...book, date: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#4a3221]/80">שעת התחלה *</span>
                  <input className={bookInputCls} type="time" step={1800} value={book.time} onChange={(e) => setBook({ ...book, time: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="text-xs font-semibold text-[#4a3221]/80">חבילה</span>
                  <select className={bookInputCls} value={book.packageId} onChange={(e) => setBook({ ...book, packageId: e.target.value })}>
                    {REGULAR_PACKAGES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {step === 2 && (
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#4a3221]/80">שם מלא *</span>
                  <input className={bookInputCls} value={book.name} onChange={(e) => setBook({ ...book, name: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#4a3221]/80">טלפון *</span>
                  <input className={bookInputCls} dir="ltr" type="tel" value={book.phone} onChange={(e) => setBook({ ...book, phone: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#4a3221]/80">אימייל לאישור</span>
                  <input className={bookInputCls} dir="ltr" type="email" list="email-suggest-newborn" value={book.email} onChange={(e) => setBook({ ...book, email: e.target.value })} placeholder="you@example.com" />
                  <EmailDatalist id="email-suggest-newborn" value={book.email} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#4a3221]/80">אמצעי תשלום</span>
                  <select className={bookInputCls} value={book.payment} onChange={(e) => setBook({ ...book, payment: e.target.value })}>
                    {Object.entries(PAYMENT_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="text-xs font-semibold text-[#4a3221]/80">הערות</span>
                  <textarea className={bookInputCls} rows={2} value={book.notes} onChange={(e) => setBook({ ...book, notes: e.target.value })} />
                </label>
              </div>
            )}

            {step === 3 && (
              <div className="rounded-2xl bg-white border border-[#d9b98a]/30 p-5 text-sm text-[#4a3221] space-y-2">
                <div className="font-semibold text-[#4a3221] text-base mb-1">סיכום לפני שליחה</div>
                <div>תאריך: <strong>{book.date || "—"}</strong> · שעה: <strong>{book.time || "—"}</strong></div>
                <div>חבילה: <strong>{chosenPackage?.name}</strong></div>
                <div>שם: <strong>{book.name || "—"}</strong> · טלפון: <strong>{book.phone || "—"}</strong></div>
                <div>תשלום: <strong>{PAYMENT_LABELS[book.payment]}</strong></div>
                <p className="text-xs text-[#4a3221]/80 pt-2">
                  המועד יישמר ביומן הסטודיו ואישור יישלח למייל. המועד מאושר סופית לאחר תיאום עם הצלמת.
                </p>
              </div>
            )}

            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => (step === 1 ? setWizard(false) : setStep(step - 1))}
                className="h-12 px-6 rounded-full border border-[#4a3221]/20 text-sm text-[#4a3221] hover:bg-white"
              >
                {step === 1 ? "ביטול" : "חזרה"}
              </button>
              {step < 3 ? (
                <button
                  type="button"
                  onClick={() => setStep(step + 1)}
                  className="h-12 px-8 rounded-full bg-[#4a3221] text-white text-sm font-semibold hover:bg-[#4a3221]/90"
                >
                  המשך
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submitBooking}
                  disabled={sending}
                  className="inline-flex items-center gap-2 h-12 px-8 rounded-full bg-[#4a3221] text-white text-sm font-semibold hover:bg-[#4a3221]/90 disabled:opacity-50"
                >
                  <CalendarDays size={18} /> {sending ? "שולח…" : "שליחה וקביעה ביומן"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Gallery — real newborn photos only (see builtinEntries in
          page-images.ts: no generic studio fallback for this page anymore,
          per explicit request), so hide the section entirely until she's
          uploaded some via /admin/gallery rather than show nothing/wrong photos. */}
      {photos.length > 0 && (
        <section id="gallery" className="max-w-6xl mx-auto px-6 pb-16">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h2 className="text-3xl md:text-4xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
                מהסשנים שלנו
              </h2>
              <p className="text-sm text-[#4a3221]/70 mt-1">רגעים אמיתיים מצילומי ניו-בורן בסטודיו</p>
            </div>
          </div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
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
                <img src={src} alt={`צילומי ניו-בורן ${i + 1}`} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition duration-700" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition" />
              </motion.button>
            ))}
          </motion.div>
        </section>
      )}

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <div className="bg-white text-[#4a3221] rounded-3xl border border-[#4a3221]/10 p-10 md:p-14 text-center">
          <h3 className="text-3xl md:text-4xl mb-3" style={{ fontFamily: "'DM Serif Display', serif" }}>
            מוכנים להנציח את הימים הראשונים?
          </h3>
          <p className="text-[#4a3221]/75 mb-7 max-w-xl mx-auto">
            נשמח לתאם איתכם סשן ניו-בורן רגוע ומקצועי — בסטודיו הבוטיק שלנו בבית שמש.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              type="button"
              onClick={() => openWizard()}
              className="inline-flex items-center gap-2 bg-[#4a3221] text-white px-7 py-3.5 rounded-full hover:bg-[#4a3221]/90 transition font-semibold"
            >
              <CalendarDays size={18} /> קביעת מועד ביומן
            </button>
            <a href={telLink} dir="ltr" className="inline-flex items-center gap-2 border border-[#4a3221]/15 text-[#4a3221] px-7 py-3.5 rounded-full hover:bg-[#fdf3ec] transition">
              <Phone size={18} /> חיוג {PHONE}
            </a>
            <a href={gmailLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 border border-[#4a3221]/15 text-[#4a3221] px-7 py-3.5 rounded-full hover:bg-[#fdf3ec] transition">
              <Mail size={18} /> מייל
            </a>
          </div>
          <p className="text-xs text-[#4a3221]/60 mt-6">
            כבר צילמתן איתנו? <Link to="/my-photos" className="underline">התמונות שלך כאן</Link>
          </p>
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
            <motion.img initial={{ scale: 0.9 }} animate={{ scale: 1 }} src={lightbox} alt="" className="max-w-full max-h-full rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
          </motion.div>
        )}
      </AnimatePresence>

      <MichalFooter />
    </div>
  );
}

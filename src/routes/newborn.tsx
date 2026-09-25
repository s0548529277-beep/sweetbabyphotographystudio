import { createFileRoute, useNavigate, useRouterState, Link, Outlet } from "@tanstack/react-router";
import { heError } from "@/lib/he-errors";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useProfilePrefill } from "@/hooks/use-profile";
import { EmailDatalist } from "@/components/EmailDatalist";
import { Button } from "@/components/ui/button";
import { requestPhotographySession } from "@/lib/photography.functions";
import { PAYMENT_LABELS } from "@/lib/photography-options";
import { NEWBORN_PACKAGES, NEWBORN_ADDONS, NEWBORN_TIMELINE_STEPS } from "@/lib/newborn-packages";
import { requestBirthBasketInterest } from "@/lib/newborn-orders.functions";
import { usePageGallery, PAGE_IMAGE_KEYS, useSiteIcon } from "@/lib/page-images";
import { Heart, Phone, Mail, CalendarDays, Check, ShieldCheck, Gift } from "lucide-react";
import michalLogoWordmark from "@/assets/michal-logo-wordmark.png";
import michalAnimatedLogoAsset from "@/assets/michal-logo-animated-v2.gif.asset.json";

// Standalone header/footer for this page — deliberately NOT the site-wide
// <Header>/<Footer> (Sweetbaby studio-rental branding + nav). Per explicit
// request: this is her own personal newborn-photography brand ("michal"),
// a separate business from the studio-rental site (Sweetbaby), so it gets
// its own identity here — her real logo — instead of the shared site
// chrome. The phone number below (0534181051) is hers as it appears on
// the logo itself, distinct from the Sweetbaby studio number used
// elsewhere in the app.
const MICHAL_PHONE = "0534181051";

function MichalLogo({ className }: { className: string }) {
  const hostedSource = michalAnimatedLogoAsset.url;
  const fallbackSource = michalLogoWordmark;
  const [source, setSource] = useState(hostedSource);

  useEffect(() => {
    const probe = new Image();
    probe.onerror = () => setSource(fallbackSource);
    probe.src = hostedSource;
    return () => {
      probe.onerror = null;
    };
  }, [fallbackSource, hostedSource]);

  return (
    <img
      src={source}
      onError={() => setSource(fallbackSource)}
      alt="מיכל סיבוני"
      className={className}
    />
  );
}

function MichalHeader() {
  return (
    <header
      dir="rtl"
      className="sticky top-0 z-30 border-b border-newborn-gold/10 bg-newborn-canvas/90 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-24 max-w-6xl items-center justify-between gap-3 px-4 md:h-32 md:px-5">
        <Link to="/" aria-label="חזרה לעמוד הבית" className="shrink-0">
          <MichalLogo className="h-20 w-auto max-w-52 object-contain md:h-28 md:max-w-80" />
        </Link>
        <div className="flex items-center gap-3 text-sm text-newborn-ink/70 sm:gap-5">
          <a href="#packages" className="hidden transition-colors hover:text-newborn-rose md:block">
            חבילות
          </a>
          <a href="#gallery" className="hidden transition-colors hover:text-newborn-rose md:block">
            גלריה
          </a>
          <a
            href={`tel:${MICHAL_PHONE}`}
            aria-label={`חיוג ${MICHAL_PHONE}`}
            className="flex items-center gap-1.5 transition-colors hover:text-newborn-rose"
            dir="ltr"
          >
            <Phone size={16} /> <span className="hidden sm:inline">{MICHAL_PHONE}</span>
          </a>
          <a
            href="mailto:s0548529277@gmail.com"
            className="hidden items-center gap-1.5 transition-colors hover:text-newborn-rose sm:flex"
          >
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
        <MichalLogo className="h-32 w-auto max-w-full object-contain mix-blend-multiply" />
        <p className="text-sm text-[#5a493c]/70">צילומי ניו-בורן ומשפחה</p>
        <div className="flex items-center gap-4 text-sm text-[#4a3221]/70">
          <a
            href={`tel:${MICHAL_PHONE}`}
            className="flex items-center gap-1.5 hover:text-[#4a3221]"
            dir="ltr"
          >
            <Phone size={14} /> {MICHAL_PHONE}
          </a>
          <a
            href="mailto:s0548529277@gmail.com"
            className="flex items-center gap-1.5 hover:text-[#4a3221]"
          >
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
        content:
          "צילומי ניו-בורן עם הצלמת מיכל סיבוני — חבילות מלאות, כולל עיבוד, קולאז' ואלבום. גם מימוש סל לידה.",
      },
      { property: "og:title", content: "צילומי ניו-בורן | מיכל סיבוני" },
      {
        property: "og:description",
        content: "חבילות ניו-בורן מלאות — סטודיו בוטיק, עיבוד מקצועי, קולאז' ואלבום.",
      },
      { property: "og:type", content: "website" },
      {
        property: "og:image",
        content:
          "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc04166_optimized-1-scaled.jpg",
      },
      { property: "og:url", content: "https://sweetbabyphoto.shop/newborn" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "twitter:image",
        content:
          "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc04166_optimized-1-scaled.jpg",
      },
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
  // The birth-basket button used to fire straight off `book` (the booking
  // wizard's own state) — almost always empty, since a visitor clicking
  // this button never opened that wizard, so the studio email arrived with
  // no way to reach back out. Now it opens its own small form first and
  // requires name/phone/email before sending, per explicit report.
  const [basketDialogOpen, setBasketDialogOpen] = useState(false);
  const [basketForm, setBasketForm] = useState({
    name: "",
    phone: "",
    email: "",
    wantsAlbum: false,
  });
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
    setBook((b) => ({
      ...b,
      name: b.name || profile.fullName,
      phone: b.phone || profile.phone,
      email: b.email || profile.email,
    }));
    setBasketForm((b) => ({
      ...b,
      name: b.name || profile.fullName,
      phone: b.phone || profile.phone,
      email: b.email || profile.email,
    }));
  }, [profile.loaded, profile.fullName, profile.phone, profile.email]);

  if (isGalleryChild) {
    return <Outlet />;
  }

  const chosenPackage =
    REGULAR_PACKAGES.find((p) => p.id === book.packageId) ?? REGULAR_PACKAGES[0];

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
          notes:
            [
              chosenPackage
                ? `חבילה מבוקשת: ${chosenPackage.name} (₪${chosenPackage.price})`
                : null,
              book.notes || null,
            ]
              .filter(Boolean)
              .join(" · ") || null,
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

  const submitBirthBasketInterest = async () => {
    if (!basketForm.name.trim() || !basketForm.phone.trim() || !basketForm.email.trim()) {
      toast.error("נא למלא שם, טלפון ומייל.");
      return;
    }
    setBasketSending(true);
    try {
      await sendBirthBasketInterest({
        data: {
          name: basketForm.name.trim(),
          phone: basketForm.phone.trim(),
          email: basketForm.email.trim(),
          wants_album: basketForm.wantsAlbum,
        },
      });
      setBasketSent(true);
      setBasketDialogOpen(false);
      toast.success("קיבלתי! מייל עם כל הפרטים בדרך אלייך, ואחזור גם בטלפון 💗");
    } catch {
      toast.error("משהו השתבש, נסי שוב או התקשרי");
    } finally {
      setBasketSending(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen overflow-x-clip bg-newborn-canvas text-newborn-ink"
      style={{ fontFamily: "'Karla', sans-serif" }}
    >
      <MichalHeader />

      <section className="relative overflow-hidden px-5 py-12 md:py-20 lg:min-h-[720px] lg:py-24">
        <div className="pointer-events-none absolute right-[6%] top-[18%] h-72 w-72 rounded-full bg-newborn-blush/55 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-16 lg:grid-cols-2 lg:gap-24">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="order-1 min-w-0 text-center lg:text-right"
          >
            <MichalLogo className="mx-auto mb-8 h-36 w-auto max-w-full object-contain mix-blend-multiply sm:h-44 lg:mx-0 lg:mb-10 lg:h-56" />
            <div className="mb-6 inline-flex items-center gap-2 border-r-2 border-newborn-gold bg-newborn-blush/30 px-4 py-1.5 text-xs font-semibold text-newborn-gold">
              <Heart size={13} className="fill-newborn-rose text-newborn-rose" /> רגעים ראשונים,
              אהבה אינסופית
            </div>
            <h1
              className="mb-7 text-5xl font-semibold leading-[1.02] text-newborn-rose sm:text-6xl md:text-8xl"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              צילומי ניו־בורן
              <br />
              <span className="block pt-2 font-light italic text-newborn-gold">בסטודיו בוטיק</span>
            </h1>
            <p className="mx-auto mb-10 max-w-lg text-lg font-light leading-relaxed text-newborn-gold lg:mx-0 lg:text-xl">
              הזיכרונות הראשונים שלכם, עטופים ברכות, אהבה וסבלנות. חוויית צילום רגועה ומקצועית, עם
              עיבוד מוקפד ואלבום שנשאר למשפחה.
            </p>
            <div className="flex flex-nowrap items-stretch justify-center gap-3 lg:justify-start">
              <Button
                type="button"
                onClick={() => openWizard()}
                className="h-auto min-w-0 rounded-full bg-newborn-rose px-5 py-4 text-sm text-primary-foreground shadow-xl shadow-newborn-rose/20 transition duration-500 hover:-translate-y-1 hover:bg-newborn-gold sm:px-8 sm:text-base"
              >
                <CalendarDays size={18} /> קביעת מועד ביומן
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-auto min-w-0 rounded-full border-newborn-blush bg-newborn-canvas/70 px-5 py-4 text-sm text-newborn-gold shadow-none transition duration-500 hover:border-newborn-rose hover:bg-newborn-blush/40 hover:text-newborn-rose sm:px-8 sm:text-base"
              >
                <a href={gmailLink} target="_blank" rel="noopener noreferrer">
                  <Mail size={18} /> לתיאום במייל
                </a>
              </Button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="relative order-2 mx-auto w-[calc(100%-1.5rem)] max-w-[500px]"
          >
            <div className="absolute -inset-6 -translate-x-3 -translate-y-3 rounded-t-full border border-newborn-gold/20" />
            <div className="relative aspect-[4/5] overflow-hidden rounded-t-full bg-newborn-blush ring-[14px] ring-card shadow-2xl shadow-newborn-rose/15">
              {photos[0] ? (
                <img
                  src={photos[0]}
                  alt="תינוק בצילומי ניו־בורן של מיכל סיבוני"
                  className="h-full w-full object-cover transition-transform duration-1000 hover:scale-105"
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-[#f8f2ed] p-10">
                  <MichalLogo className="w-full mix-blend-multiply" />
                </div>
              )}
            </div>
            {photos[1] && (
              <button
                type="button"
                onClick={() => setLightbox(photos[1])}
                className="absolute -bottom-8 -left-10 hidden h-60 w-44 overflow-hidden rounded-t-full bg-card ring-8 ring-card shadow-2xl transition duration-700 hover:-translate-y-2 sm:block"
              >
                <img
                  src={photos[1]}
                  alt="פרט מצילומי ניו־בורן"
                  className="h-full w-full object-cover transition duration-700 hover:scale-105"
                />
              </button>
            )}
            <div className="absolute right-[-2.75rem] top-1/2 hidden -rotate-12 rounded-full border border-newborn-blush bg-card/85 p-5 text-center text-[10px] font-semibold text-newborn-rose shadow-lg backdrop-blur-md xl:block">
              BOUTIQUE
              <br />
              STUDIO
            </div>
          </motion.div>
        </div>
      </section>

      {/* Packages */}
      <section id="packages" className="max-w-6xl mx-auto px-6 py-16 md:py-20">
        <div className="text-center mb-8">
          <h2
            className="text-3xl md:text-4xl mb-2"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
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
                pkg.id === "pampering"
                  ? "border-[#d9b98a] shadow-lg md:scale-105"
                  : "border-[#4a3221]/10"
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
          תוספות אפשריות:{" "}
          {NEWBORN_ADDONS.map((a) => a.label.replace(/\s*\(אוכל\)/, "")).join(" · ")}.
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
            <div className="text-sm text-[#4a3221]/75">
              יש לי חבילות ייעודיות למימוש סל לידה — לחצי ואחזור אלייך עם כל הפרטים.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setBasketDialogOpen(true)}
            disabled={basketSent}
            className="inline-flex items-center gap-2 shrink-0 bg-[#4a3221] text-white px-6 py-3 rounded-full text-sm font-semibold hover:bg-[#4a3221]/90 transition disabled:opacity-60"
          >
            {basketSent ? <Check size={16} /> : <Gift size={16} />}
            {basketSent ? "הבקשה נשלחה ✓" : "מעוניינת במימוש סל לידה"}
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
            <div
              key={s.key}
              className="bg-white/80 rounded-2xl border border-[#d9b98a]/25 p-4 text-center"
            >
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
              <button
                type="button"
                aria-label="סגירה"
                onClick={() => setWizard(false)}
                className="h-9 w-9 rounded-full hover:bg-[#4a3221]/10 flex items-center justify-center"
              >
                ✕
              </button>
            </div>
            <div className="h-1.5 rounded-full bg-[#4a3221]/10 mb-6 overflow-hidden">
              <div
                className="h-full bg-[#4a3221] transition-all"
                style={{ width: `${(step / 3) * 100}%` }}
              />
            </div>

            {step === 1 && (
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#4a3221]/80">תאריך *</span>
                  <input
                    className={bookInputCls}
                    type="date"
                    value={book.date}
                    onChange={(e) => setBook({ ...book, date: e.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#4a3221]/80">שעת התחלה *</span>
                  <input
                    className={bookInputCls}
                    type="time"
                    step={1800}
                    value={book.time}
                    onChange={(e) => setBook({ ...book, time: e.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="text-xs font-semibold text-[#4a3221]/80">חבילה</span>
                  <select
                    className={bookInputCls}
                    value={book.packageId}
                    onChange={(e) => setBook({ ...book, packageId: e.target.value })}
                  >
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
                  <input
                    className={bookInputCls}
                    value={book.name}
                    onChange={(e) => setBook({ ...book, name: e.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#4a3221]/80">טלפון *</span>
                  <input
                    className={bookInputCls}
                    dir="ltr"
                    type="tel"
                    value={book.phone}
                    onChange={(e) => setBook({ ...book, phone: e.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#4a3221]/80">אימייל לאישור</span>
                  <input
                    className={bookInputCls}
                    dir="ltr"
                    type="email"
                    list="email-suggest-newborn"
                    value={book.email}
                    onChange={(e) => setBook({ ...book, email: e.target.value })}
                    placeholder="you@example.com"
                  />
                  <EmailDatalist id="email-suggest-newborn" value={book.email} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#4a3221]/80">אמצעי תשלום</span>
                  <select
                    className={bookInputCls}
                    value={book.payment}
                    onChange={(e) => setBook({ ...book, payment: e.target.value })}
                  >
                    {Object.entries(PAYMENT_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="text-xs font-semibold text-[#4a3221]/80">הערות</span>
                  <textarea
                    className={bookInputCls}
                    rows={2}
                    value={book.notes}
                    onChange={(e) => setBook({ ...book, notes: e.target.value })}
                  />
                </label>
              </div>
            )}

            {step === 3 && (
              <div className="rounded-2xl bg-white border border-[#d9b98a]/30 p-5 text-sm text-[#4a3221] space-y-2">
                <div className="font-semibold text-[#4a3221] text-base mb-1">סיכום לפני שליחה</div>
                <div>
                  תאריך: <strong>{book.date || "—"}</strong> · שעה:{" "}
                  <strong>{book.time || "—"}</strong>
                </div>
                <div>
                  חבילה: <strong>{chosenPackage?.name}</strong>
                </div>
                <div>
                  שם: <strong>{book.name || "—"}</strong> · טלפון:{" "}
                  <strong>{book.phone || "—"}</strong>
                </div>
                <div>
                  תשלום: <strong>{PAYMENT_LABELS[book.payment]}</strong>
                </div>
                <p className="text-xs text-[#4a3221]/80 pt-2">
                  המועד יישמר ביומן הסטודיו ואישור יישלח למייל. המועד מאושר סופית לאחר תיאום עם
                  הצלמת.
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

      {basketDialogOpen && (
        <div
          dir="rtl"
          className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setBasketDialogOpen(false)}
        >
          <div
            className="w-full max-w-md bg-[#fdf3ec] rounded-3xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="text-sm font-semibold text-[#4a3221] flex items-center gap-1.5">
                <Gift size={16} /> מימוש סל לידה
              </div>
              <button
                type="button"
                aria-label="סגירה"
                onClick={() => setBasketDialogOpen(false)}
                className="h-9 w-9 rounded-full hover:bg-[#4a3221]/10 flex items-center justify-center"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-[#4a3221]/70 mb-5">
              נא למלא פרטי קשר — אחזור אלייך, ובנוסף יישלח למייל שלך מייד מידע מלא על החבילות
              והמחירים.
            </p>
            <div className="grid gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-[#4a3221]/80">שם מלא *</span>
                <input
                  className={bookInputCls}
                  value={basketForm.name}
                  onChange={(e) => setBasketForm({ ...basketForm, name: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-[#4a3221]/80">טלפון *</span>
                <input
                  className={bookInputCls}
                  dir="ltr"
                  type="tel"
                  value={basketForm.phone}
                  onChange={(e) => setBasketForm({ ...basketForm, phone: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-[#4a3221]/80">אימייל *</span>
                <input
                  className={bookInputCls}
                  dir="ltr"
                  type="email"
                  list="email-suggest-basket"
                  value={basketForm.email}
                  onChange={(e) => setBasketForm({ ...basketForm, email: e.target.value })}
                  placeholder="you@example.com"
                />
                <EmailDatalist id="email-suggest-basket" value={basketForm.email} />
              </label>
              <label className="flex items-center gap-2 text-sm text-[#4a3221] pt-1">
                <input
                  type="checkbox"
                  checked={basketForm.wantsAlbum}
                  onChange={(e) => setBasketForm({ ...basketForm, wantsAlbum: e.target.checked })}
                  className="h-4 w-4 rounded border-[#4a3221]/30"
                />
                מעוניינת בחבילה כולל אלבום מודפס
              </label>
            </div>
            <button
              type="button"
              onClick={submitBirthBasketInterest}
              disabled={basketSending}
              className="mt-5 w-full inline-flex items-center justify-center gap-2 h-12 rounded-full bg-[#4a3221] text-white text-sm font-semibold hover:bg-[#4a3221]/90 disabled:opacity-60"
            >
              <Gift size={16} /> {basketSending ? "שולח…" : "שליחת בקשה"}
            </button>
          </div>
        </div>
      )}

      {/* Gallery — real newborn photos only (see builtinEntries in
          page-images.ts: no generic studio fallback for this page anymore,
          per explicit request — never the general studio-session stock
          photos, which mix in non-newborn shots). This section itself must
          always render, though, even with zero photos: the header's own
          "גלריה" link (#gallery anchor) points here, and hiding the whole
          section whenever nothing's been uploaded yet turned that link (and
          any other in-page "view gallery" link) into a dead click that
          silently does nothing — confirmed as a real reported bug, not just
          a cosmetic gap. Empty state below instead. */}
      <section id="gallery" className="max-w-6xl mx-auto px-6 pb-16">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2
              className="text-3xl md:text-4xl"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              מהסשנים שלנו
            </h2>
            <p className="text-sm text-[#4a3221]/70 mt-1">רגעים אמיתיים מצילומי ניו-בורן בסטודיו</p>
          </div>
        </div>

        {photos.length > 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
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
                className={`relative overflow-hidden rounded-2xl bg-[#f5d5cf] group ${
                  i % 5 === 0 ? "md:col-span-2 md:row-span-2 aspect-square" : "aspect-square"
                }`}
              >
                <img
                  src={src}
                  alt={`צילומי ניו-בורן ${i + 1}`}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition" />
              </motion.button>
            ))}
          </motion.div>
        ) : (
          <div className="rounded-3xl border border-dashed border-[#d9b98a]/50 bg-white/60 p-10 text-center text-sm text-[#4a3221]/70">
            תמונות מהסשנים בקרוב — בינתיים אפשר לקבוע מועד ולהיות מהראשונות בגלריה 💗
          </div>
        )}
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <div className="bg-white text-[#4a3221] rounded-3xl border border-[#4a3221]/10 p-10 md:p-14 text-center">
          <h3
            className="text-3xl md:text-4xl mb-3"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
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
            <a
              href={telLink}
              dir="ltr"
              className="inline-flex items-center gap-2 border border-[#4a3221]/15 text-[#4a3221] px-7 py-3.5 rounded-full hover:bg-[#fdf3ec] transition"
            >
              <Phone size={18} /> חיוג {PHONE}
            </a>
            <a
              href={gmailLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border border-[#4a3221]/15 text-[#4a3221] px-7 py-3.5 rounded-full hover:bg-[#fdf3ec] transition"
            >
              <Mail size={18} /> מייל
            </a>
          </div>
          <p className="text-xs text-[#4a3221]/60 mt-6">
            כבר צילמתן איתנו?{" "}
            <Link to="/my-photos" className="underline">
              התמונות שלך כאן
            </Link>
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

      <MichalFooter />
    </div>
  );
}

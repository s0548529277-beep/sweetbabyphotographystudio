import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ChevronRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { getStudioDayBusy } from "@/lib/studio-availability.functions";
import { placeBooking, computeStudioPrice, isMorningPackage, GUIDANCE_FEES, GUIDANCE_LABELS } from "@/lib/bookings.functions";
import { submitStudioIntake } from "@/lib/studio-intake.functions";
import { loadBookingProgress, saveBookingProgress, clearBookingProgress, wizardStartStep } from "@/lib/booking-draft";

/**
 * Studio booking wizard that lives INSIDE the chat (owner request 2026-11-03: the whole process —
 * date, questionnaire, payment choice — in the bot, with buttons or quick typing, a "back" button on
 * every step, and a small explanation under a disabled "continue" button).
 * Same server calls as /booking + /studio-rental: getStudioDayBusy, placeBooking, submitStudioIntake.
 */

export type WizardPrefill = { date?: string; startTime?: string; hours?: number };
export type WizardResult = { id: string; price: number; deposit: number; summary: string };

const STEPS = ["מועד", "שאלון", "פרטים ותנאים", "תשלום"] as const;
const DAY_START = 8 * 60;
const DAY_END = 23 * 60;

const SESSION_TYPES = ["משפחתי", "ניו-בורן", "חלאקה", "גיל שנה", "אחר"];
const PEOPLE = ["1-2", "3-4", "5-6", "7+"];
const CAMERA = ["יש לי מצלמה", "צריכה המלצה", "רוצה את המצלמה של הסטודיו"];
const FLASH = ["יש לי ניסיון", "אין לי ניסיון", "רוצה הדרכה"];
const PROPS = ["כן, אשמח לאביזרים", "לא צריך"];
const DEPOSIT_PLANS = [
  { id: "will_pay_now", label: "אשלם את המקדמה עכשיו" },
  { id: "already_paid", label: "כבר העברתי / שילמתי" },
  { id: "will_pay_later", label: "אשלם בהמשך" },
] as const;
type DepositPlan = (typeof DEPOSIT_PLANS)[number]["id"];

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const fmt = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const hoursLabel = (h: number) => (h === 1 ? "שעה" : h === 1.5 ? "שעה וחצי" : h === 2 ? "שעתיים" : `${h} שעות`);

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active ? "border-primary bg-primary text-primary-foreground" : "border-primary/30 bg-card text-foreground hover:bg-secondary/60"
      }`}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-foreground/80">{label}</p>
      {children}
    </div>
  );
}

export function ChatBookingWizard({
  prefill,
  onBooked,
  onClose,
}: {
  prefill?: WizardPrefill;
  onBooked: (r: WizardResult) => void;
  onClose: () => void;
}) {
  // Start from whatever the visitor already filled (here, on /booking or on /studio-rental).
  const saved = useMemo(() => loadBookingProgress(), []);
  const [step, setStep] = useState(() => wizardStartStep({ ...saved, date: prefill?.date ?? saved.date, time: prefill?.startTime ?? saved.time, hours: prefill?.hours ?? saved.hours }));
  const [date, setDate] = useState(prefill?.date ?? saved.date ?? "");
  const [hours, setHours] = useState<number>(prefill?.hours ?? saved.hours ?? 0);
  const [time, setTime] = useState(prefill?.startTime ?? saved.time ?? "");
  const [busy, setBusy] = useState<Array<{ start_time: string; end_time: string }> | null>(null);
  const [busyErr, setBusyErr] = useState(false);

  const [sessionType, setSessionType] = useState(saved.sessionType ?? "");
  const [people, setPeople] = useState(saved.people ?? "");
  const [babyAge, setBabyAge] = useState(saved.babyAge ?? "");
  const [camera, setCamera] = useState(saved.camera ?? "");
  const [flash, setFlash] = useState(saved.flash ?? "");
  const [props, setProps] = useState(saved.props ?? "");
  const [special, setSpecial] = useState(saved.special ?? "");

  const [name, setName] = useState(saved.name ?? "");
  const [phone, setPhone] = useState(saved.phone ?? "");
  const [email, setEmail] = useState(saved.email ?? "");
  const [terms, setTerms] = useState(saved.terms ?? false);

  const [guidance, setGuidance] = useState<keyof typeof GUIDANCE_FEES>("basic");
  const [coupon, setCoupon] = useState("");
  const [isMember, setIsMember] = useState(false);
  const [editContact, setEditContact] = useState(false);
  const [creditBalance, setCreditBalance] = useState(0);
  const [useCredit, setUseCredit] = useState(false);
  const [plan, setPlan] = useState<DepositPlan | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<WizardResult | null>(null);

  // Remember progress so a visitor who gets stuck (or closes the chat) can continue, and so the bot knows what is missing.
  useEffect(() => {
    if (done) return;
    saveBookingProgress({ date, time, hours: hours || undefined, sessionType, people, babyAge, camera, flash, props, special, name, phone, email, terms: terms || undefined });
  }, [done, date, time, hours, sessionType, people, babyAge, camera, flash, props, special, name, phone, email, terms]);

  // Prefill contact details from the signed-in profile (best effort).
  useEffect(() => {
    let off = false;
    void (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const u = data.user;
        if (off || !u || u.is_anonymous) return;
        setIsMember(true);
        setEmail((v) => v || u.email || "");
        try {
          const { data: loy } = await (supabase as any).from("customer_loyalty").select("credit_balance").eq("user_id", u.id).maybeSingle();
          if (!off) setCreditBalance(Number(loy?.credit_balance ?? 0));
        } catch {
          /* optional */
        }
        const { data: p } = await (supabase as any).from("profiles").select("full_name, phone").eq("id", u.id).maybeSingle();
        if (off || !p) return;
        setName((v) => v || p.full_name || "");
        setPhone((v) => v || p.phone || "");
      } catch {
        /* optional */
      }
    })();
    return () => {
      off = true;
    };
  }, []);

  // Busy intervals for the chosen date.
  useEffect(() => {
    if (!date) {
      setBusy(null);
      return;
    }
    let off = false;
    setBusy(null);
    setBusyErr(false);
    getStudioDayBusy({ data: { date } })
      .then((r) => !off && setBusy(r))
      .catch(() => !off && (setBusyErr(true), setBusy([])));
    return () => {
      off = true;
    };
  }, [date]);

  const freeStarts = useMemo(() => {
    if (!date || !hours || busy === null) return [] as string[];
    const len = hours * 60;
    const out: string[] = [];
    const now = new Date();
    const isToday = date === todayIso();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    for (let s = DAY_START; s + len <= DAY_END; s += 30) {
      if (isToday && s < nowMin + 30) continue;
      const clash = busy.some((b) => s < toMin(b.end_time) && s + len > toMin(b.start_time));
      if (!clash) out.push(fmt(s));
    }
    return out;
  }, [date, hours, busy]);

  // Drop a previously chosen time that is no longer free after changing date/duration.
  useEffect(() => {
    if (time && busy !== null && hours && !freeStarts.includes(time)) setTime("");
  }, [freeStarts, time, busy, hours]);

  const slots = Math.round(hours * 2);
  const guidanceFee = GUIDANCE_FEES[guidance] ?? 0;
  const price = hours && time ? computeStudioPrice(slots, time) + guidanceFee : 0;
  const morning = hours && time ? isMorningPackage(slots, time) : false;
  const phoneOk = phone.replace(/\D/g, "").length >= 9;
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const contactKnown = isMember && !!name.trim() && phoneOk && emailOk;
  const showContactFields = !contactKnown || editContact;
  const creditApplied = useCredit ? Math.min(creditBalance, price) : 0;

  // What is missing on the current step (shown under a disabled "continue").
  const missing: string[] = [];
  if (step === 0) {
    if (!date) missing.push("בחרי תאריך");
    else if (date < todayIso()) missing.push("התאריך שבחרת עבר — בחרי תאריך עתידי");
    if (!hours) missing.push("בחרי משך");
    if (date && hours && busy !== null && freeStarts.length === 0 && date >= todayIso()) missing.push("אין שעות פנויות לאורך הזה ביום הזה — נסי תאריך או משך אחר");
    else if (date && hours && !time) missing.push("בחרי שעת התחלה");
  } else if (step === 1) {
    if (!sessionType) missing.push("בחרי סוג צילום (שאר השדות אופציונליים)");
  } else if (step === 2) {
    if (!name.trim()) missing.push("חסר שם מלא");
    if (!phoneOk) missing.push("חסר טלפון תקין");
    if (!emailOk) missing.push("חסר אימייל תקין (אליו נשלח האישור)");
    if (!terms) missing.push("צריך לאשר את התנאים");
  } else if (step === 3) {
    if (!plan) missing.push("בחרי איך תטפלי במקדמה");
  }
  const canContinue = missing.length === 0;

  const submit = async () => {
    if (submitting || !canContinue) return;
    setSubmitting(true);
    setError("");
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const { error: e } = await supabase.auth.signInAnonymously();
        if (e) throw new Error("לא הצלחתי להמשיך כאורחת. אפשר להתחבר ולנסות שוב.");
      }
      const planLabel = DEPOSIT_PLANS.find((p) => p.id === plan)?.label ?? "";
      const res: any = await placeBooking({
        data: {
          session_date: date,
          start_time: time,
          slots,
          contact_name: name.trim(),
          contact_phone: phone.trim(),
          contact_email: email.trim(),
          notes: [`הוזמן דרך אשף ההזמנה בצ'אט`, `מקדמה: ${planLabel}`, special ? `בקשות: ${special}` : ""].filter(Boolean).join("\n"),
          guidance,
          coupon: !morning && coupon.trim() ? coupon.trim().toUpperCase() : null,
          use_credit: creditApplied > 0 ? creditApplied : undefined,
          terms_accepted: true,
        },
      });
      try {
        await submitStudioIntake({
          data: {
            clientName: name.trim(),
            phone: phone.trim(),
            email: email.trim(),
            sessionType,
            sessionDate: `${date} ${time}`,
            peopleCount: people,
            babyAge,
            cameraBrand: camera,
            flashExperience: flash,
            needProps: props,
            specialRequests: special,
            agreed: true,
          },
        });
      } catch (e) {
        console.error("chat wizard intake save failed", e);
      }
      const d = new Date(`${date}T00:00:00`);
      const dateHe = d.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "numeric" });
      const result: WizardResult = {
        id: res.id,
        price: Number(res.price ?? price),
        deposit: Number(res.deposit ?? 90),
        summary: `השריון נוצר (ממתין למקדמה): ${dateHe}, ${time}–${fmt(toMin(time) + hours * 60)}, ${hoursLabel(hours)}, ${Number(res.price ?? price)}₪, מקדמה ${Number(res.deposit ?? 90)}₪.`,
      };
      clearBookingProgress();
      setDone(result);
      onBooked(result);
    } catch (e: any) {
      const msg = e?.message ?? "שגיאה לא צפויה";
      setError(msg);
      toast.error("השריון לא נוצר");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="mt-2 space-y-2 rounded-2xl border border-primary/30 bg-secondary/40 p-3 text-sm">
        <p className="flex items-center gap-1.5 font-semibold text-primary">
          <Check className="size-4" /> השריון נוצר 💗
        </p>
        <p className="text-xs text-foreground/80">{done.summary}</p>
        <p className="rounded-lg bg-accent/20 px-3 py-2 text-xs leading-snug">
          ⏳ המועד נשמר לך <b>זמנית</b> — הוא יאושר סופית רק אחרי תשלום המקדמה. בלי תשלום השריון עלול להשתחרר.
        </p>
        <Button asChild size="lg" className="h-11 w-full rounded-full text-sm font-semibold shadow-md">
          <Link to="/deposit/$type/$id" params={{ type: "booking", id: done.id }}>
            לתשלום המקדמה עכשיו · {done.deposit}₪
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-3 rounded-2xl border border-primary/30 bg-card p-3 text-sm" dir="rtl">
      {/* progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            שלב {step + 1} מתוך {STEPS.length} · <b className="text-foreground">{STEPS[step]}</b>
          </span>
          <button type="button" onClick={onClose} className="underline-offset-2 hover:underline">
            סגירה
          </button>
        </div>
        <div className="flex gap-1">
          {STEPS.map((s, i) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-secondary"}`} />
          ))}
        </div>
      </div>

      {step === 0 && (
        <div className="space-y-3">
          <Field label="תאריך">
            <Input type="date" min={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} className="h-9 text-sm" />
          </Field>
          <Field label="משך הצילום">
            <div className="flex flex-wrap gap-1.5">
              {[1, 1.5, 2, 3].map((h) => (
                <Chip key={h} active={hours === h} onClick={() => setHours(h)}>
                  {hoursLabel(h)}
                </Chip>
              ))}
            </div>
          </Field>
          {date && hours > 0 && (
            <Field label="שעת התחלה (רק שעות פנויות)">
              {busy === null ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> בודקת יומן…
                </p>
              ) : freeStarts.length === 0 ? (
                <p className="text-xs text-muted-foreground">אין שעות פנויות לאורך הזה בתאריך הזה.</p>
              ) : (
                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                  {freeStarts.map((t) => (
                    <Chip key={t} active={time === t} onClick={() => setTime(t)}>
                      {t}
                    </Chip>
                  ))}
                </div>
              )}
              {busyErr && <p className="text-[11px] text-muted-foreground">בדיקת היומן חלקית — הזמינות תאומת סופית בשריון.</p>}
            </Field>
          )}
          {price > 0 && (
            <p className="rounded-lg bg-secondary/50 px-3 py-2 text-xs">
              מחיר: <b>{price}₪</b>
              {morning ? " (חבילת 3 שעות מיוחדת)" : ""} · מקדמה לשריון 90₪
            </p>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <Field label="סוג הצילום">
            <div className="flex flex-wrap gap-1.5">
              {SESSION_TYPES.map((s) => (
                <Chip key={s} active={sessionType === s} onClick={() => setSessionType(s)}>
                  {s}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label="כמה אנשים בערך (אופציונלי)">
            <div className="flex flex-wrap gap-1.5">
              {PEOPLE.map((s) => (
                <Chip key={s} active={people === s} onClick={() => setPeople(people === s ? "" : s)}>
                  {s}
                </Chip>
              ))}
            </div>
          </Field>
          {(sessionType === "ניו-בורן" || sessionType === "חלאקה" || sessionType === "גיל שנה") && (
            <Field label="גיל התינוק/ת (אופציונלי)">
              <Input value={babyAge} onChange={(e) => setBabyAge(e.target.value)} placeholder="למשל: שבועיים" className="h-9 text-sm" />
            </Field>
          )}
          <Field label="מצלמה (אופציונלי)">
            <div className="flex flex-wrap gap-1.5">
              {CAMERA.map((s) => (
                <Chip key={s} active={camera === s} onClick={() => setCamera(camera === s ? "" : s)}>
                  {s}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label="ניסיון עם פלאש (אופציונלי)">
            <div className="flex flex-wrap gap-1.5">
              {FLASH.map((s) => (
                <Chip key={s} active={flash === s} onClick={() => setFlash(flash === s ? "" : s)}>
                  {s}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label="אביזרים (אופציונלי)">
            <div className="flex flex-wrap gap-1.5">
              {PROPS.map((s) => (
                <Chip key={s} active={props === s} onClick={() => setProps(props === s ? "" : s)}>
                  {s}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label="חבילת הדרכה (אופציונלי)">
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(GUIDANCE_FEES) as Array<keyof typeof GUIDANCE_FEES>).map((g) => (
                <Chip key={g} active={guidance === g} onClick={() => setGuidance(g)}>
                  {GUIDANCE_LABELS[g].split(" · ")[0]}
                  {GUIDANCE_FEES[g] ? ` +${GUIDANCE_FEES[g]}₪` : ""}
                </Chip>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">{GUIDANCE_LABELS[guidance]}</p>
          </Field>
          <Field label="בקשות מיוחדות (אופציונלי)">
            <Input value={special} onChange={(e) => setSpecial(e.target.value)} className="h-9 text-sm" />
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          {showContactFields ? (
            <>
          <Field label="שם מלא">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="h-9 text-sm" />
          </Field>
          <Field label="טלפון">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" dir="ltr" className="h-9 text-right text-sm" />
          </Field>
          <Field label="אימייל (לשם נשלח אישור ההזמנה)">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" dir="ltr" className="h-9 text-right text-sm" />
          </Field>
            </>
          ) : (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-secondary/40 px-3 py-2 text-xs">
              <span>
                פרטי קשר מהחשבון שלך: <b>{name}</b> · {phone} · {email}
              </span>
              <button type="button" onClick={() => setEditContact(true)} className="shrink-0 underline-offset-2 hover:underline">
                שינוי
              </button>
            </div>
          )}
          <div className="space-y-1.5 rounded-lg bg-secondary/40 p-2.5 text-[11px] leading-relaxed">
            <p className="font-semibold">תנאי הסטודיו המרכזיים</p>
            <p>• מקדמה 90₪ לשריון המועד — לא מוחזרת בביטול.</p>
            <p>• ביטול ביום הצילומים עצמו — תשלום של 100% מההזמנה.</p>
            <p>• נזק: עלות תיקון/רכישה + 20% דמי טיפול. בלגן משמעותי: 150₪ דמי ניקיון.</p>
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-xs">
            <Checkbox checked={terms} onCheckedChange={(v) => setTerms(v === true)} className="mt-0.5" />
            <span>קראתי ואני מאשרת את התנאים, וממשיכה בהזמנה כאורחת/כמחוברת.</span>
          </label>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div className="space-y-1.5 rounded-lg bg-secondary/50 p-2.5 text-xs">
            <p className="font-semibold">סיכום לפני אישור</p>
            <SummaryRow onEdit={() => setStep(0)}>
              {new Date(`${date}T00:00:00`).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "numeric" })} · {time}–{fmt(toMin(time) + hours * 60)} ({hoursLabel(hours)})
            </SummaryRow>
            <SummaryRow onEdit={() => setStep(1)}>
              {sessionType}
              {people ? ` · ${people} אנשים` : ""}
              {babyAge ? ` · גיל התינוק: ${babyAge}` : ""}
            </SummaryRow>
            <SummaryRow onEdit={() => { setEditContact(true); setStep(2); }}>
              {name} · {phone} · {email}
            </SummaryRow>
            <p>
              מחיר <b>{price}₪</b>
              {guidanceFee ? ` (כולל הדרכה ${guidanceFee}₪)` : ""} · מקדמה <b>90₪</b>
            </p>
          </div>
          {!morning && (
            <Field label="קוד קופון (אופציונלי)">
              <Input value={coupon} onChange={(e) => setCoupon(e.target.value)} dir="ltr" className="h-9 text-right text-sm" placeholder="למשל SWEETBABY10" />
              <p className="text-[11px] text-muted-foreground">ההנחה תחושב ותוצג בשריון.</p>
            </Field>
          )}
          {isMember && creditBalance > 0 && (
            <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-secondary/40 px-3 py-2 text-xs">
              <Checkbox checked={useCredit} onCheckedChange={(v) => setUseCredit(v === true)} />
              <span>
                להשתמש בקרדיט שלי (₪{creditBalance.toFixed(0)}){useCredit ? ` — יקוזזו ₪${creditApplied}` : ""}
              </span>
            </label>
          )}
          {!isMember && (
            <p className="rounded-lg bg-accent/20 px-3 py-2 text-[11px] leading-snug">
              💡 מומלץ{" "}
              <Link to="/auth" search={{ redirect: "/" }} className="font-semibold underline">
                להתחבר
              </Link>{" "}
              לפני השריון — לקוחות מחוברות מקבלות את הפרטים ממולאים, צוברות ומשתמשות בקרדיט, ורואות את כל ההזמנות שלהן בחשבון. ההתקדמות שמילאת כאן נשמרת.
            </p>
          )}
          <Field label="איך תרצי לטפל במקדמה?">
            <div className="flex flex-wrap gap-1.5">
              {DEPOSIT_PLANS.map((p) => (
                <Chip key={p.id} active={plan === p.id} onClick={() => setPlan(p.id)}>
                  {p.label}
                </Chip>
              ))}
            </div>
          </Field>
          <p className="text-[11px] text-muted-foreground">אחרי האישור המועד נשמר לך זמנית, ויופיע כפתור אחד לתשלום המקדמה (אשראי, ביט או העברה).</p>
          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
        </div>
      )}

      {/* navigation */}
      <div className="space-y-1.5 border-t border-secondary pt-2.5">
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={step === 0 || submitting}
            onClick={() => {
              setError("");
              setStep((s) => Math.max(0, s - 1));
            }}
            className="h-9 rounded-full text-xs"
          >
            <ChevronRight className="size-3.5" /> חזרה לשלב הקודם
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" size="sm" disabled={!canContinue} onClick={() => setStep((s) => s + 1)} className="h-9 rounded-full px-5 text-xs">
              המשך
            </Button>
          ) : (
            <Button type="button" size="sm" disabled={!canContinue || submitting} onClick={submit} className="h-9 rounded-full px-5 text-xs">
              {submitting ? <Loader2 className="size-3.5 animate-spin" /> : "אישור ושריון"}
            </Button>
          )}
        </div>
        {!canContinue && <p className="text-[11px] leading-snug text-muted-foreground">כדי להמשיך: {missing.join(" · ")}</p>}
      </div>
    </div>
  );
}

function SummaryRow({ children, onEdit }: { children: React.ReactNode; onEdit: () => void }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <p className="min-w-0 flex-1 break-words">{children}</p>
      <button type="button" onClick={onEdit} className="shrink-0 text-[11px] font-semibold text-primary underline">
        שינוי
      </button>
    </div>
  );
}

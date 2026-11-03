import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ChevronRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { placeOrder, checkItemsAvailability } from "@/lib/orders.functions";
import { useProfilePrefill } from "@/hooks/use-profile";
import { PROPS_LATEST_HANDOFF } from "@/lib/props-hours";

/**
 * Props-rental wizard inside the chat (owner approval 2026-11-03), same look as ChatBookingWizard:
 * 1 dates → 2 cart items (with availability) → 3 details + terms → 4 summary + confirm.
 * Uses the real cart and the same server calls as /checkout (checkItemsAvailability, placeOrder).
 * Every step has a "back" button and an explanation under a disabled "continue".
 */
const STEPS = ["תאריכי השכרה", "הפריטים שלי", "פרטים ותנאים", "סיכום ואישור"] as const;
const MIN_ORDER = 50;
const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });

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
function Row({ children, onEdit }: { children: React.ReactNode; onEdit: () => void }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <p className="min-w-0 flex-1 break-words">{children}</p>
      <button type="button" onClick={onEdit} className="shrink-0 text-[11px] font-semibold text-primary underline">
        שינוי
      </button>
    </div>
  );
}

type Done = { id: string; total: number; deposit: number };

export function ChatPropsWizard({ onClose, onOrdered }: { onClose: () => void; onOrdered: (summary: string) => void }) {
  const cart = useCart();
  const profile = useProfilePrefill();
  const [step, setStep] = useState(0);
  const [pickup, setPickup] = useState("");
  const [pickupTime, setPickupTime] = useState("10:00");
  const [ret, setRet] = useState("");
  const [returnTime, setReturnTime] = useState("18:00");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [terms, setTerms] = useState(false);
  const [notes, setNotes] = useState("");
  const [avail, setAvail] = useState<Record<string, { available: number }> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Done | null>(null);
  const [member, setMember] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [applying, setApplying] = useState(false);
  const [creditBalance, setCreditBalance] = useState(0);
  const [useCredit, setUseCredit] = useState(false);

  useEffect(() => {
    if (!profile.loaded) return;
    setName((v) => v || profile.fullName);
    setPhone((v) => v || profile.phone);
  }, [profile.loaded, profile.fullName, profile.phone]);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (u && !u.is_anonymous) {
        setMember(true);
        if (u.email) setEmail((v) => v || u.email!);
        (supabase as any)
          .from("customer_loyalty")
          .select("credit_balance")
          .eq("user_id", u.id)
          .maybeSingle()
          .then(({ data: loy }: any) => setCreditBalance(Number(loy?.credit_balance ?? 0)));
      }
    });
  }, []);

  const skus = useMemo(() => cart.lines.map((l) => l.sku).join(","), [cart.lines]);
  useEffect(() => {
    if (!pickup || !ret || ret < pickup || !skus) {
      setAvail(null);
      return;
    }
    let off = false;
    checkItemsAvailability({ data: { skus: skus.split(","), from: pickup, to: ret } })
      .then((r: any) => !off && setAvail(r))
      .catch(() => !off && setAvail(null));
    return () => {
      off = true;
    };
  }, [skus, pickup, ret]);

  const unavailable = cart.lines.filter((l) => avail && avail[l.sku] && avail[l.sku].available < l.quantity);
  const phoneOk = phone.replace(/\D/g, "").length >= 9;
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());

  const missing: string[] = [];
  if (step === 0) {
    if (!pickup) missing.push("בחרי תאריך איסוף");
    else if (pickup < todayIso()) missing.push("תאריך האיסוף עבר");
    if (!ret) missing.push("בחרי תאריך החזרה");
    else if (pickup && ret < pickup) missing.push("ההחזרה לא יכולה להיות לפני האיסוף");
    if (pickupTime > PROPS_LATEST_HANDOFF || returnTime > PROPS_LATEST_HANDOFF) missing.push(`איסוף והחזרה עד ${PROPS_LATEST_HANDOFF}`);
  } else if (step === 1) {
    if (cart.lines.length === 0) missing.push("העגלה ריקה — בקשי ממני אביזרים או הוסיפי מהקטלוג");
    else if (cart.subtotal < MIN_ORDER) missing.push(`מינימום הזמנה ₪${MIN_ORDER} — חסרים ₪${MIN_ORDER - cart.subtotal}`);
    if (unavailable.length) missing.push(`לא פנוי בתאריכים: ${unavailable.map((l) => l.name).join(", ")} — אפשר להסיר או לשנות תאריכים`);
  } else if (step === 2) {
    if (!name.trim()) missing.push("חסר שם מלא");
    if (!phoneOk) missing.push("חסר טלפון תקין");
    if (!emailOk) missing.push("חסר אימייל תקין (אליו נשלח הסיכום)");
    if (!terms) missing.push("צריך לאשר את התנאים");
  }
  const canContinue = missing.length === 0;

  const creditApplied = useCredit ? Math.min(creditBalance, cart.total) : 0;
  const onApplyCoupon = async () => {
    setApplying(true);
    const res = await cart.applyCoupon(couponInput);
    setApplying(false);
    if (res.ok) {
      toast.success(res.message);
      setCouponInput("");
    } else toast.error(res.message);
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const { error: e } = await supabase.auth.signInAnonymously();
        if (e) throw new Error("לא הצלחתי להמשיך כאורחת. אפשר להתחבר ולנסות שוב.");
      }
      const res: any = await placeOrder({
        data: {
          lines: cart.lines.map((l) => ({ id: l.id, name: l.name, sku: l.sku, price: l.price, quantity: l.quantity })),
          contact_name: name.trim(),
          contact_phone: phone.trim(),
          contact_email: email.trim(),
          session_date: pickup,
          start_time: pickupTime,
          return_date: ret,
          end_time: returnTime,
          notes: ["הוזמן דרך אשף האביזרים בצ'אט", notes].filter(Boolean).join("\n"),
          coupon: cart.coupon?.code ?? null,
          use_credit: creditApplied > 0 ? creditApplied : undefined,
          terms_accepted: true as const,
        },
      } as any);
      cart.clear();
      const d: Done = { id: res.id, total: Number(res.total ?? cart.total), deposit: Number(res.deposit ?? 0) };
      setDone(d);
      onOrdered(`ההזמנה נוצרה (ממתינה לתשלום): ${cart.lines.length} פריטים, איסוף ${pickup}, החזרה ${ret}, סה״כ ${d.total}₪.`);
    } catch (e: any) {
      setError(e?.message ?? "שגיאה לא צפויה");
      toast.error("ההזמנה לא נוצרה");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="mt-2 space-y-2 rounded-2xl border border-primary/30 bg-secondary/40 p-3 text-sm">
        <p className="flex items-center gap-1.5 font-semibold text-primary">
          <Check className="size-4" /> ההזמנה נוצרה 💗
        </p>
        <p className="rounded-lg bg-accent/20 px-3 py-2 text-xs leading-snug">
          ⏳ הפריטים נשמרים לך <b>זמנית</b> — ההזמנה תאושר סופית רק אחרי התשלום. בלי תשלום השריון עלול להשתחרר.
        </p>
        <Button asChild size="lg" className="h-11 w-full rounded-full text-sm font-semibold shadow-md">
          <Link to="/deposit/$type/$id" params={{ type: "order", id: done.id }}>
            לתשלום עכשיו{done.deposit ? ` · ${done.deposit}₪` : ""}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-3 rounded-2xl border border-primary/30 bg-card p-3 text-sm" dir="rtl">
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
          <Field label="תאריך איסוף">
            <div className="flex gap-2">
              <Input type="date" min={todayIso()} value={pickup} onChange={(e) => { setPickup(e.target.value); if (!ret || ret < e.target.value) setRet(e.target.value); }} className="h-9 text-sm" />
              <Input type="time" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} className="h-9 w-28 text-sm" />
            </div>
          </Field>
          <Field label="תאריך החזרה">
            <div className="flex gap-2">
              <Input type="date" min={pickup || todayIso()} value={ret} onChange={(e) => setRet(e.target.value)} className="h-9 text-sm" />
              <Input type="time" value={returnTime} onChange={(e) => setReturnTime(e.target.value)} className="h-9 w-28 text-sm" />
            </div>
          </Field>
          <p className="text-[11px] text-muted-foreground">איסוף והחזרה עד {PROPS_LATEST_HANDOFF}.</p>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-2">
          {cart.lines.length === 0 ? (
            <p className="rounded-lg bg-secondary/50 p-3 text-xs">העגלה ריקה. כתבי לי איזה אביזרים מעניינים אותך ואוסיף לעגלה, או{" "}
              <Link to="/rental-catalog" className="font-semibold underline">לקטלוג</Link>.</p>
          ) : (
            <ul className="space-y-1.5">
              {cart.lines.map((l) => {
                const bad = unavailable.includes(l);
                return (
                  <li key={l.id} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs ${bad ? "border-destructive/50 bg-destructive/5" : "border-primary/15"}`}>
                    <span className="min-w-0 flex-1 truncate">{l.name}{bad ? " · לא פנוי בתאריכים" : ""}</span>
                    <span className="shrink-0 text-muted-foreground">₪{l.price}</span>
                    <div className="flex items-center gap-1">
                      <button type="button" className="size-6 rounded-full border" onClick={() => cart.setQty(l.id, l.quantity - 1)} aria-label="פחות">−</button>
                      <span className="w-4 text-center">{l.quantity}</span>
                      <button type="button" className="size-6 rounded-full border" onClick={() => cart.setQty(l.id, l.quantity + 1)} aria-label="עוד">+</button>
                    </div>
                    <button type="button" className="text-[11px] text-destructive underline" onClick={() => cart.remove(l.id)}>הסרה</button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs">סה״כ פריטים: <b>₪{cart.subtotal}</b></p>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-2.5">
          <Field label="שם מלא"><Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" /></Field>
          <Field label="טלפון"><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" dir="ltr" className="h-9 text-right text-sm" /></Field>
          <Field label="אימייל"><Input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" dir="ltr" className="h-9 text-right text-sm" /></Field>
          <Field label="הערות (אופציונלי)"><Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-9 text-sm" /></Field>
          {!member && (
            <p className="rounded-lg bg-accent/20 px-3 py-2 text-[11px] leading-snug">
              💡 מומלץ <Link to="/auth" search={{ redirect: "/" }} className="font-semibold underline">להתחבר</Link> — הפרטים ימולאו לבד, והקרדיט וההזמנות יישמרו בחשבון.
            </p>
          )}
          <label className="flex cursor-pointer items-start gap-2 text-xs">
            <Checkbox checked={terms} onCheckedChange={(v) => setTerms(v === true)} className="mt-0.5" />
            <span>קראתי ואני מאשרת את תנאי ההשכרה: החזרה בזמן ובמצב תקין, נזק או אובדן מחויבים, ניקיון נדרש.</span>
          </label>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-2.5">
          <div className="space-y-1.5 rounded-lg bg-secondary/50 p-2.5 text-xs">
            <p className="font-semibold">סיכום לפני אישור</p>
            <Row onEdit={() => setStep(0)}>איסוף {pickup} {pickupTime} · החזרה {ret} {returnTime}</Row>
            <Row onEdit={() => setStep(1)}>{cart.lines.map((l) => `${l.name} ×${l.quantity}`).join(", ")}</Row>
            <Row onEdit={() => setStep(2)}>{name} · {phone} · {email}</Row>
            <p>
              סה״כ <b>₪{cart.total}</b>
              {cart.discount > 0 ? ` (אחרי הנחה ₪${cart.discount})` : ""}
              {creditApplied > 0 ? ` · קרדיט −₪${creditApplied}` : ""}
            </p>
          </div>
          <Field label="קוד קופון (אופציונלי)">
            {cart.coupon ? (
              <p className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2 text-xs">
                <span>קופון {cart.coupon.code} הופעל</span>
                <button type="button" className="text-destructive underline" onClick={() => cart.removeCoupon()}>הסרה</button>
              </p>
            ) : (
              <div className="flex gap-2">
                <Input value={couponInput} onChange={(e) => setCouponInput(e.target.value)} dir="ltr" className="h-9 text-right text-sm" placeholder="למשל SWEETBABY10" />
                <Button type="button" size="sm" variant="outline" disabled={applying || !couponInput.trim()} onClick={onApplyCoupon} className="h-9 rounded-full text-xs">
                  {applying ? <Loader2 className="size-3.5 animate-spin" /> : "הפעלה"}
                </Button>
              </div>
            )}
          </Field>
          {member && creditBalance > 0 && (
            <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-secondary/40 px-3 py-2 text-xs">
              <Checkbox checked={useCredit} onCheckedChange={(v) => setUseCredit(v === true)} />
              <span>להשתמש בקרדיט שלי (₪{creditBalance.toFixed(0)}){useCredit ? ` — יקוזזו ₪${creditApplied}` : ""}</span>
            </label>
          )}
          <p className="text-[11px] text-muted-foreground">אחרי האישור הפריטים נשמרים לך זמנית, ויופיע כפתור אחד לתשלום.</p>
          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
        </div>
      )}

      <div className="space-y-1.5 border-t border-secondary pt-2.5">
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" disabled={step === 0 || submitting} onClick={() => { setError(""); setStep((s) => Math.max(0, s - 1)); }} className="h-9 rounded-full text-xs">
            <ChevronRight className="size-3.5" /> חזרה לשלב הקודם
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" size="sm" disabled={!canContinue} onClick={() => setStep((s) => s + 1)} className="h-9 rounded-full px-5 text-xs">
              המשך
            </Button>
          ) : (
            <Button type="button" size="sm" disabled={submitting} onClick={submit} className="h-9 rounded-full px-5 text-xs">
              {submitting ? <Loader2 className="size-3.5 animate-spin" /> : "אישור והזמנה"}
            </Button>
          )}
        </div>
        {!canContinue && <p className="text-[11px] leading-snug text-muted-foreground">כדי להמשיך: {missing.join(" · ")}</p>}
      </div>
    </div>
  );
}

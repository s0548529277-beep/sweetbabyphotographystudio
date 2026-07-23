import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useServerFn } from "@tanstack/react-start";
import { placeOrder, checkItemsAvailability } from "@/lib/orders.functions";
import { toast } from "sonner";
import { Lock, Camera, CalendarDays, CheckCircle2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/checkout")({
  component: Checkout,
  head: () => ({ meta: [
    { title: "סיכום הזמנה | Sweetbaby" },
    { name: "description", content: "סיכום הזמנה, בדיקת זמינות אביזרים לתאריך שלך ותשלום מקדמה." },
    { name: "robots", content: "noindex, follow" },
  ], links: [{ rel: "canonical", href: "https://sweetbabyphotographystudio.lovable.app/checkout" }] }),
});

function Checkout() {
  const { lines, subtotal, clear } = useCart();
  const { user } = useAuth();
  const nav = useNavigate();
  const place = useServerFn(placeOrder);
  const checkAvail = useServerFn(checkItemsAvailability);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    contact_name: "",
    contact_phone: "",
    session_date: "",
    start_time: "09:00",
    return_date: "",
    end_time: "18:00",
    camera_model: "",
    notes: "",
    terms_accepted: false,
  });
  const [availability, setAvailability] = useState<Record<string, { stock: number; taken: number; available: number }> | null>(null);
  const [checking, setChecking] = useState(false);

  // 24h-multiplier: any rental up to 24h = base, 24-48h = x2, and so on.
  const dayMultiplier = (() => {
    if (!form.session_date || !form.return_date) return 1;
    const s = new Date(`${form.session_date}T${form.start_time || "09:00"}:00`).getTime();
    const e = new Date(`${form.return_date}T${form.end_time || form.start_time || "18:00"}:00`).getTime();
    if (!isFinite(s) || !isFinite(e) || e <= s) return 1;
    return Math.max(1, Math.ceil((e - s) / (1000 * 60 * 60 * 24)));
  })();
  const chargedTotal = subtotal * dayMultiplier;

  const disabled = lines.length === 0 || subtotal < 50;

  // Auto-check availability whenever dates change
  useEffect(() => {
    if (!form.session_date || !form.return_date || lines.length === 0) {
      setAvailability(null); return;
    }
    if (form.return_date < form.session_date) { setAvailability(null); return; }
    let cancelled = false;
    setChecking(true);
    checkAvail({ data: { skus: lines.map((l) => l.sku), from: form.session_date, to: form.return_date } })
      .then((r) => { if (!cancelled) setAvailability(r); })
      .catch(() => { if (!cancelled) setAvailability(null); })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [form.session_date, form.return_date, lines, checkAvail]);

  const anyUnavailable = availability
    ? lines.some((l) => (availability[l.sku]?.available ?? 0) < l.quantity)
    : false;

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <section className="container-page py-24 flex-1">
          <div className="max-w-md mx-auto text-center glass-card rounded-3xl p-10">
            <Lock className="h-8 w-8 text-primary/40 mx-auto mb-3" />
            <h2 className="font-display text-3xl text-primary mb-2">התחברות נדרשת</h2>
            <p className="text-muted-foreground text-sm mb-6">כדי לשמור את ההזמנה, יש להיכנס תחילה.</p>
            <Link to="/auth" search={{ redirect: "/checkout" }}>
              <Button className="rounded-full w-full">התחברות</Button>
            </Link>
          </div>
        </section>
        <Footer />
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled || !form.terms_accepted || !form.session_date || !form.return_date || anyUnavailable) return;
    setBusy(true);
    try {
      const res = await place({
        data: {
          lines: lines.map((l) => ({ id: l.id, name: l.name, sku: l.sku, price: l.price, quantity: l.quantity })),
          contact_name: form.contact_name,
          contact_phone: form.contact_phone,
          camera_model: form.camera_model || null,
          session_date: form.session_date,
          start_time: form.start_time || undefined,
          return_date: form.return_date,
          end_time: form.end_time || undefined,
          notes: form.notes,
          terms_accepted: true as const,
        },
      });
      toast.success("ההזמנה נשמרה!");
      clear();
      nav({ to: "/summary/$type/$id", params: { type: "order", id: res.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בשליחת ההזמנה");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <section className="container-page py-14 flex-1">
        <div className="text-xs tracking-[0.3em] uppercase text-forest/70 mb-3">Checkout</div>
        <h1 className="font-display text-5xl text-primary mb-10">סיכום ההזמנה</h1>

        <form onSubmit={submit} className="grid lg:grid-cols-[1fr_400px] gap-10">
          <div className="space-y-6">
            <div className="glass-card rounded-3xl p-8">
              <h2 className="font-display text-2xl text-primary mb-6">פרטי איש קשר</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>שם מלא *</Label>
                  <Input required value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>טלפון *</Label>
                  <Input required type="tel" dir="ltr" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> תאריך איסוף *</Label>
                  <Input required type="date" min={new Date().toISOString().slice(0,10)} value={form.session_date} onChange={(e) => setForm({ ...form, session_date: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>שעת איסוף *</Label>
                  <Input required type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> תאריך החזרה *</Label>
                  <Input required type="date" min={form.session_date || new Date().toISOString().slice(0,10)} value={form.return_date} onChange={(e) => setForm({ ...form, return_date: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>שעת החזרה *</Label>
                  <Input required type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} className="mt-1" />
                </div>
                <div className="md:col-span-2 -mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blush/40 text-primary font-medium">
                    <AlertTriangle className="h-3 w-3" /> תמחור לפי 24 שעות · מכפיל נוכחי: ×{dayMultiplier}
                  </span>
                  <span className="text-muted-foreground">חובה לעדכן מראש אם צפוי איחור — כל 24ש נוספות = תשלום כפול.</span>
                </div>
                <div className="md:col-span-2">
                  <Label className="flex items-center gap-1"><Camera className="h-3 w-3" /> דגם המצלמה (אופציונלי)</Label>
                  <Input placeholder="Canon R5 / Sony A7IV / ..." value={form.camera_model} onChange={(e) => setForm({ ...form, camera_model: e.target.value })} className="mt-1" />
                </div>
              </div>
              <div className="mt-4">
                <Label>הערות</Label>
                <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" />
              </div>
            </div>

            {form.session_date && form.return_date && (
              <div className="glass-card rounded-3xl p-6">
                <h3 className="font-display text-xl text-primary mb-4">זמינות לתאריכים שבחרת</h3>
                {checking ? (
                  <div className="text-sm text-muted-foreground">בודקת זמינות…</div>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {lines.map((l) => {
                      const a = availability?.[l.sku];
                      const ok = a ? a.available >= l.quantity : true;
                      return (
                        <li key={l.id} className="flex items-center justify-between">
                          <span className="truncate ml-2">{l.name} × {l.quantity}</span>
                          <span className={ok ? "text-forest flex items-center gap-1" : "text-destructive flex items-center gap-1"}>
                            {ok ? <><CheckCircle2 className="h-4 w-4" /> זמין</> : <><AlertTriangle className="h-4 w-4" /> תפוס</>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {anyUnavailable && (
                  <p className="text-xs text-destructive mt-3">
                    יש פריטים לא זמינים בתאריכים אלה. יש לבחור תאריכים אחרים או לעדכן את הסל.
                  </p>
                )}
              </div>
            )}

            <div className="glass-card rounded-3xl p-8">
              <h2 className="font-display text-xl text-primary mb-1">תנאי השכרה</h2>
              <p className="text-xs text-muted-foreground mb-4">
                מיקום הסטודיו: <span className="font-medium text-primary">תלמוד ירושלמי 24, בית שמש</span>
              </p>
              <ul className="text-xs text-muted-foreground space-y-1.5 mb-4 max-h-32 overflow-y-auto pr-2">
                <li>· חפץ שלא ייאסף תוך 30 יום ייכנס למאגר האביזרים.</li>
                <li>· ניקיון: השארת מקום מלוכלך – חיוב 150₪.</li>
                <li>· רקעי נייר לקירות בלבד. שימוש כרצפה – 50₪ מראש. נזק – 100₪ למטר.</li>
                <li>· נזק לציוד – עלות התיקון + 20% דמי טיפול.</li>
                <li>· ביטול עד יום האירוע – מקדמה לא מוחזרת. ביטול ביום עצמו – חיוב 100%.</li>
              </ul>
              <label className="flex items-start gap-2 text-sm cursor-pointer bg-blush/30 rounded-2xl p-4 border border-blush">
                <Checkbox checked={form.terms_accepted} onCheckedChange={(v) => setForm({ ...form, terms_accepted: !!v })} className="mt-0.5" />
                <span className="font-medium">אני מאשר/ת שקראתי את הכללים ואני מסכימה לתנאי ההשכרה *</span>
              </label>
            </div>
          </div>

          <aside className="bg-primary text-primary-foreground rounded-3xl p-8 h-fit lg:sticky lg:top-24">
            <div className="text-blush text-xs tracking-[0.3em] uppercase mb-2">Order</div>
            <h2 className="font-display text-3xl mb-6">ההזמנה שלי</h2>
            <div className="space-y-2 text-sm max-h-64 overflow-y-auto">
              {lines.map((l) => (
                <div key={l.id} className="flex justify-between text-primary-foreground/80">
                  <span className="truncate ml-2">{l.name} × {l.quantity}</span>
                  <span>₪{(l.price * l.quantity).toFixed(0)}</span>
                </div>
              ))}
            </div>
            <div className="h-px bg-primary-foreground/20 my-4" />
            <div className="flex justify-between items-baseline">
              <span className="text-primary-foreground/70">סה״כ</span>
              <span className="font-display text-3xl text-blush">₪{subtotal.toFixed(0)}</span>
            </div>
            <div className="text-[11px] text-primary-foreground/60 mt-2">מינימום 50₪. מקדמה 90₪ תיגבה לפני הצילום.</div>
            <Button
              type="submit"
              disabled={disabled || busy || !form.terms_accepted || !form.session_date || !form.return_date || anyUnavailable}
              className="w-full mt-6 rounded-full h-12 bg-blush text-primary hover:bg-blush-deep"
            >
              {busy ? "שולח…" : "אישור הזמנה"}
            </Button>
            {anyUnavailable && (
              <div className="text-xs text-blush mt-2 text-center">חלק מהאביזרים תפוסים בתאריכים שנבחרו</div>
            )}
          </aside>
        </form>
      </section>
      <Footer />
    </div>
  );
}

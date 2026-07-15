import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
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
import { placeOrder } from "@/lib/orders.functions";
import { toast } from "sonner";
import { Lock, Camera } from "lucide-react";

export const Route = createFileRoute("/checkout")({
  component: Checkout,
  head: () => ({ meta: [
    { title: "סיכום הזמנה | Sweetbaby" },
    { name: "description", content: "סיכום הזמנה והזנת פרטי צילום ב-Sweetbaby — השכרת אביזרים, דגם מצלמה, תאריך ותשלום מקדמה." },
    { property: "og:title", content: "סיכום הזמנה | Sweetbaby" },
    { property: "og:description", content: "סיכום הזמנה והזנת פרטי צילום ב-Sweetbaby — השכרת אביזרים, דגם מצלמה, תאריך ותשלום מקדמה." },
    { property: "og:url", content: "https://sweetbabyphotographystudio.lovable.app/checkout" },
    { name: "robots", content: "noindex, follow" },
  ], links: [{ rel: "canonical", href: "https://sweetbabyphotographystudio.lovable.app/checkout" }] }),
});

function Checkout() {
  const { lines, subtotal, clear } = useCart();
  const { user } = useAuth();
  const nav = useNavigate();
  const place = useServerFn(placeOrder);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    contact_name: "",
    contact_phone: "",
    session_date: "",
    return_date: "",
    camera_model: "",
    notes: "",
    terms_accepted: false,
    pickup_form_submitted: false,
  });

  const disabled = lines.length === 0 || subtotal < 50;

  const skuList = lines.map((l) => `${l.sku} × ${l.quantity} (${l.name})`).join(", ");
  const pickupFormUrl = (() => {
    const base = "https://docs.google.com/forms/d/e/1FAIpQLSc4atGAeD36M3Q8S27w6JZAZyKWM86AapSYNYv4sNAYXlgJwQ/viewform";
    const params = new URLSearchParams({
      "entry.1462159346": skuList,
      "entry.1909001795": form.contact_name,
      "entry.1252723948": form.contact_phone,
      "entry.1772840725": user?.email ?? "",
      "entry.1074291119": form.session_date,
    });
    return `${base}?${params.toString()}`;
  })();
  const pickupFormEmbedUrl = pickupFormUrl.replace("/viewform?", "/viewform?embedded=true&");

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <section className="container-page py-24 flex-1">
          <div className="max-w-md mx-auto text-center glass-card rounded-3xl p-10">
            <Lock className="h-8 w-8 text-primary/40 mx-auto mb-3" />
            <h2 className="font-display text-3xl text-primary mb-2">התחברות נדרשת</h2>
            <p className="text-muted-foreground text-sm mb-6">כדי לשמור את ההזמנה שלך, יש להיכנס תחילה.</p>
            <div className="mb-6 rounded-2xl border border-blush bg-blush/20 p-4 text-right text-xs text-muted-foreground">
              <p className="mb-2">
                מיקום הסטודיו: <span className="font-medium text-primary">תלמוד ירושלמי 24, בית שמש</span>
              </p>
              <a
                href="https://docs.google.com/forms/d/e/1FAIpQLSdVqfjJ53OzK55mXvEeExdHp0lEWFN7RJgwtG7OSqD94KjEhg/viewform"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-forest underline underline-offset-4 hover:text-primary"
              >
                לקריאת הכללים המלאים והחתמה בטופס
              </a>
              <label className="mt-3 flex items-start gap-2 rounded-xl border border-blush bg-background/70 p-3 text-sm font-medium text-primary">
                <Checkbox checked={false} disabled className="mt-0.5" />
                <span>אני מאשר/ת שקראתי את הכללים ואני מסכימה לתנאי ההשכרה *</span>
              </label>
              <p className="mt-2">לאחר ההתחברות ניתן יהיה לסמן את הצ׳קבוקס ולהמשיך לשליחת ההזמנה.</p>
            </div>
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
    if (disabled || !form.terms_accepted || !form.pickup_form_submitted) return;
    setBusy(true);
    try {
      const res = await place({
        data: {
          lines: lines.map((l) => ({ id: l.id, name: l.name, sku: l.sku, price: l.price, quantity: l.quantity })),
          contact_name: form.contact_name,
          contact_phone: form.contact_phone,
          camera_model: form.camera_model,
          session_date: form.session_date,
          return_date: form.return_date || null,
          notes: form.notes,
          terms_accepted: true as const,
        },
      });
      toast.success("ההזמנה נשמרה. ממשיכות לתשלום מקדמה.");
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
                  <Label>מתי נתראה? *</Label>
                  <Input required type="date" value={form.session_date} onChange={(e) => setForm({ ...form, session_date: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>תאריך החזרה</Label>
                  <Input type="date" value={form.return_date} onChange={(e) => setForm({ ...form, return_date: e.target.value })} className="mt-1" />
                </div>
                <div className="md:col-span-2">
                  <Label className="flex items-center gap-1"><Camera className="h-3 w-3" /> דגם המצלמה שלך *</Label>
                  <Input required placeholder="Canon R5 / Sony A7IV / ..." value={form.camera_model} onChange={(e) => setForm({ ...form, camera_model: e.target.value })} className="mt-1" />
                </div>
              </div>
              <div className="mt-4">
                <Label>הערות</Label>
                <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" />
              </div>
            </div>

            <div className="glass-card rounded-3xl p-8">
              <h2 className="font-display text-xl text-primary mb-1">תנאי השכרה</h2>
              <p className="text-xs text-muted-foreground mb-4">
                מיקום הסטודיו: <span className="font-medium text-primary">תלמוד ירושלמי 24, בית שמש</span>
              </p>
              <ul className="text-xs text-muted-foreground space-y-1.5 mb-4 max-h-32 overflow-y-auto pr-2">
                <li>· חפץ שלא ייאסף תוך 30 יום ייכנס למאגר האביזרים.</li>
                <li>· ניקיון: השארת מקום מלוכלך – חיוב 150₪.</li>
                <li>· כיבוי אורות/מזגן: 7₪ לשעה עד השעה 08:00 למחרת.</li>
                <li>· רקעי נייר לקירות בלבד. שימוש כרצפה – 50₪ מראש. נזק – 100₪ למטר.</li>
                <li>· נזק לציוד (פלאש, משדרים) – עלות התיקון + 20% דמי טיפול.</li>
                <li>· חריגה 15-44 דק' = חצי שעת חיוב. 45+ דק' = שעה מלאה.</li>
                <li>· ביטול עד יום האירוע – מקדמה לא מוחזרת. ביטול ביום עצמו – חיוב 100%.</li>
              </ul>
              <a
                href="https://docs.google.com/forms/d/e/1FAIpQLSdVqfjJ53OzK55mXvEeExdHp0lEWFN7RJgwtG7OSqD94KjEhg/viewform"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-forest hover:text-primary underline underline-offset-4 mb-4"
              >
                לקריאת הכללים המלאים והחתמה בטופס →
              </a>
              <label className="flex items-start gap-2 text-sm cursor-pointer bg-blush/30 rounded-2xl p-4 border border-blush mt-2">
                <Checkbox
                  checked={form.terms_accepted}
                  onCheckedChange={(v) => setForm({ ...form, terms_accepted: !!v })}
                  className="mt-0.5"
                />
                <span className="font-medium">
                  אני מאשר/ת שקראתי את הכללים ואני מסכימה לתנאי ההשכרה *
                </span>
              </label>
            </div>

            <div className="glass-card rounded-3xl p-8">
              <div className="text-xs tracking-[0.3em] uppercase text-forest/70 mb-2">Pickup Form</div>
              <h2 className="font-display text-2xl text-primary mb-2">טופס איסוף אביזרים</h2>
              <p className="text-sm text-muted-foreground mb-4">
                לפני התשלום — יש למלא ולשלוח את טופס איסוף האביזרים. המק״טים שבחרת הועתקו אוטומטית לשדה "יש לפרט כאן את המק״טים של האביזרים להשכרה".
              </p>
              <div className="bg-blush/20 border border-blush rounded-2xl p-3 text-xs text-primary mb-4" dir="rtl">
                <div className="font-semibold mb-1">המק״טים שלך:</div>
                <div className="text-muted-foreground break-words">{skuList || "—"}</div>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                <a href={pickupFormUrl} target="_blank" rel="noopener noreferrer">
                  <Button type="button" variant="secondary" className="rounded-full">
                    פתחי את הטופס בחלון חדש ↗
                  </Button>
                </a>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => { navigator.clipboard.writeText(skuList); toast.success("המק״טים הועתקו"); }}
                >
                  העתיקי מק״טים
                </Button>
              </div>
              <div className="rounded-2xl overflow-hidden border border-primary/10 bg-white">
                <iframe
                  key={pickupFormEmbedUrl}
                  src={pickupFormEmbedUrl}
                  title="טופס איסוף אביזרים"
                  width="100%"
                  height="620"
                  frameBorder={0}
                  marginHeight={0}
                  marginWidth={0}
                >
                  בטעינה…
                </iframe>
              </div>
              <label className="flex items-start gap-2 text-sm cursor-pointer bg-blush/30 rounded-2xl p-4 border border-blush mt-4">
                <Checkbox
                  checked={form.pickup_form_submitted}
                  onCheckedChange={(v) => setForm({ ...form, pickup_form_submitted: !!v })}
                  className="mt-0.5"
                />
                <span className="font-medium">מילאתי ושלחתי את טופס איסוף האביזרים *</span>
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
            <div className="text-[11px] text-primary-foreground/60 mt-2">מינימום 50₪. מקדמה 90₪ תיגבה לפני יום הצילום.</div>
            <Button type="submit" disabled={disabled || busy || !form.terms_accepted || !form.pickup_form_submitted} className="w-full mt-6 rounded-full h-12 bg-blush text-primary hover:bg-blush-deep">
              {busy ? "שולח…" : "המשך לתשלום מקדמה"}
            </Button>
          </aside>
        </form>
      </section>
      <Footer />
    </div>
  );
}

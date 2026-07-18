import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductImage } from "@/components/ProductImage";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Minus, Plus, Trash2, ShoppingBag, Tag, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { GmailOverlay } from "@/components/GmailOverlay";

export const Route = createFileRoute("/cart")({
  component: Cart,
  head: () => ({ meta: [
    { title: "עגלת קניות | Sweetbaby" },
    { name: "description", content: "העגלה שלכם ב-Sweetbaby — סקירת אביזרי צילום נבחרים, הפעלת קוד קופון, בקשת מנוי ומעבר לתשלום מקדמה." },
    { property: "og:title", content: "עגלת קניות | Sweetbaby" },
    { property: "og:description", content: "העגלה שלכם ב-Sweetbaby — סקירת אביזרי צילום נבחרים, הפעלת קוד קופון, בקשת מנוי ומעבר לתשלום מקדמה." },
    { property: "og:url", content: "https://sweetbabyphotographystudio.lovable.app/cart" },
    { name: "robots", content: "noindex, follow" },
  ], links: [{ rel: "canonical", href: "https://sweetbabyphotographystudio.lovable.app/cart" }] }),
});

function Cart() {
  const { lines, remove, setQty, subtotal, count, coupon, applyCoupon, removeCoupon, discount, total } = useCart();
  const { user } = useAuth();
  const [couponInput, setCouponInput] = useState("");
  const [applying, setApplying] = useState(false);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [gmailUrl, setGmailUrl] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: user?.email ?? "", name: "", phone: "", referral: "", pickup: "",
    payment: "מזומן במקום", amount: "", agree: false, suggestion: "",
  });

  const onApply = async () => {
    setApplying(true);
    const res = await applyCoupon(couponInput);
    setApplying(false);
    if (res.ok) { toast.success(res.message); setCouponInput(""); }
    else toast.error(res.message);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <section className="container-page py-14 flex-1">
        <div className="text-xs tracking-[0.3em] uppercase text-forest/70 mb-3">Your Cart</div>
        <h1 className="font-display text-5xl text-primary mb-10">העגלה שלי</h1>

        {lines.length === 0 ? (
          <div className="rounded-3xl bg-cream/50 border border-primary/10 py-24 text-center">
            <ShoppingBag className="h-10 w-10 text-primary/40 mx-auto mb-4" />
            <div className="font-display text-2xl text-primary mb-2">העגלה שלכם ריקה</div>
            <p className="text-muted-foreground text-sm mb-6">גלו את הקטלוג והתחילו להרכיב את הסט המושלם.</p>
            <Link to="/rental-catalog"><Button className="rounded-full">לקטלוג</Button></Link>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[1fr_380px] gap-10">
            <div className="space-y-4">
              {lines.map((l) => (
                <div key={l.id} className="flex gap-4 items-center bg-card rounded-2xl p-4 border border-primary/5">
                  <div className="h-24 w-24 rounded-xl overflow-hidden bg-cream shrink-0">
                    <ProductImage imageUrl={l.image_url} alt={l.name} fallbackClassName="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-lg text-primary truncate">{l.name}</div>
                    <div className="text-xs text-muted-foreground tracking-widest">מק״ט {l.sku}</div>
                    <div className="font-display text-peach-deep text-lg mt-1">₪{l.price.toFixed(0)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="outline" className="h-8 w-8 rounded-full" aria-label={`הפחת כמות עבור ${l.name}`} onClick={() => setQty(l.id, l.quantity - 1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center font-medium">{l.quantity}</span>
                    <Button size="icon" variant="outline" className="h-8 w-8 rounded-full" aria-label={`הוסף כמות עבור ${l.name}`} onClick={() => setQty(l.id, l.quantity + 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <Button size="icon" variant="ghost" className="text-destructive" aria-label={`הסר את ${l.name} מהעגלה`} onClick={() => remove(l.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              {/* Coupon */}
              <div className="bg-card rounded-2xl p-5 border border-primary/5">
                <div className="flex items-center gap-2 mb-3">
                  <Tag className="h-4 w-4 text-peach-deep" />
                  <div className="font-display text-lg text-primary">קוד קופון</div>
                </div>
                {coupon ? (
                  <div className="flex items-center justify-between bg-peach/30 rounded-xl px-4 py-3">
                    <div className="text-sm">
                      <span className="font-semibold text-primary">{coupon.code}</span>
                      <span className="text-muted-foreground mr-2">
                        · הנחה {coupon.discount_percent ? `${coupon.discount_percent}%` : `₪${coupon.discount_amount}`}
                      </span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={removeCoupon} className="text-destructive">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value)}
                      placeholder="למשל SWEET10"
                      dir="ltr"
                      className="uppercase"
                    />
                    <Button onClick={onApply} disabled={applying || !couponInput.trim()} className="rounded-full shrink-0">
                      {applying ? "בודקת…" : "החל"}
                    </Button>
                  </div>
                )}
              </div>

              {/* Subscription CTA */}
              <SubscriptionCard user={user} />
            </div>

            <aside className="bg-[#f5d5cf] text-[#2d3d2b] rounded-3xl p-8 h-fit lg:sticky lg:top-24 shadow-xl border border-[#2d3d2b]/10">
              <div className="text-[#2d3d2b]/70 text-xs tracking-[0.3em] uppercase mb-2">Summary</div>
              <h2 className="font-display text-3xl mb-6">סיכום הזמנה</h2>
              <div className="space-y-3 text-sm">
                <Row k={`${count} פריטים`} v={`₪${subtotal.toFixed(0)}`} />
                {coupon && (
                  <Row k={`הנחה (${coupon.code})`} v={`-₪${discount.toFixed(0)}`} />
                )}
                <Row k="דמי טיפול" v="—" />
                <div className="h-px bg-[#2d3d2b]/15 my-3" />
                <Row k="סה״כ" v={`₪${total.toFixed(0)}`} big />
                {total < 50 && (
                  <p className="text-[#2d3d2b]/80 text-xs mt-3">מינימום להזמנה 50 ש״ח — יש להוסיף ₪{(50 - total).toFixed(0)}.</p>
                )}
              </div>
              <Button
                className="w-full mt-6 rounded-full h-12 bg-[#2d3d2b]/40 text-[#f5d5cf] cursor-not-allowed hover:bg-[#2d3d2b]/40"
                disabled
              >
                המשך לתשלום <span className="mr-2 text-[11px] tracking-widest opacity-80">· בקרוב</span>
              </Button>
              <Button
                variant="outline"
                className="w-full mt-2 rounded-full h-11 bg-white text-[#2d3d2b] border-[#2d3d2b]/15 hover:bg-white/80"
                disabled={lines.length === 0}
                onClick={() => setShowOrderForm(true)}
              >
                ✉️ שליחת הסל במייל (Gmail)
              </Button>
              <Link to="/rental-catalog" className="block text-center text-xs text-[#2d3d2b]/60 mt-4 hover:text-[#2d3d2b]">
                המשך קניה
              </Link>
            </aside>

          </div>
        )}
      </section>

      {/* Order form modal */}
      {showOrderForm && (
        <div
          className="fixed inset-0 bg-black/60 z-[210] flex items-start justify-center overflow-y-auto p-4"
          onClick={() => setShowOrderForm(false)}
          role="dialog"
          aria-modal="true"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.agree) return;
              const skusText = lines.map((l) => `${l.sku} × ${l.quantity}`).join(", ");
              const body = [
                "👋 הזמנת אביזרים — Sweetbaby",
                "",
                `1. מייל: ${form.email}`,
                `2. שם: ${form.name}`,
                `3. טלפון: ${form.phone}`,
                `4. איך הגעת אלינו: ${form.referral}`,
                `5. מתי נתראה (תאריך + שעות איסוף): ${form.pickup}`,
                "",
                "6. מק״טים של האביזרים להשכרה:",
                skusText || "(אין)",
                "",
                "פירוט פריטים:",
                ...lines.map((l) => `• ${l.name} (מק״ט ${l.sku}) — ₪${l.price} × ${l.quantity}`),
                ...(coupon ? [`קוד קופון: ${coupon.code} — הנחה ₪${discount.toFixed(0)}`] : []),
                `סה״כ: ₪${total.toFixed(0)}`,
                "",
                `7. אופן תשלום: ${form.payment}`,
                `8. סכום: ${form.amount}`,
                `9. אישור כללי השכרה: ${form.agree ? "כן, אני מאשרת" : "לא"}`,
                `11. הצעה לשיפור: ${form.suggestion || "—"}`,
              ].join("\n");
              const url = `https://mail.google.com/mail/?view=cm&fs=1&to=s0548529277@gmail.com&su=${encodeURIComponent("הזמנת אביזרים — Sweetbaby")}&body=${encodeURIComponent(body)}`;
              setGmailUrl(url);
              setShowOrderForm(false);
              toast.success("Gmail מוטמע לשליחת ההזמנה ✉️");
            }}
            className="relative w-full max-w-2xl my-8 bg-cream rounded-3xl p-6 md:p-8 shadow-2xl border border-primary/10"
          >
            <button
              type="button"
              onClick={() => setShowOrderForm(false)}
              className="absolute top-4 left-4 h-9 w-9 rounded-full bg-white text-primary flex items-center justify-center border border-primary/10"
              aria-label="סגור"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="text-center mb-6">
              <div className="text-xs tracking-[0.3em] uppercase text-forest/70 mb-2">Rental Order</div>
              <h3 className="font-display text-3xl text-primary">הזמנת אביזרים</h3>
              <p className="text-sm text-muted-foreground mt-2">👋 מלאי את הפרטים ונשלח את ההזמנה למייל של הסטודיו.</p>
            </div>

            <div className="space-y-3 text-right">
              <div><Label>1. מייל</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" /></div>
              <div><Label>2. שם *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" /></div>
              <div><Label>3. טלפון *</Label><Input required type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" /></div>
              <div><Label>4. איך הגעת אלינו? 📍</Label><Input value={form.referral} onChange={(e) => setForm({ ...form, referral: e.target.value })} placeholder="חברה, אינסטגרם, גוגל…" className="mt-1" /></div>
              <div><Label>5. מתי נתראה? (תאריך + טווח שעות איסוף)</Label><Input value={form.pickup} onChange={(e) => setForm({ ...form, pickup: e.target.value })} placeholder="לדוגמה: 20.7 בין 10:00–12:00" className="mt-1" /></div>

              <div className="rounded-2xl bg-white/70 border border-primary/10 p-4 text-xs text-forest/80 leading-relaxed">
                <b>6. מק״טים של האביזרים להשכרה</b> (ממולא אוטומטית מהסל):
                <div className="mt-2 font-mono text-primary">
                  {lines.length ? lines.map((l) => `${l.sku} × ${l.quantity}`).join(", ") : "— אין פריטים בסל —"}
                </div>
                <ul className="list-disc pr-5 mt-3 space-y-1">
                  <li>מינימום להזמנה: 50 ₪.</li>
                  <li>איסוף והחזרה תוך 24 שעות — כל יום נוסף מחויב בעלות השכרה נוספת.</li>
                  <li>האביזרים באחריות מלאה של השוכר — נזק יחויב לפי מחיר מלא.</li>
                  <li>יש להחזיר נקי ובמצב טוב.</li>
                </ul>
              </div>

              <div>
                <Label>7. איך את משלמת?</Label>
                <select value={form.payment} onChange={(e) => setForm({ ...form, payment: e.target.value })} className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option>מזומן במקום</option>
                  <option>העברה</option>
                  <option>BIT / PAYBOX</option>
                </select>
              </div>
              <div><Label>8. מה הסכום?</Label><Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder={`מוצע: ₪${total.toFixed(0)}`} className="mt-1" /></div>

              <label className="flex items-start gap-2 text-sm text-forest/80 bg-white/70 border border-primary/10 rounded-2xl p-3">
                <input type="checkbox" checked={form.agree} onChange={(e) => setForm({ ...form, agree: e.target.checked })} className="mt-1" required />
                <span>9. אני מאשרת כי קראתי בעיון את כללי השכרת האביזרים, מחירי ההשכרה והמדיניות, ואני מסכימה לפעול לפיהם במלואם.*</span>
              </label>

              <div><Label>11. יש לך הצעה לשיפור? (לא חובה)</Label><Textarea rows={3} value={form.suggestion} onChange={(e) => setForm({ ...form, suggestion: e.target.value })} className="mt-1" /></div>

              <div className="text-[11px] text-forest/60 text-center pt-2">
                10. לכל שאלה: 054-8529277 · s0548529277@gmail.com
              </div>
            </div>

            <Button
              type="submit"
              disabled={!form.agree || lines.length === 0}
              className="w-full mt-6 rounded-full h-12"
            >
              ✉️ שליחת ההזמנה למייל
            </Button>
          </form>
        </div>
      )}
      {gmailUrl && <GmailOverlay url={gmailUrl} onClose={() => setGmailUrl(null)} />}
      <Footer />
    </div>
  );
}

function Row({ k, v, big }: { k: string; v: string; big?: boolean }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-[#2d3d2b]/70">{k}</span>
      <span className={big ? "font-display text-2xl text-[#2d3d2b]" : "text-[#2d3d2b]"}>{v}</span>
    </div>
  );
}

function SubscriptionCard({ user }: { user: { id: string; email?: string } | null }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: user?.email ?? "",
    plan: "monthly",
    notes: "",
  });

  const submit = async () => {
    if (!form.full_name.trim() || !form.phone.trim()) {
      toast.error("שם וטלפון הם שדות חובה");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("subscription_requests").insert({
      user_id: user?.id ?? null,
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      plan: form.plan,
      notes: form.notes.trim() || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("הבקשה נשלחה, נחזור אלייך בהקדם ✨");
    setOpen(false);
    setForm({ full_name: "", phone: "", email: user?.email ?? "", plan: "monthly", notes: "" });
  };

  return (
    <div className="bg-gradient-to-br from-peach/40 to-blush/30 rounded-2xl p-5 border border-primary/10">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-peach-deep/20 text-peach-deep flex items-center justify-center shrink-0">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="font-display text-lg text-primary">קוד מנוי — לחיסכון קבוע</div>
          <p className="text-sm text-muted-foreground mt-1">
            מזמינות בקביעות? הצטרפו למנוי חודשי / שנתי ותקבלו קוד קבוע להנחה על כל הזמנה.
          </p>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="mt-3 rounded-full" variant="secondary">
                הזמנת קוד מנוי
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md" dir="rtl">
              <DialogHeader className="text-right">
                <DialogTitle className="font-display text-2xl text-primary">בקשת מנוי Sweetbaby</DialogTitle>
                <DialogDescription>מלאו פרטים ונחזור אליכן עם הצעה מותאמת וקוד אישי.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div><Label>שם מלא *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="mt-1" /></div>
                <div><Label>טלפון *</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" className="mt-1" /></div>
                <div><Label>אימייל</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} dir="ltr" className="mt-1" /></div>
                <div>
                  <Label>מסלול</Label>
                  <select
                    value={form.plan}
                    onChange={(e) => setForm({ ...form, plan: e.target.value })}
                    className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="monthly">חודשי</option>
                    <option value="quarterly">רבעוני</option>
                    <option value="yearly">שנתי</option>
                  </select>
                </div>
                <div><Label>הערות</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" /></div>
              </div>
              <DialogFooter>
                <Button onClick={submit} disabled={busy} className="rounded-full w-full">
                  {busy ? "שולחת…" : "שלחי בקשה"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}

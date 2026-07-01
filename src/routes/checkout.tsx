import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useServerFn } from "@tanstack/react-start";
import { placeOrder } from "@/lib/orders.functions";
import { toast } from "sonner";
import { CreditCard, Lock } from "lucide-react";

export const Route = createFileRoute("/checkout")({
  component: Checkout,
  head: () => ({ meta: [{ title: "סיכום הזמנה | Sweetbaby" }] }),
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
    scheduled_date: "",
    return_date: "",
    notes: "",
  });

  const disabled = lines.length === 0 || subtotal < 50;

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <section className="container-page py-24 flex-1">
          <div className="max-w-md mx-auto text-center bg-cream/60 rounded-3xl p-10 border border-primary/10">
            <Lock className="h-8 w-8 text-primary/40 mx-auto mb-3" />
            <h2 className="font-display text-3xl text-primary mb-2">התחברות נדרשת</h2>
            <p className="text-muted-foreground text-sm mb-6">כדי לשמור את ההזמנה שלכם, יש להיכנס תחילה.</p>
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
    if (disabled) return;
    setBusy(true);
    try {
      const res = await place({
        data: {
          lines: lines.map((l) => ({ id: l.id, name: l.name, sku: l.sku, price: l.price, quantity: l.quantity })),
          contact_name: form.contact_name,
          contact_phone: form.contact_phone,
          scheduled_date: form.scheduled_date || null,
          return_date: form.return_date || null,
          notes: form.notes,
        },
      });
      toast.success("ההזמנה נשמרה. הסטודיו יצור איתכם קשר בהקדם.");
      clear();
      nav({ to: "/account" });
      void res;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בשליחת ההזמנה");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <section className="container-page py-14 flex-1">
        <div className="text-xs tracking-[0.3em] uppercase text-forest/70 mb-3">Checkout</div>
        <h1 className="font-display text-5xl text-primary mb-10">סיכום ותשלום</h1>

        <form onSubmit={submit} className="grid lg:grid-cols-[1fr_400px] gap-10">
          <div className="space-y-8">
            <div className="bg-card rounded-3xl p-8 border border-primary/5">
              <h2 className="font-display text-2xl text-primary mb-6">פרטי איש קשר</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>שם מלא</Label>
                  <Input required value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>טלפון</Label>
                  <Input required type="tel" dir="ltr" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>תאריך צילום</Label>
                  <Input type="date" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>תאריך החזרה</Label>
                  <Input type="date" value={form.return_date} onChange={(e) => setForm({ ...form, return_date: e.target.value })} className="mt-1" />
                </div>
              </div>
              <div className="mt-4">
                <Label>הערות</Label>
                <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" />
              </div>
            </div>

            <div className="bg-card rounded-3xl p-8 border border-primary/5">
              <h2 className="font-display text-2xl text-primary mb-2">תשלום</h2>
              <p className="text-sm text-muted-foreground mb-6">
                החיוב יתבצע דרך שירות סליקה מאובטח (Stripe / משולם) — הכפתור מוכן לחיבור.
              </p>
              <div className="rounded-2xl border-2 border-dashed border-primary/25 p-8 flex flex-col items-center text-center">
                <CreditCard className="h-8 w-8 text-primary/50 mb-3" />
                <div className="font-display text-lg text-primary">סליקת אשראי</div>
                <div className="text-xs text-muted-foreground mt-1">Stripe · Meshulam · Apple Pay</div>
                <Button type="button" variant="outline" className="mt-4 rounded-full" disabled>
                  ממתין לחיבור סליקה
                </Button>
              </div>
            </div>
          </div>

          <aside className="bg-primary text-primary-foreground rounded-3xl p-8 h-fit lg:sticky lg:top-24">
            <div className="text-peach text-xs tracking-[0.3em] uppercase mb-2">Order</div>
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
              <span className="font-display text-3xl text-peach">₪{subtotal.toFixed(0)}</span>
            </div>
            <Button type="submit" disabled={disabled || busy} className="w-full mt-6 rounded-full h-12 bg-peach text-primary hover:bg-peach-deep">
              {busy ? "שולח…" : "שלח הזמנה"}
            </Button>
            <p className="text-[11px] text-primary-foreground/60 mt-3 text-center">
              ההזמנה תישלח לאישור הסטודיו. תיצור איתכם קשר לתיאום איסוף.
            </p>
          </aside>
        </form>
      </section>
      <Footer />
    </div>
  );
}

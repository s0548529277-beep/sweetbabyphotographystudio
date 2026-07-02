import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { CreditCard, Banknote, Camera, CalendarDays, User, Phone, Aperture, ShieldCheck, Sparkles, Clock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/summary/$type/$id")({
  component: SummaryPage,
  head: () => ({ meta: [{ title: "סיכום ותשלום | Sweetbaby" }, { name: "robots", content: "noindex, nofollow" }] }),
});

function SummaryPage() {
  const { type, id } = Route.useParams();
  const nav = useNavigate();
  const [record, setRecord] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const table = type === "booking" ? "bookings" : "orders";
      const { data } = await (supabase.from(table) as any).select("*").eq("id", id).maybeSingle();
      setRecord(data);
      if (data && type === "order") {
        const { data: lines } = await supabase.from("order_items").select("*").eq("order_id", id);
        setItems(lines ?? []);
      }
      setLoading(false);
    })();
  }, [type, id]);

  const handleCard = () => {
    toast("סליקה בכרטיס אשראי – בקרוב", {
      description: "אנחנו בשלבי חיבור אחרונים ל-Stripe / משולם. בינתיים ניתן להשלים את השריון בהעברה בנקאית או ב-Bit.",
      icon: <Sparkles className="h-4 w-4 text-blush-deep" />,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="container-page py-24 text-center text-muted-foreground">טוען סיכום…</div>
        <Footer />
      </div>
    );
  }

  if (!record) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="container-page py-24 text-center">
          <h1 className="font-display text-3xl text-primary mb-3">לא מצאנו את ההזמנה</h1>
          <Link to="/catalog"><Button className="rounded-full">חזרה לקטלוג</Button></Link>
        </div>
        <Footer />
      </div>
    );
  }

  const total = record.price ?? record.total ?? 0;
  const deposit = record.deposit_amount ?? Math.min(90, total);
  const balance = Math.max(0, total - deposit);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <section className="container-page py-14 flex-1">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 text-xs tracking-[0.3em] uppercase text-forest/70 mb-3">
            <Aperture className="h-3.5 w-3.5" /> Step 3 · Order Summary
          </div>
          <h1 className="font-display text-5xl text-primary mb-3">סיכום ותשלום</h1>
          <p className="text-muted-foreground max-w-2xl mb-10">
            עברי על הפרטים ובחרי איך לסיים את השריון. הכל שמור ומחכה — מקדמה של ₪{deposit} סוגרת עסקה.
          </p>

          <div className="grid md:grid-cols-[1.4fr_1fr] gap-6">
            {/* Left: details */}
            <div className="space-y-6">
              <div className="glass-card rounded-3xl p-6">
                <div className="flex items-center gap-2 mb-5">
                  <div className="h-8 w-8 rounded-full bg-blush-deep/15 flex items-center justify-center">
                    {type === "booking" ? <CalendarDays className="h-4 w-4 text-blush-deep" /> : <Camera className="h-4 w-4 text-blush-deep" />}
                  </div>
                  <h2 className="font-display text-2xl text-primary">
                    {type === "booking" ? "שריון סטודיו" : "השכרת אביזרים"}
                  </h2>
                </div>

                <dl className="grid sm:grid-cols-2 gap-4 text-sm">
                  <Info icon={<User className="h-4 w-4" />} label="שם" value={record.contact_name} />
                  <Info icon={<Phone className="h-4 w-4" />} label="טלפון" value={record.contact_phone} ltr />
                  {type === "booking" ? (
                    <>
                      <Info icon={<CalendarDays className="h-4 w-4" />} label="תאריך" value={record.session_date} ltr />
                      <Info icon={<Clock className="h-4 w-4" />} label="שעות" value={`${record.start_time}–${record.end_time}`} ltr />
                    </>
                  ) : (
                    <>
                      <Info icon={<CalendarDays className="h-4 w-4" />} label="תאריך צילום" value={record.session_date} ltr />
                      <Info icon={<Camera className="h-4 w-4" />} label="מצלמה" value={record.camera_model ?? "—"} />
                    </>
                  )}
                </dl>

                {record.notes && (
                  <div className="mt-4 p-3 rounded-2xl bg-blush/40 text-sm text-primary/80">
                    <span className="text-xs tracking-[0.2em] uppercase text-forest/70 block mb-1">הערות</span>
                    {record.notes}
                  </div>
                )}
              </div>

              {type === "order" && items.length > 0 && (
                <div className="glass-card rounded-3xl p-6">
                  <h3 className="font-display text-xl text-primary mb-4">פריטים בסל</h3>
                  <ul className="divide-y divide-border">
                    {items.map((l) => (
                      <li key={l.id} className="py-3 flex items-center justify-between text-sm">
                        <div className="flex-1">
                          <div className="text-primary">{l.item_name}</div>
                          <div className="text-[11px] text-muted-foreground" dir="ltr">SKU {l.item_sku} · x{l.quantity}</div>
                        </div>
                        <div className="font-display text-lg text-primary" dir="ltr">₪{l.price * l.quantity}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="glass-card rounded-3xl p-6 text-sm text-muted-foreground space-y-2">
                <div className="flex items-center gap-2 text-primary mb-1">
                  <ShieldCheck className="h-4 w-4 text-blush-deep" />
                  <span className="font-medium">מדיניות</span>
                </div>
                <p>מקדמה שומרת את התאריך והפריטים במלואם ואינה מוחזרת בביטול. ביטול ביום האירוע – חיוב מלא.</p>
                <p>איסוף והחזרה תוך 24 שעות · דמי ניקיון במקרה של השחתה לפי טבלת המחירים.</p>
              </div>
            </div>

            {/* Right: totals + payment */}
            <aside className="space-y-4">
              <div className="glass-card rounded-3xl p-6 sticky top-24">
                <h3 className="font-display text-xl text-primary mb-4">סיכום תשלום</h3>
                <div className="space-y-2 text-sm">
                  <Row label="סה״כ הזמנה" value={`₪${total}`} />
                  <Row label="מקדמה עכשיו" value={`₪${deposit}`} strong />
                  {balance > 0 && <Row label="יתרה ביום הצילום" value={`₪${balance}`} muted />}
                </div>

                <div className="mt-6 space-y-3">
                  <button
                    type="button"
                    onClick={handleCard}
                    className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-forest-deep text-primary-foreground p-4 text-right shadow-[var(--shadow-soft)] transition-transform hover:scale-[1.01]"
                  >
                    <div className="absolute -left-6 -top-6 h-24 w-24 rounded-full bg-blush/25 blur-2xl" />
                    <div className="relative flex items-center justify-between">
                      <div>
                        <div className="text-[10px] tracking-[0.3em] uppercase text-blush/90 mb-1">Secure checkout</div>
                        <div className="font-display text-2xl leading-tight">סליקה בכרטיס אשראי</div>
                        <div className="text-xs text-blush/80 mt-1">Stripe · משולם — בקרוב</div>
                      </div>
                      <div className="h-11 w-11 rounded-full bg-blush/20 flex items-center justify-center">
                        <CreditCard className="h-5 w-5 text-blush" />
                      </div>
                    </div>
                    <div className="relative mt-3 flex items-center gap-2 text-[10px] text-blush/75">
                      <Sparkles className="h-3 w-3" /> חיבור בשלבי הטמעה — לחצי לפרטים
                    </div>
                  </button>

                  <Button
                    onClick={() => nav({ to: "/deposit/$type/$id", params: { type, id } })}
                    variant="outline"
                    className="w-full h-12 rounded-2xl border-primary/30 gap-2 justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <Banknote className="h-4 w-4 text-blush-deep" />
                      <span>העברה בנקאית / Bit</span>
                    </span>
                    <span className="text-xs text-muted-foreground">זמין עכשיו →</span>
                  </Button>
                </div>

                <div className="mt-5 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-forest" />
                  תשלום מאובטח · פרטי האשראי אינם נשמרים אצלנו
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}

function Info({ icon, label, value, ltr }: { icon: React.ReactNode; label: string; value: string; ltr?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] tracking-[0.2em] uppercase text-muted-foreground mb-1">
        <span className="text-blush-deep">{icon}</span>{label}
      </div>
      <div className="text-primary font-medium" dir={ltr ? "ltr" : undefined}>{value || "—"}</div>
    </div>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${muted ? "text-muted-foreground" : "text-primary"}`}>
      <span className="text-xs">{label}</span>
      <span className={`font-display ${strong ? "text-2xl text-blush-deep" : "text-lg"}`} dir="ltr">{value}</span>
    </div>
  );
}

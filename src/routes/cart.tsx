import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";

export const Route = createFileRoute("/cart")({
  component: Cart,
  head: () => ({ meta: [
    { title: "עגלת קניות | Sweetbaby" },
    { name: "description", content: "העגלה שלכם ב-Sweetbaby — סקירת אביזרי צילום נבחרים, שינוי כמויות ומעבר לתשלום מקדמה לסשן הבא." },
    { property: "og:title", content: "עגלת קניות | Sweetbaby" },
    { property: "og:description", content: "העגלה שלכם ב-Sweetbaby — סקירת אביזרי צילום נבחרים, שינוי כמויות ומעבר לתשלום מקדמה לסשן הבא." },
    { property: "og:url", content: "https://sweetbabyphotographystudio.lovable.app/cart" },
    { name: "robots", content: "noindex, follow" },
  ], links: [{ rel: "canonical", href: "https://sweetbabyphotographystudio.lovable.app/cart" }] }),
});

function Cart() {
  const { lines, remove, setQty, subtotal, count } = useCart();
  const nav = useNavigate();

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
            <Link to="/catalog"><Button className="rounded-full">לקטלוג</Button></Link>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[1fr_360px] gap-10">
            <div className="space-y-4">
              {lines.map((l) => (
                <div key={l.id} className="flex gap-4 items-center bg-card rounded-2xl p-4 border border-primary/5">
                  <div className="h-24 w-24 rounded-xl overflow-hidden bg-cream shrink-0">
                    {l.image_url ? <img src={l.image_url} alt={l.name} className="w-full h-full object-cover" /> : null}
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
            </div>
            <aside className="bg-primary text-primary-foreground rounded-3xl p-8 h-fit lg:sticky lg:top-24">
              <div className="text-peach text-xs tracking-[0.3em] uppercase mb-2">Summary</div>
              <h2 className="font-display text-3xl mb-6">סיכום הזמנה</h2>
              <div className="space-y-3 text-sm">
                <Row k={`${count} פריטים`} v={`₪${subtotal.toFixed(0)}`} />
                <Row k="דמי טיפול" v="—" />
                <div className="h-px bg-primary-foreground/20 my-3" />
                <Row k="סה״כ" v={`₪${subtotal.toFixed(0)}`} big />
                {subtotal < 50 && (
                  <p className="text-peach text-xs mt-3">מינימום להזמנה 50 ש״ח — יש להוסיף ₪{(50 - subtotal).toFixed(0)}.</p>
                )}
              </div>
              <Button
                className="w-full mt-6 rounded-full h-12 bg-peach text-primary hover:bg-peach-deep"
                disabled={subtotal < 50}
                onClick={() => nav({ to: "/checkout" })}
              >
                המשך לתשלום
              </Button>
              <Link to="/catalog" className="block text-center text-xs text-primary-foreground/70 mt-4 hover:text-peach">
                המשך קניה
              </Link>
            </aside>
          </div>
        )}
      </section>
      <Footer />
    </div>
  );
}

function Row({ k, v, big }: { k: string; v: string; big?: boolean }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-primary-foreground/70">{k}</span>
      <span className={big ? "font-display text-2xl text-peach" : ""}>{v}</span>
    </div>
  );
}

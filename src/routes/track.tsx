import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CalendarDays, ShoppingBag, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/track")({
  component: Track,
  head: () => ({ meta: [{ title: "בחירת מסלול | Sweetbaby" }] }),
});

function Track() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <section className="container-page py-16 flex-1">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="text-xs tracking-[0.35em] uppercase text-forest/70 mb-3">Choose your path</div>
          <h1 className="font-display text-5xl md:text-6xl text-primary">איך נמשיך מכאן?</h1>
          <p className="text-muted-foreground mt-4">שני מסלולים — בחרי את זה שמתאים לך היום.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 md:gap-8 max-w-5xl mx-auto">
          <Link to="/booking" className="group glass-card rounded-3xl p-10 relative overflow-hidden hover:-translate-y-1 transition-transform">
            <div className="absolute -top-16 -left-16 w-64 h-64 rounded-full bg-blush/50 blur-3xl" />
            <div className="relative">
              <div className="h-14 w-14 rounded-2xl bg-primary text-blush flex items-center justify-center mb-6">
                <CalendarDays className="h-6 w-6" />
              </div>
              <div className="text-xs tracking-[0.3em] uppercase text-forest/70 mb-2">Track A</div>
              <h2 className="font-display text-3xl text-primary mb-3">שריון סטודיו ויומן</h2>
              <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
                בחירת יום ושעה בלוח הסטודיו. חצאי שעות, מינימום שעה, וחבילת בוקר ייחודית לניוברן.
              </p>
              <ul className="text-sm text-forest space-y-2 mb-8">
                <li>· שעה ראשונה 120₪, כל שעה נוספת 90₪</li>
                <li>· חבילת בוקר 08:00–11:00 · 240₪</li>
                <li>· מקדמה 90₪ לשריון</li>
              </ul>
              <span className="inline-flex items-center gap-2 text-primary font-medium">
                לבחירת מועד <ArrowLeft className="h-4 w-4" />
              </span>
            </div>
          </Link>

          <Link to="/catalog" className="group glass-card rounded-3xl p-10 relative overflow-hidden hover:-translate-y-1 transition-transform">
            <div className="absolute -bottom-16 -right-16 w-64 h-64 rounded-full bg-blush-deep/40 blur-3xl" />
            <div className="relative">
              <div className="h-14 w-14 rounded-2xl bg-primary text-blush flex items-center justify-center mb-6">
                <ShoppingBag className="h-6 w-6" />
              </div>
              <div className="text-xs tracking-[0.3em] uppercase text-forest/70 mb-2">Track B</div>
              <h2 className="font-display text-3xl text-primary mb-3">השכרת אביזרים</h2>
              <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
                בחירת אביזרים מהקטלוג לפי מק"ט. סל מינימום 50₪, זמינות אוטומטית לפי תאריך הצילום.
              </p>
              <ul className="text-sm text-forest space-y-2 mb-8">
                <li>· חסימת מלאי אוטומטית לתאריך</li>
                <li>· הזנת דגם מצלמה</li>
                <li>· תשלום מקדמה + השלמה בסטודיו</li>
              </ul>
              <span className="inline-flex items-center gap-2 text-primary font-medium">
                לקטלוג האביזרים <ArrowLeft className="h-4 w-4" />
              </span>
            </div>
          </Link>
        </div>
      </section>
      <Footer />
    </div>
  );
}

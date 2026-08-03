import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { PayOnlineButton } from "@/components/PayOnlineButton";
import { AlertTriangle, Mail, Phone } from "lucide-react";

export const Route = createFileRoute("/payment-failed")({
  component: PaymentFailed,
  head: () => ({
    meta: [
      { title: "התשלום לא הושלם | Sweetbaby" },
      { name: "description", content: "התשלום לא הושלם. אפשר לנסות שוב או ליצור איתנו קשר ונשמח לעזור להשלים את ההזמנה." },
      { property: "og:title", content: "התשלום לא הושלם | Sweetbaby" },
      { property: "og:description", content: "התשלום לא הושלם — אפשר לנסות שוב או ליצור קשר." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function PaymentFailed() {
  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      <Header />
      <section className="container-page py-16 flex-1">
        <div className="max-w-2xl mx-auto">
          <div className="glass-card rounded-3xl p-10 text-center">
            <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-5">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <h1 className="font-display text-4xl md:text-5xl text-primary mb-3">התשלום לא הושלם</h1>
            <p className="text-muted-foreground leading-relaxed mb-2">
              משהו השתבש בתהליך התשלום והחיוב לא בוצע. אין מה לדאוג — ההזמנה שלכם עדיין שמורה.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-8">
              אפשר לנסות שוב, או ליצור איתנו קשר ונשמח לעזור להשלים את התשלום בדרך אחרת.
            </p>

            <div className="flex justify-center mb-8">
              <PayOnlineButton label="ניסיון תשלום נוסף" note={null} />
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 mb-8 text-sm">
              <a
                href="tel:0548529277"
                className="inline-flex items-center gap-2 rounded-full border border-border px-5 h-11 hover:border-primary transition-colors text-primary"
              >
                <Phone className="h-4 w-4" /> <span dir="ltr">054-8529277</span>
              </a>
              <a
                href="mailto:s0548529277@gmail.com"
                className="inline-flex items-center gap-2 rounded-full border border-border px-5 h-11 hover:border-primary transition-colors text-primary"
              >
                <Mail className="h-4 w-4" /> s0548529277@gmail.com
              </a>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link to="/">
                <Button className="rounded-full h-12 px-8">חזרה לעמוד הבית</Button>
              </Link>
              <Link to="/contact">
                <Button variant="outline" className="rounded-full h-12 px-8">יצירת קשר</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ArrivalDirections } from "@/components/ArrivalDirections";
import { Check, Mail, Phone } from "lucide-react";

export const Route = createFileRoute("/thank-you")({
  component: ThankYou,
  head: () => ({
    meta: [
      { title: "התשלום התקבל בהצלחה | Sweetbaby" },
      { name: "description", content: "התשלום התקבל בהצלחה — תודה! אישור ההזמנה נשלח אליכם והצוות שלנו יחזור אליכם לתיאום סופי." },
      { property: "og:title", content: "התשלום התקבל בהצלחה | Sweetbaby" },
      { property: "og:description", content: "התשלום התקבל בהצלחה — תודה רבה! נחזור אליכם לתיאום סופי." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function ThankYou() {
  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      <Header />
      <section className="container-page py-16 flex-1">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="glass-card rounded-3xl p-10 text-center">
            <div className="mx-auto h-16 w-16 rounded-full bg-forest/10 flex items-center justify-center mb-5">
              <Check className="h-8 w-8 text-forest" />
            </div>
            <h1 className="font-display text-4xl md:text-5xl text-primary mb-3">התשלום התקבל בהצלחה</h1>
            <p className="text-muted-foreground leading-relaxed mb-2">
              תודה רבה! התשלום נקלט במערכת וההזמנה שלכם נשמרה.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-3">
              אישור מפורט נשלח אליכם למייל. נחזור אליכם לתיאום סופי של המועד — ואם יש שאלה, אנחנו כאן.
            </p>
            <p className="text-sm text-primary/70 mb-8">{fullHebrewDate()}</p>


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
              <Link to="/account">
                <Button variant="outline" className="rounded-full h-12 px-8">לאזור האישי</Button>
              </Link>
            </div>
          </div>
          <ArrivalDirections />
        </div>
      </section>
      <Footer />
    </div>
  );
}

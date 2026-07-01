import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Phone, Mail, MapPin } from "lucide-react";

export const Route = createFileRoute("/contact")({
  component: Contact,
  head: () => ({
    meta: [
      { title: "יצירת קשר | Sweetbaby" },
      { name: "description", content: "צרו איתנו קשר לתיאום השכרת אביזרי צילום." },
    ],
  }),
});

function Contact() {
  const cards = [
    { icon: Phone, t: "טלפון", v: "054-8529277", href: "tel:0548529277" },
    { icon: Mail, t: "אימייל", v: "s0548529277@gmail.com", href: "mailto:s0548529277@gmail.com" },
    { icon: MapPin, t: "כתובת", v: "תלמוד ירושלמי 24, בית שמש", href: "https://maps.google.com/?q=תלמוד+ירושלמי+24+בית+שמש" },
  ];
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <section className="container-page py-16 md:py-24">
        <div className="text-xs tracking-[0.3em] uppercase text-forest/70 mb-4">Get In Touch</div>
        <h1 className="font-display text-5xl md:text-6xl text-primary">בואו נדבר</h1>
        <p className="text-muted-foreground max-w-lg mt-4">
          שמחות לענות על שאלות, לעזור בבחירת אביזרים ולתאם השכרה.
        </p>

        <div className="grid md:grid-cols-3 gap-5 mt-14">
          {cards.map((c) => (
            <a key={c.t} href={c.href} className="bg-card rounded-3xl p-8 border border-primary/5 hover:shadow-[var(--shadow-card)] transition-shadow block">
              <c.icon className="h-6 w-6 text-peach-deep mb-6" />
              <div className="text-xs tracking-widest uppercase text-muted-foreground mb-2">{c.t}</div>
              <div className="font-display text-2xl text-primary" dir={c.t === "אימייל" || c.t === "טלפון" ? "ltr" : undefined}>{c.v}</div>
            </a>
          ))}
        </div>
      </section>
      <Footer />
    </div>
  );
}

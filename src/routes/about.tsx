import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ArrivalDirections } from "@/components/ArrivalDirections";
import { Camera, Aperture, Clock, Sparkles, Phone, Mail, MapPin } from "lucide-react";

export const Route = createFileRoute("/about")({
  component: About,
  head: () => ({
    meta: [
      { title: "סטודיו לצילום להשכרה לפי שעות בבית שמש | Sweetbaby" },
      { name: "description", content: "Sweetbaby — סטודיו לצילום להשכרה לפי שעות והשכרת אביזרי צילום לפי שעות בבית שמש. ניוברן, גיל שנה, חלאקה ומשפחה. 400+ אביזרים, תאורה מקצועית ורקעים." },
      { name: "keywords", content: "סטודיו לצילום להשכרה לפי שעות, השכרת אביזרי צילום לפי שעות, סטודיו ניוברן בית שמש, השכרת סטודיו צילום, אביזרים לצילום ניוברן" },
      { property: "og:title", content: "סטודיו לצילום להשכרה לפי שעות | Sweetbaby" },
      { property: "og:description", content: "השכרת סטודיו לצילום לפי שעות והשכרת אביזרי צילום לפי שעות בבית שמש." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: "https://sweetbabyphoto.shop/about" },
    ],
    links: [{ rel: "canonical", href: "https://sweetbabyphoto.shop/about" }],

    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          "@id": "https://sweetbabyphoto.shop/#business",
          name: "Sweetbaby",
          image: "https://sweetbabyphoto.shop/favicon.ico",
          url: "https://sweetbabyphoto.shop",
          telephone: "+972-54-8529277",
          email: "s0548529277@gmail.com",
          priceRange: "₪₪",
          address: {
            "@type": "PostalAddress",
            streetAddress: "תלמוד ירושלמי 24",
            addressLocality: "בית שמש",
            addressCountry: "IL",
          },
          areaServed: "IL",
        }),
      },
    ],
  }),
});

function About() {
  const contactCards = [
    { icon: Phone, t: "טלפון", v: "054-8529277", href: "tel:0548529277", ltr: true },
    { icon: Mail, t: "אימייל", v: "s0548529277@gmail.com", href: "mailto:s0548529277@gmail.com", ltr: true },
    { icon: MapPin, t: "כתובת", v: "תלמוד ירושלמי 24, בית שמש", href: "https://maps.google.com/?q=תלמוד+ירושלמי+24+בית+שמש", ltr: false },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <section className="container-page py-16 md:py-24">
        <div className="max-w-3xl">
          <div className="text-xs tracking-[0.3em] uppercase text-forest/70 mb-4">Our Story</div>
          <h1 className="font-display text-5xl md:text-7xl text-primary leading-none">
            נשמור לכם את
            <br />
            <span className="italic text-peach-deep">הרגע הראשון.</span>
          </h1>
          <p className="text-lg text-muted-foreground mt-8 leading-relaxed">
            סוויט בייבי היא ספריית אביזרים מעוצבים לצילום — מסלים סרוגים ועגלות רטאן לניוברן,
            דרך כובעי קש וכריות פוזינג ועד וינטג׳ יפייפה: מצלמות מינולטה, טלפונים, ספרים ורדיו.
            אנחנו שם כדי שהתמונות שלכם יספרו סיפור.
          </p>
        </div>

        <div className="mt-16 grid md:grid-cols-4 gap-6">
          {[
            { icon: Camera, t: "לכל סגנון", d: "ניו בורן, גיל שנה, חלאקה, משפחה" },
            { icon: Aperture, t: "400+ אביזרים", d: "מבחר מתעדכן לפי עונות" },
            { icon: Clock, t: "24 שעות", d: "השכרה גמישה, איסוף ידני" },
            { icon: Sparkles, t: "אווירה", d: "פינה קטנה של קסם לצילום" },
          ].map((c) => (
            <div key={c.t} className="bg-card rounded-2xl p-6 border border-primary/5">
              <c.icon className="h-6 w-6 text-peach-deep mb-4" />
              <div className="font-display text-xl text-primary">{c.t}</div>
              <div className="text-sm text-muted-foreground mt-1">{c.d}</div>
            </div>
          ))}
        </div>

        {/* Contact */}
        <div className="mt-24">
          <div className="text-xs tracking-[0.3em] uppercase text-forest/70 mb-4">Get In Touch</div>
          <h2 className="font-display text-4xl md:text-5xl text-primary">בואו נדבר</h2>
          <p className="text-muted-foreground max-w-lg mt-4">
            שמחות לענות על שאלות, לעזור בבחירת אביזרים ולתאם השכרה.
          </p>

          <div className="grid md:grid-cols-3 gap-5 mt-10">
            {contactCards.map((c) => (
              <a key={c.t} href={c.href} className="bg-card rounded-3xl p-8 border border-primary/5 hover:shadow-[var(--shadow-card)] transition-shadow block">
                <c.icon className="h-6 w-6 text-peach-deep mb-6" />
                <div className="text-xs tracking-widest uppercase text-muted-foreground mb-2">{c.t}</div>
                <div className="font-display text-2xl text-primary" dir={c.ltr ? "ltr" : undefined}>{c.v}</div>
              </a>
            ))}
          </div>
        </div>

        <ArrivalDirections className="mt-14" />

        <div className="mt-16 flex gap-3">
          <Link to="/rental-catalog"><Button className="rounded-full px-7 h-12">לקטלוג</Button></Link>
          <Link to="/studio-rental"><Button variant="outline" className="rounded-full px-7 h-12">השכרת סטודיו</Button></Link>
        </div>

      </section>
      <Footer />
    </div>
  );
}

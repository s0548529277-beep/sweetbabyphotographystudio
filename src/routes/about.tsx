import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Camera, Aperture, Clock, Sparkles } from "lucide-react";

export const Route = createFileRoute("/about")({
  component: About,
  head: () => ({
    meta: [
      { title: "אודות הסטודיו | Sweetbaby" },
      { name: "description", content: "Sweetbaby — סטודיו ומחסן אביזרי צילום מעוצבים בבית שמש. צילומי ניוברן, גיל שנה, חלאקה ומשפחה." },
      { property: "og:title", content: "אודות הסטודיו | Sweetbaby" },
      { property: "og:description", content: "Sweetbaby — סטודיו ומחסן אביזרי צילום מעוצבים בבית שמש. צילומי ניוברן, גיל שנה, חלאקה ומשפחה." },
      { property: "og:url", content: "https://sweetbabyphotographystudio.lovable.app/about" },
    ],
    links: [{ rel: "canonical", href: "https://sweetbabyphotographystudio.lovable.app/about" }],
  }),
});

function About() {
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

        <div className="mt-16 flex gap-3">
          <Link to="/catalog"><Button className="rounded-full px-7 h-12">לקטלוג</Button></Link>
          <Link to="/contact"><Button variant="outline" className="rounded-full px-7 h-12">יצירת קשר</Button></Link>
        </div>
      </section>
      <Footer />
    </div>
  );
}

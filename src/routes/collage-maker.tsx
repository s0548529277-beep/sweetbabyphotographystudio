import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CollageWizard } from "@/components/collage/CollageWizard";
import { STUDIO_FONTS_GOOGLE_HREF } from "@/lib/collage-studio-library";

export const Route = createFileRoute("/collage-maker")({
  component: CollageMaker,
  head: () => ({
    meta: [
      { title: "יוצר קולאז׳ים חינם | Sweetbaby" },
      { name: "description", content: "יוצרים קולאז׳ תמונות מקצועי בחינם, עם עשרות רעיונות, גדלים להדפסה ולרשתות, עיצוב אישי והורדה באיכות גבוהה." },
      { property: "og:title", content: "יוצר קולאז׳ים חינם | Sweetbaby" },
      { property: "og:description", content: "עשרות רעיונות לקולאז׳ים, העלאת תמונות ועיצוב אישי — בחינם וללא הרשמה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    // Same extended font set the free-canvas Studio offers (35 fonts,
    // Hebrew + English, sans/serif/script) — reused here for step 4's
    // caption font picker, per explicit request for more fonts.
    links: [{ rel: "stylesheet", href: STUDIO_FONTS_GOOGLE_HREF }],
  }),
});

function CollageMaker() {
  return <div className="min-h-screen bg-background"><Header /><CollageWizard /><Footer /></div>;
}

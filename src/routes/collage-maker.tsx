import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CollageWizard } from "@/components/collage/CollageWizard";

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
  }),
});

function CollageMaker() {
  return <div className="min-h-screen bg-background"><Header /><CollageWizard /><Footer /></div>;
}

import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CollageWizard } from "@/components/collage/CollageWizard";

export const Route = createFileRoute("/collage-studio/")({
  component: CollageStudio,
  head: () => ({
    meta: [
      { title: "קולאז׳ים חינם | Sweetbaby" },
      { name: "description", content: "יוצר קולאז׳ים חינמי ומקצועי עם עשרות רעיונות, גדלים להדפסה ולרשתות, תצוגה חיה והורדה באיכות גבוהה." },
      { property: "og:title", content: "קולאז׳ים חינם | Sweetbaby" },
      { property: "og:description", content: "בוחרים רעיון, מעלים תמונות ומעצבים קולאז׳ מרהיב בחינם וללא הרשמה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function CollageStudio() {
  return <div className="min-h-screen bg-background"><Header /><CollageWizard /><Footer /></div>;
}

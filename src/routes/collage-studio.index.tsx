// Collage Studio gallery — template search/filter, the entry point linked
// from the homepage "קולאז'ים" category. Real interactive filtering over
// real template data (see collage-studio-data.ts); the editor itself
// lives at /collage-studio/$templateId (collage-studio.$templateId.tsx).
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Input } from "@/components/ui/input";
import { TemplateCard } from "@/components/collage-studio/TemplateCard";
import { COLLAGE_TEMPLATES, TEMPLATE_CATEGORIES, countImageElements, type CollageTemplateCategoryId } from "@/lib/collage-studio-data";
import { Search, Sparkles } from "lucide-react";

export const Route = createFileRoute("/collage-studio/")({
  component: CollageStudioGallery,
  head: () => ({
    meta: [
      { title: "סטודיו קולאז'ים | Sweetbaby" },
      { name: "description", content: "סטודיו קולאז'ים מקצועי — בוחרים תבנית, מעלים תמונות, עורכים טקסטים וצבעים, ומורידים עיצוב מוכן להדפסה." },
      { name: "robots", content: "index, follow" },
    ],
  }),
});

const PHOTO_COUNT_FILTERS = [1, 2, 3, 4, 5, 6] as const; // 6 means "6+"

function CollageStudioGallery() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CollageTemplateCategoryId | "all">("all");
  const [photoCount, setPhotoCount] = useState<number | null>(null);

  const filtered = useMemo(() => {
    return COLLAGE_TEMPLATES.filter((t) => {
      if (category !== "all" && t.category !== category) return false;
      const count = countImageElements(t);
      if (photoCount !== null) {
        if (photoCount === 6 ? count < 6 : count !== photoCount) return false;
      }
      if (query.trim() && !t.name.includes(query.trim())) return false;
      return true;
    });
  }, [query, category, photoCount]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <section className="container-page py-12 flex-1">
        <div className="flex items-center gap-2 text-xs tracking-[0.3em] uppercase text-forest/70 mb-3">
          <Sparkles className="h-3.5 w-3.5" /> כלי עיצוב מקצועי
        </div>
        <h1 className="font-display text-4xl md:text-5xl text-primary mb-2">סטודיו קולאז'ים</h1>
        <p className="text-muted-foreground max-w-2xl mb-8">יוצרים עיצוב מושלם לתמונות שלכם בכמה דקות.</p>

        <div className="relative max-w-md mb-6">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש תבנית..." className="pr-9" dir="rtl" />
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            onClick={() => setCategory("all")}
            className={`rounded-full px-4 py-1.5 text-xs font-medium border transition-colors ${category === "all" ? "bg-primary text-primary-foreground border-primary" : "border-primary/20 hover:border-primary text-primary"}`}
          >
            הכל
          </button>
          {TEMPLATE_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`rounded-full px-4 py-1.5 text-xs font-medium border transition-colors ${category === c.id ? "bg-primary text-primary-foreground border-primary" : "border-primary/20 hover:border-primary text-primary"}`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-10">
          <span className="text-xs text-muted-foreground ml-1">כמות תמונות:</span>
          <button
            type="button"
            onClick={() => setPhotoCount(null)}
            className={`rounded-full px-3 py-1 text-xs border transition-colors ${photoCount === null ? "bg-primary text-primary-foreground border-primary" : "border-primary/20 hover:border-primary text-primary"}`}
          >
            הכל
          </button>
          {PHOTO_COUNT_FILTERS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPhotoCount(n)}
              className={`rounded-full px-3 py-1 text-xs border transition-colors ${photoCount === n ? "bg-primary text-primary-foreground border-primary" : "border-primary/20 hover:border-primary text-primary"}`}
            >
              {n === 6 ? "6+ תמונות" : n === 1 ? "תמונה אחת" : `${n} תמונות`}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="text-muted-foreground">לא נמצאו תבניות מתאימות.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {filtered.map((t) => (
              <TemplateCard key={t.id} template={t} />
            ))}
          </div>
        )}
      </section>
      <Footer />
    </div>
  );
}

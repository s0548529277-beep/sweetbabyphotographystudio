import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCart } from "@/lib/cart";
import { toast } from "sonner";
import { Search, Plus, ImageIcon } from "lucide-react";

export const Route = createFileRoute("/catalog")({
  component: Catalog,
  head: () => ({
    meta: [
      { title: "קטלוג | Sweetbaby" },
      { name: "description", content: "עיינו במבחר אביזרי הצילום שלנו ליצירת התמונות המושלמות." },
    ],
  }),
});

function Catalog() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const { add } = useCart();

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const items = useQuery({
    queryKey: ["items", cat],
    queryFn: async () => {
      let query = supabase.from("items").select("*").eq("active", true).order("created_at", { ascending: false });
      if (cat) query = query.eq("category_id", cat);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const list = items.data ?? [];
    if (!q.trim()) return list;
    const s = q.toLowerCase();
    return list.filter(
      (i) => i.name.toLowerCase().includes(s) || i.sku.toLowerCase().includes(s) || (i.description ?? "").toLowerCase().includes(s),
    );
  }, [items.data, q]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <section className="container-page pt-14 pb-10 border-b border-border">
        <div className="flex items-center justify-between text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-8">
          <span>Catalogue №26 · 2026</span>
          <span>{filtered.length} items</span>
        </div>
        <h1 className="font-display text-6xl md:text-8xl tracking-tight leading-[0.95]">
          קטלוג <span className="italic">האביזרים</span>
        </h1>
        <p className="text-muted-foreground max-w-xl mt-6 text-base md:text-lg">
          חיפוש חופשי לפי שם, מק״ט או קטגוריה. הוסיפו לעגלה — נעדכן את הסטודיו בהזמנה.
        </p>

        <div className="mt-10 flex flex-col md:flex-row gap-6 items-stretch md:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="h-4 w-4 absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="חיפוש אביזר או מק״ט…"
              className="pr-6 h-11 rounded-none bg-transparent border-0 border-b border-foreground/30 focus-visible:ring-0 focus-visible:border-foreground text-base"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setCat(null)}
              className={`px-4 h-9 text-[11px] tracking-[0.25em] uppercase transition-colors ${
                cat === null ? "bg-foreground text-background" : "bg-transparent text-foreground/70 hover:text-foreground border border-border"
              }`}
            >
              הכל
            </button>
            {categories.data?.map((c) => (
              <button
                key={c.id}
                onClick={() => setCat(c.id)}
                className={`px-4 h-9 text-[11px] tracking-[0.25em] uppercase transition-colors ${
                  cat === c.id ? "bg-foreground text-background" : "bg-transparent text-foreground/70 hover:text-foreground border border-border"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page py-12 pb-24">
        {items.isLoading ? (
          <GridSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-12">
            {filtered.map((item, idx) => (
              <article key={item.id} className="group">
                <div className="aspect-[4/5] bg-bone relative overflow-hidden">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-foreground/20">
                      <ImageIcon className="h-10 w-10" />
                    </div>
                  )}
                  <div className="absolute top-3 right-3 text-[10px] tracking-[0.28em] uppercase text-foreground/70">
                    №{String(idx + 1).padStart(3, "0")}
                  </div>
                  <button
                    onClick={() => {
                      add({ id: item.id, name: item.name, sku: item.sku, price: Number(item.price), image_url: item.image_url });
                      toast.success(`${item.name} נוסף לעגלה`);
                    }}
                    className="absolute bottom-0 inset-x-0 h-11 bg-foreground text-background text-[11px] tracking-[0.3em] uppercase translate-y-full group-hover:translate-y-0 transition-transform duration-300 inline-flex items-center justify-center gap-2"
                  >
                    <Plus className="h-3.5 w-3.5" /> הוספה לעגלה
                  </button>
                </div>
                <div className="pt-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-display text-xl leading-tight line-clamp-1">{item.name}</h3>
                    <div className="text-[10px] tracking-[0.28em] uppercase text-muted-foreground mt-1">מק״ט {item.sku}</div>
                  </div>
                  <div className="font-display text-2xl shrink-0">₪{Number(item.price).toFixed(0)}</div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <Footer />
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-12">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i}>
          <div className="aspect-[4/5] bg-muted animate-pulse" />
          <div className="pt-4 space-y-2">
            <div className="h-4 bg-muted animate-pulse w-3/4" />
            <div className="h-3 bg-muted animate-pulse w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border border-dashed border-border py-24 text-center bg-bone/40">
      <div className="font-display text-4xl italic mb-2">אין אביזרים להצגה</div>
      <p className="text-muted-foreground text-sm mb-6">הקטלוג מתמלא עכשיו. בקרוב תוכלו לראות אותו כאן.</p>
      <Link to="/">
        <Button variant="outline" className="rounded-none">חזרה לעמוד הבית</Button>
      </Link>
    </div>
  );
}

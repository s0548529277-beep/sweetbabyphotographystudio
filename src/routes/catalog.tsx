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
      <section className="container-page pt-14 pb-8">
        <div className="text-xs tracking-[0.3em] uppercase text-forest/70 mb-3">Catalog 2026</div>
        <h1 className="font-display text-5xl md:text-6xl text-primary mb-4">קטלוג האביזרים</h1>
        <p className="text-muted-foreground max-w-xl">חיפוש חופשי לפי שם, מק״ט או קטגוריה. הוסיפו לעגלה — נעדכן את הסטודיו בהזמנה.</p>

        <div className="mt-8 flex flex-col md:flex-row gap-4 items-stretch md:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="חיפוש אביזר או מק״ט…"
              className="pr-10 h-11 rounded-full bg-card border-primary/15"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setCat(null)}
              className={`px-4 h-9 rounded-full text-xs tracking-wider border transition-colors ${
                cat === null ? "bg-primary text-primary-foreground border-primary" : "bg-transparent border-primary/20 hover:border-primary/50"
              }`}
            >
              הכל
            </button>
            {categories.data?.map((c) => (
              <button
                key={c.id}
                onClick={() => setCat(c.id)}
                className={`px-4 h-9 rounded-full text-xs tracking-wider border transition-colors ${
                  cat === c.id ? "bg-primary text-primary-foreground border-primary" : "bg-transparent border-primary/20 hover:border-primary/50"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page pb-24">
        {items.isLoading ? (
          <GridSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 md:gap-7">
            {filtered.map((item) => (
              <article key={item.id} className="group rounded-2xl bg-card overflow-hidden shadow-[var(--shadow-card)] border border-primary/5">
                <div className="aspect-square bg-cream relative overflow-hidden">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-primary/20">
                      <ImageIcon className="h-10 w-10" />
                    </div>
                  )}
                  <div className="absolute top-3 right-3 bg-cream/90 backdrop-blur text-[10px] tracking-widest px-2 py-1 rounded-full text-primary">
                    {item.sku}
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-display text-lg text-primary line-clamp-1">{item.name}</h3>
                  {item.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>}
                  <div className="flex items-center justify-between mt-3">
                    <div className="font-display text-xl text-peach-deep">₪{Number(item.price).toFixed(0)}</div>
                    <Button
                      size="sm"
                      className="rounded-full h-8 gap-1"
                      onClick={() => {
                        add({ id: item.id, name: item.name, sku: item.sku, price: Number(item.price), image_url: item.image_url });
                        toast.success(`${item.name} נוסף לעגלה`);
                      }}
                    >
                      <Plus className="h-3 w-3" /> הוסף
                    </Button>
                  </div>
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
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-card overflow-hidden">
          <div className="aspect-square bg-muted animate-pulse" />
          <div className="p-4 space-y-2">
            <div className="h-4 bg-muted animate-pulse rounded" />
            <div className="h-3 bg-muted animate-pulse rounded w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-dashed border-primary/30 py-24 text-center bg-cream/40">
      <div className="font-display text-3xl text-primary mb-2">אין אביזרים להצגה</div>
      <p className="text-muted-foreground text-sm mb-6">הקטלוג מתמלא עכשיו. בקרוב תוכלו לראות אותו כאן.</p>
      <Link to="/">
        <Button variant="outline" className="rounded-full">חזרה לעמוד הבית</Button>
      </Link>
    </div>
  );
}

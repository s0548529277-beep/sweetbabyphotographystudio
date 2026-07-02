import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductImage } from "@/components/ProductImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCart } from "@/lib/cart";
import { absoluteImageUrl, normalizeImageUrl } from "@/lib/images";
import { toast } from "sonner";
import { Search, Plus, Minus, ChevronDown, Trash2, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/catalog")({
  component: Catalog,
  head: () => ({
    meta: [
      { title: "קטלוג אביזרי צילום | Sweetbaby" },
      { name: "description", content: "מבחר סלסלות, כריות, שמיכות, כיסויי ראש ואביזרים מעוצבים להשכרה לצילומי ניוברן, סיטר ומשפחה." },
      { property: "og:title", content: "קטלוג אביזרי צילום | Sweetbaby" },
      { property: "og:description", content: "עיינו במבחר האביזרים המעוצבים שלנו והזמינו לצילום הבא." },
      { property: "og:url", content: "https://sweetbabyphotographystudio.lovable.app/catalog" },
    ],
    links: [{ rel: "canonical", href: "https://sweetbabyphotographystudio.lovable.app/catalog" }],
  }),
});

function Catalog() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [catOpen, setCatOpen] = useState(false);
  const { lines, add, remove, setQty, count, subtotal } = useCart();
  const navigate = useNavigate();

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

  const activeCat = categories.data?.find((c) => c.id === cat);

  const productLd = useMemo(() => {
    const list = (filtered ?? []).slice(0, 30);
    if (!list.length) return null;
    return {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: list.map((i, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        item: {
          "@type": "Product",
          name: i.name,
          sku: i.sku,
          image: absoluteImageUrl(i.image_url),
          description: i.description ?? undefined,
          offers: {
            "@type": "Offer",
            price: i.price,
            priceCurrency: "ILS",
            availability: "https://schema.org/InStock",
          },
        },
      })),
    };
  }, [filtered]);

  return (
    <div className="min-h-screen flex flex-col bg-[#f6f1ec]" dir="rtl">
      {productLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }}
        />
      )}
      <Header />

      {/* Welcome bar */}
      <section className="container-page pt-10 pb-6">
        <div className="flex items-end justify-between flex-wrap gap-6">
          <div>
            <h1 className="font-display text-4xl md:text-5xl tracking-tight leading-tight">
              ברוכה הבאה <span className="italic text-[#b98a7a]">אלינו</span>
            </h1>
            <p className="text-muted-foreground text-sm mt-2">התחילי, ותתייו את ההזמנה שלך:</p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Category dropdown */}
            <div className="relative">
              <button
                onClick={() => setCatOpen((v) => !v)}
                className="h-11 px-5 rounded-full bg-white border border-black/10 text-sm inline-flex items-center gap-2 min-w-[220px] justify-between"
              >
                <span className="text-muted-foreground">בחרי קטגוריה</span>
                <span className="font-medium">{activeCat?.name ?? "הכל"}</span>
                <ChevronDown className="h-4 w-4" />
              </button>
              {catOpen && (
                <div className="absolute top-full mt-2 right-0 z-20 w-64 rounded-2xl bg-white border border-black/10 shadow-lg p-2 max-h-80 overflow-auto">
                  <button
                    onClick={() => { setCat(null); setCatOpen(false); }}
                    className="w-full text-right px-3 py-2 rounded-lg hover:bg-[#f6e5dd] text-sm"
                  >
                    הכל
                  </button>
                  {categories.data?.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { setCat(c.id); setCatOpen(false); }}
                      className="w-full text-right px-3 py-2 rounded-lg hover:bg-[#f6e5dd] text-sm"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="h-4 w-4 absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="חיפוש..."
                className="pr-10 h-11 w-56 rounded-full bg-white border border-black/10 focus-visible:ring-0 text-sm"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Main split layout */}
      <section className="container-page pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-8">
          {/* Products grid */}
          <div>
            <div className="rounded-3xl bg-white/70 backdrop-blur-sm border border-black/5 p-5 md:p-8 shadow-sm">
              <h2 className="sr-only">קטלוג אביזרי צילום</h2>
              {items.isLoading ? (
                <GridSkeleton />
              ) : items.isError ? (
                <CatalogError onRetry={() => items.refetch()} />
              ) : filtered.length === 0 ? (
                <EmptyState />
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-5 md:gap-6">
                  {filtered.map((item) => (
                    <article key={item.id} className="group flex flex-col">
                      <Link
                        to="/items/$id"
                        params={{ id: item.id }}
                        className="aspect-square rounded-2xl bg-[#efe6df] relative overflow-hidden block"
                        aria-label={`צפייה בפריט ${item.name}`}
                      >
                        <ProductImage
                          imageUrl={item.image_url}
                          alt={item.name}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </Link>
                      <Link to="/items/$id" params={{ id: item.id }} className="pt-3 pb-1 px-1 block hover:text-[#b98a7a] transition-colors">
                        <h3 className="font-display text-lg leading-tight line-clamp-1">{item.name}</h3>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          מק״ט {item.sku} · ₪{Number(item.price).toFixed(0)}
                        </div>
                      </Link>

                      <button
                        onClick={() => {
                          add({ id: item.id, name: item.name, sku: item.sku, price: Number(item.price), image_url: normalizeImageUrl(item.image_url) });
                          toast.success(`${item.name} נוסף להזמנה`);
                        }}
                        className="mt-2 h-10 rounded-full bg-[#f3c9bd] hover:bg-[#eab5a4] text-[#4a2a20] text-sm font-medium transition-colors"
                      >
                        הוספי להזמנה
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cart sidebar */}
          <aside className="lg:sticky lg:top-24 self-start">
            <div className="rounded-3xl bg-white border border-black/5 shadow-sm p-5 md:p-6">
              <div className="flex items-center justify-between pb-4 border-b border-black/5">
                <h2 className="font-display text-2xl">ההזמנה שלי</h2>
                <span className="text-xs text-muted-foreground">{count} פריטים</span>
              </div>

              {lines.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  העגלה ריקה — הוסיפי אביזרים מהקטלוג
                </div>
              ) : (
                <>
                  <ul className="divide-y divide-black/5 max-h-[420px] overflow-auto -mx-1 px-1">
                    {lines.map((l) => (
                      <li key={l.id} className="py-3 flex gap-3">
                        <div className="h-14 w-14 rounded-xl bg-[#efe6df] overflow-hidden shrink-0">
                          <ProductImage imageUrl={l.image_url} alt={l.name} fallbackClassName="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium line-clamp-1">{l.name}</div>
                          <div className="text-[11px] text-muted-foreground">₪{l.price.toFixed(0)}</div>
                          <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#f6f1ec] px-1 py-0.5">
                            <button
                              onClick={() => (l.quantity <= 1 ? remove(l.id) : setQty(l.id, l.quantity - 1))}
                              className="h-6 w-6 inline-flex items-center justify-center rounded-full hover:bg-white"
                              aria-label="הפחת"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="text-xs w-5 text-center">{l.quantity}</span>
                            <button
                              onClick={() => setQty(l.id, l.quantity + 1)}
                              className="h-6 w-6 inline-flex items-center justify-center rounded-full hover:bg-white"
                              aria-label="הוסף"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                        <button
                          onClick={() => remove(l.id)}
                          className="text-muted-foreground hover:text-foreground shrink-0"
                          aria-label="הסר"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>

                  <div className="pt-4 mt-2 border-t border-black/5 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">סה״כ</span>
                    <span className="font-display text-2xl">₪{subtotal.toFixed(0)}</span>
                  </div>

                  <Button
                    onClick={() => navigate({ to: "/checkout" })}
                    className="w-full mt-4 h-12 rounded-full bg-[#f3c9bd] hover:bg-[#eab5a4] text-[#4a2a20] text-base font-medium"
                  >
                    שלחי הזמנה
                  </Button>
                </>
              )}
            </div>

            <Link to="/" className="block text-center text-xs text-muted-foreground mt-4 hover:text-foreground">
              חזרה לעמוד הבית
            </Link>
          </aside>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-5 md:gap-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i}>
          <div className="aspect-square rounded-2xl bg-[#efe6df] animate-pulse" />
          <div className="pt-3 space-y-2">
            <div className="h-4 bg-[#efe6df] animate-pulse w-3/4 rounded" />
            <div className="h-3 bg-[#efe6df] animate-pulse w-1/3 rounded" />
            <div className="h-10 bg-[#f3c9bd]/60 animate-pulse rounded-full mt-2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-24 text-center">
      <div className="font-display text-3xl italic mb-2">אין אביזרים להצגה</div>
      <p className="text-muted-foreground text-sm">נסי לנקות את הסינון או לחפש מונח אחר.</p>
    </div>
  );
}

function CatalogError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="py-24 text-center">
      <div className="font-display text-3xl italic mb-2">הקטלוג לא נטען כרגע</div>
      <p className="text-muted-foreground text-sm mb-5">יש תקלה זמנית בטעינת האביזרים. נסי לרענן את הרשימה.</p>
      <Button type="button" onClick={onRetry} className="rounded-full gap-2">
        <RefreshCw className="h-4 w-4" />
        טען מחדש
      </Button>
    </div>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import catalogData from "@/data/studio-catalog.json";
import { smartSearchItems } from "@/lib/ai.functions";
import { useCart } from "@/lib/cart";
import { Sparkles, Search, X, ShoppingBag, Check, Plus, Trash2, ZoomIn } from "lucide-react";

export const Route = createFileRoute("/rental-catalog")({
  head: () => ({
    meta: [
      { title: "קטלוג אביזרים להשכרה | Sweetbaby" },
      {
        name: "description",
        content:
          "מעל 400 אביזרים להשכרה לצילומי ניו-בורן, גיל שנה ומשפחה. בחירה, סל צד וקופה מאובטחת.",
      },
      { property: "og:title", content: "קטלוג אביזרים להשכרה | Sweetbaby" },
      { property: "og:description", content: "מעל 400 אביזרים להשכרה — בחירה, סל וקופה." },
      { property: "og:url", content: "https://sweetbabyphotographystudio.lovable.app/rental-catalog" },
    ],
    links: [{ rel: "canonical", href: "https://sweetbabyphotographystudio.lovable.app/rental-catalog" }],
  }),
  component: RentalCatalogPage,
});

type Item = { sku: string; name: string; price: number; img: string; alt: string; hasHand?: boolean };
type Category = { title: string; items: Item[] };
const categories = catalogData as Category[];

function RentalCatalogPage() {
  const { lines, add, remove, subtotal, count } = useCart();
  const nav = useNavigate();
  const inCart = useMemo(() => new Set(lines.map((l) => l.id)), [lines]);

  const [query, setQuery] = useState("");
  const [aiSkus, setAiSkus] = useState<Set<string> | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [lightbox, setLightbox] = useState<Item | null>(null);
  const [activeCat, setActiveCat] = useState<string>("all");
  const runSmartSearch = useServerFn(smartSearchItems);

  const allItems = useMemo(() => categories.flatMap((c) => c.items), []);
  const inspirationImages = useMemo(
    () => allItems.filter((it) => it.hasHand && it.img).map((it) => it.img),
    [allItems],
  );
  const [inspoIdx, setInspoIdx] = useState(0);
  useEffect(() => {
    if (inspirationImages.length < 2) return;
    const id = setInterval(() => setInspoIdx((i) => (i + 1) % inspirationImages.length), 3200);
    return () => clearInterval(id);
  }, [inspirationImages.length]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return categories
      .filter((c) => activeCat === "all" || c.title === activeCat)
      .map((c) => ({
        ...c,
        items: c.items.filter((it) => {
          if (it.hasHand) return false;
          if (aiSkus) return aiSkus.has(it.sku);
          if (!q) return true;
          return it.sku.includes(q) || it.name.includes(q) || it.alt.includes(q);
        }),
      }))
      .filter((c) => c.items.length > 0);
  }, [query, aiSkus, activeCat]);

  const doAiSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setAiLoading(true);
    try {
      const { skus } = await runSmartSearch({ data: { query: q } });
      setAiSkus(new Set(skus));
    } catch {
      setAiSkus(null);
    } finally {
      setAiLoading(false);
    }
  };
  const clearSearch = () => { setAiSkus(null); setQuery(""); };

  const toggleCart = (it: Item) => {
    if (inCart.has(it.sku)) {
      remove(it.sku);
    } else {
      add({ id: it.sku, sku: it.sku, name: it.name || it.alt, price: it.price, image_url: it.img || null });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-cream">
      <Header />

      {/* Hero */}
      <section className="border-b border-primary/10 bg-gradient-to-b from-blush/40 to-cream">
        <div className="container-page py-14 grid md:grid-cols-[1fr_auto] gap-8 items-center">
          <div className="text-center md:text-right">
            <div className="text-xs tracking-[0.35em] uppercase text-forest/70 mb-3">Rental Catalog</div>
            <h1 className="font-display text-5xl md:text-6xl text-primary mb-3">קטלוג אביזרים להשכרה</h1>
            <p className="text-muted-foreground max-w-xl md:mx-0 mx-auto">
              {allItems.length}+ אביזרים · {categories.length} קטגוריות · מינימום הזמנה 50 ₪
            </p>
          </div>
          {inspirationImages.length > 0 && (
            <div className="relative w-full md:w-[320px] aspect-square rounded-3xl overflow-hidden shadow-xl bg-cream mx-auto">
              <AnimatePresence mode="wait">
                <motion.img
                  key={inspoIdx}
                  src={inspirationImages[inspoIdx]}
                  alt="השראה מהסטודיו"
                  initial={{ opacity: 0, scale: 1.05 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.02 }}
                  transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </AnimatePresence>
            </div>
          )}
        </div>
      </section>

      <section className="container-page py-10 flex-1">
        <div className="grid lg:grid-cols-[1fr_340px] gap-8 items-start">
          {/* MAIN */}
          <div className="min-w-0">
            {/* Search */}
            <div className="bg-card rounded-3xl border border-primary/10 p-5 mb-6 shadow-sm">
              <div className="flex gap-2 items-center">
                <div className="flex-1 relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/50" />
                  <input
                    type="search"
                    className="w-full h-12 pr-10 pl-4 rounded-full bg-cream/60 border border-primary/10 text-sm outline-none focus:border-primary/40"
                    placeholder='חיפוש חכם: "משהו ורוד לניו-בורן", "כובע סרוג", מק״ט…'
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); if (aiSkus) setAiSkus(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") doAiSearch(); }}
                  />
                </div>
                <button
                  type="button"
                  onClick={doAiSearch}
                  disabled={aiLoading || !query.trim()}
                  className="h-12 px-5 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 flex items-center gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  {aiLoading ? "מחפשת…" : "חיפוש חכם"}
                </button>
                {(aiSkus || query) && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="h-12 w-12 rounded-full border border-primary/15 text-primary/70 hover:bg-cream flex items-center justify-center"
                    aria-label="נקה חיפוש"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {aiSkus && (
                <div className="mt-3 text-xs text-forest/70">
                  ✨ תוצאות חיפוש חכם: {aiSkus.size} פריטים
                </div>
              )}
              {/* Category chips */}
              <div className="flex flex-wrap gap-2 mt-4">
                <Chip active={activeCat === "all"} onClick={() => setActiveCat("all")}>הכל</Chip>
                {categories.map((c) => (
                  <Chip key={c.title} active={activeCat === c.title} onClick={() => setActiveCat(c.title)}>
                    {c.title}
                  </Chip>
                ))}
              </div>
            </div>

            {/* Grid by category */}
            {filtered.length === 0 && (
              <div className="rounded-3xl bg-card border border-primary/10 p-16 text-center text-muted-foreground">
                לא נמצאו פריטים בחיפוש. נסו ניסוח אחר או נקו את החיפוש.
              </div>
            )}

            {filtered.map((cat) => (
              <div key={cat.title} className="mb-10">
                <div className="flex items-baseline justify-between mb-4">
                  <h2 className="font-display text-2xl text-primary">{cat.title}</h2>
                  <span className="text-xs text-forest/60 tracking-wider">{cat.items.length} פריטים</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {cat.items.map((it) => {
                    const inspiration = !!it.hasHand;
                    const selected = inCart.has(it.sku);
                    return (
                      <div
                        key={it.sku}
                        className={
                          "group relative rounded-2xl overflow-hidden border bg-card transition-all " +
                          (inspiration ? "col-span-2 border-dashed border-primary/25" : selected ? "border-primary shadow-lg -translate-y-0.5" : "border-primary/10 hover:border-primary/30 hover:shadow-md")
                        }
                      >
                        <button
                          type="button"
                          className="block w-full relative overflow-hidden"
                          onClick={() => setLightbox(it)}
                          aria-label={`הגדל תמונה של ${it.name || it.sku}`}
                        >
                          {it.img ? (
                            <img
                              src={it.img}
                              alt={it.alt}
                              loading="lazy"
                              className={
                                (inspiration ? "h-56 md:h-64 object-contain bg-cream" : "h-40 object-cover") +
                                " w-full transition-transform duration-500 group-hover:scale-105"
                              }
                            />
                          ) : (
                            <div className="h-40 flex items-center justify-center text-xs text-muted-foreground bg-cream">
                              אין תמונה
                            </div>
                          )}
                          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-primary/10 flex items-center justify-center">
                            <ZoomIn className="h-6 w-6 text-white drop-shadow-lg" />
                          </div>
                          {inspiration && (
                            <span className="absolute bottom-2 right-2 bg-primary/90 text-primary-foreground text-[10px] tracking-widest uppercase px-2 py-1 rounded-full">
                              להשראה בלבד
                            </span>
                          )}
                        </button>

                        {!inspiration && (
                          <div className="p-3 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[10px] tracking-widest text-forest/60 uppercase">מק״ט {it.sku}</div>
                              <div className="font-display text-peach-deep text-lg leading-none mt-0.5">₪{it.price}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleCart(it)}
                              className={
                                "h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition-colors " +
                                (selected ? "bg-primary text-primary-foreground" : "bg-cream text-primary hover:bg-blush")
                              }
                              aria-label={selected ? `הסר מהסל את ${it.name}` : `הוסף לסל ${it.name}`}
                            >
                              {selected ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* CART SIDEBAR */}
          <aside className="lg:sticky lg:top-24 bg-[#f5d5cf] text-[#2d3d2b] rounded-3xl p-6 shadow-xl border border-[#2d3d2b]/10">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingBag className="h-4 w-4 text-[#2d3d2b]/70" />
              <div className="text-[#2d3d2b]/70 text-[11px] tracking-[0.3em] uppercase">My Order</div>
            </div>
            <h2 className="font-display text-2xl mb-4 text-[#2d3d2b]">הסל שלי</h2>

            {lines.length === 0 ? (
              <div className="text-[#2d3d2b]/60 text-sm py-8 text-center">
                לחצו על <Plus className="inline h-3 w-3 mx-1" /> ליד פריט כדי להוסיף לסל.
              </div>
            ) : (
              <div className="space-y-3 max-h-[46vh] overflow-y-auto pr-1 -mr-2">
                {lines.map((l) => (
                  <div key={l.id} className="flex gap-3 items-center bg-white/60 rounded-2xl p-2 pr-3">
                    <div className="h-12 w-12 rounded-xl overflow-hidden bg-white shrink-0">
                      {l.image_url && <img src={l.image_url} alt={l.name} className="h-full w-full object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate text-[#2d3d2b]">{l.name}</div>
                      <div className="text-[10px] text-[#2d3d2b]/60 tracking-widest">#{l.sku} · ₪{l.price}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(l.id)}
                      className="h-7 w-7 rounded-full bg-white/70 hover:bg-white flex items-center justify-center"
                      aria-label={`הסר את ${l.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="h-px bg-[#2d3d2b]/15 my-5" />
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-[#2d3d2b]/80">{count} פריטים</span>
              <span className="font-display text-3xl text-[#2d3d2b]">₪{subtotal.toFixed(0)}</span>
            </div>
            {subtotal > 0 && subtotal < 50 && (
              <p className="text-[#2d3d2b]/80 text-xs mt-2">מינימום 50 ₪ — הוסיפו ₪{(50 - subtotal).toFixed(0)}.</p>
            )}
            <button
              type="button"
              disabled={subtotal < 50}
              onClick={() => nav({ to: "/checkout" })}
              className="w-full mt-5 h-12 rounded-full bg-[#2d3d2b] text-[#f5d5cf] font-medium hover:bg-[#1f2b1e] disabled:opacity-40 transition-colors"
            >
              המשך לקופה
            </button>
            <button
              type="button"
              disabled={lines.length === 0}
              onClick={() => {
                const body = [
                  "שלום, אשמח להזמין את הפריטים הבאים:",
                  "",
                  ...lines.map((l) => `• ${l.name} (מק״ט ${l.sku}) — ₪${l.price} × ${l.quantity}`),
                  "",
                  `סה״כ: ₪${subtotal.toFixed(0)}`,
                  "",
                  "פרטי לקוח:",
                  "שם: ",
                  "טלפון: ",
                  "תאריך רצוי: ",
                ].join("\n");
                const url = `https://mail.google.com/mail/?view=cm&fs=1&to=s0548529277@gmail.com&su=${encodeURIComponent("הזמנת אביזרים — Sweetbaby")}&body=${encodeURIComponent(body)}`;
                window.open(url, "_blank", "noopener,noreferrer");
              }}
              className="w-full mt-2 h-11 rounded-full bg-white text-[#2d3d2b] font-medium border border-[#2d3d2b]/15 hover:bg-white/80 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
            >
              ✉️ שליחת הסל במייל (Gmail)
            </button>
            <Link to="/cart" className="block text-center text-xs text-[#2d3d2b]/60 mt-3 hover:text-[#2d3d2b]">
              צפייה בסל המלא
            </Link>
          </aside>

        </div>
      </section>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/85 z-[200] flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="relative max-w-3xl max-h-[90vh] bg-card rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <button
              className="absolute top-3 left-3 h-9 w-9 rounded-full bg-black/60 text-white flex items-center justify-center z-10"
              onClick={() => setLightbox(null)}
              aria-label="סגור"
            >
              <X className="h-4 w-4" />
            </button>
            <img src={lightbox.img} alt={lightbox.alt} className="max-h-[75vh] w-auto mx-auto object-contain bg-black" />
            {!lightbox.hasHand && (
              <div className="p-4 flex items-center justify-between">
                <div>
                  <div className="text-[10px] tracking-widest text-forest/60 uppercase">מק״ט {lightbox.sku}</div>
                  <div className="font-display text-lg text-primary">{lightbox.name || lightbox.alt}</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="font-display text-peach-deep text-2xl">₪{lightbox.price}</div>
                  <button
                    type="button"
                    onClick={() => { toggleCart(lightbox); setLightbox(null); }}
                    className="h-10 px-5 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
                  >
                    {inCart.has(lightbox.sku) ? "בסל" : "הוסף לסל"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}

function Chip({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "px-4 h-8 rounded-full text-xs whitespace-nowrap transition-colors " +
        (active ? "bg-primary text-primary-foreground" : "bg-cream text-primary/80 hover:bg-blush border border-primary/10")
      }
    >
      {children}
    </button>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { Check, Copy, Plus, Search, ShoppingBag, Sparkles, Trash2, X } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductImage } from "@/components/ProductImage";
import { PropInspirationImage } from "@/components/PropInspirationImage";
import { useCart } from "@/lib/cart";
import { useCatalogCategories, type CatalogItem } from "@/lib/catalog";
import { mergedInspiration, useItemInspiration } from "@/lib/item-inspiration";

const CANONICAL = "https://sweetbabyphoto.shop/set-builder";
const TITLE = "בונה סטים | Sweetbaby";
const DESCRIPTION =
  "בונים סט צילום מהאביזרים של הסטודיו: בוחרים אביזרים, רואים איך הסט נראה, שומרים קישור ומוסיפים הכל לסל.";

// The set is kept in the link (?s=101,205,...) so it survives a refresh and can be shared.
const searchSchema = z.object({
  s: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/set-builder")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: CANONICAL },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: SetBuilderPage,
});

const PAGE_SIZE = 48;
const MAX_SET = 24;

function SetBuilderPage() {
  const { s } = Route.useSearch();
  const nav = useNavigate();
  const categories = useCatalogCategories();
  const remoteInspiration = useItemInspiration();
  const { add, lines } = useCart();

  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState("all");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [copied, setCopied] = useState(false);
  const [addedAll, setAddedAll] = useState(false);

  const allItems = useMemo(() => categories.flatMap((c) => c.items), [categories]);
  const bySku = useMemo(() => new Map(allItems.map((i) => [i.sku, i])), [allItems]);

  const selectedSkus = useMemo(
    () => Array.from(new Set((s ?? "").split(",").map((x) => x.trim()).filter(Boolean))),
    [s],
  );
  const selected = useMemo(
    () => selectedSkus.map((sku) => bySku.get(sku)).filter((i): i is CatalogItem => !!i),
    [selectedSkus, bySku],
  );
  const selectedSet = useMemo(() => new Set(selected.map((i) => i.sku)), [selected]);
  const total = selected.reduce((sum, i) => sum + (Number(i.price) || 0), 0);

  const setSkus = (next: string[]) => {
    nav({ to: "/set-builder", search: { s: next.length ? next.join(",") : undefined }, replace: true });
  };
  const toggle = (sku: string) => {
    if (selectedSet.has(sku)) setSkus(selected.map((i) => i.sku).filter((x) => x !== sku));
    else if (selected.length < MAX_SET) setSkus([...selected.map((i) => i.sku), sku]);
  };

  const shelf = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool =
      activeCat === "all"
        ? allItems
        : (categories.find((c) => c.title === activeCat)?.items ?? []);
    if (!q) return pool;
    return pool.filter((i) =>
      [i.name, i.alt, ...(i.tags ?? [])].some((t) => (t ?? "").toLowerCase().includes(q)),
    );
  }, [allItems, categories, activeCat, query]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the address bar link still works */
    }
  };

  const addAllToCart = () => {
    const inCart = new Set(lines.map((l) => l.id));
    for (const it of selected) {
      if (inCart.has(it.sku)) continue;
      add({
        id: it.sku,
        sku: it.sku,
        name: it.name || it.alt,
        price: it.price,
        image_url: it.img || null,
      });
    }
    setAddedAll(true);
    setTimeout(() => setAddedAll(false), 2500);
  };

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground flex flex-col">
      <Header />
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-8 md:py-12">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-[#b98a7a] mb-2">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm">חדש</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl mb-2">בונה סטים</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            בוחרות אביזרים מהמדף, רואות איך הסט נראה יחד, ומוסיפות הכל לסל בלחיצה.
            על אביזר שיש לו תמונה מהצילומים אפשר ללחוץ ולראות אותו בפעולה.
          </p>
        </div>

        {/* The set board */}
        <section
          aria-label="הסט שלי"
          className="rounded-[2rem] border border-black/5 bg-gradient-to-br from-[#fbf3ec] to-[#f1e2d6] p-4 md:p-6 mb-10 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="font-display text-xl md:text-2xl">
              הסט שלי{" "}
              <span className="text-sm text-muted-foreground">
                ({selected.length} אביזרים{selected.length ? ` · ₪${total}` : ""})
              </span>
            </h2>
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copyLink}
                  className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-4 py-2 text-sm hover:bg-white/70"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "הקישור הועתק" : "העתקת קישור לסט"}
                </button>
                <button
                  type="button"
                  onClick={() => setSkus([])}
                  className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-4 py-2 text-sm hover:bg-white/70"
                >
                  <Trash2 className="h-4 w-4" />
                  ניקוי
                </button>
              </div>
            )}
          </div>

          {selected.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/15 bg-white/50 py-14 text-center text-muted-foreground">
              הסט עדיין ריק. בחרי אביזרים מהמדף למטה והם יופיעו כאן.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {selected.map((it) => {
                  const shots = mergedInspiration(it.sku, remoteInspiration.data);
                  return (
                    <div
                      key={it.sku}
                      className="relative overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm"
                    >
                      <div className="aspect-square bg-[#efe6df]">
                        <PropInspirationImage
                          src={it.img}
                          alt={it.name || it.alt}
                          shots={shots}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => toggle(it.sku)}
                        aria-label={`הסרת ${it.name || it.alt} מהסט`}
                        className="absolute top-2 right-2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow hover:bg-white"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <div className="px-2 py-1.5 text-xs leading-tight">
                        <div className="line-clamp-2">{it.name || it.alt}</div>
                        <div className="text-muted-foreground mt-0.5">₪{it.price}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={addAllToCart}
                  className="inline-flex items-center gap-2 rounded-full bg-[#2d3d2b] px-6 py-3 text-white hover:opacity-90"
                >
                  {addedAll ? <Check className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
                  {addedAll ? "נוסף לסל" : "הוספת כל הסט לסל"}
                </button>
                {addedAll && (
                  <Link to="/cart" className="text-sm underline underline-offset-4">
                    לסל
                  </Link>
                )}
                <span className="text-xs text-muted-foreground">
                  המחיר הוא מחיר ההשכרה של האביזרים; התאריכים והזמינות נבחרים בקופה.
                </span>
              </div>
            </>
          )}
        </section>

        {/* The shelf */}
        <section aria-label="מדף האביזרים">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
            <h2 className="font-display text-xl md:text-2xl">המדף</h2>
            <div className="relative md:w-72">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShown(PAGE_SIZE);
                }}
                placeholder="חיפוש אביזר"
                className="w-full rounded-full border border-black/10 bg-white py-2.5 pr-9 pl-4 text-base outline-none focus:ring-2 focus:ring-[#f3c9bd]"
              />
            </div>
          </div>

          <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
            {["all", ...categories.filter((c) => c.items.length > 0).map((c) => c.title)].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setActiveCat(c);
                  setShown(PAGE_SIZE);
                }}
                className={
                  "shrink-0 rounded-full border px-4 py-1.5 text-sm transition " +
                  (activeCat === c
                    ? "border-[#2d3d2b] bg-[#2d3d2b] text-white"
                    : "border-black/10 bg-white hover:bg-white/70")
                }
              >
                {c === "all" ? "הכל" : c}
              </button>
            ))}
          </div>

          {allItems.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">טוען אביזרים…</p>
          ) : shelf.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">לא נמצאו אביזרים. נסי מילה אחרת.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {shelf.slice(0, shown).map((it) => {
                  const on = selectedSet.has(it.sku);
                  return (
                    <button
                      key={it.sku}
                      type="button"
                      onClick={() => toggle(it.sku)}
                      aria-pressed={on}
                      className={
                        "group relative overflow-hidden rounded-2xl border bg-white text-right shadow-sm transition " +
                        (on ? "border-[#2d3d2b] ring-2 ring-[#2d3d2b]/40" : "border-black/5 hover:shadow-md")
                      }
                    >
                      <div className="aspect-square bg-[#efe6df]">
                        <ProductImage imageUrl={it.img} alt={it.name || it.alt} />
                      </div>
                      <span
                        className={
                          "absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full shadow " +
                          (on ? "bg-[#2d3d2b] text-white" : "bg-white/90")
                        }
                      >
                        {on ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      </span>
                      <div className="px-2 py-1.5 text-xs leading-tight">
                        <div className="line-clamp-2">{it.name || it.alt}</div>
                        <div className="text-muted-foreground mt-0.5">₪{it.price}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {shown < shelf.length && (
                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => setShown((n) => n + PAGE_SIZE)}
                    className="rounded-full border border-black/10 bg-white px-6 py-2.5 text-sm hover:bg-white/70"
                  >
                    הצגת עוד אביזרים
                  </button>
                </div>
              )}
            </>
          )}
          {selected.length >= MAX_SET && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              הגעת למקסימום של {MAX_SET} אביזרים בסט אחד.
            </p>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}

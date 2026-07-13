import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductImage } from "@/components/ProductImage";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { absoluteImageUrl, normalizeImageUrl } from "@/lib/images";
import { toast } from "sonner";
import { ChevronRight, ShoppingBag, Plus, Minus } from "lucide-react";
import { useMemo } from "react";

export const Route = createFileRoute("/items/$id")({
  component: ItemPage,
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center" dir="rtl">
      <div className="text-center">
        <p className="text-lg mb-2">שגיאה בטעינת הפריט</p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen flex flex-col bg-[#f6f1ec]" dir="rtl">
      <Header />
      <div className="container-page py-24 text-center flex-1">
        <h1 className="font-display text-4xl mb-3">האביזר לא נמצא</h1>
        <p className="text-muted-foreground mb-6">ייתכן שהפריט הוסר מהקטלוג.</p>
        <Link to="/rental-catalog" className="underline">חזרה לקטלוג</Link>
      </div>
      <Footer />
    </div>
  ),
});

function ItemPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { lines, add, remove, setQty } = useCart();

  const item = useQuery({
    queryKey: ["item", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("items").select("*, categories(name)").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data;
    },
  });

  const line = lines.find((l) => l.id === id);
  const inCart = line?.quantity ?? 0;

  const ld = useMemo(() => {
    if (!item.data) return null;
    return {
      "@context": "https://schema.org",
      "@type": "Product",
      name: item.data.name,
      sku: item.data.sku,
      image: absoluteImageUrl(item.data.image_url),
      description: item.data.description ?? undefined,
      offers: {
        "@type": "Offer",
        price: item.data.price,
        priceCurrency: "ILS",
        availability: "https://schema.org/InStock",
      },
    };
  }, [item.data]);

  if (item.isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#f6f1ec]" dir="rtl">
        <Header />
        <div className="container-page py-16 flex-1">
          <div className="grid md:grid-cols-2 gap-10">
            <div className="aspect-square rounded-3xl bg-[#efe6df] animate-pulse" />
            <div className="space-y-4">
              <div className="h-10 w-2/3 bg-[#efe6df] animate-pulse rounded" />
              <div className="h-4 w-1/3 bg-[#efe6df] animate-pulse rounded" />
              <div className="h-24 bg-[#efe6df] animate-pulse rounded" />
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const it = item.data!;

  return (
    <div className="min-h-screen flex flex-col bg-[#f6f1ec]" dir="rtl">
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />}
      <Header />

      <section className="container-page pt-8 pb-16 flex-1">
        {/* Breadcrumbs */}
        <nav className="text-xs text-muted-foreground flex items-center gap-1.5 mb-6">
          <Link to="/" className="hover:text-foreground">בית</Link>
          <ChevronRight className="h-3 w-3 rotate-180" />
          <Link to="/rental-catalog" className="hover:text-foreground">קטלוג</Link>
          <ChevronRight className="h-3 w-3 rotate-180" />
          <span className="text-foreground">{it.name}</span>
        </nav>

        <div className="grid md:grid-cols-2 gap-8 md:gap-12">
          {/* Image */}
          <div className="aspect-square rounded-3xl bg-[#efe6df] overflow-hidden border border-black/5">
            <ProductImage imageUrl={it.image_url} alt={it.name} fallbackClassName="h-16 w-16" />
          </div>

          {/* Details */}
          <div className="flex flex-col">
            {(it as any).categories?.name && (
              <div className="text-xs uppercase tracking-widest text-[#b98a7a] mb-2">
                {(it as any).categories.name}
              </div>
            )}
            <h1 className="font-display text-4xl md:text-5xl leading-tight tracking-tight">{it.name}</h1>

            <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
              <span>מק״ט <span className="font-mono text-foreground">{it.sku}</span></span>
            </div>

            <div className="mt-6 font-display text-4xl">₪{Number(it.price).toFixed(0)}</div>

            {it.description && (
              <p className="mt-6 text-base leading-relaxed text-foreground/80 whitespace-pre-line">
                {it.description}
              </p>
            )}

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              {inCart > 0 ? (
                <div className="inline-flex items-center gap-2 rounded-full bg-white border border-black/10 px-2 py-1.5">
                  <button
                    onClick={() => (inCart <= 1 ? remove(it.id) : setQty(it.id, inCart - 1))}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-full hover:bg-[#f6f1ec]"
                    aria-label="הפחת"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-8 text-center font-medium">{inCart}</span>
                  <button
                    onClick={() => setQty(it.id, inCart + 1)}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-full hover:bg-[#f6f1ec]"
                    aria-label="הוסף"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <Button
                  onClick={() => {
                    add({ id: it.id, name: it.name, sku: it.sku, price: Number(it.price), image_url: normalizeImageUrl(it.image_url) });
                    toast.success(`${it.name} נוסף להזמנה`);
                  }}
                  className="h-12 rounded-full bg-[#f3c9bd] hover:bg-[#eab5a4] text-[#4a2a20] text-base font-medium px-8"
                >
                  <ShoppingBag className="h-4 w-4 ml-2" />
                  הוספה להזמנה
                </Button>
              )}

              <Button
                variant="outline"
                onClick={() => navigate({ to: "/cart" })}
                className="h-12 rounded-full px-8"
              >
                לצפייה בעגלה
              </Button>
            </div>

            <div className="mt-10 pt-6 border-t border-black/5 text-xs text-muted-foreground leading-relaxed">
              המחיר להשכרה למשך יום הצילום. הזמנת אביזרים נחשבת להסכמה{" "}
              <Link to="/terms" className="underline hover:text-foreground">לתנאי השימוש</Link>.
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

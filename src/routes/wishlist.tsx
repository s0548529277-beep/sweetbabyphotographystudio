import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductImage } from "@/components/ProductImage";
import { Button } from "@/components/ui/button";
import { useWishlist } from "@/lib/wishlist";
import { useCart } from "@/lib/cart";
import { Heart, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/wishlist")({
  component: WishlistPage,
  head: () => ({
    meta: [
      { title: "רשימת המשאלות שלי | Sweetbaby" },
      { name: "description", content: "אביזרים שסימנתם לשמור להזמנה בעתיד." },
      { name: "robots", content: "noindex, follow" },
    ],
  }),
});

function WishlistPage() {
  const { items, remove } = useWishlist();
  const { add } = useCart();
  // The catalog saves hearts under the item's SKU, but /items/$id needs the item's real id (uuid).
  // Resolve sku → id so a saved item always opens its page.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const skus = items.filter((i) => !UUID.test(i.id)).map((i) => i.sku);
  const idBySku = useQuery({
    queryKey: ["wishlist-sku-ids", skus.join(",")],
    enabled: skus.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("items").select("id, sku").in("sku", skus);
      return new Map<string, string>((data ?? []).map((r: any) => [String(r.sku), String(r.id)]));
    },
  });
  const pageIdFor = (it: { id: string; sku: string }): string | null =>
    UUID.test(it.id) ? it.id : (idBySku.data?.get(String(it.sku)) ?? null);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <section className="container-page py-14 flex-1">
        <div className="text-xs tracking-[0.3em] uppercase text-forest/70 mb-3">Wishlist</div>
        <h1 className="font-display text-5xl text-primary mb-10">רשימת המשאלות שלי</h1>

        {items.length === 0 ? (
          <div className="rounded-3xl bg-cream/50 border border-primary/10 py-24 text-center">
            <Heart className="h-10 w-10 text-primary/40 mx-auto mb-4" />
            <div className="font-display text-2xl text-primary mb-2">הרשימה ריקה</div>
            <p className="text-muted-foreground text-sm mb-6">
              סמנו בלב אביזרים בקטלוג ששמרתם בשבילם, ותמצאו אותם כאן.
            </p>
            <Link to="/rental-catalog">
              <Button className="rounded-full">לקטלוג</Button>
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((it) => (
              <div
                key={it.id}
                className="flex gap-4 items-center bg-card rounded-2xl p-4 border border-primary/5"
              >
                {pageIdFor(it) ? (
                  <Link to="/items/$id" params={{ id: pageIdFor(it)! }} className="h-20 w-20 rounded-xl overflow-hidden bg-cream shrink-0">
                    <ProductImage imageUrl={it.image_url} alt={it.name} fallbackClassName="h-6 w-6" />
                  </Link>
                ) : (
                  <Link to="/rental-catalog" className="h-20 w-20 rounded-xl overflow-hidden bg-cream shrink-0">
                    <ProductImage imageUrl={it.image_url} alt={it.name} fallbackClassName="h-6 w-6" />
                  </Link>
                )}
                <div className="flex-1 min-w-0">
                  {pageIdFor(it) ? (
                    <Link to="/items/$id" params={{ id: pageIdFor(it)! }} className="font-display text-base text-primary truncate block hover:underline">
                      {it.name}
                    </Link>
                  ) : (
                    <Link to="/rental-catalog" className="font-display text-base text-primary truncate block hover:underline">
                      {it.name}
                    </Link>
                  )}
                  <div className="font-display text-peach-deep text-base mt-1">₪{it.price.toFixed(0)}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <Button
                      size="sm"
                      className="h-8 rounded-full text-xs"
                      onClick={() => {
                        add({ id: it.id, name: it.name, sku: it.sku, price: it.price, image_url: it.image_url });
                        toast.success(`${it.name} נוסף להזמנה`);
                      }}
                    >
                      <ShoppingBag className="h-3.5 w-3.5 ml-1" />
                      הוספה להזמנה
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 rounded-full"
                      aria-label={`הסרה מרשימת המשאלות: ${it.name}`}
                      onClick={() => remove(it.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <Footer />
    </div>
  );
}

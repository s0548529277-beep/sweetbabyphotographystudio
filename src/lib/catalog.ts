import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import catalogData from "@/data/studio-catalog.json";
import { supabase } from "@/integrations/supabase/client";

export type CatalogItem = {
  sku: string;
  name: string;
  price: number;
  img: string;
  alt: string;
  hasHand?: boolean;
};
export type CatalogCategory = { title: string; items: CatalogItem[] };

export const STATIC_CATALOG = catalogData as CatalogCategory[];

type DbItem = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  price: number | string;
  image_url: string | null;
  active: boolean;
  sort_order?: number | null;
  categories: { name: string } | null;
};

/**
 * Live catalog: the bundled catalog merged with whatever the studio edits in
 * /admin/items. Anything changed there (name, price, category, image, active,
 * drag-and-drop order) immediately changes every page that renders the catalog.
 */
export function useCatalogCategories(): CatalogCategory[] {
  const db = useQuery({
    queryKey: ["items"],
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data } = await supabase
        .from("items")
        .select("id, sku, name, description, price, image_url, active, sort_order, categories(name)")
        .order("sort_order", { ascending: true });
      return (data ?? []) as unknown as DbItem[];
    },
  });


  return useMemo(() => {
    const rows = db.data ?? [];
    if (rows.length === 0) return STATIC_CATALOG;

    const bySku = new Map<string, DbItem>();
    for (const r of rows) bySku.set(String(r.sku), r);

    const order: string[] = [];
    const buckets = new Map<string, CatalogItem[]>();
    const push = (title: string, item: CatalogItem) => {
      if (!buckets.has(title)) {
        buckets.set(title, []);
        order.push(title);
      }
      buckets.get(title)!.push(item);
    };

    const used = new Set<string>();

    for (const cat of STATIC_CATALOG) {
      // keep original category order even if every item moved away
      if (!buckets.has(cat.title)) {
        buckets.set(cat.title, []);
        order.push(cat.title);
      }
      for (const item of cat.items) {
        const row = bySku.get(item.sku);
        if (!row) {
          push(cat.title, item);
          continue;
        }
        used.add(item.sku);
        if (row.active === false) continue; // hidden from the catalog by admin
        push(row.categories?.name || cat.title, {
          ...item,
          name: row.name || item.name,
          price: Number(row.price ?? item.price),
          img: row.image_url || item.img,
          alt: row.description || item.alt,
        });
      }
    }

    // Items created in the admin panel that don't exist in the bundled catalog
    for (const row of rows) {
      if (used.has(String(row.sku)) || row.active === false) continue;
      push(row.categories?.name || "אביזרים נוספים", {
        sku: String(row.sku),
        name: row.name,
        price: Number(row.price ?? 0),
        img: row.image_url || "",
        alt: row.description || row.name,
      });
    }

    return order.map((title) => ({ title, items: buckets.get(title) ?? [] })).filter((c) => c.items.length > 0);
  }, [db.data]);
}

export function useCatalogItems(): CatalogItem[] {
  const cats = useCatalogCategories();
  return useMemo(() => cats.flatMap((c) => c.items), [cats]);
}

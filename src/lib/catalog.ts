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
 *
 * Two bugs used to live here together, and between them explain a real
 * report ("admin shows items the site doesn't, and items I deleted in admin
 * still show on the site"): (1) queryFn destructured only `data` from the
 * Supabase response and silently dropped `error` — ANY transient query
 * failure (a blip, a cold start) resolved as a *successful* empty array
 * instead of a query error, and (2) the merge below treated "zero DB rows"
 * (whether from that swallowed error, from still being mid-fetch, or from a
 * genuinely empty table) as "nothing customized yet" and fell back to the
 * raw bundled STATIC_CATALOG — resurrecting every item ever deleted or
 * deactivated in /admin/items, with no admin edit involved at all. Fixed by
 * actually throwing on a real Supabase error, and by only ever falling back
 * to the bundled catalog once we've *confirmed* (via a successful query)
 * that there's truly nothing in the DB — never merely because this
 * particular fetch hasn't resolved yet or just failed.
 */
export function useCatalogCategories(): CatalogCategory[] {
  const db = useQuery({
    queryKey: ["items"],
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select(
          "id, sku, name, description, price, image_url, active, sort_order, categories(name)",
        )
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as DbItem[];
    },
  });

  // Live category names, so a category deleted in /admin/items (the
  // `categories` table row removed via deleteCategory) actually stops its
  // old bundled-JSON title from grouping items again below — without this,
  // any STATIC_CATALOG item that was never individually given its own DB
  // row keeps rendering under the bundled seed's original category text
  // forever, since deleting a *category* only touches the `categories`
  // table and items.category_id, never studio-catalog.json itself.
  const liveCategories = useQuery({
    queryKey: ["categories"],
    staleTime: 5_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("name");
      if (error) throw error;
      return (data ?? []) as { name: string }[];
    },
  });

  return useMemo(() => {
    // Not yet confirmed successful (still loading, or the last attempt
    // errored) — show nothing rather than risk showing stale/deleted items
    // as if they were current.
    if (!db.isSuccess) return [];
    const rows = db.data ?? [];

    const bySku = new Map<string, DbItem>();
    for (const r of rows) bySku.set(String(r.sku), r);

    // Only known once liveCategories has actually loaded — while it's still
    // pending, fall back to trusting the bundled title rather than hiding
    // every not-yet-customized category (same "don't assume from absence"
    // rule as db.isSuccess above).
    const liveCategoryNames = liveCategories.isSuccess
      ? new Set(liveCategories.data.map((c) => c.name))
      : null;

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
      // A deleted category (its name no longer in the live `categories`
      // table) falls back to "אביזרים נוספים" for any item still using the
      // bundled seed's original grouping — same catch-all bucket already
      // used below for DB items whose own category was deleted.
      const title =
        liveCategoryNames && !liveCategoryNames.has(cat.title) ? "אביזרים נוספים" : cat.title;
      // keep original category order even if every item moved away
      if (!buckets.has(title)) {
        buckets.set(title, []);
        order.push(title);
      }
      for (const item of cat.items) {
        const row = bySku.get(item.sku);
        if (!row) {
          push(title, item);
          continue;
        }
        used.add(item.sku);
        if (row.active === false) continue; // hidden from the catalog by admin
        // Once a live DB row exists, its OWN category is authoritative — even
        // when that's null (no category, e.g. its category was deleted in
        // /admin/items). Falling back to the bundled JSON's original
        // `cat.title` here used to resurrect deleted-category names forever,
        // since studio-catalog.json is a static seed that's never updated.
        push(row.categories?.name || "אביזרים נוספים", {
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

    // Respect the drag-and-drop order set in /admin/items.
    const rank = (sku: string) => {
      const so = bySku.get(sku)?.sort_order;
      return so == null ? Number.MAX_SAFE_INTEGER : Number(so);
    };

    return order
      .map((title) => ({
        title,
        items: [...(buckets.get(title) ?? [])].sort((a, b) => rank(a.sku) - rank(b.sku)),
      }))
      .filter((c) => c.items.length > 0);
  }, [db.isSuccess, db.data, liveCategories.isSuccess, liveCategories.data]);
}

export function useCatalogItems(): CatalogItem[] {
  const cats = useCatalogCategories();
  return useMemo(() => cats.flatMap((c) => c.items), [cats]);
}

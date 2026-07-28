import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { inspirationFor } from "@/lib/inspiration";

export type ItemInspirationImage = {
  id: string;
  sku: string;
  url: string;
  storage_path: string | null;
  caption: string | null;
  source: string;
  sort_order: number;
};

export async function fetchItemInspiration(): Promise<ItemInspirationImage[]> {
  const { data, error } = await supabase
    .from("item_inspiration_images")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ItemInspirationImage[];
}

/** All admin-managed inspiration photos, grouped by SKU. */
export function useItemInspiration() {
  return useQuery({
    queryKey: ["item-inspiration"],
    queryFn: async () => {
      const rows = await fetchItemInspiration();
      const map: Record<string, string[]> = {};
      for (const row of rows) (map[row.sku] ||= []).push(row.url);
      return map;
    },
    staleTime: 60_000,
  });
}

/** Merge local file-based inspiration (src/inspiration/sku-*.jpg) with admin-managed photos. */
export function mergedInspiration(sku: string, remote?: Record<string, string[]>): string[] {
  const all = [...inspirationFor(sku), ...(remote?.[sku] ?? [])];
  return Array.from(new Set(all));
}

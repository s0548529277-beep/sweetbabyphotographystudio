import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { studioInspiration } from "@/lib/inspiration";

export const PAGE_IMAGE_KEYS = {
  studioRental: "studio-rental",
  photographyStudio: "photography-studio",
  photographyOutdoor: "photography-outdoor",
} as const;

export type PageImageKey = (typeof PAGE_IMAGE_KEYS)[keyof typeof PAGE_IMAGE_KEYS];

export type PageImage = {
  id: string;
  page: string;
  url: string;
  storage_path: string | null;
  caption: string | null;
  sort_order: number;
  source: string;
  created_at: string;
};

export const BUILTIN_PHOTOGRAPHY_STUDIO = [
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc04166_optimized-1-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc04088_optimized-1-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc03989_optimized-1-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc04141_optimized-1-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc04290_optimized-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc04418_optimized-1-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc07818_optimized-1-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc08152_optimized-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/08/dsc04298_optimized-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/08/dsc04579_optimized-scaled.jpg",
];

export const BUILTIN_PHOTOGRAPHY_OUTDOOR = [
  "https://michalsiboni.co.il/wp-content/uploads/2025/05/777-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/05/DSC01673-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/05/DSC04181-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/05/DSC08770-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc01210_optimized-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc01367_optimized-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc01467_optimized-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc01597_optimized-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc01673_optimized-scaled.jpg",
  "https://michalsiboni.co.il/wp-content/uploads/2025/06/dsc02946_optimized-scaled.jpg",
];

export async function fetchPageImages(page: string): Promise<PageImage[]> {
  const { data, error } = await supabase
    .from("page_images")
    .select("*")
    .eq("page", page)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PageImage[];
}

/** Client-side hook: images managed from the admin panel for a given page. */
export function usePageImages(page: string) {
  return useQuery({
    queryKey: ["page-images", page],
    queryFn: () => fetchPageImages(page),
    staleTime: 60_000,
  });
}

/** Images that ship with the site (bundled/hardcoded assets) for a given page. */
export function builtinPageImages(page: string): string[] {
  if (page === PAGE_IMAGE_KEYS.studioRental) return studioInspiration();
  if (page === PAGE_IMAGE_KEYS.photographyStudio) return BUILTIN_PHOTOGRAPHY_STUDIO;
  if (page === PAGE_IMAGE_KEYS.photographyOutdoor) return BUILTIN_PHOTOGRAPHY_OUTDOOR;
  return [];
}

/**
 * Once the admin imports built-in photos into the gallery (rows with source='builtin'),
 * the gallery table becomes the single source of truth for that page — so deletions and
 * ordering apply to built-in photos too. Before that, built-ins are shown first.
 */
export function resolveGalleryImages(page: string, rows: PageImage[] | undefined): string[] {
  const list = rows ?? [];
  const managed = list.some((r) => r.source === "builtin");
  if (managed) return Array.from(new Set(list.map((r) => r.url)));
  return Array.from(new Set([...builtinPageImages(page), ...list.map((r) => r.url)]));
}

/** Resolved, ordered gallery for a page (built-ins + uploads, respecting admin edits). */
export function usePageGallery(page: string) {
  const query = usePageImages(page);
  return { ...query, images: resolveGalleryImages(page, query.data) };
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { studioInspirationMap } from "@/lib/inspiration";

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
  hidden: boolean;
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

/**
 * Bundled images shipped with the site, keyed by a STABLE key.
 * Studio photos are bundled assets whose URL changes between builds, so the
 * source path is used as key and the URL resolved at runtime.
 */
export function builtinEntries(page: string): { key: string; url: string }[] {
  if (page === PAGE_IMAGE_KEYS.studioRental) {
    return Object.entries(studioInspirationMap()).map(([key, url]) => ({ key, url }));
  }
  if (page === PAGE_IMAGE_KEYS.photographyStudio) return BUILTIN_PHOTOGRAPHY_STUDIO.map((u) => ({ key: u, url: u }));
  if (page === PAGE_IMAGE_KEYS.photographyOutdoor) return BUILTIN_PHOTOGRAPHY_OUTDOOR.map((u) => ({ key: u, url: u }));
  return [];
}

export function builtinPageImages(page: string): string[] {
  return builtinEntries(page).map((e) => e.url);
}

/** Current URL of a bundled image, by its stable key. */
export function builtinUrl(page: string, key: string | null | undefined): string | null {
  if (!key) return null;
  return builtinEntries(page).find((e) => e.key === key)?.url ?? null;
}

/** The display URL for a gallery row (bundled rows resolve to their live asset URL). */
export function rowUrl(page: string, row: PageImage): string {
  return (row.source === "builtin" ? builtinUrl(page, row.storage_path) : null) ?? row.url;
}

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

/**
 * Gallery shown on the site: every managed row that isn't hidden, plus bundled
 * photos that haven't been adopted into the gallery yet (first visit to admin
 * adopts them, after which order + deletions are fully admin-controlled).
 */
export function resolveGalleryImages(page: string, rows: PageImage[] | undefined): string[] {
  const list = rows ?? [];
  const adoptedKeys = new Set(list.filter((r) => r.source === "builtin").map((r) => r.storage_path ?? ""));
  const pending = builtinEntries(page)
    .filter((e) => !adoptedKeys.has(e.key))
    .map((e) => e.url);
  const managed = list.filter((r) => !r.hidden).map((r) => rowUrl(page, r));
  return Array.from(new Set([...pending, ...managed]));
}

/** Resolved, ordered gallery for a page (built-ins + uploads, respecting admin edits). */
export function usePageGallery(page: string) {
  const query = usePageImages(page);
  return { ...query, images: resolveGalleryImages(page, query.data) };
}

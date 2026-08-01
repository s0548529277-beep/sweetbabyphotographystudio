import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { studioInspirationMap } from "@/lib/inspiration";
import { STATIC_CATALOG } from "@/lib/catalog";

export const PAGE_IMAGE_KEYS = {
  studioRental: "studio-rental",
  photographyStudio: "photography-studio",
  photographyOutdoor: "photography-outdoor",
  homeHero: "home-hero",
  rentalInspiration: "rental-inspiration",
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

/** Bundled home-hero slides (the rotating rectangle on the homepage). */
export function builtinHomeHero(): { key: string; url: string }[] {
  const mods = import.meta.glob("../assets/home-hero-*.asset.json", { eager: true }) as Record<
    string,
    { default?: { url: string }; url?: string }
  >;
  return Object.entries(mods)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, mod]) => ({ key, url: mod.default?.url ?? mod.url ?? "" }))
    .filter((e) => e.url);
}

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
  if (page === PAGE_IMAGE_KEYS.homeHero) return builtinHomeHero();
  if (page === PAGE_IMAGE_KEYS.rentalInspiration) {
    return STATIC_CATALOG.flatMap((c) => c.items)
      .filter((i) => i.hasHand && i.img)
      .map((i) => ({ key: i.img, url: i.img }));
  }
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
  const managed = list.filter((r) => !r.hidden && r.source !== "config").map((r) => rowUrl(page, r));
  return Array.from(new Set([...pending, ...managed]));
}

/** Resolved, ordered gallery for a page (built-ins + uploads, respecting admin edits). */
export function usePageGallery(page: string) {
  const query = usePageImages(page);
  return { ...query, images: resolveGalleryImages(page, query.data) };
}

/** Layout setting rows (kept hidden so they never render in a gallery). */
export type GalleryAspect = "portrait" | "landscape";

export function resolveAspect(rows: PageImage[] | undefined): GalleryAspect {
  const row = (rows ?? []).find((r) => r.source === "config");
  return row?.caption === "landscape" ? "landscape" : "portrait";
}

export async function saveAspect(page: string, aspect: GalleryAspect) {
  const rows = await fetchPageImages(page);
  const existing = rows.find((r) => r.source === "config");
  if (existing) {
    const { error } = await supabase.from("page_images").update({ caption: aspect }).eq("id", existing.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("page_images")
    .insert({ page, url: "", source: "config", caption: aspect, hidden: true, sort_order: 9999 });
  if (error) throw error;
}

/** Resolved gallery + layout aspect for a page. */
export function usePageGalleryWithAspect(page: string) {
  const query = usePageImages(page);
  return {
    ...query,
    images: resolveGalleryImages(page, query.data),
    aspect: resolveAspect(query.data),
  };
}
